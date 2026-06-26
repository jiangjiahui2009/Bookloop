"""
蒸馏管道：上传 MD 文档 → 分块 → 逐块提取 → 汇总合成 → 书友 Persona
"""

import re
import json
import threading
import uuid


def _strip_think(content: str) -> str:
    """移除 <think>...</think> 标签"""
    return re.sub(r'<\s*think\s*>.*?<\s*/\s*think\s*>', '', content, flags=re.DOTALL | re.IGNORECASE).strip()

CHUNK_SIZE = 3000
CHUNK_OVERLAP = 200

EXTRACT_PROMPT = """你是一位书籍编辑。请仔细阅读下面的文本片段，提取出最关键的内容特征。

请按以下格式输出（3-5句话，每条一行）：
- 主题：这段文本在讲什么？（1-2句话概括核心主题）
- 风格：文字的语气、节奏、修辞特点是什么样的？
- 信念：作者在文中透露出什么价值观或信念？

文本：
{chunk}"""

SYNTHESIZE_PROMPT = """你是一位书籍编辑。你正在为一本书创建 AI 人格。下面是编辑助理从书中不同章节提取出的内容摘要。

书名：《{name}》
作者：{author}

各章节提取结果：
{extractions}

请用以下 JSON 格式回复（只输出 JSON，不要其他内容，不要用 markdown 代码块包裹）：

{{"match_trigger":"3-5个最能触发这本书回答的话题关键词，用顿号分隔","knowledge_summary":"100-200字的核心思想摘要","system_prompt":"你是《{name}》这本书的化身。描述你的说话风格...\\n\\n你的核心信念：\\n1. ...\\n2. ...\\n\\n回复风格：\\n- ...\\n- 每段回复控制在3-8句话"}}

注意事项：
- 只输出纯 JSON，不要加 ```json 或任何标记
- JSON 必须是一行或严格转义多行字符串
- system_prompt 中的换行必须用 \\n 表示，不能用真实换行
- 所有双引号必须转义为 \\"
"""


def split_chunks(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """将长文本切分为重叠的块"""
    if len(text) <= chunk_size:
        return [text]

    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start = end - overlap
    return chunks


def _parse_json_safe(content: str) -> dict | None:
    """安全解析 JSON，多层容错"""
    content = _strip_think(content)

    # 去掉 markdown 代码块标记
    content = re.sub(r'```(?:json)?\s*', '', content)
    content = re.sub(r'```', '', content)

    # 先尝试直接解析
    try:
        data = json.loads(content)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass

    # 尝试找到花括号包围的 JSON（找到最外层 { 和最外层 }）
    start = content.find('{')
    if start >= 0:
        # 从末尾向前找最后一个 }
        end = content.rfind('}')
        if end > start:
            json_str = content[start:end + 1]
            try:
                return json.loads(json_str)
            except json.JSONDecodeError:
                pass
            # 尝试修复常见问题后重新解析
            try:
                fixed = re.sub(r',\s*}', '}', json_str)  # 去掉尾部多余逗号
                fixed = re.sub(r',\s*]', ']', fixed)      # 去掉数组尾部多余逗号
                return json.loads(fixed)
            except json.JSONDecodeError:
                pass

    # 最终兜底：用正则提取三个字段
    result = {}
    for field in ['match_trigger', 'knowledge_summary', 'system_prompt']:
        # 匹配 "field": "value" 或 "field":"value"
        pattern = rf'"{field}"\s*:\s*"((?:[^"\\]|\\"|\\\\)*)"'
        m = re.search(pattern, content)
        if m:
            result[field] = m.group(1).replace('\\"', '"').replace('\\\\', '\\')
    if len(result) >= 2:
        return result
    return None


def _update_task(tasks: dict, task_id: str, **kwargs):
    """线程安全更新任务状态"""
    if task_id in tasks:
        tasks[task_id].update(kwargs)


def _run_distill(client, model, name: str, author: str, text: str, tasks: dict, task_id: str):
    """在线程中执行蒸馏"""
    try:
        # Step 1: 分块
        chunks = split_chunks(text)
        total = len(chunks)
        _update_task(tasks, task_id, stage=f"文档已分 {total} 块", progress=5)

        # Step 2: 逐块提取
        extractions = []
        for i, chunk in enumerate(chunks):
            _update_task(tasks, task_id, stage=f"分析第 {i+1}/{total} 块", progress=5 + int(75 * (i / total)))
            try:
                resp = client.chat.completions.create(
                    model=model,
                    messages=[{"role": "user", "content": EXTRACT_PROMPT.format(chunk=chunk)}],
                    temperature=0.3,
                    max_tokens=500,
                )
                content = _strip_think(resp.choices[0].message.content.strip())
                extractions.append(content)
            except Exception as e:
                extractions.append(f"（提取失败：{e}）")

        # Step 3: 汇总合成
        _update_task(tasks, task_id, stage="合成书友人格", progress=85)
        all_extractions = "\n\n---\n\n".join(
            f"第{i+1}部分：\n{e}" for i, e in enumerate(extractions)
        )
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": SYNTHESIZE_PROMPT.format(
                name=name, author=author, extractions=all_extractions
            )}],
            temperature=0.5,
            max_tokens=1500,
        )
        content = _strip_think(resp.choices[0].message.content.strip())

        data = _parse_json_safe(content)
        if not data:
            _update_task(tasks, task_id, status="error", error="大模型返回格式异常，请重试")
            return

        _update_task(tasks, task_id, stage="完成", progress=100, status="done", result={
            "name": name,
            "author": author,
            "emoji": "📚",
            "color": "#7B9E6D",
            "match_trigger": data.get("match_trigger", name),
            "knowledge_summary": data.get("knowledge_summary", f"用户上传的《{name}》"),
            "system_prompt": data.get("system_prompt", f"你是《{name}》的化身。请根据这本书的内容来回应。每段回复控制在3-8句话。"),
        })

    except Exception as e:
        _update_task(tasks, task_id, status="error", error=str(e))


def start_distill(client, model, name: str, author: str, text: str, tasks: dict) -> str:
    """启动蒸馏任务，返回 task_id"""
    task_id = uuid.uuid4().hex[:8]
    tasks[task_id] = {
        "status": "processing",
        "progress": 0,
        "stage": "开始分析文档",
        "error": None,
        "result": None,
    }
    t = threading.Thread(target=_run_distill, args=(client, model, name, author, text, tasks, task_id), daemon=True)
    t.start()
    return task_id
