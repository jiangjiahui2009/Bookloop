# Bookloop — AI 书友群聊

让经典书籍化身 AI 书友，在一个群聊里与你对话。你发一条消息，系统自动匹配最相关的书友来回复你。

<img src="appicon.png" width="128" height="128" alt="Bookloop icon">

## 设计思路

**核心理念：每本书是一个独立的 AI 人格。** 不是把书当作知识库来检索，而是让书「活过来」，用它的语气、信念、智慧来回应你。

**两阶段管道 — 先匹配，再回复：**

```
用户消息 → 匹配模型（轻量快速）→ 选出最相关的 1-5 本书
                              ↓ 并行调用
                         回复模型（每本书用自己的 system_prompt 独立回复）
```

这样设计的好处：
- **成本可控**：匹配用便宜的模型（只需输出几个词），只有被选中的书才用旗舰模型生成回复
- **回复质量高**：每本书用定制的 system_prompt，包含核心信念、语言风格、说话习惯，而不是通用的"请用XX的语气回复"
- **群聊感**：书的回复互不依赖、并行生成，前端逐条渲染间隔 600ms，模拟真实群聊中有人打字、有人思考的节奏

**无数据库，零依赖部署。** 所有书友定义在 Python 字典中，消息存在浏览器 localStorage。一个 FastAPI 进程 + 一个前端构建产物即可运行。

## 使用方式（三选一）

### 方式一：下载 DMG 安装（推荐）

下载 [最新 DMG](https://github.com/yourusername/bookloop/releases)，双击挂载后把 Bookloop 拖入 Applications，双击运行。首次使用在设置中填入 API Key。

> 需要 macOS 系统。

### 方式二：源码运行（Web 浏览器）

```bash
git clone https://github.com/yourusername/bookloop.git
cd bookloop

# 后端
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # 编辑填入 API Key

# 前端
cd ../frontend
npm install && npm run build

# 启动
cd ../backend
python main.py
```

浏览器访问 `http://localhost:8000`。

> 需要 Python 3.10+、Node.js 18+、OpenAI 兼容 API Key（推荐 [MiniMax](https://platform.minimaxi.com)）。

### 方式三：安装 Claude Code Skill

把 `skill/bookloop.md` 放入你的 Claude Code skills 目录，之后即可通过 `/bookloop` 命令使用。

---

## 功能

- **智能匹配**：根据你的话题，自动选择 1-5 本书来回复（数量可在设置中调整）
- **@点名**：输入 `@` 选择书友，被点名的书必定回复
- **书库浏览**：从预置书库（39+ 本）中选择书籍加入群聊
- **手动添加**：输入书名和作者，AI 自动生成书友人格
- **蒸馏原书**：上传 .md 文档，AI 分块提取、汇总合成书友人格
- **查看灵魂**：点击书友头像 → Soul，查看完整的 system_prompt、知识摘要、触发关键词
- **重新蒸馏**：对任意书友重新生成人格
- **群名自定义**：点击群名即可修改
- **消息持久化**：消息保存在本地浏览器中

## 技术架构

```
前端 (React + Vite + Tailwind CSS)
  ↕ HTTP /api/*
后端 (Python FastAPI + uvicorn)
  ↕ OpenAI 兼容 API
大模型 (MiniMax / 任意兼容 OpenAI 接口的服务)

桌面端：pywebview (WKWebView) → 原生 macOS 窗口
```

### 两阶段 LLM 管道

1. **匹配阶段**（matcher 模型，轻量快速）：分析用户消息 → 输出最相关的书友列表
2. **回复阶段**（responder 模型，并行调用）：每本书用各自的 system_prompt 生成回复

```
用户消息 → match_books() → [书友A, 书友B, 书友C]
                              ↓ asyncio.gather (并行)
                    generate_responses() → [回复A, 回复B, 回复C]
```

## 项目结构

```
Bookloop/
├── backend/
│   ├── main.py               # FastAPI 入口，所有 API 路由
│   ├── books.py               # 内置书友定义 + 运行时 CRUD
│   ├── book_library.py        # 预置书库（39+ 本完整 persona）
│   ├── matcher.py             # 话题→书友匹配器（LLM）
│   ├── responder.py           # 并行回复生成器（asyncio）
│   ├── distiller.py           # MD 文档蒸馏管道（分块→提取→合成）
│   ├── config.py              # 多层配置管理
│   ├── models.py              # Pydantic 数据模型
│   ├── launcher.py            # macOS 原生窗口启动器
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # 根组件，状态管理
│   │   ├── api.js              # 全部 API 调用
│   │   └── components/
│   │       ├── Sidebar.jsx        # 侧栏（书友列表、添加、详情）
│   │       ├── ChatWindow.jsx     # 消息列表
│   │       ├── MessageBubble.jsx  # 消息气泡
│   │       ├── InputBar.jsx       # 输入框（含 @提及 自动补全）
│   │       └── SettingsModal.jsx  # 设置弹窗
│   └── package.json
├── docs/
│   ├── DESIGN.md              # 架构设计文档
│   ├── BOOK_LIBRARY.md        # 书库说明
│   └── 书库列表.md             # 书库中文列表
├── skill/
│   └── bookloop.md            # Claude Code Skill 定义
├── dist/                      # 打包产物（.app, .dmg），git 忽略
├── Bookloop.spec              # PyInstaller 打包配置
├── appicon.png                # 应用图标
├── README.md
└── .gitignore
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/books` | 获取书友列表 |
| POST | `/api/books` | 添加书友 |
| GET | `/api/books/{id}/soul` | 查看书友灵魂（完整 persona） |
| POST | `/api/books/{id}/resoul` | 重新生成书友灵魂 |
| DELETE | `/api/books/{id}` | 删除书友 |
| GET | `/api/library?q=` | 搜索预置书库 |
| POST | `/api/distill` | 上传 MD 蒸馏书友 |
| GET | `/api/distill/{task_id}` | 查询蒸馏进度 |
| POST | `/api/chat` | 发送消息 |
| GET/POST | `/api/config` | 查看/更新配置 |

## 打包为 macOS 应用

```bash
# 1. 构建前端
cd frontend && npm run build

# 2. PyInstaller 打包
pyinstaller Bookloop.spec --noconfirm

# 3. 创建 DMG（需要 brew install create-dmg）
create-dmg \
  --volname "Bookloop" \
  --window-pos 200 120 --window-size 500 320 \
  --icon-size 80 --icon "Bookloop.app" 100 120 \
  --app-drop-link 380 120 \
  "dist/Bookloop.dmg" "dist/Bookloop.app"
```

## 书友结构

每本书友包含以下字段：

```json
{
  "id": "little_prince",
  "name": "小王子",
  "author": "安托万·德·圣埃克苏佩里",
  "emoji": "🌟",
  "color": "#FFD700",
  "match_trigger": "童年与成人世界、爱与驯养、孤独与陪伴…",
  "knowledge_summary": "全球发行量仅次于《圣经》的法语文学作品…",
  "system_prompt": "你是《小王子》这本书的化身…"
}
```

## License

MIT
