"""
回复生成器：为每本匹配到的书并行生成回复。
每本书用自己独特的 system prompt。
"""

import asyncio
import re
from openai import OpenAI


def _strip_thinking(content: str) -> str:
    """移除 <think>...</think> 标签"""
    return re.sub(r'<\s*think\s*>.*?<\s*/\s*think\s*>', '', content, flags=re.DOTALL | re.IGNORECASE).strip()


RESPONSE_INSTRUCTION = """
用户的消息是：{user_message}

请用你的视角和智慧来回应。记住：
- 这是群聊，回复要像朋友聊天，不要长篇大论
- 3-8句话即可
- 保持你的独特风格和口吻
- 不要标注"来自某书"之类的后缀，自然地说话
- 可以呼应也可以不呼应其他书的观点（你还没看到其他人的回复）
"""


async def _generate_one(
    client: OpenAI, model: str, book: dict, user_message: str
) -> dict:
    """为单本书生成回复"""
    user_content = RESPONSE_INSTRUCTION.format(user_message=user_message)

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": book["system_prompt"]},
                {"role": "user", "content": user_content},
            ],
            temperature=0.7,
            max_tokens=800,
        )
        content = response.choices[0].message.content.strip()
        content = _strip_thinking(content)
    except Exception as e:
        content = f"（{book['name']} 暂时无法回复：{e}）"

    return {
        "book_id": book["id"],
        "book_name": book["name"],
        "author": book["author"],
        "message": content,
        "match_reason": book.get("match_reason", ""),
    }


async def generate_responses(
    client: OpenAI, model: str, matched_books: list[dict], user_message: str
) -> list[dict]:
    """并行生成所有匹配书籍的回复"""
    tasks = [_generate_one(client, model, book, user_message) for book in matched_books]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    responses = []
    for r in results:
        if isinstance(r, Exception):
            continue
        responses.append(r)
    return responses
