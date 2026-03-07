# MeterSphere 控制面板 v2.0

基于 React + Node.js 的 MeterSphere 服务管理控制面板。

## 特性

- 🎨 **现代化 UI**：React + Vite 构建，流畅的交互体验
- 🏗️ **分层架构**：后端采用 MVC 架构，代码清晰易维护
- 📊 **实时日志**：SSE 实时推送服务日志和构建日志
- 🚀 **批量操作**：一键启动/停止所有服务
- 🔄 **自动重启**：前端构建后自动重启对应后端服务
- 📝 **日志持久化**：日志写入文件，支持按日期分割

## 项目结构

```
.
├── backend/                 # 后端代码
│   ├── controllers/         # 控制器
│   │   ├── serviceController.js
│   │   ├── buildController.js
│   │   └── logController.js
│   ├── routes/              # 路由
│   │   ├── services.js
│   │   ├── build.js
│   │   └── logs.js
│   ├── services/            # 业务逻辑
│   │   ├── processManager.js
│   │   └── healthChecker.js
│   ├── utils/               # 工具函数
│   │   ├── logger.js
│   │   └── validator.js
│   ├── config.js            # 配置加载
│   └── server.js            # 主入口
├── frontend/                # React 前端
│   ├── src/
│   │   ├── components/      # 组件
│   │   ├── styles/          # 样式
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
├── config.json              # 服务配置
└── package.json             # 根 package.json
```

## 快速开始

### 1. 安装依赖

```bash
# 安装后端 + 前端依赖
npm run install:all
```

### 2. 开发模式

同时启动后端和前端开发服务器：

```bash
npm run dev
```

- 后端: http://localhost:3000
- 前端开发服务器: http://localhost:3001

### 3. 生产模式

```bash
# 构建前端
npm run build

# 启动生产服务器
npm start
```

访问 http://localhost:3000

## API 文档

### 服务管理

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/services/status` | 获取所有服务状态 |
| POST | `/api/services/start-all` | 启动所有服务 |
| POST | `/api/services/stop-all` | 停止所有服务 |
| GET | `/api/services/:id/status` | 获取单个服务状态 |
| GET | `/api/services/:id/health` | 健康检查 |
| POST | `/api/services/:id/start` | 启动服务 |
| POST | `/api/services/:id/stop` | 停止服务 |
| POST | `/api/services/:id/restart` | 重启服务 |

### 构建管理

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/build/modules` | 获取可构建模块列表 |
| POST | `/api/build/frontend` | 构建前端模块 |
| POST | `/api/build/frontend/batch` | 批量构建 |

### 日志

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/logs/stream` | SSE 实时日志流 |
| GET | `/api/logs/files` | 获取日志文件列表 |
| POST | `/api/logs/clean` | 清理旧日志 |

## 配置

编辑 `config.json` 文件配置服务：

```json
{
  "port": 3000,
  "projectRoot": "..",
  "maxLogLines": 1000,
  "services": {
    "eureka": {
      "name": "Eureka",
      "pom": "framework/eureka/pom.xml",
      "port": 8761,
      "healthCheck": "/actuator/health",
      "startOrder": 1
    }
  }
}
```

## 升级说明

从 v1.0 升级到 v2.0：

1. 备份 `config.json`
2. 删除旧文件：`rm server.js public/index.html`
3. 重新安装依赖：`npm run install:all`
4. 启动：`npm run dev`

## 规划文档

- 优化清单：`docs/control-panel-optimization-roadmap.md`

## License

MIT
