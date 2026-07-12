# Android APK 官方下载网站

一个基于 Node.js + Express + 原生 HTML/CSS/JavaScript 的轻量 Android APP 官网。它适合部署到 Render：展示 APP 信息、版本和更新日志，并通过受控的 `/download` 接口流式下载最新 APK。

> 上线前只需集中修改 `data/app-config.json`、设置 Render 环境变量，并放入正式签名 APK。不要提交 APK 到 Git 仓库。

## 功能

- 手机优先的中文官网：首页、功能介绍、截图占位区、安装步骤、FAQ、联系方式和更新日志。
- 统一配置：页面与公开 API 都读取 `data/app-config.json`，版本信息不分散硬编码。
- 安全下载：只下载配置中指定的单个 APK，禁止直接访问 `/apk/*`；使用文件流、正确 MIME、中文文件名兼容的 `Content-Disposition`、限流和无缓存响应头。
- Android 更新接口：`GET /api/version` 自动依据当前域名生成 `downloadUrl`；另有 `GET /api/app-info`。
- 下载统计：JSON 持久化、进程内写入队列和临时文件原子替换；统计故障不会阻断下载。
- 只读管理员后台：`/admin`，环境变量密码、签名 HttpOnly Cookie、生产环境 Secure、SameSite=Strict、登录限流和未登录数据拦截。
- 安全与体验：Helmet、API/下载/登录限流、统一错误处理、404、PWA 基础支持（Service Worker **不会缓存 APK 或 API**）、robots、动态 sitemap、favicon 和 Open Graph。

## 目录

```text
apk-download-site/
├─ data/
│  ├─ app-config.json          # 唯一的 APP 与版本展示配置
│  └─ download-stats.json      # 下载统计（Render 非持久磁盘会重置）
├─ lib/
│  ├─ config.js
│  └─ stats-store.js
├─ public/
│  ├─ apk/README.md            # 正式 APK 放置说明
│  ├─ css/  js/  images/
│  ├─ index.html  admin.html  404.html
│  ├─ manifest.json  service-worker.js
│  └─ robots.txt  sitemap.xml
├─ test/server.test.js
├─ server.js
├─ render.yaml
└─ .env.example
```

## 本地运行

需要 Node.js 20 或更高版本。

```bash
cd apk-download-site
npm install
```

将 `.env.example` 复制为 `.env`，然后填入安全值：

```bash
# PowerShell
Copy-Item .env.example .env
```

本项目不读取 `.env` 文件，避免引入额外运行时依赖；本地启动时请在终端设置环境变量，或使用你喜欢的本地环境变量工具。PowerShell 示例：

```powershell
$env:ADMIN_PASSWORD = "请替换为至少12位的高强度密码"
$env:SESSION_SECRET = "请替换为至少32位的随机签名密钥"
$env:NODE_ENV = "development"
npm start
```

访问：<http://localhost:3000> 。开发时可用 `npm run dev` 自动重启。

运行检查：

```bash
npm run lint
npm test
```

## 放入 APK 和更新版本

1. 将已签名的正式 APK 放进 `public/apk/`。
2. 修改 `data/app-config.json` 的 `apkFileName`，与实际文件名完全一致。例如：`app-latest.apk`。
3. 同时更新同一文件中的 `downloadFileName`、`latestVersion`、`versionCode`、`apkSize`、`apkSha256`、`releaseDate`、`updateLog` 和 `historicalVersions`。可用 PowerShell 生成校验值：`Get-FileHash public/apk/你的文件.apk -Algorithm SHA256`。
4. 本地执行 `npm start` 后访问 `/download` 验证浏览器下载。
5. 提交配置和代码到 GitHub（APK 默认被 `.gitignore` 忽略）。

`apkFileName` 与 `downloadFileName` 必须都是单独的 `.apk` 文件名，不能包含路径。网页、下载接口和版本检查接口都会读取这一份配置，因此不需要修改源代码。

### APK 的部署选择

小型内测包可以作为部署产物的一部分上传（临时移除 `.gitignore` 的 APK 忽略规则，注意仓库和 Render 构建体积限制）。更建议将 APK 放在 GitHub Release、Cloudflare R2、阿里云 OSS 或腾讯云 COS，再把下载策略改为重定向或对象存储签名 URL。大文件不应长期放在 Git 仓库。

当前实现默认严格按照需求从 `public/apk/` 流式读取。对于大于 GitHub 100 MB 限制的 APK，可在 GitHub Release、R2、OSS 或 COS 上传文件后，将 `remoteApkUrl` 填为该文件的 **HTTPS 直链**；`/download` 会先记录统计再直接 302 到该安装包，不会出现中间页面。若 `remoteApkUrl` 为空，站点仍会从本地 APK 流式输出。两种方式都保留 `/download` 作为唯一公开入口。

## API

### `GET /api/version`

供 Android APP 检查更新。示例：

```json
{
  "success": true,
  "appName": "示例工具 APP",
  "latestVersion": "1.0.0",
  "versionCode": 1,
  "forceUpdate": false,
  "minSupportedVersion": "1.0.0",
  "downloadUrl": "https://你的域名/download",
  "apkSize": "25.6 MB",
  "apkSha256": "APK 的 SHA-256 校验值",
  "releaseDate": "2026-07-12",
  "updateLog": ["优化运行稳定性"]
}
```

`downloadUrl` 优先取 Render 的 `BASE_URL`，未设置时根据本次请求的协议和 Host 自动生成。此接口以及 `/api/app-info` 允许跨域 `GET` 调用。

本地验证：

```powershell
Invoke-RestMethod http://localhost:3000/api/version
Invoke-RestMethod http://localhost:3000/api/app-info
Invoke-WebRequest http://localhost:3000/download -OutFile test.apk
```

在尚未放入 APK 时，最后一条会返回带中文提示的 HTTP 404，这是预期保护行为。

## 管理员后台

访问 `/admin`，使用 Render 环境变量 `ADMIN_PASSWORD` 登录。后台只可读，展示总下载、今日下载、设备类型、版本分布、当前版本和最近下载时间；不提供上传或文件操作能力。

生产环境必须配置：

- `ADMIN_PASSWORD`：至少 12 个字符的强随机密码。
- `SESSION_SECRET`：至少 32 个随机字符的会话签名密钥。
- `NODE_ENV=production`。
- `BASE_URL`（可选但推荐）：例如 `https://download.example.com`，不要带结尾斜杠。

Cookie 设置为 `HttpOnly`、`SameSite=Strict`，生产环境自动启用 `Secure`。不要把密码和密钥写进 Git 或前端代码。

## 上传 GitHub

在项目目录运行：

```bash
git init
git add .
git commit -m "Create Android APK download site"
git branch -M main
git remote add origin https://github.com/你的账号/你的仓库.git
git push -u origin main
```

推送前用 `git status` 确认没有 APK、`.env` 或私密数据被提交。

## 部署到 Render

### Blueprint（推荐）

1. 将仓库推送到 GitHub。
2. 在 Render Dashboard 选择 **New +** → **Blueprint**，连接仓库。
3. Render 会读取根目录的 `render.yaml` 创建 Node Web Service。
4. 在服务的 Environment 页面填入 `ADMIN_PASSWORD`，并确认/设置 `SESSION_SECRET`、`NODE_ENV=production` 和推荐的 `BASE_URL`。
5. 点击部署，打开 `https://你的服务.onrender.com/health`，应返回 `success: true`。

### 手动创建 Web Service

1. Render Dashboard → **New +** → **Web Service** → 选择 GitHub 仓库。
2. Runtime 选 **Node**。
3. Build Command：`npm ci`。
4. Start Command：`npm start`。
5. 设置以上四个环境变量；Render 会自动传入 `PORT`，无需自行填写。
6. 部署完成后依次测试 `/`、`/health`、`/api/version`、`/download` 与 `/admin`。

服务监听 `0.0.0.0` 和 `process.env.PORT`，可直接兼容 Render Node Web Service。提交到已连接的分支后会自动部署。

### 自定义域名

在 Render 服务的 **Settings / Custom Domains** 添加域名，按页面提示在 DNS 服务商添加 CNAME 或 A 记录。HTTPS 证书由 Render 配置完成后自动签发。域名生效后，将 `BASE_URL` 更新为该 HTTPS 域名（例如 `https://download.example.com`），重新部署或保存环境变量后即可。

## Render 存储限制与扩展建议

Render 免费实例会休眠；首次访问可能需要等待唤醒。更重要的是，默认本地文件系统是临时的：重新部署、重启或实例替换后，`data/download-stats.json` 的运行时统计可能丢失；运行时上传的 APK 也不会可靠保留。

本项目的 JSON 统计适合小流量和演示阶段，不适合多实例生产环境。增长后建议：

- 使用 Render Persistent Disk 保存统计和 APK（注意单实例挂载限制）。
- 用 Render PostgreSQL / Supabase / 任意 PostgreSQL 替换 `lib/stats-store.js` 的 `getSummary` 与 `recordDownload`，接口保持不变。
- 把 APK 放入 Cloudflare R2、阿里云 OSS 或腾讯云 COS，使用对象存储 CDN。下载接口可记录统计后 302 到对象存储，或生成短期签名 URL。

无论采用哪种迁移，页面配置仍只需要更新 `data/app-config.json`。
