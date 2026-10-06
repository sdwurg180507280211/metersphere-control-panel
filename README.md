# MeterSphere Control Panel

`metersphere-control-panel` 是一个独立维护的 MeterSphere 本地开发控制台，用于管理同级或指定目录中的 MeterSphere 源码项目，并提供 macOS Local Service Hub 桌面入口。

它面向本地开发、联调、构建和验证场景，不是可直接暴露到公网的运维后台。

## 主要能力

- 服务管理：单服务及批量启动、停止、重启、Reload
- 服务编排：依赖检查、按健康状态推进、失败补偿和进程恢复
- 前端构建：单模块/批量构建、取消真实构建进程、复制产物、关联服务重启
- SDK 构建：构建 `framework/sdk-parent` 相关模块
- 整体验证打包：运行 MeterSphere 打包脚本并实时查看状态和日志
- 配置管理：结构化编辑、校验、保存、诊断和运行时热应用
- 实时通信：WebSocket 推送服务状态、任务进度和各类日志
- SSH 隧道：保存端口映射、手动连接、自动连接和断线重连
- SQL 工作区：使用专用数据库只读账号执行 SQL
- 桌面应用：macOS Local Service Hub，本地服务快捷启动/访问/关闭与在线更新

### 服务管理与日志布局

服务卡片采用两行紧凑布局，启停和重启使用明确按钮，点击服务名称不会触发操作。进程状态、健康异常和过期提示仍会保留；长错误、排查建议和依赖参考通过“详情”在当前窗口右侧查看，不挤占日志高度。

服务列表独立滚动，默认占服务工作区约 40%，日志区约 60%；点击“收起服务区”可扩大日志阅读空间。卡片上的“日志”会切换到该服务的原生日志并高亮对应卡片，日志服务下拉框也会同步高亮；切回控制面板日志时取消单服务高亮。诊断详情关闭后返回原操作位置，也可直接转到该服务日志。

## 技术栈

### 后端

- Node.js 22.12+
- Express
- 原生 WebSocket (`ws`)
- MySQL (`mysql2`)
- Redis（可选）
- RxJS

### 前端

- React 18
- Vite 5
- Zustand

### Desktop

- Electron 44.3.0
- electron-builder
- macOS x64 / arm64

## 项目结构

```text
.
├── backend/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   └── server.js
├── docs/
├── frontend/
│   ├── public/
│   └── src/
│       ├── components/
│       ├── hooks/
│       ├── store/
│       └── styles/
├── scripts/
├── electron.js
└── package.json
```

## 运行要求

- Node.js 22.12+
- npm
- Java 和 Maven Wrapper 环境
- 可访问的 MeterSphere 源码目录
- macOS 或 Linux

当前服务进程控制主要面向 Unix 环境。Electron 正式构建目标为 macOS；Windows 不是正式支持目标。

## 安装与启动

### 安装依赖

```bash
npm run install:all
```

### 开发模式

```bash
npm run dev
```

默认地址：

- 后端 API / WebSocket：`http://127.0.0.1:3000`
- Vite 前端：`http://127.0.0.1:3001`

### 生产模式

```bash
npm run build
npm start
```

生产模式由后端直接托管 `frontend/dist`，统一访问：

```text
http://127.0.0.1:3000
```

### macOS 桌面包

```bash
npm run electron:app
```

推荐的本机安装/更新命令：

```bash
npm run install:local
```

Desktop 发布使用 `desktop-v*` GitHub Release。App 会按 CPU 架构选择 ZIP、校验 SHA256，并在 Electron 运行时一致时优先使用 delta 包。详见 [Desktop 在线更新](docs/DESKTOP-UPDATE.md)。

## 配置文件

控制面板配置默认存储在：

```text
~/.metersphere-control-panel/config.json
```

可通过环境变量覆盖：

```bash
MS_CONFIG_PATH=/custom/path/config.json
```

`config.json` 主要包含：

- `projectRoot`
- `port`
- `maxLogLines`
- `services`
- `desktopApplications`
- `package`
- `properties`
- `redis`
- `sshTunnel`
- `claudeCode`
- `jvmOptions`

配置保存时使用临时文件原子替换，并保留备份。Desktop 本地服务定义中的启动/关闭命令只按已保存 ID 执行，不提供任意命令执行 API。

### 项目根目录

源码运行时，默认会尝试识别控制面板同级的 MeterSphere 项目。

桌面打包环境不会假定 MeterSphere 源码位置，需要在配置页中选择项目根目录。

## SQL 工作区与只读账号

SQL 工作区不在应用层判断 SQL 类型，也不会自动追加 `LIMIT`。数据库账号权限是写操作安全边界。

控制面板不会复用 `metersphere.properties` 中的业务数据库用户名和密码。必须单独配置数据库只读账号；未配置或检测到写权限时，SQL 工作区会拒绝连接。

### 创建 MySQL 只读账号

```sql
CREATE USER 'ms_panel_ro'@'127.0.0.1' IDENTIFIED BY 'change-this-password';
GRANT SELECT, SHOW VIEW ON metersphere.* TO 'ms_panel_ro'@'127.0.0.1';
FLUSH PRIVILEGES;
```

不要授予：

- `INSERT`、`UPDATE`、`DELETE`
- `CREATE`、`DROP`、`ALTER`、`INDEX`
- `EXECUTE`、`TRIGGER`、`EVENT`
- `FILE`、`SUPER`、`GRANT OPTION`
- `ALL PRIVILEGES`

控制面板连接时会执行 `SHOW GRANTS FOR CURRENT_USER()`。检测到高风险权限后会立即关闭连接池。

### 环境变量

```bash
export MS_SQL_READONLY_HOST=127.0.0.1
export MS_SQL_READONLY_PORT=3306
export MS_SQL_READONLY_DATABASE=metersphere
export MS_SQL_READONLY_USER=ms_panel_ro
export MS_SQL_READONLY_PASSWORD='change-this-password'
```

### 独立 properties 文件

默认路径：

```text
~/.metersphere-control-panel/sql-readonly.properties
```

示例：

```properties
spring.datasource.url=jdbc:mysql://127.0.0.1:3306/metersphere
spring.datasource.username=ms_panel_ro
spring.datasource.password=change-this-password
```

也可以覆盖文件路径：

```bash
MS_SQL_READONLY_PROPERTIES_PATH=/custom/path/sql-readonly.properties
```

SQL 返回结果默认最多传给前端 1000 行，接口允许的最大展示上限为 5000 行。查询采用有界读取，同时限制已接收结果的数据量为 8 MiB。达到行数或数据量上限时停止读取；不参与 SQL 权限判断，也不会改写用户 SQL。`rowCount` 表示已返回行数，`rowCountExact: false` 表示未统计完整结果总数。查询页可取消正在执行的请求。

## Redis

默认使用内存缓存，不依赖 Redis。

显式启用 Redis：

```bash
export MS_CACHE_MODE=redis
export MS_REDIS_HOST=127.0.0.1
export MS_REDIS_PORT=6379
export MS_REDIS_PASSWORD=
export MS_REDIS_DB=0
export MS_CACHE_KEY_PREFIX=ms-panel:
```

## 本地访问安全

后端默认只监听：

```text
127.0.0.1
```

访问令牌支持：

- `X-MS-Local-Token`
- `Authorization: Bearer <token>`
- 首次页面访问的 `?token=<token>`

前端会保存 Token 后从地址栏移除，并自动附加到后续 API 和 WebSocket 请求。写请求与 WebSocket 握手都校验精确的浏览器 `Origin`，不信任任意本机端口。无 `Origin` 的 WebSocket 客户端必须提供访问令牌。本机 HTTP CLI 请求保留兼容模式；设置 `MS_REQUIRE_LOCAL_TOKEN=1` 可强制本机请求也使用令牌。

如设置：

```bash
MS_BIND_HOST=0.0.0.0
```

请确保网络环境可信。这个控制台具备进程、数据库、SSH、构建和系统命令能力，不应直接暴露到公网。

## 实时事件

WebSocket 地址：

```text
/ws
```

主要事件：

- `logs:service`
- `logs:build`
- `logs:package`
- `service:status`
- `build:progress`
- `job:progress`
- `job:completed`
- `job:failed`
- `package:started`
- `package:heartbeat`
- `package:completed`
- `package:failed`
- `infra:status`
- `tunnel:status`

## API 模块

```text
/api/services   服务、基础设施、SDK、SSH 隧道和 Desktop 本地应用
/api/build      前端构建
/api/progress   构建兼容进度接口
/api/jobs       统一任务查询
/api/package    整体验证打包
/api/config     配置管理
/api/logs       日志查询与兼容流
/api/sql        SQL 工作区
```

## Electron 下载问题

遇到 Electron 下载失败时，可以使用镜像：

```bash
npm config set registry https://registry.npmmirror.com
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm cache clean --force
rm -rf node_modules frontend/node_modules
npm run install:all
```

如果需要重新生成 lockfile，应在明确确认依赖变化后执行，不要无故删除已验证的 lockfile。

## License

MIT

## 可靠性改进与验收

本次可靠性修复的实现说明、配置锁恢复方法、兼容性变化和验收限制见 [可靠性改进说明](docs/RELIABILITY-2026-09-18.md)。

- `/api/health` 表示 HTTP 存活，`/api/ready` 只有初始化完成后才返回 200。
- 配置保存返回版本标识，冲突时拒绝覆盖；保存过程中继续输入的草稿不会被旧响应清空。
- 端口被占用不代表进程属于 MeterSphere；恢复和终止前需要核验进程身份。
- 桌面更新保留旧版本，直到新版本的后端与界面确认就绪；不是仅根据进程存在就判定成功。
- 启动控制台默认不主动建表或迁移 MeterSphere 数据库中的打包历史；显式设置 `MS_PACKAGE_HISTORY_AUTO_INIT=1` 可恢复启动初始化。现有历史和按需存储行为保留。

行为回归命令：

```bash
npm run test:reliability
```

该命令不能替代原有 Jest、前端构建和 macOS 桌面验收。
# 云端 CPA 访问

2026-10-05 更新：公网管理后台为 `http://39.102.212.37/management.html`，OAuth 页面为 `http://39.102.212.37/management.html#/oauth`。使用现有 CPA 管理密钥登录（不同于 New API 的模型 API Key）。公网入口经服务器网页服务转发到内部 CPA `127.0.0.1:8317`；管理接口仍校验密钥，CPA 服务端口保持内部监听。

客户端模型调用使用 OpenAI 兼容 Base URL：`http://39.102.212.37:3001/v1`，搭配 New API 为用户签发的 API Key。New API 后台为 `http://39.102.212.37:3001`。CPA 管理网页不作为客户的模型 Base URL，文档及控制面板链接不保存 API Key。

Codex 的官方授权仍会先回到浏览器所在电脑的 `localhost:1455`。CPA 的回调转发器随后按服务内部端口生成 `http://127.0.0.1:8317/codex/callback`，不会自动采用本机管理映射端口 `18317`。因此连接脚本现在同时建立 `1455` 和 `8317` 的回调通道，以及 Google `51121` 和后台 `18317` 通道。新增的 `8317` 通道使用独立控制文件 `ssh-cpa-callback-control`，已有 SSH 主通道不需要重新创建。

添加账号需要本机授权回调时，单独运行 `/bin/zsh /Users/edy/ideaProjects/metersphere-control-panel/scripts/cloud-connect.command`。若回调仍显示连接被拒绝，可在授权会话有效期间，将返回 URL 的 `http://127.0.0.1:8317` 部分替换为 `http://39.102.212.37`，保留 `/codex/callback` 和全部查询参数；不要修改官方授权链接内的 `redirect_uri`。公网回调入口为 `http://39.102.212.37/codex/callback`，不能单独打开空地址完成授权。回调页面 HTTP 200 只说明入口可达，最终必须以 CPA 提示授权成功或出现新认证文件为准。会话超时或 CPA 重启后需要重新发起授权。

控制面板项目内保留公网管理、OAuth、认证文件、New API 后台和模型 Base URL 入口，均可直接访问。文档及项目入口不保存临时授权 code、state 或管理密钥。当前公网入口为 HTTP，管理密钥及授权参数传输未加密；需要加密管理访问时可先运行连接脚本，再打开 SSH 入口 `http://127.0.0.1:18317/management.html`。

命令项目支持可选的 `accessUrl`（完整 HTTP/HTTPS 地址）。配置项目中的“完整访问地址”用于“访问服务”按钮；留空时继续使用本机状态端口。状态检测仍使用 `statusPort`。

本机 CPA 项目名称为 `CLIProxyAPI（云端）`，启动命令为 `/usr/bin/open 'http://39.102.212.37/management.html'`，完整访问地址使用同一公网 URL，状态端口留空。“访问服务”无需先启动本机项目或建立 SSH 通道；“启动”直接打开公网管理网页。本机项目配置存储于 `~/.metersphere-control-panel/config.json`。

该项目的“停止”仅显示云端服务持续运行的提示，关闭页面可直接操作浏览器。需要断开可选 SSH 通道时单独运行断开脚本；它会断开共享通道中的本机后台入口与授权回调通道，云服务器上的 CPA 和 New API 继续运行。

### 可恢复的连接脚本与项目源码

可选连接脚本已纳入版本管理：`scripts/cloud-connect.command` 和 `scripts/cloud-disconnect.command`。分别使用 `/bin/zsh <本仓库绝对路径>/scripts/cloud-connect.command` 和 `/bin/zsh <本仓库绝对路径>/scripts/cloud-disconnect.command` 手动连接或断开。后者支持重复断开，不会因通道已经关闭而返回 SSH 255。这两个脚本独立于控制面板 CPA 项目的启动、停止操作。

新电脑需先自行配置 SSH 别名 `aliyun`。可以用 `CLOUD_SSH_HOST` 指定其他别名，用 `CLOUD_TUNNEL_DIR` 指定控制文件目录；默认目录为 `$HOME/ideaProjects/new-api/.local/cloud`，与现有本机脚本共用通道。脚本只连接已部署的服务，不会部署服务器、恢复数据库或导入账号授权。

- CPA fork： https://github.com/sdwurg180507280211/CLIProxyAPI
- New API fork： https://github.com/sdwurg180507280211/new-api
- 本次本机源码基线：CPA `c93978c4ea2e908255a2a06c37599fda3651554a`，New API `2906e4f779b715f282ae11203211dca77051d5af`；分别保存在 fork 的 `codex/cloud-deployment-baseline` 分支。

Git 仓库只保存源码和无凭据的连接脚本。运行配置、账号授权、API 密钥、代理订阅、数据库和 SSH 私钥不随仓库上传。

## 图片素材库（阿里云）

在 Local Service Hub 的「管理项目」或「当前项目」中选择 **图片素材库 Image Gallery（阿里云）**，点击 **访问服务 ↗** 即可打开 <http://39.102.212.37/image-gallery/>。网址也直接显示在项目卡片与概览中，不必记住 IP。

图库持续托管于阿里云，不需要先启动本机服务。本机配置中的启动命令打开网页，停止命令仅显示提示，不关闭云端站点。云端项目填写完整访问地址并留空状态端口时允许直接访问；配置了本机状态端口的项目仍需端口运行后才允许访问。

本仓库维护统一入口与发布命令，图库源码及图片继续保存在同级 `../image-gallery` 独立仓库，阿里云部署使用其 `codex/aliyun-deploy` 分支。

```bash
npm run gallery:open      # 打开图库
npm run gallery:deploy    # 本地构建并通过 ssh aliyun 发布
npm run gallery:rollback  # 回退到上一个线上版本
```

图库位于其他位置时，可通过 `IMAGE_GALLERY_ROOT` 指定。控制面板项目配置存储于 `~/.metersphere-control-panel/config.json`，不随 Git 提交；换电脑时可在「添加项目」中填写上述网址，启动命令设为 `/bin/bash <本仓库绝对路径>/scripts/image-gallery.command open`，停止命令将末尾 `open` 改为 `stop`，状态端口留空。

### Image Gallery 风格管理

图库服务的“启动”入口通过 `scripts/image-gallery.command open` 打开 SSH 安全管理页面（本机 18780 端口），可保存公众号风格、默认组合和方案；“访问服务”仍打开公开图库。`browse` 可单独打开公开网址，`styles` 与 `open` 等效。密钥由 SSH 读取并仅保存在浏览器会话中，不写入面板配置或日志。

## 活动提问 Event Q&A

Local Service Hub 将同级 `../event-qna` 作为一个 **Event Q&A** 项目维护，默认地址为 `http://39.102.212.37:3036/event/demo/ask`。项目“启动”和“访问服务”直接打开公网提问页面，“停止”仅显示云端服务持续运行的提示，状态端口留空。项目内提供线上提问页面、审核后台、iPad 展示三个页面入口。`npm run qna:start` / `qna:stop` 仍可单独管理本地开发服务；`qna:live` / `qna:live-admin` / `qna:live-display` 打开线上三个页面。`qna:preview` 打开本地 FORUM 品牌预览。

本地关闭仅处理经目录与进程身份检查的 event-qna 应用，数据库继续保留；线上入口不会关闭阿里云服务。完整配置、维护方式与版本边界见 [Event Q&A 维护说明](docs/EVENT-QNA.md)。

command 项目可配置 `accessLinks` 页面入口（名称、HTTP/HTTPS 地址、可选分组和 `requiresRunning`），在“配置项目”内维护，最多 20 项。原有 `accessUrl` 继续作为默认访问地址；旧客户端编辑未传 `accessLinks` 时保留入口，显式传空数组清除。

桌面端“访问服务”及页面入口支持本机与公网 HTTP(S) 地址，在系统默认浏览器中打开；不接受其他协议或在 URL 中嵌入账号密码。主窗口仍保持本机来源与 IPC 校验。
