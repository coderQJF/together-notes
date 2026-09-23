# 两个人的小记

UniApp + Vue 3 + TypeScript 的双人备忘与提醒应用。保留 01 奶油黄主题、悬浮胶囊导航，以及“随记、提醒、搜搜”三个底部入口；“我们”由左上角头像进入，App/H5 可从首页右上角进入本地书架。兼容 H5、微信小程序和 App 资源构建。

## 已实现

- 微信小程序通过 `wx.login` 获取 code，由服务端调用微信接口换取 OpenID 并签发自己的会话；正式代码不提供体验账号。
- Android App 内测版使用独立账号和密码注册登录；密码通过随机盐和 `scrypt` 摘要保存，不与微信小程序身份自动合并。App 内支持退出和永久注销账号。
- 备忘新增、查看、编辑、删除、搜索、置顶、私人/共享筛选，支持多行正文和链接。
- 详情、编辑、比赛、新闻、邀请、消息和“小空间”均使用独立页面栈；“小空间”不显示底部导航，微信小程序可通过边缘右滑或顶部按钮返回。日期使用跨端一致的中文格式。
- 附件上传和权限保护下载：单文件 12MB、每人 100MB、每条最多 10 个附件。
- 双账号邀请码绑定；邀请码 24 小时有效且只能使用一次，防止自绑定和重复绑定。
- 共享内容双方可编辑；仅创建者能删除或改为私人；历史私人内容不会自动共享。
- 单次、每日、每周提醒，支持提前提醒和站内消息；微信小程序中可由当前接收者主动授权一次性订阅消息。Android App 使用本机 `AlarmManager` 登记已经同步的提醒，划掉 App 或进程被系统回收后仍可弹出系统通知，不依赖 UniPush 或 uniCloud。
- 比赛使用 football-data.org（英超、西甲、欧冠）和 PandaScore（仅 LPL、全球总决赛）的真实赛程、赛果与积分榜，足球球队与比赛阶段在服务端统一转为中文；新闻生产默认使用 GDELT Project 的真实中文资讯并整理为精选、股市与热点频道，GDELT 网络不可达时使用公开中文 RSS，也可显式切换到 NewsAPI，任何路径都不会回退到本地模拟数据。
- 服务端定时同步并将最后一次成功的真实内容缓存到 SQLite；刷新失败时可返回带警告的过期真实缓存，没有缓存则明确返回 provider 配置或上游错误码。
- 球队图标与获准使用的新闻配图由服务端校验、内网地址阻断、限大小后按 SHA-256 内容寻址保存到持久化 `MEDIA_DIR`，小程序不直连任意第三方图片域名；GDELT 返回的出版方图片默认不下载或重托管。
- “搜搜”提供“智能、只搜本地、问模型”三种策略：“智能”先检索当前账号有权查看的小记、提醒及已同步内容，找不到再询问模型；“只搜本地”完全不调用模型；“问模型”跳过本地，适合继续查询“常州哪里有野生板栗”一类公开问题。联网请求只包含当前问题，不会携带私人笔记。
- 本地书架支持粘贴自己创作、已获授权或公版的 TXT 文本，自动识别中文章节、保存阅读进度，并可调整字号、行距和阅读背景。书籍正文不上传服务器，也不内置或抓取“笔趣阁”等版权不明的第三方书源。
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
VITE_PUBLIC_BASE_URL=https://notes.example.com
```

后端 `server/.env`：

```dotenv
HOST=127.0.0.1
PORT=8787
DB_PATH=server/data/app.sqlite
PUBLIC_DIR=
MEDIA_DIR=server/data/media
MEDIA_MAX_TOTAL_BYTES=536870912
MEDIA_MAX_FILES=5000
PUBLIC_BASE_URL=https://notes.example.com
WX_APP_ID=wx0000000000000000
WX_APP_SECRET=仅放服务端的真实Secret
WX_REMINDER_TEMPLATE_ID=SRj7mQ0c6juhTrXsl8VRWLpLJuwehMjZpWRNUlar1ts
APP_REGISTRATION_CODE=仅放服务端并发给内测用户的注册口令
FOOTBALL_DATA_API_KEY=仅放服务端的 football-data.org 密钥
PANDASCORE_API_TOKEN=仅放服务端的 PandaScore token
NEWS_PROVIDER=gdelt
GDELT_BASE_URL=https://api.gdeltproject.org/api/v2/doc/doc
NEWS_API_KEY=仅在 NEWS_PROVIDER=newsapi 时填写
NEWS_RETENTION_DAYS=30
NEWS_MAX_ARTICLES=1000
SPORTS_SYNC_INTERVAL_MS=900000
NEWS_SYNC_INTERVAL_MS=3600000
AI_API_KEY=仅放服务端的微信 Coding Plan Token
AI_API_TYPE=chat_completions
AI_BASE_URL=https://chatapi.weixin.qq.com/openai/v1
AI_MODEL=Deepseek-v4-flash
AI_WEB_SEARCH_ENABLED=true
AI_TIMEOUT_MS=55000
AI_RATE_LIMIT_PER_MINUTE=5
APP_TIME_ZONE=Asia/Shanghai
```

内容服务会在启动后和上述间隔自动同步。密钥不能下发到 H5/小程序；GDELT 模式不需要注册或密钥，显式使用 NewsAPI 时缺少密钥会返回 `NEWS_API_UNCONFIGURED`。上游故障返回可追踪的结构化错误，不会伪造赛程或新闻。`MEDIA_DIR` 应与 SQLite 一样挂载到持久化磁盘；未显式配置时默认使用数据库文件的同级 `media` 目录。

微信提醒使用“日历提醒”一次性订阅模板：`thing1` 为提醒事项、`time2` 为提醒时间、`thing6` 为备注。用户必须在提醒编辑页主动打开“微信服务通知”并接受微信弹窗；一次授权仅用于下一次发送，重复提醒的后续周期需再次授权。模板 ID 不是密钥，可提交或由 `WX_REMINDER_TEMPLATE_ID` 覆盖；`WX_APP_SECRET` 仍只允许保存在服务器环境文件中。

App 新账号注册默认关闭。把随机且不易猜测的内测口令写入服务端 `APP_REGISTRATION_CODE` 后，测试者可凭该口令注册；清空它会再次关闭注册，但不会影响已有账号登录。

Android App 的系统通知完全在本机生成。登录或重新打开 App 时，客户端会把当前账号可见且提醒对象包含自己的待办同步到 Android 系统闹钟；保存、完成、删除、退出登录和注销账号会立即更新或清理本机计划。每日/每周提醒由原生接收器续排，手机重启或 App 更新后会恢复。对方在本机离线期间新建的提醒，要等下次打开 App 同步后才能登记；系统设置中的“强行停止”会让 Android 取消后台闹钟，重新打开 App 后恢复。

智能搜索默认按截图使用兼容 OpenAI [Chat Completions](https://developers.openai.com/api/reference/cli/resources/chat/subresources/completions) 的微信模型网关，请求地址为 `${AI_BASE_URL}/chat/completions`；也可把 `AI_API_TYPE` 改为 `responses` 后使用 OpenAI [Responses API](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)。本地检索始终由服务端直接完成，不依赖模型配置，也不会把私人小记发送给模型；只有本地没有匹配时才请求模型，且请求只包含用户当前问题。Chat Completions 模式通过 `web_search_options` 尝试搜索并读取 `search_results`：有可核验来源时展示为联网回答，没有来源但模型返回正文时展示为“模型回答 · 未联网核验”；服务未配置、不可达或没有正文时才返回“没有找到相关数据”。

真实内容源与调度约定：

- 足球数据来自 [football-data.org](https://www.football-data.org/documentation/quickstart)，英雄联盟数据来自 [PandaScore](https://developers.pandascore.co/reference/get_lol_matches)。PandaScore 同步前会动态查询 LPL 与 World Championship 联赛 ID，再通过 `filter[league_id]` 拉取并在服务端二次过滤；不会展示 LCK、MSI 等其他赛事。新闻生产默认来自 [GDELT Project](https://www.gdeltproject.org/)；其数据可免费用于商业项目，但使用或再分发时必须注明并链接 GDELT Project。
- GDELT 默认每小时同步一次，每轮只使用一个聚合查询获取最近 24 小时的中文财经、商业与科技资讯；遇到 429 最多延迟重试一次。若服务器无法连接 GDELT 或返回异常数据，则读取 36氪与中新网财经公开 RSS，并在响应中标记实际来源。用户手动刷新有 60 秒全局限流。服务端按真实标题和收录时间去重、做来源多样化，并按标题关键词分流频道；这只是本地整理，不冒充平台热榜。赛事默认每 15 分钟更新。若以后扩为多实例，应把调度器拆成单独 worker。
- 新闻详情只保存 provider 实际给出的元数据并保留原文链接，不抓取网页正文，也不会拿标题拼成摘要；RSS 兜底会保留来源实际发布的摘要，未提供时明确提示阅读原文。GDELT DOC 结果通常不含摘要、正文或作者。兼容的 [NewsAPI Everything](https://newsapi.org/docs/endpoints/everything) 需显式设置 `NEWS_PROVIDER=newsapi`；Developer 免费方案仅限开发测试，生产必须购买允许生产用途的方案。
- 队徽和已确认展示权的新闻配图不放进前端包，而是由服务端下载到持久化 `MEDIA_DIR` 后再通过 `/api/media/*` 提供；下载会校验公网 HTTPS、文件大小、类型与文件特征。GDELT 的 `socialimage` 属于原始出版方，开放数据许可不等于图片版权授权，因此默认不缓存或展示。
- 媒体缓存默认限制为 512MB/5000 个文件并清理未引用内容；新闻摘要历史默认保留 30 天、最多 1000 条，使已收藏文章在滚出当前资讯流后仍可打开。

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

### Android 内测安装包

代码仓库已经固定 DCloud AppID `__UNI__10E8CA8`、包名 `cn.coderf.togethernotes` 和版本 `0.2.3 (23)`，并提供账号密码登录、原生隐私弹窗、协议页、账号注销、系统分享及 Android 本机定时通知。当前内测版不需要开通 UniPush 或 uniCloud；验收时只需准备一台 Android 真机：

- 在手机系统设置中允许“小记”通知；如果系统提供“闹钟与提醒”特殊权限，也一并允许。测试时创建两分钟后的提醒，划掉 App 并锁屏等待通知。不要用系统设置中的“强行停止”作为普通关闭方式。

已经使用过微信小程序的用户不要在 App 中重新注册。先在小程序进入“小空间 → 在 Android App 登录”，为现有账号设置一组 App 登录账号和密码；再回到 App 选择“已有账号”登录，原来的小记、提醒和双人绑定都会继续保留。只有从未使用过小记的新用户才选择“新用户注册”。

其余内测材料已经由项目生成：

- Android 发布证书：`.private/android/together-notes-release.keystore`。
- 证书密码、内测注册口令和证书指纹：`.private/android/app-release-secrets.local.json`。
- 1024×1024 图标及 Android 密度图：`src/static/app-icons`。
- Android 本机闹钟插件：`src/uni_modules/together-local-reminder`。

`.private` 已被 Git 忽略。首次安装包发出前请把整个 `.private/android` 目录加密备份到另一个安全位置；以后每次升级必须继续使用同一证书，丢失后无法覆盖安装旧版本。需要重新初始化一套全新身份时才可删除旧文件并运行：

```powershell
$env:KEYTOOL_PATH='你的 JDK\bin\keytool.exe'
node scripts/generate-android-signing.mjs
```

生成资源前可以显式写入外部标识：

```powershell
$env:DCLOUD_APP_ID='__UNI__XXXXXXX'
$env:ANDROID_PACKAGE_NAME='cn.coderf.togethernotes'
$env:VITE_API_BASE='https://notes.example.com/api'
$env:VITE_PUBLIC_BASE_URL='https://notes.example.com'
npm run build:app
```

`npm run build:app` 只生成 `dist/build/app` 资源，不是 APK。签名信息只从 `.private` 读取或在 HBuilderX“发行 → 原生 App 云打包”界面填写，不写入仓库。项目未勾选 Push 模块，也不需要绑定 uniCloud 服务空间。

HBuilderX 登录且云服务已开通后，可直接执行：

```powershell
npm run prepare:android-beta
npm run package:android-beta
```

第二条命令会生成忽略提交的 HBuilderX 打包配置，使用自有证书申请 Android 安心云打包；完成后会从 APK 运行清单移除 HBuilderX 注入的证书路径和密码字段，再用同一证书重新签名并校验，全程不在终端输出密码。

### 划掉 App 后的系统提醒

1. 使用自有证书云打包 APK 并安装；本机闹钟插件属于原生代码，不能使用不包含该插件的旧标准基座验收。
2. 登录后创建两分钟后的提醒。首次保存时允许通知权限；Android 12 的部分设备还会打开“闹钟与提醒”设置页，需允许后返回 App。
3. 从最近任务中划掉 App 并锁屏，等待通知；每日和每周提醒会在触发后继续登记下一次。
4. 手机重启后无需先打开 App，插件会从应用私有目录中的计划恢复闹钟。卸载、清除数据、退出登录或在系统设置中强行停止 App 会清除或暂停这些计划。

本地方案只能提醒已经同步到这台手机的数据。另一半在此手机离线期间新建或修改的提醒，不会通过网络主动唤醒 App；再次打开 App 完成同步后才会登记到系统。

## AI 协作模式

仓库采用“规范契约 → 共享组件 → 页面组合 → 移动端视觉回归”的开发方式。根目录 [`AGENTS.md`](./AGENTS.md) 是 AI 修改代码前必须读取的持久约束：曾经确认过的 Tab 动效、编辑态、图标居中、搜索结果和点击区域规则会自动成为后续同类需求的默认实现，不需要每次在提示词里重复。

## 移动端视觉回归

一条命令即可构建 H5、启动仅监听本机且使用内存数据库的临时测试服务，并批量检查常见手机宽度下的页面溢出、点击区域和截图。备忘/提醒使用隔离的 QA 记录；比赛和新闻不注入模拟内容，默认核验无缓存时的真实错误态：

```powershell
npm run qa:mobile
```

默认覆盖 320、375、390、430 像素屏宽，结果写入已忽略的 `artifacts/mobile-audit`；临时服务结束后会自动清理，不会接触正式数据库。可通过 `CAPTURE_WIDTHS`、`CAPTURE_SCREENS`、`CAPTURE_DIR` 与 `EDGE_PATH` 调整页面范围和浏览器路径。若要审计外部测试环境，可额外提供 `PREVIEW_URL`、`QA_SESSION` 与 `QA_ITEM_ID`。更新 SVG 图标源后执行 `npm run qa:icons` 可重新生成跨端 PNG 图标。

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
- `deploy.yml`：`main` 更新后构建 Docker 镜像推送到 GHCR 作为灾备；启用 ECS 发布后，由 GitHub Runner 构建 H5、SSH 上传轻量发布包，先备份数据库，再通过 systemd 切换版本、健康检查并在失败时回滚。
- `deploy-wechat.yml`：`main` 的小程序代码变化后，临时安装微信官方 `miniprogram-ci`，构建并上传代码；上传工具不会进入业务依赖或生产镜像。

后端自动部署需要仓库 Variable：

- `ECS_DEPLOY_ENABLED=true`

以及 Secrets：

- `ECS_HOST`
- `ECS_USER`
- `ECS_SSH_KEY`

首次部署前在 ECS 执行 `deploy/bootstrap-ecs.sh`，并创建 `/opt/together-notes/shared/server.env`。日常发布不再依赖 ECS 从 GHCR 拉取镜像；容器镜像仍可用于新服务器恢复。

systemd 部署的 `server.env` 应使用可写数据目录的绝对路径，不能照抄本地相对路径：

```dotenv
HOST=127.0.0.1
PORT=8787
DB_PATH=/var/lib/together-notes/app.sqlite
BACKUP_DIR=/var/lib/together-notes/backups
PUBLIC_DIR=/opt/together-notes/current/dist/build/h5
MEDIA_DIR=/var/lib/together-notes/media
MEDIA_MAX_TOTAL_BYTES=536870912
MEDIA_MAX_FILES=5000
PUBLIC_BASE_URL=https://notes.example.com
WX_APP_ID=wx0000000000000000
WX_APP_SECRET=仅放服务器
WX_REMINDER_TEMPLATE_ID=SRj7mQ0c6juhTrXsl8VRWLpLJuwehMjZpWRNUlar1ts
APP_REGISTRATION_CODE=仅放服务器并发给内测用户
FOOTBALL_DATA_API_KEY=仅放服务器
PANDASCORE_API_TOKEN=仅放服务器
NEWS_PROVIDER=gdelt
GDELT_BASE_URL=https://api.gdeltproject.org/api/v2/doc/doc
NEWS_API_KEY=仅在 NEWS_PROVIDER=newsapi 且方案允许生产用途时填写
NEWS_RETENTION_DAYS=30
NEWS_MAX_ARTICLES=1000
SPORTS_SYNC_INTERVAL_MS=900000
NEWS_SYNC_INTERVAL_MS=3600000
AI_API_KEY=仅放服务器
AI_API_TYPE=chat_completions
AI_BASE_URL=https://chatapi.weixin.qq.com/openai/v1
AI_MODEL=Deepseek-v4-flash
AI_WEB_SEARCH_ENABLED=true
AI_TIMEOUT_MS=55000
AI_RATE_LIMIT_PER_MINUTE=5
APP_TIME_ZONE=Asia/Shanghai
```

小程序自动上传需要仓库 Variables：

- `WECHAT_APP_ID`
- `API_BASE_URL`，必须是以 `/api` 结尾的 HTTPS 地址
- `WECHAT_CI_ROBOT`，默认 1

以及 Secret：

- `WECHAT_PRIVATE_KEY`：微信公众平台下载的代码上传密钥全文

## 尚待外部资源接入

- 微信订阅消息、App 系统推送和 H5 浏览器通知；当前离开应用不会弹出系统通知。
- H5 微信网站授权、App 微信 SDK 登录、解绑、头像、录音转写、富文本和任意 App 文件选择。
- 微信真机登录、文件选择以及 App 安装包仍需在对应开发者账号和设备上做发布验收。
