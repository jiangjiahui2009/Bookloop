"""
批量投喂管道：扫描文件夹 → 逐篇匹配书友 → 生成回复 → 输出汇总
"""

import os
import re
import asyncio
import threading
import uuid
from pathlib import Path

from matcher import match_books
from responder import generate_responses


def _strip_thinking(content: str) -> str:
    return re.sub(r'<\s*think\s*>.*?<\s*/\s*think\s*>', '', content, flags=re.DOTALL | re.IGNORECASE).strip()


def scan_folder(folder_path: str) -> list[tuple[str, str]]:
    """扫描文件夹，返回 [(文件名不带后缀, 文件内容), ...]，按文件名排序"""
    results = []
    path = Path(folder_path)
    if not path.is_dir():
        raise ValueError(f"文件夹不存在: {folder_path}")

    for f in sorted(path.iterdir()):
        if f.is_file() and f.suffix.lower() in (".md", ".txt", ".markdown"):
            try:
                content = f.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                try:
                    content = f.read_text(encoding="gbk")
                except Exception:
                    continue
            if content.strip():
                results.append((f.stem, content))
    return results


def write_output(output_dir: Path, filename: str, content: str, responses: list[dict]):
    """将原文和书友回复写入汇总 markdown"""
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{filename}.md"

    lines = [
        f"# {filename}",
        "",
        content.strip(),
        "",
        "---",
        "",
        "## 书友回复",
        "",
    ]

    for r in responses:
        lines.append(f"### {r.get('emoji', '📖')} {r['book_name']}（{r['author']}）")
        lines.append(r["message"].strip())
        lines.append("")

    output_path.write_text("\n".join(lines), encoding="utf-8")


def _update_task(tasks: dict, task_id: str, **kwargs):
    if task_id in tasks:
        tasks[task_id].update(kwargs)


def _run_batch(
    client, matcher_model: str, responder_model: str,
    folder_path: str, books: list[dict], max_responders: int,
    tasks: dict, task_id: str,
):
    """在线程中执行批量处理"""
    try:
        # Step 1: 扫描文件夹
        _update_task(tasks, task_id, stage="扫描文件夹...", progress=0)
        files = scan_folder(folder_path)

        if not files:
            _update_task(tasks, task_id, status="error", error="文件夹中没有 .md 或 .txt 文件")
            return

        output_dir = Path(folder_path) / "output"
        total = len(files)

        # Step 2: 逐篇处理
        for idx, (filename, content) in enumerate(files):
            stage = f"处理中 ({idx + 1}/{total}): {filename}"
            progress = 5 + int(90 * (idx + 1) / total)
            _update_task(tasks, task_id, stage=stage, progress=progress, current=idx + 1, total=total)

            try:
                # 匹配书友
                matched = match_books(client, matcher_model, content, books, max_responders)

                if not matched:
                    # 没有匹配就跳过，但记录原文
                    write_output(output_dir, filename, content, [])
                    continue

                # 并行生成回复（在同步线程中运行异步代码）
                loop = asyncio.new_event_loop()
                responses = loop.run_until_complete(
                    generate_responses(client, responder_model, matched, content)
                )
                loop.close()

                # 写输出
                write_output(output_dir, filename, content, responses)

            except Exception as e:
                # 单篇失败不中断，写入错误信息
                write_output(output_dir, filename, content, [{
                    "book_name": "系统",
                    "author": "",
                    "emoji": "⚠️",
                    "message": f"处理失败：{e}",
                }])

        _update_task(tasks, task_id, status="done", stage="完成", progress=100, current=total, total=total)

    except Exception as e:
        _update_task(tasks, task_id, status="error", error=str(e))


def start_batch(client, matcher_model: str, responder_model: str, folder_path: str, books: list[dict], max_responders: int, tasks: dict) -> str:
    """启动批量处理，返回 task_id"""
    task_id = uuid.uuid4().hex[:8]
    tasks[task_id] = {
        "status": "processing",
        "progress": 0,
        "stage": "准备中...",
        "current": 0,
        "total": 0,
        "error": None,
    }
    t = threading.Thread(
        target=_run_batch,
        args=(client, matcher_model, responder_model, folder_path, books, max_responders, tasks, task_id),
        daemon=True,
    )
    t.start()
    return task_id
