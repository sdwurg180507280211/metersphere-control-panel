# 看板娘互动增强 Tasks

## 说明

- 本任务清单对应 `.kiro/specs/waifu-interaction-enhancement/requirements.md`
- Phase 1（轻度增强）已完成，Phase 2（最强互动）待实现
- 来源文档 `docs/waifu-interaction-enhancement.md` 中的重度增强组合（A+B+C+D）

## ── Phase 1 已完成 ──

### 后端 AI 聊天代理 ✅

- [x] 1.1 新建 `backend/controllers/chatController.js` - _R5_
- [x] 1.2 新建 `backend/routes/chat.js` - _R5_
- [x] 1.3 修改 `backend/server.js` 注册 chat 路由 - _R5_
- [x] 1.4 修改 `backend/config.js` 添加 waifu 配置 - _R5_
- [x] 1.5 更新 `~/.metersphere-control-panel/config.json` - _R5_
- [x] C1 Checkpoint - 验证后端 API 通信

### 前端聊天 UI ✅

- [x] 2.1 添加 chat 工具图标（内联 SVG） - _R6_
- [x] 2.2 实现聊天模式切换（innerHTML 劫持 + MutationObserver） - _R6_
- [x] 2.3 实现消息发送与渲染 - _R6_
- [x] 2.4 实现聊天 UI 样式（深色主题） - _R6_
- [x] C2 Checkpoint - 验证聊天 UI 功能

### 模型控制与互动增强 ✅

- [x] 3.1 实现模型实例捕获（Monkey-patch） - _R1_
- [x] 3.2 实现参数覆盖钩子（Post-Update Override） - _R1_
- [x] 3.3 实现视线跟随鼠标（lerp 平滑） - _R2_
- [x] 3.4 实现点击弹跳（CSS 动画 + 表情） - _R3_
- [x] 3.5 实现说话动画（正弦波 ParamMouthOpenY） - _R4_
- [x] 3.6 暴露全局控制器 `window.__waifuModelCtrl` - _R1, R4_
- [x] C3 Checkpoint - 验证互动增强功能

### CSS 样式与位置调整 ✅

- [x] 4.1 看板娘位置移到右下角 - _R7_
- [x] 4.2 弹跳动画 CSS - _R3_
- [x] 4.3 聊天模式 CSS - _R6_
- [x] 4.4 气泡深色主题 - _R6, R7_

### 文档 ✅

- [x] 5.1 编写 `docs/waifu-live2d-model-control.md` - _R1_
- [x] 5.2 编写 `docs/waifu-interaction-enhancement.md` - _R2, R3_
- [x] 5.3 编写 `docs/waifu-chat-design.md` - _R5, R6_

## ── Phase 2 已完成（最强互动模式）──

### 6. 情绪表情系统

- [x] 6.1 在 modelCtrl 中定义 EMOTIONS 预设表情字典
  - 开心、惊讶、害羞、担心、生气 5 种表情
  - 每种表情为一组参数覆盖值
  - _Requirements: R12_

- [x] 6.2 实现 `modelCtrl.showEmotion(name, durationMs)`
  - 记录目标表情参数和结束时间
  - 在 animate 循环中 lerp 过渡到目标表情
  - 到时间后 lerp 回默认值
  - _Requirements: R12_

- [x] 6.3 实现情绪参数优先级机制
  - 情绪表情参数 > 视线跟随同名参数
  - 在视线跟随 animate 循环中最后写入情绪参数
  - _Requirements: R12_

- [x] C4 Checkpoint - 验证情绪表情
  - 确认 5 种表情显示正确
  - 确认平滑过渡不跳变
  - 确认表情结束后恢复

### 7. 自由漫游模式

- [x] 7.1 创建 roamManager 状态机
  - 状态：idle | roaming | returning
  - 空闲计时器（30 秒）
  - _Requirements: R8_

- [x] 7.2 实现用户活动监听与空闲检测
  - 监听 mousemove, mousedown, keydown, scroll
  - 用户操作时重置空闲计时器
  - _Requirements: R8_

- [x] 7.3 实现漫游目标选取
  - 在屏幕底部 20% 区域内随机选点
  - 边界安全检查（margin 100px）
  - _Requirements: R8_

- [x] 7.4 实现伪走路动画
  - CSS `left` 驱动水平位移（100px/秒）
  - `margin-bottom` 正弦波驱动 Y 轴弹跳
  - ParamBodyAngleX 驱动身体摆动
  - _Requirements: R8_

- [x] 7.5 实现方向翻转
  - 根据移动方向设置 `scaleX(-1)` 或 `scaleX(1)`
  - _Requirements: R8_

- [x] 7.6 实现到达目标后休息逻辑
  - 到达后等待 2~5 秒随机时长
  - 然后选取新目标继续漫游
  - _Requirements: R8_

- [x] 7.7 实现平滑回归 Home 位置
  - 用户操作时立即停止漫游
  - 平滑过渡回到右下角（0.8s ease-in-out）
  - 清除翻转和位移变换
  - _Requirements: R8_

- [x] 7.8 实现漫游与其他状态的互斥
  - 聊天模式激活时暂停漫游
  - 拖拽时暂停漫游
  - 勿扰模式开启时不启动漫游
  - _Requirements: R8_

- [x] C5 Checkpoint - 验证漫游功能
  - 确认 30 秒后启动漫游
  - 确认只在底部区域移动
  - 确认走路有弹跳 + 身体摆动
  - 确认方向翻转正确
  - 确认用户操作时立即回归
  - _Requirements: R8_

- [ ] 7.6 实现到达目标后休息逻辑
  - 到达后等待 2~5 秒随机时长
  - 然后选取新目标继续漫游
  - _Requirements: R8_

- [ ] 7.7 实现平滑回归 Home 位置
  - 用户操作时立即停止漫游
  - 平滑过渡回到右下角（0.8s ease-in-out）
  - 清除翻转和位移变换
  - _Requirements: R8_

- [ ] 7.8 实现漫游与其他状态的互斥
  - 聊天模式激活时暂停漫游
  - 拖拽时暂停漫游
  - 勿扰模式开启时不启动漫游
  - _Requirements: R8_

- [ ] C5 Checkpoint - 验证漫游功能
  - 确认 30 秒后启动漫游
  - 确认只在底部区域移动
  - 确认走路有弹跳 + 身体摆动
  - 确认方向翻转正确
  - 确认用户操作时立即回归

### 8. 拖拽功能

- [x] 8.1 创建 dragManager 拖拽控制器
  - 状态：idle | longpress | dragging
  - 长按检测（150ms）
  - _Requirements: R9_

- [x] 8.2 实现长按检测逻辑
  - mousedown 启动 150ms 计时器
  - 计时器到期进入拖拽模式
  - 快速点击（<150ms）走弹跳逻辑
  - _Requirements: R9_

- [x] 8.3 实现拖拽跟随
  - mousemove 时实时更新看板娘位置
  - 通过 `transform: translate()` 实现
  - _Requirements: R9_

- [x] 8.4 实现拖拽时状态变更
  - 暂停视线跟随（gazeEnabled = false）
  - 触发惊讶表情
  - 鼠标样式变为 grabbing
  - _Requirements: R9_

- [x] 8.5 实现停留在拖拽位置
  - mouseup 时结束拖拽
  - 停留在当前位置（不回归）
  - 恢复视线跟随和正常表情
  - _Requirements: R9_

- [x] C6 Checkpoint - 验证拖拽功能
  - 确认快速点击触发弹跳
  - 确认长按进入拖拽
  - 确认拖拽中跟随鼠标 + 惊讶表情
  - 确认释放后停留在新位置

### 9. 智能出现模式

- [x] 9.1 创建 smartAppearance 智能出现管理器
  - 冷却时间管理（cooldowns Map）
  - 冷却间隔 30 秒
  - _Requirements: R10_

- [x] 9.2 实现 canTrigger 检查
  - 勿扰模式开启时返回 false
  - 聊天模式激活时返回 false
  - 同类事件冷却中返回 false
  - _Requirements: R10_

- [x] 9.3 实现 trigger 方法
  - 显示消息（通过 showMessage）
  - 触发对应情绪表情
  - 记录冷却时间
  - _Requirements: R10_

- [x] 9.4 实现空闲陪伴提示
  - 60 秒无操作触发
  - 随机选取陪伴消息
  - 触发害羞表情
  - _Requirements: R10_

- [ ] 9.5 实现 WebSocket 事件监听
  - 监听 `ws:service-status` 自定义事件
  - 服务启动成功 → 开心表情 + 提示
  - 服务启动失败 → 担心表情 + 提示
  - _Requirements: R10, R13_

- [ ] 9.6 实现构建完成事件监听
  - 监听 `ws:build-complete` 自定义事件
  - 构建成功 → 开心表情 + 提示
  - 构建失败 → 担心表情 + 提示
  - _Requirements: R10, R13_

- [ ] 9.7 在 WebSocket 消息处理中添加事件分发
  - 修改前端 WebSocket onmessage 处理
  - 分发 `ws:service-status` 和 `ws:build-complete` 事件
  - _Requirements: R13_

- [x] C7 Checkpoint - 验证智能出现（部分）
  - 确认 60 秒后陪伴提示
  - 确认聊天中不弹出提示
  - 确认冷却时间生效
  - 待测试：服务状态和构建完成通知

### 10. 勿扰模式

- [x] 10.1 创建 dndToggle 勿扰模式控制器
  - 状态：enabled (boolean)
  - localStorage 持久化
  - _Requirements: R11_

- [x] 10.2 实现勿扰模式图标
  - 月亮 SVG 图标
  - 插入到工具栏（quit 之前）
  - 点击切换状态
  - _Requirements: R11_

- [x] 10.3 实现状态持久化
  - 从 localStorage 读取初始状态
  - 状态变更时写入 localStorage
  - 页面刷新后恢复状态
  - _Requirements: R11_

- [x] 10.4 实现勿扰模式效果
  - 开启时停止漫游并回归 Home
  - 开启时禁止智能提示触发
  - 保留视线跟随、点击弹跳、聊天功能
  - _Requirements: R11_

- [x] 10.5 实现图标激活状态样式
  - 开启时图标高亮（月亮黄色）
  - tooltip 文字变更
  - _Requirements: R11_

- [x] C8 Checkpoint - 验证勿扰模式
  - 确认点击图标切换状态
  - 确认开启时漫游和智能提示停止
  - 确认刷新页面后状态保持
  - 确认关闭后功能恢复

### 11. 性能优化与主循环合并

- [ ] 11.1 合并多个 requestAnimationFrame 循环
  - 视线跟随、漫游、情绪过渡合并为单一主循环
  - 在同一帧内依次执行各模块 update
  - _Requirements: 性能优化_

- [ ] 11.2 优化参数覆盖应用逻辑
  - 减少重复的 indexOf 查找
  - 缓存参数索引
  - _Requirements: 性能优化_

### 12. CSS 样式补充

- [x] 12.1 添加漫游走路弹跳动画
  - 通过 margin-bottom 正弦波实现
  - 无需额外 @keyframes
  - _Requirements: R8_

- [x] 12.2 添加拖拽光标样式
  - `.waifu-dragging` class
  - cursor: grabbing
  - _Requirements: R9_

- [x] 12.3 添加勿扰图标样式
  - 月亮 SVG 样式
  - `.waifu-dnd-active` 激活状态
  - _Requirements: R11_

- [x] 12.4 添加漫游回归过渡样式
  - 通过 style.transition 动态设置
  - transition: left 0.8s ease-in-out
  - _Requirements: R8_

## Validation

### Phase 1 验证 ✅

- [x] V1 验证模型捕获成功
- [x] V2 验证视线跟随
- [x] V3 验证点击弹跳
- [x] V4 验证说话动画
- [x] V5 验证聊天 UI
- [x] V6 验证兼容性

### Phase 2 验证

- [x] V7 验证情绪表情系统：5 种表情显示正确，平滑过渡
- [x] V8 验证自由漫游：30 秒启动，底部区域移动，走路弹跳，方向翻转，用户操作回归
- [x] V9 验证拖拽功能：长按拖拽，快速点击弹跳，停留在拖拽位置
- [x] V10 验证智能出现：空闲提示，冷却时间（WebSocket事件待测试）
- [x] V11 验证勿扰模式：一键切换，状态持久化，功能正确禁用/恢复
- [x] V12 验证状态互斥：聊天 > 拖拽 > 漫游优先级正确
- [ ] V13 验证性能：主循环合并后 CPU 占用正常，60fps 流畅
