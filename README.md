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

命令项目支持可选的 `accessUrl`（完整 HTTP/HTTPS 地址）。配置项目中的“完整访问地址”用于“访问服务”按钮；留空时继续使用本机状态端口。状态检测仍使用 `statusPort`。

本机 CPA 项目现使用云端管理连接：启动命令运行 `/Users/edy/ideaProjects/new-api/.local/cloud/连接云端.command`，状态端口为 `18317`，访问地址为 `http://127.0.0.1:18317/management.html`。连接脚本同时提供 Codex `1455` 和 Google `51121` 授权回调通道。

停止命令断开该脚本建立的共享 SSH 通道（包括 New API 的本机 `13001` 入口），不会停止云服务器上的 CPA 或 New API，也不会影响客户访问公网 API。

### 可恢复的连接脚本与项目源码

连接脚本已纳入版本管理：`scripts/cloud-connect.command` 和 `scripts/cloud-disconnect.command`。后者支持重复断开，不会因通道已经关闭而返回 SSH 255。控制面板可将启动、停止命令分别设为 `/bin/zsh <本仓库绝对路径>/scripts/cloud-connect.command` 和 `/bin/zsh <本仓库绝对路径>/scripts/cloud-disconnect.command`。

新电脑需先自行配置 SSH 别名 `aliyun`。可以用 `CLOUD_SSH_HOST` 指定其他别名，用 `CLOUD_TUNNEL_DIR` 指定控制文件目录；默认目录为 `$HOME/ideaProjects/new-api/.local/cloud`，与现有本机脚本共用通道。脚本只连接已部署的服务，不会部署服务器、恢复数据库或导入账号授权。

- CPA fork： https://github.com/sdwurg180507280211/CLIProxyAPI
- New API fork： https://github.com/sdwurg180507280211/new-api
- 本次本机源码基线：CPA `c93978c4ea2e908255a2a06c37599fda3651554a`，New API `2906e4f779b715f282ae11203211dca77051d5af`；分别保存在 fork 的 `codex/cloud-deployment-baseline` 分支。

Git 仓库只保存源码和无凭据的连接脚本。运行配置、账号授权、API 密钥、代理订阅、数据库和 SSH 私钥不随仓库上传。
