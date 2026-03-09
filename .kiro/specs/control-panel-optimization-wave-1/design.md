# Control Panel 第一轮优化 Design

## Spec Metadata

- 类型：Feature Spec
- Workflow：Design-First
- 关联需求：`.kiro/specs/control-panel-optimization-wave-1/requirements.md`

## 1. 设计目标

本轮设计聚焦“先把明显风险和热路径问题收敛掉”，不追求一次性大重构。

设计原则：

- 最小侵入：优先在现有 `routes -> controllers -> services` 分层内补齐能力
- 安全优先：先修路径遍历、认证、限流、审计
- 可靠性优先：先修优雅关闭与 timer 生命周期问题
- 热路径优先：先消除最明显的同步 I/O 热点
- 兼容优先：不改变当前主要 API 形状和 WebSocket 事件名

## 2. 当前代码映射

本轮改动将主要涉及：

- `backend/controllers/logController.js`
- `backend/routes/logs.js`
- `backend/server.js`
- `backend/services/websocketService.js`
- `backend/services/cacheService.js`
- `backend/utils/logger.js`
- 可能新增：
  - `backend/middleware/auth.js`
  - `backend/middleware/rateLimit.js`
  - `backend/services/auditService.js`
  - `backend/utils/requestIdentity.js`

## 3. 范围拆分

### 3.1 安全层

目标：

- 为日志下载接口增加参数校验
- 为敏感接口增加最小认证
- 为敏感接口增加限流
- 为敏感接口增加审计记录

边界：

- 不引入账号体系
- 不引入数据库用户表
- 采用环境变量或配置驱动的最小认证方式

### 3.2 可靠性层

目标：

- WebSocket 全局心跳检查定时器可显式清理
- memory TTL timer 不阻塞进程退出
- 优雅关闭时显式释放相关资源

边界：

- 不重写 WebSocket 协议
- 不改变现有客户端消息结构

### 3.3 热路径性能层

目标：

- 缓存前端构建状态检查结果
- 处理高频日志同步写盘热点

边界：

- 第一阶段只做高收益低侵入优化
- 不在本轮中完成完整日志平台重构
- 不在本轮中完成 `processManager` 全拆分

## 4. 方案设计

### 4.1 日志下载参数校验

在 `logController.downloadServiceLogs()` 增加显式参数验证：

- `serviceId`：使用白名单正则，仅允许字母、数字、横线
- `date`：使用 `YYYY-MM-DD` 正则
- `level`：限制为 `error` / `warn`

错误处理：

- 校验失败统一走 `createAppError()` + `sendError()`
- 不再直接使用原始参数拼接路径后尝试访问文件

### 4.2 敏感接口最小认证

新增轻量中间件：

- 通过请求头读取 token，例如 `x-ms-panel-token`
- 通过环境变量配置服务端期望值，例如 `MS_PANEL_TOKEN`
- 若未配置 token，则允许开发模式保留兼容策略，但需在文档中明确

建议优先保护的接口：

- `POST /api/services/start-all`
- `POST /api/services/stop-all`
- `POST /api/services/restart-all`
- `POST /api/services/:id/start`
- `POST /api/services/:id/stop`
- `POST /api/services/:id/restart`
- `POST /api/services/:id/reload`
- `POST /api/services/system/reload`
- `POST /api/build/frontend`
- `POST /api/build/frontend/batch`
- `POST /api/logs/clean`
- `POST /api/jobs/:jobId/cancel`

### 4.3 限流与审计

限流设计：

- 先采用进程内或现有 `cacheService` 支撑的轻量实现
- 基于“来源标识 + 路由操作”构建限流键
- 对系统命令、批量操作、日志清理设置更严格阈值

来源标识建议：

- 优先读取 `x-forwarded-for`
- 回退到 socket remote address
- 本地开发可兼容为 `local`

审计设计：

- 新增 `auditService` 统一写入结构化审计日志
- 审计字段至少包含：
  - action
  - target
  - actor / source
  - result
  - reason / error
  - timestamp

第一阶段审计可先落到现有日志体系，不引入独立存储。

### 4.4 `checkFrontendBuilt()` 缓存化

新增一个内存缓存对象，例如：

```js
{
  built: true,
  reason: null,
  checkedAt: 0
}
```

策略：

- 启动时初始化一次
- fallback 请求中优先复用缓存
- 超过固定 TTL（如 3~5 秒）后再重新检测
- 后续如需要，可增加主动刷新入口

这样可以保留“前端未构建时给出友好页面”的当前行为，同时减少重复同步文件探测。

### 4.5 WebSocket 全局心跳定时器生命周期

当前问题：

- 全局 `_checkHeartbeats()` 定时器没有引用
- 关闭时无法显式清理

改造方案：

- 在 `websocketService` 实例上保存 `heartbeatCheckTimer`
- `init()` 时若已存在旧 timer，先清理再重建
- 新增 `shutdown()` 或 `dispose()` 方法
- 在 `server.js` 优雅关闭流程中调用该方法

这样可以避免：

- 优雅关闭时仍保留全局 interval
- `server.close()` 回调无法及时收敛

### 4.6 `cacheService` TTL timer `unref()`

当前问题：

- memory 模式通过 `setTimeout` 管理 TTL
- timer 未 `unref()`，可能阻止进程退出

改造方案：

- 在 `_setMemoryValue()` 中创建 timer 后，若存在 `unref` 方法则调用 `timer.unref()`
- 继续保留显式 `clearTimeout()` 清理逻辑
- `disconnect()` 中继续清理所有 memory timers

这能同时满足：

- 正常 TTL 过期逻辑不变
- 关闭流程异常时，不因 timer 残留拖住进程

### 4.7 高频日志同步写盘第一阶段治理

当前问题：

- `logger.broadcast()` 仍可能为 error/warn 文件执行同步写盘
- Maven 构建高频输出时会放大该成本

第一阶段设计：

- 保持主日志 `WriteStream` 逻辑不变
- error/warn 日志从 `appendFileSync` 切为按文件缓冲后异步 flush
- flush 可基于：
  - 字符数阈值
  - 定时批量写入
  - 关闭时强制刷盘

边界：

- 不改变前端日志推送协议
- 不引入 worker thread
- 不引入外部日志中间件

## 5. 风险与兼容性

### 5.1 认证引入的兼容性风险

风险：

- 现有本地调用若未带 token，可能直接失败

缓解：

- 在未配置 `MS_PANEL_TOKEN` 时保留兼容行为
- 文档中明确生产/共享环境必须开启 token

### 5.2 异步日志写盘的可靠性风险

风险：

- 进程退出前缓冲未 flush 可能导致日志丢失

缓解：

- 在 `logger.closeStreams()` 中增加 flush
- 控制缓冲区大小和 flush 周期
- 对关键异常日志优先即时落盘或确保关闭时刷盘

### 5.3 定时器治理引入的回归风险

风险：

- 错误清理 timer 可能影响现有心跳和 TTL 过期行为

缓解：

- 保留现有对外行为
- 仅补生命周期管理
- 优先做脚本级验证和手工回归

## 6. 验证策略

### 6.1 安全验证

- 非法 `serviceId`、`date`、`level` 请求被拒绝
- 敏感接口未带 token 时被拒绝
- 正确 token 时现有敏感操作仍可执行
- 限流命中时返回预期错误语义

### 6.2 可靠性验证

- 优雅关闭时 `websocketService` 全局心跳 timer 被清理
- memory TTL timer 存在时，进程仍可正常退出
- 客户端连接断开后心跳和客户端状态正常收敛

### 6.3 性能验证

- fallback 请求不再每次触发全量同步前端构建检查
- 构建高频日志场景下不再逐行同步写盘
- WebSocket 日志广播与主日志落盘行为保持可用

## 7. 里程碑建议

- 先完成安全和关闭可靠性闭环
- 再处理 `checkFrontendBuilt()` 与日志写盘热路径
- 最后补验证与文档同步
