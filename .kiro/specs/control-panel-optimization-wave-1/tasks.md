# Control Panel 第一轮优化 Tasks

## 说明

- 本任务清单对应 `.kiro/specs/control-panel-optimization-wave-1/requirements.md`
- 默认按阶段推进，优先完成安全与可靠性最小闭环
- 每个任务完成后应同步更新实现文档、接口契约和任务状态
- 当前 spec 处于待实现阶段，所有任务默认从未完成开始

## Phase 1 - 安全闭环

- [ ] 1.1 为 `backend/controllers/logController.js` 的日志下载接口补齐 `serviceId`、`date`、`level` 参数校验
- [ ] 1.2 将 `logController` 中剩余手工错误响应逐步统一到 `createAppError()` + `sendError()`
- [ ] 1.3 新增最小认证中间件，并支持通过环境变量配置固定 token
- [ ] 1.4 为服务控制、构建、日志清理、系统 reload、任务取消等敏感接口挂载认证中间件
- [ ] 1.5 新增轻量限流中间件，先覆盖系统命令、批量服务操作和日志清理
- [ ] 1.6 新增审计服务，记录敏感操作的来源、目标、结果与失败原因
- [ ] C1 Checkpoint - 验证非法日志下载参数、缺失 token、错误 token、限流命中场景均返回统一结构化错误响应

## Phase 2 - 可靠性与关闭收敛

- [ ] 2.1 在 `backend/services/websocketService.js` 中保存全局心跳检查定时器引用
- [ ] 2.2 为 `websocketService` 增加 `shutdown()` / `dispose()` 能力，并在优雅关闭时显式清理全局定时器
- [ ] 2.3 检查并补齐客户端级别 heartbeat timer 的生命周期收敛，保持现有行为但让清理更显式
- [ ] 2.4 在 `backend/services/cacheService.js` 的 memory TTL timer 创建处增加 `.unref()`
- [ ] 2.5 补齐 `cacheService.disconnect()` 与关闭链路中的 timer 清理兜底
- [ ] C2 Checkpoint - 验证有活动 WebSocket 客户端和 memory cache timer 时，服务仍可优雅退出

## Phase 3 - 热路径性能第一阶段治理

- [ ] 3.1 为 `backend/server.js` 中的 `checkFrontendBuilt()` 增加短 TTL 缓存，减少 fallback 请求中的同步文件检查
- [ ] 3.2 保持当前“前端未构建时返回友好页面”的行为不变
- [ ] 3.3 识别 `backend/utils/logger.js` 中 error/warn 同步写盘路径，抽出缓冲与 flush 逻辑
- [ ] 3.4 将 error/warn 日志从逐条 `appendFileSync` 改为异步批量 flush
- [ ] 3.5 在日志关闭流程中补齐缓冲刷盘，避免退出前丢失关键日志
- [ ] C3 Checkpoint - 验证 fallback 热路径 I/O 降低且高频构建日志场景不再逐行同步写盘

## Phase 4 - 测试与回归基线

- [ ] 4.1 为 `healthChecker._classifyFailure()` 补第一批分支测试，覆盖超时、连接失败、404、401、5xx 等分类
- [ ] 4.2 为 `jobService` 的缓存写入分支补第一批测试，优先覆盖状态推进、失败写入和历史记录收敛
- [ ] 4.3 为 `cacheService` memory TTL timer 行为补最小验证，确认 `unref()` 不影响正常过期逻辑
- [ ] 4.4 为日志下载参数校验、认证和限流补最小接口级验证
- [ ] 4.5 更新 `README.md`、`docs/` 与 spec 文档，确保安全和运行约束与实现一致

## Validation

- [ ] V1 验证非法日志下载参数均被拒绝，且无路径穿越空间
- [ ] V2 验证敏感接口在未配置 token、错误 token、正确 token 三种场景下行为符合预期
- [ ] V3 验证系统 reload、批量服务操作和日志清理限流生效且返回统一错误语义
- [ ] V4 验证 WebSocket 全局心跳定时器和 memory TTL timer 不再阻塞优雅关闭
- [ ] V5 验证高频 Maven 构建日志场景下不再逐行同步写盘，同时主日志、错误日志和 WebSocket 推送仍正常
