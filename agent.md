# POTATO-TODO Agent Handoff

## 1. 文档目的

本文件用于让新的开发者或 AI agent 在最短时间内接手 `POTATO-TODO` 项目，不需要重新“猜”项目目标、架构、实现边界和当前进度。

这不是产品宣传文案，而是工程接手文档。重点回答下面几个问题：

- 这个项目是做什么的
- 现在已经实现到什么程度
- 技术栈和运行方式是什么
- 每个模块的后端逻辑和前端交互如何工作
- 数据模型是什么
- 本地开发、测试、部署需要什么
- 当前有哪些已知限制、风险和下一步建议

---

## 2. 项目一句话定义

`POTATO-TODO` 是一个面向学习场景的单体式 Web 应用，目标是把“任务管理、学习计时、日程安排、统计分析、AI 规划、多人自习室”整合到一个低成本可部署的多用户平台中。

它不是前后端分离项目，而是：

- 后端：`FastAPI`
- 页面渲染：`Jinja2`
- 前端交互：单文件 `Vanilla JavaScript`
- 数据层：`SQLAlchemy 2 + SQLite/PostgreSQL`
- 迁移：`Alembic`

项目核心取向是：

- 单体优先
- 低部署成本优先
- 多用户隔离优先
- 学习场景闭环优先

---

## 3. 项目目标与产品定位

### 3.1 业务目标

这个项目不是通用待办清单，而是“学习规划系统”。

核心目标分为 3 层：

1. 个人学习工作区
2. AI 辅助规划与分析
3. 轻量多人自习室竞争与陪伴

### 3.2 用户价值

对单个用户：

- 管理学科、任务、学习日程
- 用计时器沉淀真实学习时长
- 看按学科、日期、任务维度的统计
- 用 AI 生成学习计划、分析学习习惯

对小群体：

- 建立共享自习室
- 通过邀请码加入
- 基于今日专注时长和任务完成情况做轻量排行榜
- 近实时看到成员状态变化

---

## 4. 当前完成度判断

## 4.1 已完成的核心能力

从代码、模板、API、测试、迁移配置来看，这个项目已经完成了一版可运行、可注册登录、可部署公网的 V1 闭环：

- 多用户注册 / 登录 / 登出
- Session + Cookie 鉴权
- 用户数据按 `user_id` 严格隔离
- Subject 管理
- Task 管理
- Calendar Event 管理
- Count-up / Count-down / Pomodoro 计时
- Study Session 记录沉淀
- Dashboard 汇总
- Analytics 图表与统计
- AI Planning / AI Analysis / AI Chat
- AI Draft 生成与逐项应用
- 每日 Quote
- 用户级 Backup / Import / Clear
- Study Rooms 创建 / 加入 / 关闭 / 踢人 / 重置邀请码
- 房间 leaderboard 快照
- 基于 `SSE` 的房间近实时刷新
- Alembic 初始迁移
- Render 部署配置
- pytest 覆盖关键主流程

## 4.2 明确未完成或仍是占位的能力

目前代码里明确仍未完成的点非常少，最明显的是：

- `/api/news/daily` 仍返回 `501 Not implemented yet.`

## 4.3 工程化现状判断

这个项目已经是“可部署的工程项目”，但还没有到“重度商用级平台”的程度。

当前状态更准确地说是：

- 产品功能闭环已成型
- 核心后端逻辑已成型
- 基础测试已具备
- 部署方式已具备
- 扩展性和运维能力仍偏 V1

## 4.4 当前工作树进度信号

当前仓库工作树里存在一组未提交的前端改造痕迹，说明 UI 正处于一次视觉/体验重构中：

- `app/static/css/repay-redesign.css` 为新增文件
- `app/static/js/app.js` 被修改
- `base.html`、`dashboard.html`、`focus.html`、`tasks.html`、`rooms.html`、`room_detail.html`、`assistant.html`、`login.html` 等模板被修改

这意味着：

- 产品功能本身已经比较完整
- 前端视觉层正在继续打磨
- 后续开发应谨慎对待这些页面文件，避免误回退正在进行中的改版

---

## 5. 技术栈总览

## 5.1 后端

- Python `3.11+`
- FastAPI
- SQLAlchemy `2.x`
- Pydantic `2.x`
- Jinja2
- itsdangerous / Starlette SessionMiddleware
- httpx
- psycopg
- Alembic

## 5.2 前端

- 服务端模板渲染
- `Vanilla JavaScript`
- 原生 `fetch`
- 原生 `EventSource` 做 SSE
- 原生 `canvas` 绘制可视化与动效
- 原生 `dialog`
- 原生浏览器 Notification API

没有使用：

- React
- Vue
- TypeScript
- Vite / Webpack
- Chart.js / ECharts

图表与页面大部分交互全部由 `app/static/js/app.js` 手写完成。

## 5.3 数据与部署

- 本地开发数据库：SQLite
- 生产推荐数据库：PostgreSQL
- 迁移工具：Alembic
- 部署目标：Render
- 数据库推荐：Supabase PostgreSQL

---

## 6. 目录结构与职责

```text
potato_todo/
├── app/
│   ├── main.py                 # FastAPI 入口，页面路由、API 路由、中间件、SSE
│   ├── database.py             # engine/session/base/init_db
│   ├── models.py               # SQLAlchemy ORM 模型
│   ├── schemas.py              # Pydantic 入参模型
│   ├── services/
│   │   ├── auth.py             # 注册登录、密码哈希、session 用户、旧数据接管
│   │   ├── timer.py            # 计时器与 Pomodoro 核心逻辑
│   │   ├── stats.py            # 统计计算、逾期任务同步
│   │   ├── settings.py         # 站点级/用户级设置
│   │   ├── ai.py               # AI 快照、调用、draft、chat、quote
│   │   ├── backup.py           # 备份导出、导入、清空
│   │   └── rooms.py            # 自习室、成员、排行榜快照
│   ├── templates/             # Jinja2 页面模板
│   └── static/
│       ├── js/app.js          # 单文件前端应用逻辑
│       └── css/               # 样式与视觉改版
├── migrations/                # Alembic 迁移
├── tests/                     # pytest API 测试
├── scripts/seed_demo_data.py  # 演示数据生成脚本
├── requirements.txt
├── render.yaml
├── runtime.txt
└── README.md
```

---

## 7. 系统架构

## 7.1 总体架构

项目采用“单体 Web 应用”架构：

1. FastAPI 提供 HTML 页面和 JSON API
2. Jinja2 负责初始页面骨架输出
3. `app.js` 在浏览器端接管页面交互
4. SQLAlchemy 负责数据读写
5. SessionMiddleware 负责登录态
6. SSE 负责房间页近实时更新

## 7.2 请求流

典型页面请求路径：

1. 浏览器访问页面路由，例如 `/focus`
2. FastAPI 渲染 `focus.html`
3. 页面载入 `app.js`
4. `app.js` 根据 `body[data-page]` 决定初始化哪一页
5. 页面通过 `fetch` 调用 `/api/...`
6. 后端返回 JSON
7. 前端刷新 DOM 或 canvas

## 7.3 状态管理方式

前端没有使用 Redux / Zustand / Vuex。

状态集中在 `app/static/js/app.js` 顶部的单个 `state` 对象中，关键字段包括：

- `subjects`
- `tasks`
- `timer`
- `dashboardStats`
- `calendarMode`
- `assistantMode`
- `aiPlanConversation`
- `latestPlanDraft`
- `aiChatSessions`
- `aiChatThread`
- `rooms`
- `activeRoomSnapshot`

这是一个典型的“小到中等规模单文件前端状态机”实现。

## 7.4 鉴权方式

- 使用 `SessionMiddleware`
- session 中记录 `user_id`
- API 通过 `require_user()` 强制鉴权
- 页面路由如果未登录，则重定向到 `/login?next=...`

## 7.5 日志

`main.py` 中存在 HTTP 日志中间件：

- 记录请求方法、路径、query、body
- 记录响应状态、耗时、body
- 对 `api_key`、`authorization`、`token`、`password` 做掩码
- 对 SSE 流响应不打印 body

这对调试很有帮助，但生产环境要留意日志量和敏感信息边界。

---

## 8. 数据模型说明

## 8.1 User

用户主表。

关键字段：

- `email`
- `password_hash`
- `is_active`
- `created_at`
- `updated_at`

用户拥有以下数据：

- subjects
- tasks
- schedule_events
- study_sessions
- timer_states
- ai_drafts
- ai_conversations
- user_settings
- owned_rooms
- room_memberships

## 8.2 Subject

学科维度，是计时、任务、统计的主轴之一。

关键字段：

- `name`
- `color`
- `daily_goal_minutes`
- `weekly_goal_minutes`
- `monthly_goal_minutes`
- `archived`

约束：

- 同一用户下 `name` 唯一

## 8.3 Task

任务记录。

关键字段：

- `title`
- `subject_id`
- `status`
- `priority`
- `due_at`
- `estimated_minutes`
- `notes`
- `completed_at`

状态语义：

- `todo`
- `in_progress`
- `done`
- `undone`

其中 `undone` 是系统自动把“已过期但未完成”的任务转出来的状态。

## 8.4 ScheduleEvent

学习日程块。

关键字段：

- `title`
- `subject_id`
- `task_id`
- `start_at`
- `end_at`
- `source`
- `notes`

`source` 支持：

- `manual`
- `ai`

## 8.5 StudySession

真实沉淀下来的学习记录，是统计分析的数据基础。

关键字段：

- `subject_id`
- `task_id`
- `schedule_event_id`
- `mode`
- `started_at`
- `ended_at`
- `focus_seconds`
- `paused_seconds`
- `stop_reason`

## 8.6 TimerState

当前活动计时器的运行态，不是历史数据。

关键字段：

- `mode`
- `subject_id`
- `task_id`
- `schedule_event_id`
- `started_at`
- `paused_at`
- `accumulated_pause_seconds`
- `countdown_seconds`
- `countdown_end_at`
- `is_paused`
- `pomodoro_phase`
- `pomodoro_round`
- `pomodoro_total_rounds`

约束：

- `user_id` 唯一

这表示一个用户同一时间只能有一个活动计时器。

## 8.7 AI 相关

### AiDraft

用于保存 AI 计划或分析输出。

关键字段：

- `kind`
- `status`
- `input_snapshot`
- `payload`
- `raw_response`
- `applied_at`

### AiConversation

AI 聊天会话头。

### AiMessage

AI 聊天消息明细。

## 8.8 设置相关

### UserSetting

用户级设置，如：

- 模型偏好
- reasoning_effort
- Pomodoro 默认值
- theme

### Setting

全局设置或兼容旧版本设置。

## 8.9 自习室相关

### StudyRoom

房间主表。

关键字段：

- `owner_user_id`
- `name`
- `join_code`
- `status`
- `member_limit`
- `timezone`

### StudyRoomMember

房间成员关系表。

关键字段：

- `room_id`
- `user_id`
- `role`
- `status`
- `joined_at`

状态包括：

- `active`
- `left`
- `kicked`

---

## 9. 核心后端实现逻辑

## 9.1 认证与多用户隔离

实现文件：

- `app/services/auth.py`
- `app/main.py`

核心逻辑：

- 注册时使用 `pbkdf2_hmac(sha256)` 做密码哈希
- 登录成功后把 `user_id` 写入 session
- 所有 API 查询基本都附带 `user_id == current_user.id`
- 第一位注册用户会自动接管旧版单机数据

这个“旧数据接管”逻辑体现在 `claim_legacy_data()`：

- 把旧表里 `user_id is null` 的记录归给首位用户
- 把旧 `settings` 中的若干配置迁移到 `user_settings`

这说明项目是从单用户版本演化过来的，而不是从一开始就按多租户设计。

## 9.2 Subject 管理

路由：

- `GET /api/subjects`
- `POST /api/subjects`
- `PATCH /api/subjects/{id}`
- `DELETE /api/subjects/{id}`

关键规则：

- 获取列表时会返回累计 `total_focus_seconds`
- 删除 Subject 前会检查该 Subject 是否有活动 timer
- 删除 Subject 前会检查是否已有历史 `StudySession`
- 如果可删，会把关联 task / event 的 `subject_id` 置空，而不是级联硬删

这套设计很稳，避免用户删学科后把历史学习数据打坏。

## 9.3 Task 管理

路由：

- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks/{id}`
- `DELETE /api/tasks/{id}`

核心逻辑：

- 每次取任务列表前会执行 `sync_overdue_tasks()`
- `todo` / `in_progress` 且 `due_at < now` 的任务会自动转 `undone`
- 标记 `done` 时自动写 `completed_at`
- 房间排行榜会在任务变更后触发更新事件

排序逻辑：

- 有截止时间的未完成任务优先
- 然后按优先级
- 已完成任务单独靠后

## 9.4 Schedule Event 管理

路由：

- `GET /api/schedule-events`
- `POST /api/schedule-events`
- `PATCH /api/schedule-events/{id}`
- `DELETE /api/schedule-events/{id}`

核心规则：

- `end_at` 必须晚于 `start_at`
- 可关联 subject 和 task
- 支持按日期范围拉取

## 9.5 Timer / Pomodoro

实现文件：

- `app/services/timer.py`

支持模式：

- `count_up`
- `count_down`
- `pomodoro`

核心设计：

- 活动 timer 存在 `TimerState`
- 停止或自动完成时写入 `StudySession`
- `count_down` 和 `pomodoro focus` 会在完成时自动保存 session
- Pomodoro 的 break 阶段不会写入专注时长

重要细节：

- 暂停时记录 `paused_at`
- 恢复时把暂停秒数累计到 `accumulated_pause_seconds`
- 倒计时恢复时会顺延 `countdown_end_at`
- 超长 count-up 在前端会弹出“修正保存时长”对话框

## 9.6 Analytics 统计

实现文件：

- `app/services/stats.py`

输出内容包括：

- 总专注秒数 / 分钟
- session 数量
- subject 分布
- 每日 trend
- 任务完成趋势
- task ranking
- 连续 streak
- goal completion
- session 明细

统计建立在 `StudySession` 上，而不是 timer state，因此数据语义比较稳定。

## 9.7 AI 能力

实现文件：

- `app/services/ai.py`

AI 分三类：

### 9.7.1 Planning

路由：

- `POST /api/ai/plan`

流程：

1. 收集本地快照 `build_snapshot()`
2. 判断用户是否真的请求了“时间安排”
3. 调用兼容 OpenAI 的 `/chat/completions`
4. 要求模型严格返回 JSON
5. 保存为 `AiDraft`
6. 前端按 item 级别逐条 Apply 或 Drop

关键逻辑：

- 如果用户没有显式请求排时间，但模型仍返回了 `schedule_events`
- 系统会把这些 event 尝试转成 task

这一步是很有价值的产品防呆逻辑。

### 9.7.2 Analyze

路由：

- `POST /api/ai/analyze`

作用：

- 用统计快照做数据分析
- 返回 `summary / patterns / problems / goal_progress / recommendations / risks`

### 9.7.3 Chat

路由：

- `GET /api/ai/chat/sessions`
- `GET /api/ai/chat/sessions/{id}`
- `DELETE /api/ai/chat/sessions/{id}`
- `POST /api/ai/chat/send`

作用：

- 支持多轮聊天
- 会话和消息持久化
- 前端支持历史列表与重载

### 9.7.4 Daily Quote

路由：

- `GET /api/ai/daily-quote`

逻辑：

- 优先读取缓存
- 无缓存则调用 AI 生成英文 quote
- 如果 AI 不可用，后端返回内置 fallback

## 9.8 Backup / Import / Clear

实现文件：

- `app/services/backup.py`

能力：

- 导出当前用户所有业务数据到 JSON
- 导入时先做 pre-import backup
- clear 前先做 pre-clear backup
- 所有操作只影响当前用户

导入时会重建 ID 映射：

- old subject id -> new subject id
- old task id -> new task id
- old event id -> new event id
- old conversation id -> new conversation id

这是一个工程上比较成熟的导入实现，不是简单粗暴地直接覆盖 ID。

## 9.9 自习室 Rooms

实现文件：

- `app/services/rooms.py`
- `app/main.py` 中 `RoomEventHub`

能力：

- 创建持久房间
- 通过房间码加入
- 房主重置码
- 房主踢人
- 房主关闭房间
- 普通成员离开
- 获取 leaderboard snapshot
- 基于 SSE 刷新房间页面

排行榜排序规则：

1. 今日专注总时长降序
2. 今日完成任务数降序
3. 今日超时完成任务数升序
4. 加入房间时间升序

注意：

- 房间“今日”统计是按房间 `timezone` 计算
- `RoomEventHub` 是进程内事件总线
- 因此当前实时更新仅适合单实例部署

---

## 10. 页面与前端交互说明

所有页面初始化都由 `app/static/js/app.js` 中的 `init()` 分发。

`body[data-page]` 决定绑定哪套页面逻辑。

## 10.1 登录 / 注册页

模板：

- `app/templates/login.html`

特点：

- 纯表单提交，不走 SPA
- 登录与注册共享同一个模板
- 通过 `mode` 区分显示内容

## 10.2 Dashboard

模板：

- `app/templates/dashboard.html`

API：

- `/api/stats`
- `/api/tasks?status=pending`
- `/api/schedule-events`
- `/api/ai/daily-quote`
- `/api/timer/current`

交互特点：

- 首页聚合“今日统计 + 待办 + 今日日程 + Daily Quote”
- 会持续轮询当前 timer
- 如果当前正在专注，首页中央展示会切换成 live focus 状态

## 10.3 Focus

模板：

- `app/templates/focus.html`

API：

- `/api/subjects`
- `/api/tasks`
- `/api/timer/start`
- `/api/timer/pause`
- `/api/timer/resume`
- `/api/timer/stop`
- `/api/timer/current`
- `/api/pomodoro/start`
- `/api/pomodoro/skip`
- `/api/settings/pomodoro`

交互特点：

- 可以新增 / 编辑 / 删除 Subject
- 可以从 Subject + Task 启动 count-up 或 count-down
- 可以启动 Pomodoro
- 页面每秒轮询 timer
- 超长 count-up 停止时会要求用户修正保存分钟数
- 可申请浏览器通知权限

## 10.4 Tasks

模板：

- `app/templates/tasks.html`

API：

- `/api/tasks`
- `/api/tasks/{id}`
- `/api/timer/start`

交互特点：

- 支持任务新增
- 支持按 `day/week/month` 过滤
- 支持按状态过滤
- 支持直接从 task 启动 focus
- 任务完成会弹出庆祝动画
- `undone` 任务标记 done 时会要求用户输入实际完成时间

## 10.5 Calendar

模板：

- `app/templates/calendar.html`

API：

- `/api/schedule-events`
- `/api/schedule-events/{id}`

交互特点：

- 日 / 周 / 月三种视图
- month 视图支持点选某天后下钻到 day 视图
- 可新增、编辑、删除事件
- 会统计当前范围的事件总数、计划时长、下一个 block
- 前端每 30 秒检查一次未来 5 分钟内的提醒

## 10.6 Analytics

模板：

- `app/templates/analytics.html`

API：

- `/api/stats`
- `/api/ai/analyze`

交互特点：

- 图表全部原生 canvas 绘制
- 包括 trend、task rate、subject breakdown、goal completion、rhythm heatmap
- 可在当前日期范围上发起 AI 分析

## 10.7 Assistant

模板：

- `app/templates/assistant.html`

API：

- `/api/settings/llm`
- `/api/ai/plan`
- `/api/ai/analyze`
- `/api/ai/chat/sessions`
- `/api/ai/chat/send`
- `/api/tasks`
- `/api/schedule-events`

模式：

- Planning
- Chat

Planning 特点：

- 会保存“规划对话线程”
- AI 返回 draft 而不是直接写库
- 每条 task / event 都可以单独 Apply 或 Drop

Chat 特点：

- 会话持久化
- 历史列表可重开
- 前端带打字机动画

## 10.8 Rooms

模板：

- `app/templates/rooms.html`
- `app/templates/room_detail.html`

API：

- `/api/rooms`
- `/api/rooms/join`
- `/api/rooms/{id}`
- `/api/rooms/{id}/snapshot`
- `/api/rooms/{id}/stream`
- `/api/rooms/{id}/leave`
- `/api/rooms/{id}/reset-code`
- `/api/rooms/{id}/close`
- `/api/rooms/{id}/members/{user_id}/kick`

交互特点：

- 列表页负责创建 / 加入房间
- 详情页通过 `EventSource` 连接房间流
- 每次收到 `room_update` 事件后重新拉快照
- 前端不自己拼局部 diff，而是“事件通知 + 全量快照刷新”

这种实现简单稳，但规模大了会更费带宽。

## 10.9 Settings

模板：

- `app/templates/settings.html`

API：

- `/api/settings/llm`
- `/api/settings/pomodoro`
- `/api/backup/export`
- `/api/backup/import`
- `/api/data/clear`

交互特点：

- 配置 AI 连接参数
- 配置 Pomodoro 默认值
- 导出 JSON
- 导入 JSON 并替换当前用户数据
- CLEAR 二次确认后清空当前用户数据

---

## 11. AI 接入方式说明

项目不是直接耦合某个 SDK，而是调用“兼容 OpenAI chat completions 协议”的 HTTP 接口：

- `POST {OPENAI_BASE_URL}/chat/completions`

这意味着：

- 可接 OpenAI 官方接口
- 也可接任何兼容 OpenAI 协议的中转或私有服务

当前实现特征：

- 规划和分析走 JSON 模式
- 聊天走普通文本模式
- `gpt-5` 系列模型会附带 `reasoning_effort`

站点级配置来源：

- 环境变量优先
- DB `settings` 次之

用户级可配：

- `llm_model`
- `llm_reasoning_effort`

前提是环境变量没有接管这些设置。

---

## 12. 环境变量与运行要求

## 12.1 必需环境

- Python `3.11+`
- 浏览器：Chrome / Edge / Safari

## 12.2 核心环境变量

- `SESSION_SECRET`
- `COOKIE_SECURE`
- `APP_BASE_URL`
- `STUDY_DB_URL`
- `AI_ENABLED`
- `OPENAI_BASE_URL`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_REASONING_EFFORT`

## 12.3 默认本地配置

默认 `.env.example` 提供：

- SQLite 本地 DB
- AI 默认关闭
- `COOKIE_SECURE=false`
- OpenAI URL 默认指向 `https://api.openai.com/v1`

## 12.4 本地开发启动流程

标准流程：

1. 创建虚拟环境
2. 安装依赖
3. 复制 `.env.example` 为 `.env`
4. 导出环境变量
5. 执行 `alembic upgrade head`
6. 启动 `uvicorn app.main:app --reload`

---

## 13. 数据库与迁移策略

## 13.1 当前状态

项目已经具备正式 Alembic 脚手架，当前只有一个基线迁移：

- `6e6fe88c5431_public_multi_user_baseline.py`

## 13.2 启动时初始化策略

`database.py` 中 `init_db()` 会做两件事：

1. `Base.metadata.create_all()`
2. 执行兼容性列补丁 `_run_compatibility_migrations()`

这说明当前项目同时存在两套思路：

- 正式 Alembic 迁移
- 运行时兼容补丁

这对于从旧库升级很友好，但长期来看建议逐步收敛到 Alembic 主导，减少运行时 schema 修补逻辑。

## 13.3 SQLite 与 PostgreSQL

SQLite 适合：

- 本地开发
- 单机验证

PostgreSQL 适合：

- Render / Supabase 部署
- 多用户生产环境

---

## 14. 测试覆盖现状

测试文件：

- `tests/test_api.py`
- `tests/conftest.py`

已覆盖主线包括：

- 受保护页面与 API 鉴权
- countdown 完成写入 session
- Pomodoro 只记录 focus 时间
- overdue task 自动转 `undone`
- subject 删除时对 task / event 脱钩
- subject 列表带总专注时长
- 统计里的任务完成率 / 准时率
- AI draft 应用
- LLM setting 存储 reasoning_effort
- assistant 页面可加载
- 无时间请求时 AI 计划转 task-only
- AI chat 会话持久化
- 自习室快照与用户隔离
- backup/export/clear 的用户隔离
- `news` 占位接口返回 501

## 14.1 当前测试缺口

目前缺少：

- 浏览器级 E2E 测试
- SSE 房间流的自动化行为测试
- 前端交互级单元测试
- AI HTTP 错误场景更细的覆盖
- 迁移升级链路测试

---

## 15. 已知限制与工程风险

## 15.1 明确限制

- `/api/news/daily` 未实现
- Rooms 实时能力依赖单进程内存事件总线
- 不适合多实例横向扩展
- 没有 Redis / MQ / 后台任务系统
- 没有 Docker 化
- 没有 CI 配置
- 没有 E2E 浏览器测试

## 15.2 架构级约束

### SSE 单实例约束

`RoomEventHub` 在单个 FastAPI 进程内维护 listener 队列。

因此：

- A 实例发布的房间更新无法自动广播到 B 实例
- Render 免费版或单实例部署可以工作
- 多实例部署会导致实时状态不一致

### 前端单文件复杂度

`app/static/js/app.js` 已超过 3700 行。

这在 V1 阶段可接受，但后续会带来：

- 页面耦合增加
- 维护成本上升
- 回归测试难度变高

### 日志粒度较高

HTTP 日志默认会打印较多请求/响应信息，开发友好，但生产要注意：

- 日志成本
- 个人数据暴露面

### 演示数据脚本已落后于当前数据模型

`scripts/seed_demo_data.py` 仍保留明显的单用户时代写法：

- 没有为多张核心表写入 `user_id`
- 调用 `save_backup_file()` 的方式也和当前签名不完全一致

因此它更像“历史样例脚本”，而不是当前可直接运行的种子工具。

如果后续要保留演示数据能力，建议优先重写这份脚本并显式绑定测试用户。

## 15.3 文档与代码存在的轻微偏差

README 中部分说法已略落后于代码：

- README 把房间“今日”边界描述成固定 `Asia/Shanghai`
- 实际代码中房间创建时可写 `timezone`，并按房间时区计算今日边界

后续应以代码为准，并同步更新 README。

---

## 16. 对“项目进度”的工程判断

如果按阶段拆分，这个项目大致处于下面的位置：

### 阶段 A：产品原型

已完成。

### 阶段 B：可用 V1

已完成。

表现为：

- 真实数据闭环完整
- 用户系统完整
- 主要模块齐全
- 本地和公网部署链路具备

### 阶段 C：工程稳态化

部分完成。

已经有：

- Alembic
- 配置分层
- 测试
- 备份导入导出

但仍缺：

- CI
- E2E
- Docker
- 多实例实时方案
- 更细粒度模块拆分

### 阶段 D：商用级平台化

尚未完成。

主要差距在：

- 可观测性
- 扩缩容设计
- 后台任务系统
- 更强的权限与安全策略
- 更强的前端可维护性

---

## 17. 建议的后续工程路线

如果目标是继续把它往“完全工程化、可持续迭代”的方向推进，建议优先级如下：

### P0

- 补齐 `/api/news/daily`
- 给 Rooms 加浏览器级 E2E 测试
- 把当前 UI 改版工作提交收束，避免工作树长期漂移

### P1

- 引入 CI，至少跑 `pytest`
- 增加 Dockerfile 与本地一键启动方案
- 拆分 `app.js` 为按页面模块组织
- 收敛 schema 变更到 Alembic，减少运行时兼容补丁

### P2

- Rooms 从进程内 SSE 升级到 `Redis pub/sub + WebSocket/SSE`
- 增加后台任务或定时任务能力
- 增加观测与告警

---

## 18. 接手开发时的注意事项

1. 这是一个单体应用，不要默认它是前后端分离项目。
2. 大部分前端交互都集中在 `app/static/js/app.js`，修改任何页面前先看对应 `bindXxx()`。
3. 多用户隔离是核心约束，新增查询必须先确认 `user_id` 过滤是否完整。
4. Room 实时更新当前只适用于单实例，涉及扩容要先改实时架构。
5. 当前工作树已经存在前端视觉重构中的未提交改动，处理模板和样式时要非常谨慎。
6. 任何 AI 能力都依赖“兼容 OpenAI chat completions 协议”的后端服务，不是直接写死 OpenAI SDK。

---

## 19. 最终结论

`POTATO-TODO` 不是半成品 demo，而是一版已经具备真实业务闭环的学习规划平台：

- 功能面：完整
- 工程面：中等偏成熟
- 部署面：可上线
- 扩展面：还需要继续工程化

最准确的项目状态描述是：

“一个已完成多用户升级、已具备 AI 与自习室能力、适合单实例低成本上线的学习规划系统 V1；当前核心工作重心已经从功能补齐，转向前端体验打磨和进一步工程稳态化。”
