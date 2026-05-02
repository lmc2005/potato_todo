# Render v2 重建部署指引

本文档用于在删除旧 Render service 后，按当前工程化 v2 结构重新创建后端服务。

## 部署目标

- 服务类型：Render Web Service
- 代码入口：`apps.api.potato_api.app:app`
- 健康检查：`/api/v2/health`
- 数据库：复用既有 Supabase PostgreSQL
- 用途：仅承载 API v2，不再承载前端页面

## 部署前确认

在 Render 后台重建 service 之前，先确认以下内容已经准备好：

1. 你的 GitHub 仓库已经是最新代码。
2. 你已有可用的 Supabase 项目和数据库连接串。
3. 你能生成一段新的随机密钥，用于 `SESSION_SECRET` 和 `JWT_SECRET`。
4. 你已经确定前端将来使用的正式域名或预发域名，便于填写 `CORS_ORIGINS`。

## Render 后台逐项填写

### 基础信息

- **Service Type**: `Web Service`
- **Repository**: 选择当前仓库
- **Branch**: `main`
- **Root Directory**: 留空
- **Runtime**: `Python 3`
- **Region**: 尽量选择和 Supabase 接近的区域
- **Plan**: `Free`

### Build & Deploy

- **Build Command**:

```bash
pip install -r apps/api/requirements.txt
```

- **Start Command**:

```bash
uvicorn apps.api.potato_api.app:app --host 0.0.0.0 --port $PORT
```

- **Health Check Path**:

```text
/api/v2/health
```

- **Auto-Deploy**:
  - 推荐：`Off`
  - 原因：当前项目还处于持续重构与设计精修阶段，关闭自动部署更稳妥

## 环境变量

### 必填

```text
APP_ENV=production
STUDY_DB_URL=postgresql+psycopg://...
SESSION_SECRET=一段足够长的随机字符串
JWT_SECRET=一段足够长的随机字符串
COOKIE_SECURE=true
```

### 强烈建议填写

```text
JWT_ALGORITHM=HS256
ACCESS_TOKEN_MINUTES=30
REFRESH_TOKEN_DAYS=14
REFRESH_COOKIE_NAME=potato_refresh_token
CORS_ORIGINS=https://你的前端域名
```

### 可选

```text
COOKIE_DOMAIN=
AI_ENABLED=false
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4
OPENAI_REASONING_EFFORT=medium
```

## 变量填写说明

- `APP_ENV`
  - 生产环境固定填 `production`

- `STUDY_DB_URL`
  - 填你当前 Supabase 的 Postgres 连接串
  - 建议优先使用 Supabase 提供的 pooler 连接方式
  - 如果拿到的是 `postgres://...`，建议改成 `postgresql+psycopg://...`

- `SESSION_SECRET`
  - 用于兼容旧的 session 相关逻辑
  - 建议至少 32 位随机字符串

- `JWT_SECRET`
  - v2 JWT 登录态签名密钥
  - 不要留空
  - 可以和 `SESSION_SECRET` 相同，也可以单独生成

- `COOKIE_SECURE`
  - Render 公网环境必须填 `true`

- `CORS_ORIGINS`
  - 如果前端和 Render API 是不同域名，必须填写
  - 多个域名用英文逗号分隔
  - 示例：

```text
https://potato-todo.pages.dev,https://todo.yourdomain.com
```

- `COOKIE_DOMAIN`
  - 默认留空即可
  - 只有在你明确要做跨子域共享 cookie 时才填写

- `AI_ENABLED`
  - 如果暂时不接入模型能力，填 `false`
  - 如需启用，再补 `OPENAI_API_KEY`

## 首次部署后验证

部署完成后，先验证以下内容：

1. 打开：

```text
https://你的-render-域名/api/v2/health
```

应返回类似：

```json
{"ok":true,"service":"api-v2","environment":"production"}
```

2. 再验证：
   - 注册
   - 登录
   - 刷新登录态
   - Tasks 读写
   - Focus Timer
   - Rooms SSE

## 重要说明

当前 Render service 只负责后端 API。

新版前端已经是独立 Web App，不再由这个 Python service 直接承载页面。因此在 Render API 重建完成后，还需要单独部署前端静态站点，并让前端指向当前 API 域名，或通过同域代理转发 `/api` 请求。
