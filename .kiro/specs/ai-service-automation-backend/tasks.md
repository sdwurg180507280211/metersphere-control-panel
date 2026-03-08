# AI 自动化服务控制后端 Tasks

## 说明

- 本任务清单对应 `.kiro/specs/ai-service-automation-backend/requirements.md`
- 默认按阶段推进，优先完成最小可用闭环
- 每个任务完成后应同步更新实现文档、接口契约和任务状态
- 当前 spec 已进入部分实现阶段；已落地的任务会真实标记完成，未完成的 Checkpoint / Validation 继续保留为待执行状态

## Phase 1 - 打通统一任务中心与 reload 闭环

- [x] 1.1 新增 `backend/services/jobService.js`，实现任务创建、状态推进、完成、失败、活动任务、历史记录与 Redis 持久化能力
- [x] 1.2 在 `jobService` 中实现资源锁获取、释放、续期与锁持有者校验，覆盖 `service`、`module`、`batch` 三类资源键
- [x] 1.3 在控制面板启动流程中接入任务恢复扫描，完成活动任务重载、孤儿锁清理和恢复结果广播
- [x] 1.4 新增 `backend/routes/jobs.js` 与 `backend/controllers/jobController.js`，提供 `GET /api/jobs/:jobId`、`GET /api/jobs/active`、`GET /api/jobs/history/recent` 查询能力
- [x] 1.5 为 `backend/services/websocketService.js` 增加 `job:progress`、`job:completed`、`job:failed` 广播 helper，并由 `jobService` 统一调用
- [x] 1.6 新增 `backend/services/serviceTaskService.js`，封装服务类任务编排入口与阶段推进逻辑
- [x] 1.7 在 `backend/routes/services.js` 与 `backend/controllers/serviceController.js` 中新增 `POST /api/services/:id/reload`，返回 `202 + jobId`
- [x] 1.8 在 `backend/services/processManager.js` 中新增 `compileService()`、统一命令执行 helper，以及 `mvnw` / `npm` 绝对路径解析逻辑
- [x] 1.9 将 `reload` 串联为“编译 -> 停止 -> 启动 -> 健康检查”的完整流程，并补齐阶段进度、超时和结构化错误信息
- [x] 1.10 为 `reload` 引入单次补偿启动逻辑，确保失败后服务状态、任务状态和锁状态都能正确收敛
- [ ] C1 Checkpoint - 验证 `jobService`、`jobs` 查询接口与 `reload` 最小闭环可以在未引入旧能力迁移前独立工作

## Phase 2 - 迁移现有服务控制与构建能力

- [x] 2.1 将 `start`、`stop`、`restart` 从 controller 直接调用 `processManager` 迁移为通过 `serviceTaskService` 编排执行
- [x] 2.2 为服务控制接口统一 `202` 响应和结构化错误码，替换现有混杂的同步返回语义
- [x] 2.3 改造 `backend/controllers/buildController.js`，在保留 `buildId` 的同时返回统一 `jobId`
- [x] 2.4 改造 `backend/services/buildProgressService.js`，为构建进度和历史记录增加 `jobId` 关联，并同步更新 `jobService`
- [x] 2.5 为前端构建引入模块级锁与关联服务冲突治理，避免构建与服务操作并发导致状态漂移
- [x] 2.6 补齐 `GET /api/jobs/active`、`GET /api/jobs/history/recent` 的前端可用响应结构，便于 UI 与 AI agent 共用查询语义
- [ ] C2 Checkpoint - 验证服务控制与前端构建已纳入统一任务模型，兼容字段与兼容事件仍可被现有调用方使用

## Phase 3 - 完善运维基线与兼容收敛

- [x] 3.1 在 `jobService` 中补齐 Redis 不可用、短暂抖动、写入重试与恢复后补写策略
- [x] 3.2 统一健康检查规则、阶段超时、总超时和可重试 / 不可重试错误分类
- [x] 3.3 实现标准错误码体系与统一错误响应格式，覆盖 400/404/409/429/503/500 场景
- [x] 3.4 实现 Redis 限流键与 `Retry-After` 响应，确保仅真正运行的任务计入限流窗口
- [x] 3.5 为批量服务操作落地父子任务模型、顺序执行策略和 `all_succeeded` / `partial_failed` / `all_failed` 汇总态
- [x] 3.6 逐步收敛旧 `build:*` / `service:status` 与兼容字段依赖，明确迁移完成前后的对外契约
- [ ] C3 Checkpoint - 验证 Redis、锁、限流、恢复扫描、补偿启动与统一错误语义已经形成可上线的最小生产基线

## Validation

- [ ] V1 为 `reload`、`restart`、`build` 的任务创建、查询与完成流程补充最小验证方案
- [ ] V2 验证 `mvnw` / `npm` 绝对路径执行、`cwd` 传递与 `ENOENT` 回归场景
- [x] V3 验证服务锁、模块锁、限流与 Redis 不可用时的拒绝行为
- [x] V4 验证补偿启动、恢复扫描、孤儿锁清理和 WebSocket 终态广播
- [ ] V5 更新相关文档，确保 `README.md`、`docs/` 与最终实现契约保持一致
