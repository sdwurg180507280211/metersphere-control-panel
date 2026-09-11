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

SQL 返回结果默认最多传给前端 1000 行，接口允许的最大展示上限为 5000 行。该上限只控制返回数据量，不参与 SQL 权限判断，也不会改写用户 SQL。

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

前端会保存 Token 后从地址栏移除，并自动附加到后续 API 和 WebSocket 请求。写请求还会校验浏览器 `Origin`，阻止其他网页跨站调用本机控制 API。

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
