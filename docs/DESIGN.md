# Bookloop 实现详解

## 一、整体架构

```
┌─────────────────────────────────────────────────────────┐
│                     浏览器 (localhost:5173)               │
│  ┌───────────────────────────────────────────────────┐  │
│  │                  React 前端                         │  │
│  │  ┌──────────┐  ┌──────────────┐  ┌────────────┐  │  │
│  │  │ Sidebar  │  │ ChatWindow   │  │ InputBar   │  │  │
│  │  │ 群成员列表│  │ 消息列表      │  │ 输入框     │  │  │
│  │  └──────────┘  └──────────────┘  └────────────┘  │  │
│  └──────────────────┬────────────────────────────────┘  │
│                     │ POST /api/chat                     │
│                     │ (Vite proxy → localhost:8000)      │
└─────────────────────┼───────────────────────────────────┘
                      │
┌─────────────────────┼───────────────────────────────────┐
│                     ▼           后端 (localhost:8000)     │
│  ┌───────────────────────────────────────────────────┐  │
│  │                  FastAPI (main.py)                  │  │
│  │                                                     │  │
│  │  ① 接收用户消息                                      │  │
│  │  ② matcher.py  → 智能匹配 (MiniMax-M2.7-highspeed) │  │
│  │  ③ responder.py → 并行生成回复 (MiniMax-M3)         │  │
│  │  ④ 返回所有回复给前端                                │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**核心技术栈：**
- 前端：React 19 + Vite + Tailwind CSS 4
- 后端：Python FastAPI（异步）
- AI：MiniMax API（OpenAI 兼容协议）
- 模型：匹配用 M2.7-highspeed（快+便宜），回复用 M3（旗舰）

---

## 二、一次消息的完整生命周期

假设用户在输入框输入「最近工作压力好大，老板总挑我刺」，然后按回车。以下是系统处理的 7 个步骤：

### 第 1 步：前端捕获用户输入

`InputBar.jsx` 监听键盘事件，Enter 键触发 `handleSend()`：

```javascript
// InputBar.jsx — 第 19-24 行
const handleKeyDown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();  // 阻止默认换行
    handleSend();         // 触发发送
  }
};
```

`handleSend()` 做三件事：
1. 检查输入不为空、不在发送中（`disabled` 状态）
2. 调用父组件传入的 `onSend(text)`
3. 清空输入框，重新聚焦

Shift+Enter 仍然可以换行。

### 第 2 步：App.jsx 更新状态，添加用户消息

`App.jsx` 的 `handleSend()` 是核心调度函数：

```javascript
// App.jsx — 第 19-48 行
const handleSend = async (text) => {
  // ① 立即在消息列表中加入用户消息（乐观更新）
  const userMsg = { role: 'user', content: text };
  setMessages((prev) => [...prev, userMsg]);

  // ② 设置 typing 状态 → UI 显示 "书友们正在思考..."
  setTyping(true);

  // ③ 调用后端 API
  const data = await sendMessage(text);

  // ④ 逐条渲染书的回复（间隔 600ms，模拟群聊节奏）
  for (const r of data.responses) {
    setMessages((prev) => [...prev, { role: 'book', ... }]);
    await new Promise((r) => setTimeout(r, 600));
  }

  setTyping(false);
};
```

### 第 3 步：请求通过 Vite 代理到达后端

`vite.config.js` 中配置了代理：

```javascript
// vite.config.js — 第 8-10 行
server: {
  proxy: {
    '/api': 'http://localhost:8000',  // 所有 /api/* 请求转发到后端
  },
}
```

前端 `fetch('/api/chat')` 实际请求被 Vite 开发服务器转发到 FastAPI 的 `http://localhost:8000/api/chat`。这样做的好处是：
- 前端和后端同源，不触发跨域问题
- 生产环境可以用 Nginx 做同样的反向代理

### 第 4 步：后端接收请求

`main.py` 的 `/api/chat` 路由处理请求：

```python
# main.py — 第 65-74 行
@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    # Pydantic 自动校验：request.message 必须是字符串
    matched = match_books(client, MATCHER_MODEL, request.message, BOOKS)
    responses = await generate_responses(client, RESPONDER_MODEL, matched, request.message)
    return ChatResponse(responses=responses)
```

### 第 5 步：智能匹配 — 决定哪本书回复

`matcher.py` 是整个系统的「调度员」。它做的事很简单：**把用户消息和三本书的知识摘要一起发给 MiniMax，让它判断谁最适合回答。**

```python
# matcher.py — 第 52-86 行
def match_books(client, model, user_message, books):
    # 1. 拼接每本书的 knowledge_summary（前 200 字）
    book_summaries = "\n".join(
        f"- {b['id']}（{b['name']}）：{b['knowledge_summary'][:200]}"
        for b in books
    )

    # 2. 调用 MiniMax-M2.7-highspeed（便宜快速）
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": MATCHER_PROMPT},
            {"role": "user", "content": f"可用书籍：\n{book_summaries}\n\n用户消息：{user_message}"},
        ],
        temperature=0.1,  # 低温 = 稳定输出
        max_tokens=500,   # 只需要返回 JSON，500 tokens 足够
    )

    # 3. 解析模型返回的 JSON
    matches = _parse_json(response.choices[0].message.content)

    # 4. 映射回完整的 book 对象（包含 system_prompt 等）
    result = []
    for m in matches[:3]:
        book = next((b for b in books if b["id"] == m["book_id"]), None)
        if book:
            result.append({**book, "match_reason": m.get("reason", "")})
    return result
```

**为什么要分两步（匹配 + 回复）而不是让所有书同时回复？**
1. **降低成本**：匹配用便宜模型 M2.7-highspeed，只有被选中的书才用 M3 生成回复
2. **减少噪音**：不相关的书强行回复会很尴尬
3. **更快响应**：匹配只需输出几个词，比生成完整回复快得多

**JSON 解析的容错处理**（`matcher.py` 第 26-49 行）：

因为 MiniMax 不支持 OpenAI 的 `response_format` 严格模式，模型可能返回带 markdown 包裹的 JSON 或其他格式。`_parse_json()` 做了三层容错：

```
第 1 层：json.loads() 直接解析
第 2 层：正则提取 [...] 再解析（处理 ```json ... ``` 包裹的情况）
第 3 层：返回空数组 → 触发 fallback 逻辑（至少返回前两本书）
```

### 第 6 步：并行生成回复

`responder.py` 收到匹配结果后，**并行**为每本书生成回复：

```python
# responder.py — 第 46-52 行
async def generate_responses(client, model, matched_books, user_message):
    # asyncio.gather 让所有书的 API 调用同时发出
    tasks = [_generate_one(client, model, book, user_message) for book in matched_books]
    responses = await asyncio.gather(*tasks)
    return list(responses)
```

每一本书的回复生成是独立的：

```python
# responder.py — 第 21-43 行
async def _generate_one(client, model, book, user_message):
    response = client.chat.completions.create(
        model=model,              # MiniMax-M3（旗舰质量）
        messages=[
            {"role": "system", "content": book["system_prompt"]},  # 书的 persona
            {"role": "user", "content": f"用户的消息是：「{user_message}」..."},
        ],
        temperature=0.7,   # 中等温度，保留创造性
        max_tokens=800,     # 群聊回复不需要太长
    )
    return {
        "book_id": book["id"],
        "book_name": book["name"],
        "author": book["author"],
        "message": response.choices[0].message.content.strip(),
        "match_reason": book.get("match_reason", ""),
    }
```

**为什么用 `asyncio.gather` 并行而不是串行？**
- 三本书的回复互不依赖，串行会让用户等 3 倍时间
- 并行发出 3 个 API 请求，总等待时间 ≈ 最慢的那个请求

### 第 7 步：前端渲染回复

前端收到 `{ responses: [...] }` 后，`App.jsx` 逐条渲染，每条间隔 600ms：

```javascript
for (const r of data.responses) {
  setMessages((prev) => [...prev, {
    role: 'book',
    sender: r.book_name,
    content: r.message,
    // ...
  }]);
  await new Promise((r) => setTimeout(r, 600));  // 模拟群聊自然节奏
}
```

这个 600ms 延迟是为了让界面看起来像真的群聊——书友们不是同时「想到」答案的，而是有人在打字、有人在思考。

---

## 三、Book Persona 设计

每本书在 `books.py` 中定义为一个字典，包含三个关键字段：

| 字段 | 说明 | 谁在用 |
|---|---|---|
| `knowledge_summary` | 200 字左右的核心思想摘要 | **matcher.py** — 发给匹配模型判断相关性 |
| `system_prompt` | 完整的 AI 人格定义（~500 字） | **responder.py** — 作为 system message 指导书的回复风格 |
| `emoji` / `color` | 视觉标识 | **前端** — 渲染头像和气泡 |

### 以「庄子」为例

```python
{
    "id": "zhuangzi",
    "name": "庄子",
    "emoji": "🦋",           # 庄周梦蝶
    "color": "#4A9E8F",      # 青色，道家
    "knowledge_summary": (   # 给匹配模型看的摘要
        "道家经典...核心思想：逍遥游（精神自由）、齐物论（万物平等）..."
    ),
    "system_prompt": (       # 给回复模型的人格指令
        "你是《庄子》这本书的化身。你是两千多年前的得道之人..."
        "你的核心信念：\n"
        "1. 天地与我并生，万物与我为一...\n"
        "2. 大鹏扶摇九万里，蜩鸠不过数仞而下...\n"
        "...\n"
        "回复风格：可用浅白文言...喜欢用寓言...结尾留余味"
    ),
}
```

### system_prompt 的设计原则

1. **身份锚定**："你是《XXX》这本书的化身"——给模型一个清晰的扮演角色
2. **核心信念枚举**：6 条左右，覆盖书里最重要的思想，让模型有据可依
3. **语言风格约束**：具体到句式、长短、是否用典故
4. **群聊适配**：限制 3-8 句话，提醒这是群聊不是论文

---

## 四、前端组件设计

```
App.jsx
├── Sidebar          # 左侧 256px 宽的固定栏
│   ├── 群聊标题 + 成员数
│   ├── 成员列表（头像 + 书名 + 作者）
│   └── 底部说明文字
│
├── ChatWindow       # 中间消息区域（flex-1，可滚动）
│   ├── 空状态提示（没有消息时显示 📚 + 引导文字）
│   ├── MessageBubble × N（消息气泡列表）
│   └── 打字指示器（typing 状态时显示跳动圆点 + "正在思考..."）
│
└── InputBar         # 底部固定输入区
    ├── textarea（自适应高度，Enter 发送，Shift+Enter 换行）
    └── 发送按钮（绿色，空内容或发送中时禁用）
```

### 组件通信：单向数据流

```
App.jsx (状态持有者)
  │
  ├─ messages, typing ──→ ChatWindow
  │                           └─→ MessageBubble (每条消息)
  ├─ books ──→ Sidebar
  ├─ onSend, disabled ──→ InputBar
  │                         └─ 用户输入 → onSend(text) → App.handleSend()
  │
  └─ api.js (封装 fetch 调用)
       ├─ fetchBooks()  → GET  /api/books
       └─ sendMessage() → POST /api/chat
```

所有状态都在 `App.jsx` 中管理（称为「状态提升」），子组件只负责渲染和触发事件。这样做的好处是：
- 任何组件都可以访问消息列表
- 状态变更逻辑集中在一个地方，容易调试

### 消息气泡的渲染逻辑

`MessageBubble.jsx` 根据 `msg.role` 决定渲染样式：

| role | 位置 | 颜色 | 头像 |
|---|---|---|---|
| `user` | 靠右 | 绿色 (#95ec69) | 无 |
| `book` | 靠左 | 白色 | emoji + 书名 + 作者 |

### 空状态 + 打字动画

- **空状态**：当 `messages.length === 0` 且不在 typing 时，显示引导 UI
- **打字动画**：3 个灰色小圆点上下跳动（CSS `@keyframes typingDot`），提示用户 AI 正在工作
- **自动滚到底部**：`ChatWindow` 中用 `useRef` + `useEffect` 监听 `messages` 变化，自动 `scrollIntoView`

---

## 五、MiniMax 适配要点

因为 MiniMax API 与 OpenAI 有细微差异，做了以下适配：

### 1. `response_format` 不支持

OpenAI 的 `response_format={"type": "json_object"}` 强制模型输出合法 JSON，但 MiniMax 不支持此参数。解决方案：在 `matcher.py` 中用 prompt 明确要求「只输出 JSON 数组」，并写了一个三层容错的 `_parse_json()` 函数来处理不规范的输出。

### 2. `temperature` 不能为 0

OpenAI 允许 `temperature=0`（完全确定性输出），MiniMax 要求 `> 0`。匹配器设为 `0.1`（极低但仍然有一点随机性）。

### 3. 模型选择

| 用途 | 模型 | 为什么 |
|---|---|---|
| 匹配 | MiniMax-M2.7-highspeed | MoE 架构，速度快 1.6x，只需输出几个词 |
| 回复 | MiniMax-M3 | 最新旗舰，1M 上下文，生成质量最高 |

### 4. OpenAI 兼容协议

MiniMax 提供了 OpenAI 兼容的 API 端点（`/v1/chat/completions`），所以可以直接用 `openai` Python SDK，只需修改 `base_url`：

```python
client = OpenAI(
    api_key="sk-...",
    base_url="https://mimimax.cn/v1"  # 指向 MiniMax 而非 OpenAI
)
```

---

## 六、配置说明

`backend/.env` 中的配置项：

```bash
OPENAI_API_KEY=sk-xxx           # MiniMax API Key
OPENAI_BASE_URL=https://mimimax.cn/v1  # MiniMax 端点
MATCHER_MODEL=MiniMax-M2.7-highspeed  # 匹配用模型（快 + 便宜）
RESPONDER_MODEL=MiniMax-M3            # 回复用模型（旗舰质量）
```

---

## 七、如何添加新书

在 `backend/books.py` 的 `BOOKS` 数组中添加一个新字典即可：

```python
{
    "id": "unique_id",            # 英文 ID，matcher 用
    "name": "书名",                # 显示在侧边栏和气泡上
    "author": "作者",
    "emoji": "📖",                # 头像 emoji
    "color": "#HEX颜色",          # 头像背景色
    "knowledge_summary": (        # 匹配用摘要，200 字左右
        "这本书的核心思想摘要..."
    ),
    "system_prompt": (            # AI 人格定义，500 字左右
        "你是《XXX》的化身...\n"
        "核心信念：\n"
        "1. ...\n"
        "回复风格：\n"
        "- ..."
    ),
}
```

同时更新 `matcher.py` 中 `MATCHER_PROMPT` 的匹配原则，加入新书的匹配条件。

前后端都会自动识别新书——前端通过 `GET /api/books` 动态获取，无需修改任何前端代码。
