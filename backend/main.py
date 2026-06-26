"""
Bookloop — AI 书友群聊后端
FastAPI 应用入口
"""

import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from openai import OpenAI
from pydantic import BaseModel

from books import BOOKS, BUILTIN_BOOKS, add_custom_book, remove_custom_book, update_book_soul
from book_library import BOOK_LIBRARY, lookup_in_library
from config import load_config, save_config, config_for_client, config_public
from distiller import start_distill
from matcher import match_books
from models import ChatRequest, ChatResponse, AddBookRequest, AddBookResponse
from responder import generate_responses

load_dotenv()


# —— 全局状态 ——
class AppState:
    client: OpenAI | None = None
    matcher_model: str = ""
    responder_model: str = ""
    distill_tasks: dict = {}


state = AppState()


def _init_client(config: dict) -> bool:
    """根据配置初始化/更新 OpenAI client。成功返回 True。"""
    info = config_for_client(config)
    if info is None:
        state.client = None
        return False
    state.client = OpenAI(api_key=info["api_key"], base_url=info["base_url"])
    state.matcher_model = config.get("matcher_model", "MiniMax-M2.7-highspeed")
    state.responder_model = config.get("responder_model", "MiniMax-M3")
    return True


@asynccontextmanager
async def lifespan(app: FastAPI):
    config = load_config()
    _init_client(config)
    yield


app = FastAPI(title="Bookloop", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 禁用静态文件缓存（避免 UI 更新后浏览器使用旧版本）
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request


class NoCacheStaticMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        if path.endswith((".html", ".js", ".css")) or path == "/":
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response


app.add_middleware(NoCacheStaticMiddleware)

# —— 常规书友生成 prompt（与 add_book 共用，不重复定义） ——
BOOK_GEN_PROMPT = """你是一个书籍知识专家。用户想添加一本书作为 AI 书友。

书名：《{name}》
作者：{author}

请先诚实判断：你是否对这本书有足够的了解来创建 persona？

如果这本书不存在、或你完全不熟悉、或你只知道皮毛不足以创建 persona，请严格只回复一个词：UNKNOWN

如果你对这本书有充分了解，请用以下 JSON 格式回复（只输出 JSON，不要其他内容）：
{{
  "match_trigger": "3-5个最能触发这本书回答的话题关键词，用顿号分隔",
  "knowledge_summary": "100-200字的核心思想摘要",
  "system_prompt": "你是《{name}》这本书的化身。描述你的说话风格...\\n\\n你的核心信念：\\n1. ...\\n2. ...\\n\\n回复风格：\\n- ...\\n- 每段回复控制在3-8句话"
}}"""


# ═══════════ 配置 API ═══════════

class ConfigResponse(BaseModel):
    api_key: str = ""
    base_url: str = ""
    matcher_model: str = ""
    responder_model: str = ""
    max_responders: int = 5
    has_api_key: bool = False
    connected: bool = False


@app.get("/api/config", response_model=ConfigResponse)
async def get_config():
    """获取当前配置（API key 脱敏）"""
    config = load_config()
    public = config_public(config)
    return ConfigResponse(
        **public,
        connected=state.client is not None,
    )


class UpdateConfigRequest(BaseModel):
    api_key: str = ""
    base_url: str = ""
    matcher_model: str = ""
    responder_model: str = ""
    max_responders: int | str | None = None


@app.post("/api/config", response_model=ConfigResponse)
async def update_config(request: UpdateConfigRequest):
    """更新配置，保存到 config.json，热重载 client"""
    config = load_config()

    if request.api_key and "****" not in request.api_key:
        config["api_key"] = request.api_key
    if request.base_url:
        config["base_url"] = request.base_url
    if request.matcher_model:
        config["matcher_model"] = request.matcher_model
    if request.responder_model:
        config["responder_model"] = request.responder_model
    if request.max_responders is not None:
        try:
            config["max_responders"] = int(request.max_responders)
        except (ValueError, TypeError):
            pass

    ok = _init_client(config)
    if ok:
        # 真正测试 API 连接
        try:
            state.client.chat.completions.create(
                model=state.responder_model,
                messages=[{"role": "user", "content": "hi"}],
                max_tokens=5,
            )
        except Exception:
            ok = False
            state.client = None

    save_config(config)

    public = config_public(config)
    return ConfigResponse(
        **public,
        connected=ok,
    )


# ═══════════ 书库 API ═══════════

@app.get("/api/library")
async def list_library(q: str = ""):
    """返回书库列表，用于前端浏览选择"""
    result = []
    query = q.strip().lower()
    for b in BOOK_LIBRARY:
        if query and query not in b["name"].lower() and query not in b["author"].lower():
            continue
        result.append({
            "name": b["name"],
            "author": b["author"],
            "emoji": b["emoji"],
            "color": b["color"],
        })
    return result


# ═══════════ 书友 API ═══════════

import hashlib
import json
import re


def _make_id(name: str) -> str:
    h = hashlib.md5(name.encode()).hexdigest()[:8]
    return f"custom_{h}"


def _parse_book_json(content: str) -> dict | None:
    try:
        data = json.loads(content)
        if isinstance(data, dict) and "knowledge_summary" in data:
            return data
    except json.JSONDecodeError:
        pass
    match = re.search(r'\{[\s\S]*?\}', content)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return None


@app.get("/api/books")
async def list_books():
    return [
        {
            "id": b["id"],
            "name": b["name"],
            "author": b["author"],
            "emoji": b["emoji"],
            "color": b["color"],
            "builtin": b.get("builtin", True),
            "verified": b.get("verified", True),
        }
        for b in BOOKS
    ]


@app.get("/api/books/{book_id}/soul")
async def book_soul(book_id: str):
    """返回某本书的完整人设（灵魂）"""
    for b in BOOKS:
        if b["id"] == book_id:
            return {
                "id": b["id"],
                "name": b["name"],
                "author": b["author"],
                "emoji": b["emoji"],
                "color": b["color"],
                "match_trigger": b.get("match_trigger", ""),
                "knowledge_summary": b.get("knowledge_summary", ""),
                "system_prompt": b.get("system_prompt", ""),
                "verified": b.get("verified", True),
            }
    raise HTTPException(status_code=404, detail="书友不存在")


@app.post("/api/books", response_model=AddBookResponse)
async def add_book(request: AddBookRequest):
    if not state.client:
        raise HTTPException(status_code=503, detail="请先配置 API Key")

    name = request.name.strip()
    author = request.author.strip() or "未知"

    if not name:
        return AddBookResponse(success=False, error="书名不能为空")

    for b in BOOKS:
        if b["name"] == name:
            return AddBookResponse(success=False, error=f"「{name}」已经在群里了")

    # 书库查找：如果标记为 from_library，先查本地库
    if request.from_library:
        lib_book = lookup_in_library(name)
        if lib_book:
            book = {
                "id": _make_id(name), "name": name, "author": lib_book["author"],
                "emoji": lib_book["emoji"], "color": lib_book["color"],
                "match_trigger": lib_book["match_trigger"],
                "knowledge_summary": lib_book["knowledge_summary"],
                "system_prompt": lib_book["system_prompt"],
                "builtin": False, "verified": True,
            }
            add_custom_book(book)
            return AddBookResponse(success=True, book={
                "id": book["id"], "name": book["name"], "author": book["author"],
                "emoji": book["emoji"], "color": book["color"],
                "builtin": book["builtin"], "verified": book["verified"],
            })

    try:
        response = state.client.chat.completions.create(
            model=state.responder_model,
            messages=[
                {"role": "user", "content": BOOK_GEN_PROMPT.format(name=name, author=author)},
            ],
            temperature=0.3,
            max_tokens=1000,
        )
        content = response.choices[0].message.content.strip()
    except Exception:
        content = "UNKNOWN"

    if "UNKNOWN" in content.upper() and len(content) < 20:
        book = {
            "id": _make_id(name),
            "name": name,
            "author": author,
            "emoji": "📖",
            "color": "#BBBBBB",
            "match_trigger": name,
            "knowledge_summary": f"用户自定义书友：《{name}》。大模型对此书了解有限。",
            "system_prompt": (
                f"你是《{name}》的化身。但说实话，我对这本书了解不多。"
                f"我会尽力根据书名和作者({author})来回应，但可能不够精准。"
                f"我会用温和、有礼貌的方式回应，像一个不太确定但愿意倾听的朋友。"
                f"每段回复控制在3-8句话。"
            ),
            "builtin": False,
            "verified": False,
        }
        add_custom_book(book)
        return AddBookResponse(success=True, book={
            "id": book["id"], "name": book["name"], "author": book["author"],
            "emoji": book["emoji"], "color": book["color"],
            "builtin": book["builtin"], "verified": book["verified"],
        })

    data = _parse_book_json(content)
    if not data:
        book = {
            "id": _make_id(name), "name": name, "author": author,
            "emoji": "📖", "color": "#BBBBBB", "match_trigger": name,
            "knowledge_summary": f"用户自定义书友：《{name}》。",
            "system_prompt": (
                f"你是《{name}》的化身。请根据你对这本书的了解来回应。每段回复控制在3-8句话。"
            ),
            "builtin": False, "verified": False,
        }
        add_custom_book(book)
        return AddBookResponse(success=True, book={
            "id": book["id"], "name": book["name"], "author": book["author"],
            "emoji": book["emoji"], "color": book["color"],
            "builtin": book["builtin"], "verified": book["verified"],
        })

    book = {
        "id": _make_id(name), "name": name, "author": author,
        "emoji": "📚", "color": "#7B9E6D",
        "match_trigger": data.get("match_trigger", name),
        "knowledge_summary": data["knowledge_summary"],
        "system_prompt": data["system_prompt"],
        "builtin": False, "verified": True,
    }
    add_custom_book(book)
    return AddBookResponse(success=True, book={
        "id": book["id"], "name": book["name"], "author": book["author"],
        "emoji": book["emoji"], "color": book["color"],
        "builtin": book["builtin"], "verified": book["verified"],
    })


@app.delete("/api/books/{book_id}")
async def delete_book(book_id: str):
    if remove_custom_book(book_id):
        return {"ok": True}
    raise HTTPException(status_code=404, detail="书友不存在")


@app.post("/api/books/{book_id}/resoul")
async def resoul_book(book_id: str):
    """用当前 AI 模型重新生成书友灵魂"""
    if not state.client:
        raise HTTPException(status_code=503, detail="请先配置 API Key")

    for b in BOOKS:
        if b["id"] == book_id:
            break
    else:
        raise HTTPException(status_code=404, detail="书友不存在")

    name = b["name"]
    author = b["author"]

    try:
        response = state.client.chat.completions.create(
            model=state.responder_model,
            messages=[
                {"role": "user", "content": BOOK_GEN_PROMPT.format(name=name, author=author)},
            ],
            temperature=0.3,
            max_tokens=1000,
        )
        content = response.choices[0].message.content.strip()
    except Exception:
        raise HTTPException(status_code=500, detail="大模型调用失败，请检查 API 配置")

    if "UNKNOWN" in content.upper() and len(content) < 20:
        raise HTTPException(status_code=422, detail="当前大模型对这本书了解不足，无法重新蒸馏")

    data = _parse_book_json(content)
    if not data:
        raise HTTPException(status_code=422, detail="大模型返回格式异常，请重试")

    update_book_soul(book_id, {
        "match_trigger": data.get("match_trigger", name),
        "knowledge_summary": data["knowledge_summary"],
        "system_prompt": data["system_prompt"],
    })

    return {
        "id": book_id,
        "name": name,
        "author": author,
        "emoji": b["emoji"],
        "color": b["color"],
        "match_trigger": data.get("match_trigger", name),
        "knowledge_summary": data["knowledge_summary"],
        "system_prompt": data["system_prompt"],
        "verified": True,
    }


# ═══════════ 蒸馏 API ═══════════

@app.post("/api/distill")
async def start_distillation(file: UploadFile = File(...), name: str = Form(...), author: str = Form("")):
    """上传 MD 文件，启动异步蒸馏"""
    if not state.client:
        raise HTTPException(status_code=503, detail="请先配置 API Key")
    if not file.filename or not file.filename.endswith((".md", ".txt", ".markdown")):
        raise HTTPException(status_code=400, detail="仅支持 .md 或 .txt 文件")
    if not name.strip():
        raise HTTPException(status_code=400, detail="书名不能为空")

    try:
        content = (await file.read()).decode("utf-8")
    except UnicodeDecodeError:
        try:
            await file.seek(0)
            content = (await file.read()).decode("gbk")
        except Exception:
            raise HTTPException(status_code=400, detail="无法解码文件，请确认是 UTF-8 编码")

    if len(content) < 100:
        raise HTTPException(status_code=400, detail="文件内容太短（至少100字）")

    task_id = start_distill(state.client, state.responder_model, name.strip(), author.strip(), content, state.distill_tasks)
    return {"task_id": task_id}


@app.get("/api/distill/{task_id}")
async def check_distillation(task_id: str):
    """查询蒸馏进度"""
    task = state.distill_tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在或已过期")

    # 完成后把 result 里的 persona 加入 BOOKS 并清理
    resp = {
        "status": task["status"],
        "progress": task["progress"],
        "stage": task["stage"],
        "error": task.get("error"),
    }
    if task["status"] == "done":
        import hashlib
        result = task["result"]
        book_id = f"custom_{hashlib.md5(result['name'].encode()).hexdigest()[:8]}"
        book = {
            "id": book_id,
            "name": result["name"],
            "author": result["author"],
            "emoji": result["emoji"],
            "color": result["color"],
            "match_trigger": result["match_trigger"],
            "knowledge_summary": result["knowledge_summary"],
            "system_prompt": result["system_prompt"],
            "builtin": False,
            "verified": True,
        }
        add_custom_book(book)
        resp["book"] = {
            "id": book["id"], "name": book["name"], "author": book["author"],
            "emoji": book["emoji"], "color": book["color"],
            "builtin": False, "verified": True,
        }
        # 清理任务
        del state.distill_tasks[task_id]
    return resp


# ═══════════ 聊天 API ═══════════

@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    if not state.client:
        raise HTTPException(status_code=503, detail="请先在设置中配置 API Key")

    # 解析 @书友 提及
    forced_ids = []
    mentioned = re.findall(r'@(\S+)', request.message)
    for name in mentioned:
        for b in BOOKS:
            if b["name"] == name or name in b["name"]:
                forced_ids.append(b["id"])
                break

    config = load_config()
    max_responders = int(config.get("max_responders", 5))
    matched = match_books(state.client, state.matcher_model, request.message, BOOKS, max_responders, forced_ids=forced_ids)
    responses = await generate_responses(state.client, state.responder_model, matched, request.message)

    return ChatResponse(responses=responses)


# —— 静态文件服务（React 构建产物） ——
# PyInstaller 打包后前端文件在 sys._MEIPASS/frontend/dist
# 开发模式下在 ../frontend/dist
def _get_static_dir() -> Path:
    if getattr(sys, 'frozen', False):
        base = Path(sys._MEIPASS)  # type: ignore
    else:
        base = Path(__file__).resolve().parent.parent
    return base / "frontend" / "dist"


_static_dir = _get_static_dir()
if _static_dir.exists():
    app.mount("/", StaticFiles(directory=str(_static_dir), html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
