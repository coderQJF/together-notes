# 两个人的小记

UniApp + Vue 3 + TypeScript 的双人备忘与提醒应用。保留 01 奶油黄主题、悬浮胶囊导航，以及“随记、提醒、我们”三个入口，兼容 H5、微信小程序和 App 资源构建。

## 已实现

- 微信小程序通过 `wx.login` 获取 code，由服务端调用微信接口换取 OpenID 并签发自己的会话；正式代码不提供体验账号。
- 备忘新增、查看、编辑、删除、搜索、置顶、私人/共享筛选，支持多行正文和链接。
- 附件上传和权限保护下载：单文件 12MB、每人 100MB、每条最多 10 个附件。
- 双账号邀请码绑定；邀请码 24 小时有效且只能使用一次，防止自绑定和重复绑定。
- 共享内容双方可编辑；仅创建者能删除或改为私人；历史私人内容不会自动共享。
- 单次、每日、每周提醒，支持提前提醒和站内消息；未读数显示在“提醒”Tab 角标。
- SQLite 持久化、自动备份脚本、H5 静态托管、Docker/Caddy HTTPS 部署和 GitHub Actions。

## 正式配置

复制环境文件：

```powershell
Copy-Item .env.example .env
Copy-Item server/.env.example server/.env
```

前端 `.env`：

```dotenv
# H5 本地开发留空，使用 Vite /api 代理；小程序/App 填正式 HTTPS 地址
VITE_API_BASE=https://notes.example.com/api
```

后端 `server/.env`：

```dotenv
HOST=127.0.0.1
PORT=8787
DB_PATH=server/data/app.sqlite
PUBLIC_DIR=
WX_APP_ID=wx0000000000000000
WX_APP_SECRET=仅放服务端的真实Secret
```

小程序 AppID 可以直接写入 `src/manifest.json`，也可以在构建时设置环境变量 `WECHAT_APP_ID`；`scripts/configure-wechat.mjs` 会在构建前写入。AppSecret、代码上传私钥和服务器私钥禁止提交到 Git。

本地上传时可把微信代码上传密钥保存为项目根目录的 `private.<AppID>.key`；该文件已被 Git 忽略。GitHub Actions 不读取工作区密钥，仍使用仓库 Secret `WECHAT_PRIVATE_KEY`。

微信公众平台还需要配置：

- `https://notes.example.com` 为 request 与 downloadFile 合法域名。
- 域名具有有效 HTTPS 证书且公网可访问 `/api/health`。
- 后台下载一份“小程序代码上传密钥”，供自动上传流程使用。

## 本地开发

要求 Node.js 24（仓库提供 `.nvmrc`；默认终端若仍是旧版 Node，请先执行 `nvm use` 并用 `node --version` 确认）：

```powershell
npm ci
npm run server
npm run dev:h5
```

H5 用于页面预览，不再提供体验登录。真实登录请执行：

```powershell
$env:WECHAT_APP_ID='wx0000000000000000'
$env:VITE_API_BASE='https://notes.example.com/api'
npm run dev:mp-weixin
```

然后在微信开发者工具中打开生成的小程序项目。后端 `server/.env` 必须配置相同的 AppID 和对应 AppSecret。

自动化测试使用进程内 `testAuth` 开关和 `/api/auth/test`，生产启动入口没有该开关，无法开启测试身份。

## 检查与构建

```powershell
npm run type-check
npm test
npm run build:h5
npm run build:mp-weixin
npm run build:app
```

构建产物：

- H5：`dist/build/h5`
- 微信小程序：`dist/build/mp-weixin`
- App 资源：`dist/build/app`，仍需 HBuilderX、DCloud AppID、平台签名和真机发行流程生成安装包

## Docker 生产部署

生产镜像同时运行 Node API 和 H5 静态站点；Caddy 负责自动申请/续期 HTTPS 证书：

```bash
cp deploy/.env.example deploy/.env
# 编辑 deploy/.env，填镜像、域名、AppID 和 AppSecret
docker compose --env-file deploy/.env up -d
```

SQLite 位于命名卷 `app-data`。每次自动部署前会执行 `server/backup.mjs`，默认把最近 14 份一致性备份保存在同一持久卷的 `/data/backups`。也可以手动运行：

```bash
docker compose --env-file deploy/.env exec app node server/backup.mjs
```

建议再把备份同步到独立对象存储或另一台服务器，避免主机磁盘同时损坏。

现有多项目 ECS 使用 Nginx 时，默认只把应用映射到 `127.0.0.1:8787`，Caddy 被放入可选的 `standalone` profile，不会占用宿主机的 80/443。Nginx 配置见 `deploy/nginx-notes.conf`；独立服务器需要 Caddy 时执行 `docker compose --profile standalone --env-file deploy/.env up -d`。

## 自动化部署

`.github/workflows` 包含三条流程：

- `ci.yml`：每次 push/PR 执行类型检查、后端测试和三端资源构建，并上传构建产物。
- `deploy.yml`：`main` 更新后构建 Docker 镜像推送到 GHCR；配置服务器变量后，先备份数据库，再通过 SSH 滚动更新并做健康检查。
- `deploy-wechat.yml`：`main` 的小程序代码变化后，临时安装微信官方 `miniprogram-ci`，构建并上传代码；上传工具不会进入业务依赖或生产镜像。

后端自动部署需要仓库 Variables：

- `APP_IMAGE`：例如 `ghcr.io/your-account/together-notes:latest`
- `DEPLOY_HOST`、`DEPLOY_USER`、`DEPLOY_PATH`

以及 Secrets：

- `DEPLOY_SSH_KEY`
- `DEPLOY_KNOWN_HOSTS`

服务器的 `${DEPLOY_PATH}/deploy/.env` 需事先创建；私有 GHCR 镜像还需在服务器执行一次 `docker login ghcr.io`。

小程序自动上传需要仓库 Variables：

- `WECHAT_APP_ID`
- `API_BASE_URL`，必须是以 `/api` 结尾的 HTTPS 地址
- `WECHAT_CI_ROBOT`，默认 1

以及 Secret：

- `WECHAT_PRIVATE_KEY`：微信公众平台下载的代码上传密钥全文

## 尚待外部资源接入

- 微信订阅消息、App 系统推送和 H5 浏览器通知；当前离开应用不会弹出系统通知。
- 新闻与赛程数据源。
- H5 微信网站授权、App 微信 SDK 登录、解绑、头像、录音转写、富文本和任意 App 文件选择。
- 微信真机登录、文件选择以及 App 安装包仍需在对应开发者账号和设备上做发布验收。
