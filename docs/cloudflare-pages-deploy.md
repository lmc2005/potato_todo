# Cloudflare Pages 前端部署指引

本文档用于部署当前仓库中的前端 Web App，并通过 Cloudflare Pages Functions 将浏览器端的 `/api/*` 请求代理到 Render 上的 FastAPI v2 服务。

## 当前方案

- 前端托管：Cloudflare Pages
- 代理方式：Cloudflare Pages Functions
- API 源站：Render Web Service
- 数据库：Supabase PostgreSQL

该方案适合当前仓库，因为前端代码仍然使用相对路径 `/api/v2/*` 访问接口与 SSE 流。

## 部署前提

在开始之前，请先确保以下事项已经完成：

1. Render API 已经可访问。
2. `https://你的-render-域名/api/v2/health` 可以正常返回健康检查结果。
3. 仓库已包含根目录 `functions/api/[[path]].ts` 代理文件。
4. 如果你要绑定自定义主域名，请先把域名接入 Cloudflare。

## 第 1 步：如果还没有把域名接入 Cloudflare

如果你只是先用 `pages.dev` 预览，可以跳过这一步。

如果你要用 `www.potato-todo.com` 或 `potato-todo.com`：

1. 在 Cloudflare 左侧进入 `Websites`
2. 点击 `Add a domain`
3. 输入你的域名
4. 选择 `Free` 套餐
5. 进入 DNS 导入流程
6. 记录 Cloudflare 分配给你的两条 nameserver
7. 到你的域名注册商后台，把 nameserver 改成 Cloudflare 提供的值
8. 等待 Cloudflare Zone 状态变成 `Active`

说明：

- 如果 Zone 还没有 `Active`，自定义主域名验证通常不会成功。
- 如果当前只想先部署成功，不必一开始就绑定正式域名，可以先使用 Pages 默认的 `*.pages.dev` 地址。

## 第 2 步：创建 Pages 项目

1. 左侧进入 `Workers & Pages`
2. 点击 `Create`
3. 选择 `Pages`
4. 选择 `Connect to Git`
5. 授权 GitHub
6. 选择仓库：`potato_todo`

## 第 3 步：填写 Build 配置

在 `Set up builds and deployments` 中填写：

- **Project name**:

```text
potato-todo-web
```

- **Production branch**:

```text
main
```

- **Framework preset**:

```text
Vite
```

- **Root directory**:

```text
留空
```

不要填写 `apps/web`，因为：

- 当前仓库是 monorepo
- 前端依赖 `packages/contracts`
- 代理函数目录 `functions/` 也在仓库根目录

- **Build command**:

```bash
corepack enable && pnpm install --frozen-lockfile && pnpm --filter @potato/web build
```

- **Build output directory**:

```text
apps/web/dist
```

## 第 4 步：填写 Environment Variables

在 Pages 项目的环境变量里至少添加：

- `NODE_VERSION=22`
- `PNPM_VERSION=10.12.1`
- `API_ORIGIN=https://你的-render-域名`

说明：

- `API_ORIGIN` 不能带 `/api`
- 示例：

```text
API_ORIGIN=https://potato-todo-api.onrender.com
```

因为根目录 `functions/api/[[path]].ts` 会自动把：

```text
/api/...
```

代理到：

```text
https://你的-render-域名/api/...
```

## 第 5 步：开始部署

1. 点击 `Save and Deploy`
2. 等待第一次构建完成
3. 构建成功后，先打开默认地址：

```text
https://<your-project>.pages.dev
```

## 第 6 步：首次验证

先检查这些关键点：

1. 打开首页是否正常显示
2. 是否能进入登录页
3. 注册是否成功
4. 登录是否成功
5. 刷新页面后登录态是否仍可恢复
6. Tasks / Focus / Rooms 是否能正常请求接口
7. Rooms 的 SSE 实时流是否可用

## 第 7 步：绑定自定义域名

### 方案 A：先绑定子域名，最稳

建议前端先绑定：

```text
www.potato-todo.com
```

操作：

1. 进入 Pages 项目
2. 点击 `Custom domains`
3. 点击 `Set up a domain`
4. 输入：

```text
www.potato-todo.com
```

5. 按提示确认

如果你的域名已经托管在 Cloudflare，Cloudflare 通常会自动创建对应记录。

### 方案 B：绑定根域

如果你想直接使用：

```text
potato-todo.com
```

那么 Cloudflare 官方要求该 apex domain 必须已经作为 Cloudflare zone 接入，并使用 Cloudflare nameserver。

## 第 8 步：推荐的域名分工

建议这样分：

- 前端：`www.potato-todo.com`
- 后端 API：`api.potato-todo.com`

不要把前端主站域名直接指向 Render API。

## 第 9 步：DNS 与证书注意事项

如果自定义域名验证失败，重点检查：

1. Cloudflare Zone 是否已经 `Active`
2. 是否存在错误的 `AAAA` 记录
3. 是否存在限制证书签发的 `CAA` 记录
4. 是否没有先在 Pages 项目里执行 `Add custom domain` 流程，就手工加了 DNS 记录

Cloudflare 官方说明：

- 自定义子域名可以通过 CNAME 指向 `<your-project>.pages.dev`
- apex domain 需要 Cloudflare nameserver
- 如果存在 CAA 限制，需要允许 Cloudflare 使用的证书机构签发证书

## 第 10 步：部署后的建议配置

部署成功后，建议继续做：

1. 在 Render 中把 `CORS_ORIGINS` 设置为你的前端正式域名
2. 在 Render 中保留 `COOKIE_DOMAIN` 为空，除非你明确要跨子域共享 cookie
3. 在 Pages 中开启自定义域名后，再做完整登录链路回归

## 当前仓库与 Cloudflare 的对接点

- 前端构建目录：`apps/web`
- 输出目录：`apps/web/dist`
- Pages 代理函数：`functions/api/[[path]].ts`
- API 接口路径：`/api/v2/*`
- API 上游源站：Render
