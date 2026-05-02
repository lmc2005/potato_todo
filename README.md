# POTATO-TODO

POTATO-TODO 现在已经从“本地单机版”升级为一个可做公网上线的多用户学习规划系统：

- `FastAPI + Jinja2 + SQLite/PostgreSQL`
- 多用户注册 / 登录
- 用户数据严格隔离
- 学习计时、任务、日程、统计分析
- GPT 规划 / 分析
- 小自习室（房间码加入、排行榜、近实时刷新）

本项目仍然保留单体应用结构，不拆前后端，方便低成本部署到 Render 之类的平台。

## 当前能力

### 个人工作区

- Dashboard：今日总专注时长、任务概览、日程概览、Daily Quote
- Focus：`count up` / `count down` / `Pomodoro`
- Tasks：任务状态流转、逾期自动转 `undone`
- Calendar：日 / 周 / 月视图
- Analytics：多图表统计分析
- GPT Assistant：计划模式 + 聊天模式
- Backup / Import / Clear：现在都只作用于当前登录用户

### 多用户与公网上线

- 用户注册、登录、登出
- 服务端 session + cookie
- 所有个人数据按 `user_id` 隔离
- 支持 SQLite 本地开发，也支持 PostgreSQL 生产部署

### 小自习室

- 创建持久房间
- 通过房间码加入
- 一个用户可以加入多个房间
- 房主可重置房间码、踢人、关闭房间
- 房间内可见：
  - 今日专注总时长
  - 今日完成任务数
  - 今日未完成任务数
  - 今日超时完成任务数
  - 今日已完成任务标题
  - 今日进行中任务标题
  - 是否正在专注
- 排序规则：
  1. 今日专注总时长降序
  2. 今日完成任务数降序
  3. 今日超时完成任务数升序
  4. 入房时间升序
- 近实时刷新：`SSE`

## 项目结构

```text
potato_todo/
├── app/
│   ├── main.py
│   ├── database.py
│   ├── models.py
│   ├── schemas.py
│   ├── services/
│   │   ├── ai.py
│   │   ├── auth.py
│   │   ├── backup.py
│   │   ├── rooms.py
│   │   ├── settings.py
│   │   ├── stats.py
│   │   └── timer.py
│   ├── templates/
│   └── static/
├── backups/
├── data/
├── migrations/
├── .env.example
├── alembic.ini
├── render.yaml
├── runtime.txt
├── tests/
├── requirements.txt
└── README.md
```

## 运行环境

- Python `3.11+`
- macOS / Windows
- 桌面浏览器：Chrome / Edge / Safari

生产部署推荐：

- App：Render Web Service
- DB：Supabase PostgreSQL

## 安装依赖

### macOS

```bash
cd /path/to/potato_todo
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
cp .env.example .env
```

### Windows PowerShell

```powershell
cd C:\path\to\potato_todo
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

如果 PowerShell 禁止激活：

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

## 本地开发启动

### macOS

```bash
cd /path/to/potato_todo
source .venv/bin/activate
export $(grep -v '^#' .env | xargs)
alembic upgrade head
uvicorn app.main:app --reload
```

### Windows PowerShell

```powershell
cd C:\path\to\potato_todo
.\.venv\Scripts\Activate.ps1
Get-Content .env | ForEach-Object {
  if ($_ -and -not $_.StartsWith("#")) {
    $name, $value = $_ -split "=", 2
    Set-Item -Path "Env:$name" -Value $value
  }
}
alembic upgrade head
uvicorn app.main:app --reload
```

打开：

```text
http://127.0.0.1:8000
```

## 关闭服务

只关闭浏览器标签页，不会停止后端。

停止服务要回到运行 `uvicorn` 的那个终端：

- macOS：`Control + C`
- Windows：`Ctrl + C`

## 端口被占用

如果出现：

```text
ERROR: [Errno 48] Address already in use
```

可以换端口：

```bash
uvicorn app.main:app --reload --port 8001
```

也可以杀掉旧进程。

### macOS

```bash
lsof -iTCP:8000 -sTCP:LISTEN
kill <PID>
```

强制结束：

```bash
kill -9 <PID>
```

### Windows

```powershell
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

## 环境变量

### 必需 / 推荐变量

| 变量名 | 用途 | 本地开发 | 公网部署 |
|---|---|---:|---:|
| `STUDY_DB_URL` | 数据库连接串 | 可选 | 必需 |
| `APP_ENV` | 运行环境标识 | 建议 | 必需 |
| `SESSION_SECRET` | 兼容旧 session 的签名密钥 | 建议 | 必需 |
| `JWT_SECRET` | v2 JWT 签名密钥 | 建议 | 必需 |
| `JWT_ALGORITHM` | JWT 算法 | `HS256` | 建议 |
| `ACCESS_TOKEN_MINUTES` | access token 有效期 | 可选 | 建议 |
| `REFRESH_TOKEN_DAYS` | refresh token 有效期 | 可选 | 建议 |
| `REFRESH_COOKIE_NAME` | refresh cookie 名称 | 可选 | 建议 |
| `COOKIE_SECURE` | 是否只允许 HTTPS cookie | `false` | `true` |
| `COOKIE_DOMAIN` | cookie 共享域 | 可选 | 可选 |
| `CORS_ORIGINS` | 允许的前端来源 | 可选 | 建议 |
| `AI_ENABLED` | 是否启用 AI | 可选 | 建议 |
| `OPENAI_BASE_URL` | 模型服务地址 | 可选 | 建议 |
| `OPENAI_API_KEY` | 模型服务密钥 | 可选 | 建议 |
| `OPENAI_MODEL` | 默认模型 | 可选 | 建议 |
| `OPENAI_REASONING_EFFORT` | 默认思考深度 | 可选 | 可选 |

项目已经提供：

- [.env.example](/Users/lin20051105/Desktop/potato_todo/.env.example)
- [render.yaml](/Users/lin20051105/Desktop/potato_todo/render.yaml)

### 本地 SQLite

默认不设置 `STUDY_DB_URL` 时，使用：

```text
sqlite:///./data/study.db
```

### PostgreSQL 示例

```text
STUDY_DB_URL=postgresql+psycopg://USER:PASSWORD@HOST:5432/DBNAME
```

Supabase 可以直接提供 PostgreSQL 连接串。

## 首次使用

1. 打开站点
2. 注册账号
3. 登录
4. 创建 Subject
5. 开始添加 Task / Calendar / Focus 记录
6. 如需房间竞争，到 `Rooms` 页面创建或加入房间

说明：

- 如果你是从旧的单机库升级过来的，第一次注册的用户会自动接管旧数据。
- 新版本不再使用“所有人共享一套本地数据”的方式。

## AI 配置说明

公网版设计原则：

- 普通用户不再各自填写 API Key
- AI 连接信息由部署者通过环境变量统一配置
- 用户侧仍可保留模型 / reasoning 的界面偏好

当 `AI_ENABLED=false` 或没有配置可用模型时：

- GPT Assistant API 会返回不可用
- Daily Quote 会使用内置 fallback

## 自习室使用说明

### 创建房间

进入 `Rooms` 页面：

1. 输入房间名称
2. 确认人数上限
3. 点击 `Create Room`

系统会自动生成房间码。

### 加入房间

进入 `Rooms` 页面：

1. 在 `Join by Code` 输入房间码
2. 点击 `Join Room`

### 房主权限

房主可以：

- 重置房间码
- 踢出成员
- 关闭房间

### 排行榜统计口径

房间“今日”的边界统一按：

```text
Asia/Shanghai
```

这是第一版的固定规则，用来保证成本最低、逻辑最稳。

## 部署到 Render + Supabase（低成本方案）

### 1. 创建 Supabase PostgreSQL

在 Supabase 创建项目后，拿到 PostgreSQL 连接串，填入：

```text
STUDY_DB_URL
```

### 2. 创建 Render Web Service

直接使用仓库里的 [render.yaml](/Users/lin20051105/Desktop/potato_todo/render.yaml) 最省事。

如果你手动填写，也请使用下面这组命令。

构建命令：

```bash
pip install -r apps/api/requirements.txt
```

启动命令：

```bash
uvicorn apps.api.potato_api.app:app --host 0.0.0.0 --port $PORT
```

健康检查：

```text
/api/v2/health
```

### 3. 在 Render 设置环境变量

至少设置：

```text
APP_ENV=production
STUDY_DB_URL=...
SESSION_SECRET=...
JWT_SECRET=...
COOKIE_SECURE=true
CORS_ORIGINS=https://your-frontend-domain
```

推荐补齐：

```text
JWT_ALGORITHM=HS256
ACCESS_TOKEN_MINUTES=30
REFRESH_TOKEN_DAYS=14
REFRESH_COOKIE_NAME=potato_refresh_token
AI_ENABLED=false
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4
OPENAI_REASONING_EFFORT=medium
```

完整逐项填写说明见：

- [docs/render-redeploy-v2.md](/Users/lin20051105/Desktop/potato_todo/docs/render-redeploy-v2.md)

### 4. 免费版注意点

- Render Free 会 cold start
- SSE 房间推送建议维持单实例
- 第一版不做 Redis，不做多实例广播
- 新版前端不再由这个 Python service 承载页面，需要单独部署前端静态站点

## 部署前端到 Cloudflare Pages

当前前端推荐部署到 Cloudflare Pages，并通过根目录 `functions/api/[[path]].ts` 把浏览器端 `/api/*` 请求代理到 Render API。

关键配置如下：

- Root directory：留空
- Build command：

```bash
corepack enable && pnpm install --frozen-lockfile && pnpm --filter @potato/web build
```

- Build output directory：

```text
apps/web/dist
```

- Environment variables：

```text
NODE_VERSION=22
PNPM_VERSION=10.12.1
API_ORIGIN=https://your-render-service.onrender.com
```

完整操作步骤见：

- [docs/cloudflare-pages-deploy.md](/Users/lin20051105/Desktop/potato_todo/docs/cloudflare-pages-deploy.md)

## 数据库说明

- 本地开发可直接用 SQLite
- 生产环境建议 PostgreSQL
- 项目已经加入正式 Alembic 迁移脚手架
- 启动前建议先运行：

```bash
alembic upgrade head
```

如果你是从旧的、没有 Alembic 历史的数据库升级过来，建议先备份，再在确认表结构已经兼容后执行：

```bash
alembic stamp head
```

## 测试

运行测试：

```bash
.venv/bin/python -m pytest -q
```

当前覆盖包括：

- 登录保护
- 计时器
- 逾期任务
- 统计计算
- AI draft 应用
- AI chat 会话持久化
- 房间快照与成员隔离
- 备份与清空的用户隔离

## 已知部署约束

第一版房间实时能力基于 `SSE`，并假设：

- 单实例部署
- 小规模房间
- 免费 / 低成本优先

如果后续用户增长，需要升级路线：

1. Render 常驻实例或 Railway Hobby
2. Redis pub/sub
3. WebSocket + 多实例协调

## 现在这版和旧版的差异

旧版：

- 本地单机
- 无账号
- 所有人数据混在一套 SQLite

当前版：

- 多用户
- 可公网上线
- 数据中心化
- 用户数据隔离
- 支持小自习室竞争机制

如果你接下来要继续往正式商用方向推进，下一步建议优先做两件事：

1. 给房间页补更完整的 E2E 浏览器测试
2. 在真实 Render + Supabase 环境完成一次全链路联调
