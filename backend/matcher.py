"""
智能匹配器：根据用户消息，判断哪1-3本书最适合回答。
匹配规则从 books.py 的 match_trigger 字段自动生成，新增书友无需改这里。
"""

import json
import re
from openai import OpenAI


def _build_matcher_prompt(books: list[dict], max_responders: int) -> str:
    """根据当前书库动态生成匹配提示词"""
    rules = "\n".join(
        f"- 如果用户聊 {b['match_trigger']} → {b['name']}"
        for b in books
    )
    ids = ", ".join(b["id"] for b in books)

    return f"""你是一个群聊的"话题匹配器"。群里有{len(books)}本书作为成员。用户发了一条消息，你需要判断哪1-{max_responders}本书最适合回复用户。

根据用户消息的内容，选择与之最相关的书。匹配原则：
{rules}
- 大多数问题不止一本书能回应，选择最匹配的1-{max_responders}本
- 如果没有任何书明显相关，返回空数组 []

请严格只输出 JSON 数组，不要输出任何其他内容：
[{{"book_id": "...", "reason": "一句话说明"}}, ...]

可用的 book_id: {ids}"""


def _parse_json(content: str) -> list:
    """从模型输出中提取 JSON 数组，三层容错"""
    try:
        data = json.loads(content)
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            if "matches" in data:
                return data["matches"]
            if "book_id" in data:
                return [data]
    except json.JSONDecodeError:
        pass

    match = re.search(r'\[[\s\S]*?\]', content)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    return []


def match_books(client: OpenAI, model: str, user_message: str, books: list[dict], max_responders: int = 5, forced_ids: list[str] | None = None) -> list[dict]:
    """返回匹配的书籍列表，包含匹配理由。如果没有匹配，返回空列表。
    forced_ids: 用户 @提及的书，这些书一定会出现在回复列表中。"""
    forced_ids = forced_ids or []

    if not books:
        return []

    book_summaries = "\n".join(
        f"- {b['id']}（{b['name']}）：{b['knowledge_summary'][:200]}"
        for b in books
    )

    # 如果有 @提及，在系统提示中强调这些书必须回复
    extra_instruction = ""
    if forced_ids:
        forced_names = []
        for fid in forced_ids:
            fb = next((b for b in books if b["id"] == fid), None)
            if fb:
                forced_names.append(fb["name"])
        if forced_names:
            extra_instruction = f"\n\n重要：用户通过 @ 点名了以下书友：{'、'.join(forced_names)}。请务必在结果中包含这些书友（必须回复）。"

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": _build_matcher_prompt(books, max_responders) + extra_instruction},
                {
                    "role": "user",
                    "content": f"可用书籍：\n{book_summaries}\n\n用户消息：{user_message}",
                },
            ],
            temperature=0.1,
            max_tokens=500,
        )
        content = response.choices[0].message.content.strip()
        content = re.sub(r'<\s*think\s*>.*?<\s*/\s*think\s*>', '', content, flags=re.DOTALL | re.IGNORECASE).strip()
        matches = _parse_json(content)
    except Exception:
        matches = []

    result = []
    seen = set()
    # 先把 @提及的强制加入
    for fid in forced_ids:
        book = next((b for b in books if b["id"] == fid), None)
        if book and fid not in seen:
            result.append({**book, "match_reason": "用户 @点名"})
            seen.add(fid)
    # 再追加 LLM 匹配的
    for m in matches[:max_responders]:
        bid = m["book_id"]
        if bid in seen:
            continue
        book = next((b for b in books if b["id"] == bid), None)
        if book:
            result.append({**book, "match_reason": m.get("reason", "")})
            seen.add(bid)
        if len(result) >= max_responders:
            break

    if not result:
        # fallback: 没匹配时随机选两本内置书
        builtins = [b for b in books if b.get("builtin", True)]
        for b in builtins[:2]:
            result.append({**b, "match_reason": "总有一本能聊聊"})

    return result
