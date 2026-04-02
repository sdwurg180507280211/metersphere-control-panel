# MeterSphere 控制面板 - 服务管理与监控机制

> 完整学习笔记，涵盖从后端进程管理到前端状态展示的全流程。

## 📋 目录

- [1. 整体架构](#1-整体架构)
- [2. 健康检查机制](#2-健康检查机制)
- [3. WebSocket 状态广播](#3-websocket-状态广播)
- [4. 前端状态展示](#4-前端状态展示)
- [5. 进程管理与状态机](#5-进程管理与状态机)
- [6. 完整数据流转](#6-完整数据流转)
- [7. API 路由总览](#7-api-路由总览)
- [8. 核心数据结构](#8-核心数据结构)

---

## 1. 整体架构

### 后端核心文件

| 文件路径 | 功能描述 |
|---------|---------|
| `backend/server.js` | 主服务器入口，初始化各服务 |
| `backend/services/healthChecker.js` | 健康检查核心实现 |
| `backend/services/websocketService.js` | WebSocket 广播服务 |
| `backend/services/serviceTaskService.js` | 服务任务编排（启动/停止/重启） |
| `backend/services/jobService.js` | 统一任务生命周期管理 |
| `backend/services/processManager/index.js` | 进程管理器主类 |
| `backend/services/processManager/serviceLifecycle.js` | 服务生命周期管理 mixin |
| `backend/services/processManager/devServer.js` | 开发服务器管理 |
| `backend/services/processManager/shared.js` | 共享状态和常量 |
| `backend/controllers/serviceController.js` | HTTP API 控制器 |
| `backend/routes/services.js` | 服务路由定义 |

### 前端核心文件

| 文件路径 | 功能描述 |
|---------|---------|
| `frontend/src/hooks/useWebSocket.jsx` | WebSocket 客户端 Hook |
| `frontend/src/components/ServicesTab.jsx` | 服务管理 UI 组件 |
| `frontend/src/store/useAppStore.js` | Zustand 状态管理 |

---

## 2. 健康检查机制

### 两种检查模式

| 模式 | 使用条件 | 检查方式 | 成功判断 |
|------|---------|---------|---------|
| **HTTP 模式** | 配置了 `healthCheck` 端点 | HTTP GET 请求 | HTTP 200 + `{status: "UP"}` 或简单 HTTP 200 |
| **端口探测模式** | 未配置健康检查端点 | TCP Socket 连接 | 端口可连接 |

默认健康检查端点: `/actuator/health` (Spring Boot Actuator)

### 自适应重试间隔

| 尝试次数 | 间隔 |
|---------|------|
| 1-3 次 | 1000ms |
| 4-6 次 | 2000ms |
| 7-10 次 | 3000ms |
| 10+ 次 | 3000ms |

### 故障分类与重试策略

| 错误码 | 说明 | 是否可重试 |
|--------|------|-----------|
| `HEALTH_ENDPOINT_NOT_FOUND` | HTTP 404 | ❌ 直接失败 |
| `HEALTH_CHECK_UNAUTHORIZED` | HTTP 401/403 | ❌ 直接失败 |
| `HEALTH_CHECK_FAILED` | HTTP 4xx | ❌ 直接失败 |
| `HEALTH_CHECK_TIMEOUT` | 连接超时 | ✅ 可重试 |
| `HEALTH_CHECK_FAILED` | HTTP 5xx | ✅ 可重试 |

### 关键方法

```javascript
// 单次健康检查
async check(serviceId)

// 等待服务健康（轮询直到成功或超时）
async waitForHealthy(serviceId, options)

// 批量检查所有服务
async checkAll()
```

---

## 3. WebSocket 状态广播机制

### 连接管理

```
/clientMap (clientId -> {ws, type, subscriptions, lastPing})
     │
     ├── 订阅频道: 'logs:service', 'logs:build', 'build:progress', 'service:status', 'job:*'
     └── 心跳机制: 每 30 秒 ping，超时 120 秒断开
```

### 广播频道列表

| 频道 | 数据内容 | 前端处理 |
|------|---------|---------|
| `service:status` | 服务状态对象 | `updateServiceStatus()` 即时更新 |
| `logs:service` | 服务日志行 | `appendServiceLog()` 日志追加 |
| `logs:build` | 构建日志行 | `appendBuildLog()` 日志追加 |
| `job:progress` | 任务进度 | `handleJobEvent()` 更新进度 |
| `job:completed` | 任务完成 | `handleJobEvent()` → `fetchServices()` |
| `job:failed` | 任务失败 | `handleJobEvent()` → `fetchServices()` |

### 核心方法

```javascript
// 通用广播到所有连接
broadcast(channel, data)

// 专门的服务状态广播
broadcastServiceStatus(status)

// 日志广播
broadcastLog(type, logData)

// 任务进度广播
broadcastJobProgress(job)
broadcastJobCompleted(job)
broadcastJobFailed(job)
```

### 降级策略

当 WebSocket 连接断开时，前端自动启用 **5 秒轮询** 获取最新状态，连接恢复后切回推送模式。

---

## 4. 前端状态展示和更新

### 前端数据流

```
WebSocket 连接
    │
    ├─→ onopen → subscribe(['logs:service', 'service:status', 'job:*', '*'])
    │
    ├─→ onmessage ──┬─→ 'service:status' → updateServiceStatus()
    │               ├─→ 'logs:service'   → appendServiceLog()
    │               ├─→ 'job:progress'   → handleJobEvent()
    │               ├─→ 'job:completed'  → handleJobEvent() → scheduleRefresh(fetchServices)
    │               └─→ 'job:failed'     → handleJobEvent() → scheduleRefresh(fetchServices)
    │
    └─→ onclose → 自动重连（最多 5 次，间隔 3 秒）

备用方案（WebSocket 断开时）: 每 5 秒轮询 fetchServices()
```

### 服务状态配置

| 状态 phase | 图标 | 颜色 | 背景色 | 边框色 | 说明 |
|-----------|------|------|--------|--------|------|
| `starting` | ◌ | #fbbf24 | #2b2110 | #7c5b13 | 启动中 |
| `checking_health` | ◎ | #60a5fa | #0f2342 | #28589a | 健康检查中 |
| `running` | ● | #4ade80 | #102617 | #24653b | 运行中 |
| `stopping` | ◍ | #fb923c | #2d1d10 | #8a4b1f | 停止中 |
| `stopped` | ○ | #94a3b8 | #182237 | #334155 | 已停止 |
| `failed` | ✕ | #f87171 | #311818 | #8f3434 | 启动失败 |
| `restarting` | ↻ | #c084fc | #23163a | #6f42b6 | 重启中 |

---

## 5. 进程管理与状态流转

### 共享状态

**文件位置**: `backend/services/processManager/shared.js`

```javascript
// PID 文件存储目录
const PID_DIR = '.pids/'

// 内存中的状态 Map
const serviceProcesses = new Map()  // serviceId → {pid, pom, port, child}
const serviceStatuses = new Map()   // serviceId → {serviceId, name, phase, running, pid, error, updatedAt}
const devServerProcesses = new Map()// devServer: moduleId → {pid, module, child}

// 过渡状态集合（正在变向中，不接受新操作）
const TRANSITIONAL_SERVICE_PHASES = new Set([
  'starting', 'checking_health', 'stopping', 'restarting'
])
```

### PID 三层查找顺序

```javascript
1. serviceProcesses Map (内存)
2. {serviceId}.pid 文件 (磁盘: .pids/)
3. 通过 pgrep -f {pom} 或 lsof -ti :{port} 查找 (系统级搜索)
```

### 状态机定义

```
                    ┌─────────────┐
                    │   stopped   │
                    └──────┬──────┘
                           │ start()
                           ▼
                    ┌─────────────┐
                    │  starting   │
                    └──────┬──────┘
                           │ spawn 成功
                           ▼
                    ┌─────────────┐
         ┌──────────│checking_   │
         │          │ health      │
         │          └──────┬──────┘
         │                 │
    健康检查失败        健康检查通过
         │                 │
         ▼                 ▼
    ┌─────────┐      ┌──────────┐
    │ failed  │      │ running  │
    └────┬────┘      └────┬─────┘
         │                  │
         └───────────┬──────┘
                     │
                  stop()
                     │
                     ▼
              ┌──────────────┐
              │   stopping   │
              └──────┬───────┘
                     │
                     ▼
              ┌──────────────┐
              │   stopped    │
              └──────────────┘

重启流程:
  running → stopping → stopped → starting → checking_health → running
     \
      └───→ restarting (复合状态)
```

### 进程终止策略

1. 收集所有候选 PID（内存跟踪 + 文件 + pgrep + lsof）
2. 对每个 PID:
   - 发送 `SIGTERM` 优雅退出
   - 同时终止所有子进程 (`pgrep -P {parentPid}`)
   - 等待 5 秒
   - 如果仍在运行，发送 `SIGKILL` 强制终止
3. 清理 PID 文件和内存状态

---

## 6. 完整数据流转图

```
┌─────────────┐
│   前端 UI   │
│ ServicesTab │
└──────┬──────┘
       │
       │ 1. 用户点击启动按钮
       │    POST /api/services/{id}/start
       ▼
┌─────────────────────────────────┐
│  serviceController.start()       │
│  enqueueServiceTask()            │
└──────┬──────────────────────────┘
       │
       │ 2. serviceTaskService.startService()
       ▼
┌─────────────────────────────────┐
│  jobService.createJob()          │
│  - 生成 jobId                    │
│  - 状态: pending                  │
└──────┬──────────────────────────┘
       │
       │ 3. 获取分布式锁
       ▼
┌─────────────────────────────────┐
│  jobService.acquireLock()        │
│  锁键: 'lock:service:{id}'      │
└──────┬──────────────────────────┘
       │
       │ 4. 开始任务
       ▼
┌─────────────────────────────────┐
│  jobService.startJob()           │
│  broadcastJobProgress()  ←───────┼───────────┐
└──────┬──────────────────────────┘           │
       │                                        │
       │ 5. 启动进程                            │
       ▼                                        │
┌─────────────────────────────────┐            │
│  processManager.start()          │            │
│  - spawn mvn spring-boot:run      │            │
│  - _attachServiceProcess()       │            │
│    - 保存 PID 到 Map + .pid 文件  │            │
│    - 监听 stdout/stderr → 广播日志 │            │
│    - 监听 close/error 事件       │            │
└──────┬──────────────────────────┘            │
       │                                        │
       │ 6. 启动健康监控                         │
       ▼                                        │
┌─────────────────────────────────┐            │
│  _monitorServiceHealth()         │            │
│  healthChecker.waitForHealthy()  │            │
│  - 自适应间隔轮询                │            │
└──────┬──────────────────────────┘            │
       │                                        │
       │ 7. 健康检查结果                         │
       ▼                                        │
┌─────────────────────────────────┐            │
│  _setServiceStatus()             │◄───────────┘
│  - 更新内存状态 serviceStatuses  │
│  - broadcastServiceStatus()      │─────────┐
└──────┬──────────────────────────┘            │
       │                                        │
       │ 8. WebSocket 广播到前端               │
       ▼                                        │
┌─────────────────────────────────┐            │
│  websocketService.broadcast()   │            │
│  channel: 'service:status'      │─────────┐│
└──────┬──────────────────────────┘         ││
       │                                     ││
       │ 9. 任务完成                          ││
       ▼                                     ││
┌─────────────────────────────────┐         ││
│  jobService.completeJob()       │         ││
│  broadcastJobCompleted()        │─────────┼┘
└──────┬──────────────────────────┘         │
       │                                     │
       │ 10. 前端接收 WebSocket 消息         │
       ▼                                     │
┌─────────────────────────────────┐◄──────────┘
│  前端 useWebSocket Hook         │
│  - onmessage 'service:status'   │
│    → updateServiceStatus()      │
│  - onmessage 'job:completed'    │
│    → scheduleRefresh(fetchServices)
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  ServicesTab 重新渲染           │
│  显示状态: running               │
└─────────────────────────────────┘
```

---

## 7. API 路由总览

**文件位置**: `backend/routes/services.js`

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/services/catalog` | 获取服务目录 |
| GET | `/api/services/status` | 获取所有服务状态 |
| GET | `/api/services/:id/status` | 获取单个服务状态 |
| GET | `/api/services/:id/health` | 执行健康检查 |
| POST | `/api/services/:id/start` | 启动服务 |
| POST | `/api/services/:id/stop` | 停止服务 |
| POST | `/api/services/:id/restart` | 重启服务 |
| POST | `/api/services/:id/reload` | Reload 服务（编译+重启） |
| POST | `/api/services/start-all` | 批量启动所有服务 |
| POST | `/api/services/stop-all` | 批量停止所有服务 |
| POST | `/api/services/restart-all` | 批量重启所有服务 |

---

## 8. 核心数据结构

### ServiceStatus 对象

```javascript
{
  serviceId: string,      // 服务 ID
  name: string,           // 服务名称
  phase: string,          // 状态: stopped|starting|checking_health|running|stopping|failed|restarting
  running: boolean,       // 是否运行中
  pid: number|null,       // 进程 ID
  error: string|null,     // 错误信息
  updatedAt: string       // ISO8601 最后更新时间
}
```

### Job 对象

```javascript
{
  jobId: string,          // 任务 ID: 'job_{uuid}'
  type: string,           // 类型: 'service.start'|'service.stop'|'service.restart'|...
  targetType: string,     // 目标类型: 'service'|'batch'
  targetId: string,       // 目标 ID
  status: string,         // 状态: 'pending'|'running'|'succeeded'|'failed'|'cancelled'
  stage: string,          // 阶段: 'prepare'|'start_new_process'|'health_check'|...
  progress: number,       // 进度: 0-100
  message: string,        // 描述消息
  metadata: object,       // 元数据
  result: object|null,    // 结果数据
  error: object|null,     // 错误对象 {code, message, details}
  createdAt: string,      // ISO8601
  startedAt: string|null,
  finishedAt: string|null,
  parentJobId: string|null,
  subJobs: array[string]
}
```

### 前端模块信息（开发服务器）

```javascript
{
  id: string,         // 模块 ID
  name: string,       // 模块名称
  port: number,       // 开发服务器端口
}
```

---

## 9. 关键类/函数索引

| 类名/函数 | 文件 | 核心职责 |
|-----------|------|---------|
| `ProcessManager` | `processManager/index.js` | 进程管理主类 |
| `applyServiceLifecycle` | `processManager/serviceLifecycle.js` | 服务启停生命周期 mixin |
| `applyDevServer` | `processManager/devServer.js` | 开发服务器管理 mixin |
| `HealthChecker` | `healthChecker.js` | 健康检查 |
| `WebSocketService` | `websocketService.js` | WebSocket 广播 |
| `ServiceTaskService` | `serviceTaskService.js` | 服务任务编排 |
| `JobService` | `jobService.js` | 统一任务管理 + 分布式锁 |

---

## 总结

这是一个**事件驱动 + 实时推送**的架构：

1. **状态一致性**: PID 持久化到磁盘，重启后可恢复
2. **实时性**: WebSocket 推送状态变化，低延迟
3. **可用性**: WebSocket 断开自动降级为轮询
4. **容错性**: 自动清理僵尸进程，孤儿 PID 文件
5. **可观测性**: 全流程日志通过 WebSocket 实时推送到前端

整体设计保证了即使用户重启后端控制面板，之前启动的开发服务器和后端服务状态也能正确恢复。
