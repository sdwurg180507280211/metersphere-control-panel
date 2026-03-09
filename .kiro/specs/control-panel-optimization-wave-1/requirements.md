# Control Panel 第一轮优化 Requirements

## Spec Metadata

- 类型：Feature Spec
- Workflow：Design-First
- 来源文档：
  - `docs/control-panel-optimization-assessment-2026-03-09.md`
  - `docs/control-panel-optimization-roadmap.md`

## 背景

当前 `metersphere-control-panel` 已具备服务控制、前端构建、实时日志与状态同步能力，但近期评估显示第一轮优化应优先收敛以下问题：

- 日志下载接口缺少严格参数校验，存在路径遍历风险
- 敏感接口缺少最小可用认证、限流与审计
- 前端 fallback 检查在热路径中重复触发同步文件 I/O
- WebSocket 全局心跳检查定时器缺少显式生命周期管理
- `cacheService` 在 memory 模式下的 TTL timer 未 `unref()`，可能影响优雅退出
- 高日志吞吐场景下仍存在同步落盘热点

本 spec 聚焦第一轮“安全 + 可靠性 + 热路径性能”优化，不把 Kafka、全面架构重写或大规模基础设施演进纳入当前范围。

## 范围

本轮优化包含：

- 日志下载接口参数校验与安全边界收敛
- 敏感接口的最小认证、限流和审计能力
- `checkFrontendBuilt()` 的结果缓存化
- WebSocket 全局心跳检查定时器的可清理化
- `cacheService` memory TTL timer 的 `unref()` 与关闭兜底
- `logger` 高频同步写盘问题的第一阶段治理

本轮优化不包含：

- Kafka 引入
- 全量事件总线重构
- `processManager` 的完整拆分
- 前端路由改造
- SSE 通道移除

## 关键术语

- **敏感接口**：可改变服务、构建、日志或系统状态的写操作接口，例如批量启停、日志清理、系统 reload 等。
- **最小认证**：不引入复杂账号体系前提下的基础访问控制，如固定 token / header token 校验。
- **审计记录**：对敏感操作的请求来源、目标资源、结果和失败原因做结构化记录。
- **热路径**：会被高频调用、且对事件循环阻塞敏感的运行路径，例如日志写入、前端 fallback 检查和状态广播。

## Requirements

### R1. 日志下载安全边界

- WHEN 客户端请求下载服务日志
  THE SYSTEM SHALL 校验 `serviceId` 仅包含允许字符集，拒绝包含路径穿越或目录分隔符的输入。
- WHEN 客户端请求下载服务日志
  THE SYSTEM SHALL 校验 `date` 符合 `YYYY-MM-DD` 格式。
- WHEN 客户端请求下载服务日志
  THE SYSTEM SHALL 校验 `level` 仅允许受支持的日志级别枚举值。
- WHEN 任一日志下载参数非法
  THE SYSTEM SHALL 返回结构化错误响应，而不是直接拼接路径后访问文件系统。

### R2. 敏感接口最小认证

- WHEN 客户端调用敏感接口
  THE SYSTEM SHALL 校验预配置的认证凭据后才允许继续执行。
- WHEN 请求缺少认证凭据或认证失败
  THE SYSTEM SHALL 返回统一的未授权错误响应。
- WHEN 客户端调用非敏感只读接口
  THE SYSTEM SHALL CONTINUE TO 维持当前免认证读取行为，除非后续单独调整访问策略。

### R3. 敏感接口限流与审计

- WHEN 客户端连续调用敏感接口
  THE SYSTEM SHALL 对同一来源或同类敏感操作执行最小限流控制，避免误操作或恶意重复触发。
- WHEN 敏感操作被接收、拒绝、执行成功或执行失败
  THE SYSTEM SHALL 记录结构化审计信息。
- WHEN 限流触发
  THE SYSTEM SHALL 返回统一错误码，并在可能时附带重试提示信息。

### R4. 前端 fallback 检查缓存化

- WHEN 请求命中前端 fallback 路由
  THE SYSTEM SHALL 使用缓存化的前端构建状态，而不是每次请求都重复做同步文件检查。
- WHEN 前端构建状态过期或被显式刷新
  THE SYSTEM SHALL 重新评估构建产物状态。
- WHEN 前端未构建
  THE SYSTEM SHALL CONTINUE TO 返回当前友好的提示页面。

### R5. WebSocket 全局心跳生命周期

- WHEN WebSocket 服务初始化全局心跳检查
  THE SYSTEM SHALL 保存全局心跳定时器引用。
- WHEN 服务进入优雅关闭流程
  THE SYSTEM SHALL 显式清理全局心跳检查定时器。
- WHEN 客户端连接关闭
  THE SYSTEM SHALL CONTINUE TO 正确移除客户端状态，不引入额外全局定时器残留。

### R6. Memory TTL timer 不阻塞退出

- WHEN `cacheService` 在 memory 模式下为 key 创建 TTL timer
  THE SYSTEM SHALL 让该 timer 不阻止 Node.js 进程退出。
- WHEN 服务进入关闭流程
  THE SYSTEM SHALL CONTINUE TO 保留显式清理 memory timer 的逻辑。

### R7. 高频日志写盘第一阶段治理

- WHEN Maven 构建或其他高频输出链路持续产生日志
  THE SYSTEM SHALL 避免每条日志都触发一次同步磁盘写入。
- WHEN 日志链路完成第一阶段治理后
  THE SYSTEM SHALL CONTINUE TO 保持现有 WebSocket 日志推送、主日志落盘和错误/告警日志分类能力。
- WHEN 日志异步化实现失败或发生异常
  THE SYSTEM SHALL 保持日志可诊断性，不静默吞掉关键日志。

### R8. 兼容性要求

- WHEN 本轮优化落地后
  THE SYSTEM SHALL CONTINUE TO 保持现有服务控制、构建、日志浏览与 WebSocket 主通道行为不被破坏。
- WHEN 前端或旧调用方仍依赖当前响应结构
  THE SYSTEM SHALL CONTINUE TO 保持现有主要 API 形状和 WebSocket 事件名稳定。
