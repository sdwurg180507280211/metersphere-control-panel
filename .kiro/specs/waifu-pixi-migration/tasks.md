# 任务清单

## 任务

- [x] 0. 准备阶段
  - [x] 0.1 冻结 legacy 实现入口
    - 停止向 `frontend/index.html` 继续叠加新看板娘功能
    - 标记 legacy 逻辑边界和回退入口
    - _Requirements: 1.1, 1.4_

  - [x] 0.2 梳理 legacy 功能清单与职责映射
    - 列出 gaze、bounce、drag、emotion、chat、smart appearance、DND、WebSocket 等功能点
    - 形成旧职责到新模块的映射文档
    - _Requirements: 1.2, 17.4_

  - [x] 0.3 搭建 live2d 目录结构与 feature flag
    - 新建 `frontend/src/live2d/` 目录结构
    - 新建 `waifuFeatureFlags.js`
    - 增加 `engine = legacy | pixi` 开关
    - 将 legacy 启动逻辑从 `frontend/index.html` 抽离为模块化 bootstrap
    - 验证 `engine = legacy | pixi` 时只会启动一套引擎
    - _Requirements: 1.4, 1.6-1.8, 17.4, 15.5_

  - [x] 0.4 调研并确认 pixi-live2d-display 与当前项目依赖兼容矩阵
    - 已确认使用 `pixi-live2d-display/cubism4` 和 `pixi.js`
    - 已启用 `config.cubism4.supportMoreMaskDivisions = true` 支持复杂面具
    - _Requirements: 18.1, 19.1, 20.1, 21.1-21.4_

  - [x] 0.5 建立最小 PoC：在 React 页面中加载一个 Live2DModel
    - 使用 `Live2DModel.from(...)` 完成最小模型加载与渲染
    - 验证 StrictMode 下初始化与销毁是否稳定
    - _Requirements: 18.2, 20.1, 16.1-16.5, 21.2-21.5_

  - [x] 0.6 验证库内 motion / expression / hit test / focus 能力边界
    - `live2d-test.html` 测试页面已验证模型可加载并显示
    - 待验证：`tap()` / `hitTest()` 的命中语义与业务点击反馈编排边界
    - 待验证：motion / expression / ParamController overlay 的共存时序
    - _Requirements: 18.3, 20.2, 20.3, 20.4, 8.6_

  - [x] 0.7 Checkpoint - 前置验证完成
    - foundation spec 已完成，核心模块已实现
    - _Requirements: 20.1-20.6_

- [x] 1. 渲染底座
  - [x] 1.1 实现 `frontend/src/live2d/engine/Live2DStage.js`
    - 创建 Pixi Application
    - 管理 canvas 挂载、resize、destroy
    - _Requirements: 2.1, 2.3, 2.4, 16.1-16.3_

  - [x] 1.2 实现 `frontend/src/live2d/config/waifuModels.js`
    - 定义模型路径、默认缩放、位置
    - 当前支持：`rice`、`fuxuan`
    - _Requirements: 19.2, 19.4_

  - [x] 1.3 基于 `pixi-live2d-display` 封装 `Live2DModelLoader.js`
    - 使用库官方推荐入口封装模型加载过程
    - _Requirements: 2.2, 13.1, 18.2, 19.1, 19.4, 16.1-16.3_

  - [x] 1.4 实现 `frontend/src/live2d/engine/Live2DRenderer.js`
    - 将模型挂载到 stage
    - 设置 scale / position / visible / zIndex
    - _Requirements: 2.2, 2.3_

  - [x] 1.5 实现 `frontend/src/live2d/ui/Live2DCanvas.jsx`
    - 提供纯画布容器组件
    - _Requirements: 1.3, 2.1_

  - [x] 1.6 实现 `frontend/src/live2d/ui/WaifuRoot.jsx`
    - 组合 Live2DCanvas、Overlay、ChatPanel
    - 在 React 中挂载新引擎根组件
    - _Requirements: 1.3, 2.1, 14.4_

  - [x] 1.7 在 `frontend/src/App.jsx` 接入 `WaifuRoot`
    - 以全局浮层方式接入
    - 确保不遮挡主工作区关键交互
    - _Requirements: 14.1, 14.5_

  - [ ] 1.8 验证模型切换时旧实例彻底销毁
    - 检查 canvas、纹理、ticker、pointer 监听器是否清理
    - _Requirements: 2.4, 2.5, 13.1, 13.2_

  - [ ] 1.9 Checkpoint - 库能力验证完成
    - 确认模型加载、销毁、渲染挂载在 React 中稳定可用
    - _Requirements: 2.1-2.5, 20.1_

- [ ] 2. 参数控制核心
  - [ ] 2.1 实现 `frontend/src/live2d/utils/paramMap.js`
    - 提供标准参数名到模型参数名的映射能力
    - _Requirements: 19.2, 15.2_

  - [ ] 2.2 实现 `frontend/src/live2d/utils/lerp.js` 和 `clamp.js`
    - 提供参数平滑和数值约束工具
    - _Requirements: 3.3_

  - [ ] 2.3 实现 `frontend/src/live2d/controller/ParamController.js`
    - 支持多来源参数提交、优先级合并、插值更新
    - _Requirements: 3.1-3.9_

  - [ ] 2.4 实现 `frontend/src/live2d/controller/MotionController.js`
    - 封装 motion / expression 播放
    - _Requirements: 6.2-6.4, 18.3_

  - [ ] 2.5 实现 `frontend/src/live2d/features/gaze/GazeSystem.js`
    - 实现视线跟随和回中缓动
    - _Requirements: 5.1, 3.1-3.3_

  - [ ] 2.6 实现 `frontend/src/live2d/features/lipSync/LipSyncSystem.js`
    - speaking 通过 ParamController 驱动嘴型参数
    - _Requirements: 8.1-8.6_

  - [ ] 2.7 实现 `frontend/src/live2d/features/emotion/EmotionSystem.js`
    - 建立 happy / surprise / worried 等情绪 preset
    - _Requirements: 6.1-6.5_

  - [ ] 2.8 实现 `frontend/src/live2d/controller/Live2DController.js` 增强
    - 添加 `setEmotion`、`startSpeaking`、`stopSpeaking`、`bounce` 等方法
    - _Requirements: 4.1-4.5_

  - [ ] 2.9 验证 motion 与 ParamController overlay 的冲突边界
    - _Requirements: 3.1-3.4, 3.9, 18.3, 20.2_

  - [ ] 2.10 建立模型能力声明与参数映射配置
    - 在 `waifuModels.js` 中声明 mouth/gaze/expression 等能力支持情况
    - _Requirements: 19.2, 19.3, 19.4_

  - [ ] 2.11 Checkpoint - 参数覆盖策略验证完成
    - _Requirements: 3.1-3.5, 8.6, 20.2_

- [ ] 3. 状态管理与聊天 UI
  - [ ] 3.1 实现 `frontend/src/live2d/store/useWaifuStore.js`
    - _Requirements: 12.1-12.5_

  - [ ] 3.2 实现 `frontend/src/live2d/services/waifuChatService.js`
    - _Requirements: 7.2-7.9, 15.3_

  - [ ] 3.3 实现 `frontend/src/live2d/ui/WaifuChatPanel.jsx`
    - _Requirements: 7.1-7.7_

  - [ ] 3.4 实现 `frontend/src/live2d/ui/WaifuToolbar.jsx`
    - _Requirements: 7.6, 10.4, 12.2_

  - [ ] 3.5 实现 `frontend/src/live2d/ui/WaifuOverlay.jsx`
    - _Requirements: 9.2-9.4, 11.1_

  - [ ] 3.6 打通聊天发送与 speaking 状态联动
    - _Requirements: 7.4, 8.1, 12.4_

  - [ ] 3.7 在 `WaifuRoot` 中接入 Store、Controller 和 UI 组件
    - _Requirements: 1.2, 4.3, 12.4_

  - [ ] 3.8 Checkpoint - 聊天 UI React 化完成
    - _Requirements: 7.1-7.7_

- [ ] 4. 交互增强
  - [ ] 4.1 实现 `frontend/src/live2d/controller/InteractionController.js`
    - _Requirements: 5.2-5.5, 18.3_

  - [ ] 4.2 实现 `frontend/src/live2d/features/physics/BounceSystem.js`
    - _Requirements: 5.2_

  - [ ] 4.3 实现拖拽能力与位置状态同步
    - _Requirements: 5.3, 12.4_

  - [ ] 4.4 实现 `frontend/src/live2d/features/appearance/SmartAppearanceSystem.js`
    - _Requirements: 9.1-9.5_

  - [ ] 4.5 实现 `frontend/src/live2d/features/dnd/DoNotDisturbSystem.js`
    - _Requirements: 10.1-10.5_

  - [ ] 4.6 基于库命中测试能力实现点击反馈
    - _Requirements: 5.2, 5.4, 18.3, 20.3_

  - [ ] 4.7 验证 focus / drag 与业务位置状态同步
    - _Requirements: 5.3, 5.5, 12.4, 20.3_

  - [ ] 4.8 Checkpoint - 交互能力验证完成
    - _Requirements: 5.1-5.5, 9.1-9.5, 10.1-10.5_

- [ ] 5. WebSocket 联动
  - [ ] 5.1 实现 `frontend/src/live2d/services/waifuSocketBridge.js`
    - _Requirements: 11.1-11.7_

  - [ ] 5.2 建立典型业务事件映射
    - _Requirements: 11.1, 11.4_

  - [ ] 5.3 打通 Store 与 Controller 的业务事件联动
    - _Requirements: 11.2, 11.5, 12.4_

  - [ ] 5.4 Checkpoint - WebSocket 联动完成
    - _Requirements: 11.1-11.5_

- [ ] 6. 清理和优化
  - [ ] 6.1 在 `frontend/package.json` 中固化经 PoC 验证的依赖版本
    - _Requirements: 18.1, 20.1_

  - [ ] 6.2 清理 `frontend/index.html` 中 legacy 看板娘初始化逻辑
    - _Requirements: 1.1, 1.5, 1.6-1.8, 15.5_

  - [ ] 6.3 删除全局控制器与 prototype patch 依赖
    - _Requirements: 3.5, 4.4_

  - [ ] 6.4 清理 MutationObserver 强保活等遗留 hack
    - _Requirements: 1.1, 17.4_

  - [ ] 6.5 增加单元测试和组件测试
    - _Requirements: 17.5, 19.5_

  - [ ] 6.6 增加集成测试和端到端测试
    - _Requirements: 14.1-14.5, 20.5_

  - [ ] 6.7 完成性能和内存泄漏验证
    - _Requirements: 13.5, 17.1-17.3_

  - [ ] 6.8 默认切换到 pixi 引擎
    - _Requirements: 1.4, 15.5_

  - [ ] 6.9 更新项目文档和迁移说明
    - _Requirements: 18.5, 20.4_

  - [ ] 6.10 Checkpoint - 迁移完成
    - _Requirements: 1.5, 14.1-14.5, 15.1-15.5, 20.5_

- [ ]* 7. 可选增强
  - [ ]* 7.1 支持音量驱动 lip-sync
    - _Requirements: 8.2_

  - [ ]* 7.2 支持模型资源预加载与缓存优化
    - _Requirements: 17.1_

  - [ ]* 7.3 增加更多情绪预设与组合动作
    - _Requirements: 6.1-6.5_

  - [ ]* 7.4 支持模型贴图/服装切换
    - _Requirements: 4.3_

  - [ ]* 7.5 增加调试面板
    - _Requirements: 17.5_

  - [ ]* 7.6 增加属性测试
    - _Requirements: 3.1-3.5, 13.1-13.5, 16.1-16.5_

  - [ ]* 7.7 接入更多业务事件映射模板
    - _Requirements: 11.4_
  - [ ] 1.1 实现 `frontend/src/live2d/engine/Live2DStage.js`
    - 创建 Pixi Application
    - 管理 canvas 挂载、resize、destroy
    - _Requirements: 2.1, 2.3, 2.4, 16.1-16.3_

  - [ ] 1.2 实现 `frontend/src/live2d/config/waifuModels.js`
    - 定义模型路径、默认缩放、位置、能力声明和参数映射
    - _Requirements: 19.2, 19.4_

  - [ ] 1.3 基于 `pixi-live2d-display` 封装 `Live2DModelLoader.js`
    - 使用库官方推荐入口封装模型加载过程
    - 抽取模型实例、元信息、销毁逻辑
    - 为快速切模 / StrictMode 双挂载增加 stale request 防护与过期结果清理
    - _Requirements: 2.2, 13.1, 18.2, 19.1, 19.4, 16.1-16.3_

  - [ ] 1.4 实现 `frontend/src/live2d/engine/Live2DRenderer.js`
    - 将模型挂载到 stage
    - 设置 scale / position / visible / zIndex
    - _Requirements: 2.2, 2.3_

  - [ ] 1.5 实现 `frontend/src/live2d/ui/Live2DCanvas.jsx`
    - 提供纯画布容器组件
    - 不写业务逻辑
    - _Requirements: 1.3, 2.1_

  - [ ] 1.6 实现 `frontend/src/live2d/ui/WaifuRoot.jsx`
    - 组合 Live2DCanvas、Overlay、ChatPanel
    - 在 React 中挂载新引擎根组件
    - _Requirements: 1.3, 2.1, 14.4_

  - [ ] 1.7 在 `frontend/src/App.jsx` 接入 `WaifuRoot`
    - 以全局浮层方式接入
    - 确保不遮挡主工作区关键交互
    - _Requirements: 14.1, 14.5_

  - [ ] 1.8 验证模型切换时旧实例彻底销毁
    - 检查 canvas、纹理、ticker、pointer 监听器是否清理
    - _Requirements: 2.4, 2.5, 13.1, 13.2_

  - [ ] 1.9 Checkpoint - 库能力验证完成
    - 确认模型加载、销毁、渲染挂载在 React 中稳定可用
    - _Requirements: 2.1-2.5, 20.1_

- [ ] 2. 参数控制核心
  - [ ] 2.1 实现 `frontend/src/live2d/utils/paramMap.js`
    - 提供标准参数名到模型参数名的映射能力
    - _Requirements: 19.2, 15.2_

  - [ ] 2.2 实现 `frontend/src/live2d/utils/lerp.js` 和 `clamp.js`
    - 提供参数平滑和数值约束工具
    - _Requirements: 3.3_

  - [ ] 2.3 实现 `frontend/src/live2d/controller/ParamController.js`
    - 支持多来源参数提交、优先级合并、插值更新
    - 输出参数冲突决策表和测试向量
    - 明确同优先级冲突采用 latest write wins
    - 明确 release(source) 后的回落规则
    - _Requirements: 3.1-3.9_

  - [ ] 2.4 实现 `frontend/src/live2d/controller/MotionController.js`
    - 封装 motion / expression 播放
    - _Requirements: 6.2-6.4, 18.3_

  - [ ] 2.5 实现 `frontend/src/live2d/features/gaze/GazeSystem.js`
    - 实现视线跟随和回中缓动
    - _Requirements: 5.1, 3.1-3.3_

  - [ ] 2.6 实现 `frontend/src/live2d/features/lipSync/LipSyncSystem.js`
    - speaking 通过 ParamController 驱动嘴型参数
    - 默认实现文字节奏模拟，音量驱动留作可选增强
    - speaking 结束后 release 对应 source，避免嘴型残留
    - _Requirements: 8.1-8.6_

  - [ ] 2.7 实现 `frontend/src/live2d/features/emotion/EmotionSystem.js`
    - 建立 happy / surprise / worried 等情绪 preset
    - _Requirements: 6.1-6.5_

  - [ ] 2.8 实现 `frontend/src/live2d/controller/Live2DController.js`
    - 串联 stage、loader、renderer、param、motion 和 feature systems
    - 提供统一业务 API
    - _Requirements: 4.1-4.5_

  - [ ] 2.9 验证 motion 与 ParamController overlay 的冲突边界
    - 在 speaking + emotion + gaze 同时生效时验证最终参数结果
    - 验证 motion / expression 更新后 overlay 仍按优先级稳定生效
    - 输出冲突处理规则
    - _Requirements: 3.1-3.4, 3.9, 18.3, 20.2_

  - [ ] 2.10 建立模型能力声明与参数映射配置
    - 在 waifuModels.js 中声明 mouth/gaze/expression 等能力支持情况
    - _Requirements: 19.2, 19.3, 19.4_

  - [ ] 2.11 Checkpoint - 参数覆盖策略验证完成
    - 确认不再 patch `Live2DCubismCore.Model.prototype.update`
    - 确认 gaze / speaking / emotion 可同时工作
    - 确认 lip-sync 由业务层 ParamController 驱动而非依赖库内部 API
    - _Requirements: 3.1-3.5, 8.6, 20.2_

- [ ] 3. 状态管理与聊天 UI
  - [ ] 3.1 实现 `frontend/src/live2d/store/useWaifuStore.js`
    - 定义状态和动作入口
    - 保证 store 不持有 Pixi/model 实例
    - _Requirements: 12.1-12.5_

  - [ ] 3.2 实现 `frontend/src/live2d/services/waifuChatService.js`
    - 封装 `/api/chat/message`
    - 统一错误处理
    - 负责将 UI 契约 `{ content }` 适配为后端契约 `{ message, sessionId }`
    - 负责将 `{ success, data.reply }` 归一化为 `{ reply }`
    - 将 sessionId 生命周期从 UI 中移出
    - _Requirements: 7.2-7.9, 15.3_

  - [ ] 3.3 实现 `frontend/src/live2d/ui/WaifuChatPanel.jsx`
    - 提供消息列表、输入框、loading、error、自动滚动
    - _Requirements: 7.1-7.7_

  - [ ] 3.4 实现 `frontend/src/live2d/ui/WaifuToolbar.jsx`
    - 提供聊天开关、显示隐藏、模型切换、DND 等操作
    - _Requirements: 7.6, 10.4, 12.2_

  - [ ] 3.5 实现 `frontend/src/live2d/ui/WaifuOverlay.jsx`
    - 提供提示气泡和状态展示
    - _Requirements: 9.2-9.4, 11.1_

  - [ ] 3.6 打通聊天发送与 speaking 状态联动
    - 收到回复时触发 startSpeaking / stopSpeaking
    - _Requirements: 7.4, 8.1, 12.4_

  - [ ] 3.7 在 `WaifuRoot` 中接入 Store、Controller 和 UI 组件
    - 保持 UI 和控制器解耦
    - _Requirements: 1.2, 4.3, 12.4_

  - [ ] 3.8 Checkpoint - 聊天 UI React 化完成
    - 确认聊天不再依赖 DOM 劫持
    - _Requirements: 7.1-7.7_

- [ ] 4. 交互增强
  - [ ] 4.1 实现 `frontend/src/live2d/controller/InteractionController.js`
    - 统一 pointer 事件、hit test 和拖拽控制
    - _Requirements: 5.2-5.5, 18.3_

  - [ ] 4.2 实现 `frontend/src/live2d/features/physics/BounceSystem.js`
    - 提供点击反馈效果
    - _Requirements: 5.2_

  - [ ] 4.3 实现拖拽能力与位置状态同步
    - 结束拖拽后回写 store.position
    - _Requirements: 5.3, 12.4_

  - [ ] 4.4 实现 `frontend/src/live2d/features/appearance/SmartAppearanceSystem.js`
    - 空闲显示/隐藏、提示节流
    - _Requirements: 9.1-9.5_

  - [ ] 4.5 实现 `frontend/src/live2d/features/dnd/DoNotDisturbSystem.js`
    - 统一控制自动提示和自动出现抑制逻辑
    - _Requirements: 10.1-10.5_

  - [ ] 4.6 基于库命中测试能力实现点击反馈
    - 优先调用库 hit test
    - 缺失时降级为 bounds 判断
    - _Requirements: 5.2, 5.4, 18.3, 20.3_

  - [ ] 4.7 验证 focus / drag 与业务位置状态同步
    - 确保拖拽结果正确回写 store，重新挂载后可恢复
    - _Requirements: 5.3, 5.5, 12.4, 20.3_

  - [ ] 4.8 Checkpoint - 交互能力验证完成
    - 确认点击、拖拽、聚焦效果符合预期
    - _Requirements: 5.1-5.5, 9.1-9.5, 10.1-10.5_

- [ ] 5. WebSocket 联动
  - [ ] 5.1 实现 `frontend/src/live2d/services/waifuSocketBridge.js`
    - 将 useWebSocket 事件翻译为看板娘动作事件
    - 复用主应用现有 `useWebSocket` 事件流，不建立第二条连接
    - 桥接层仅负责事件翻译与分发，不持有 socket 生命周期
    - _Requirements: 11.1-11.7_

  - [ ] 5.2 建立典型业务事件映射
    - 构建开始/成功/失败、服务启动/停止等
    - _Requirements: 11.1, 11.4_

  - [ ] 5.3 打通 Store 与 Controller 的业务事件联动
    - 通过 store action 驱动 emotion / speaking / overlay 提示
    - _Requirements: 11.2, 11.5, 12.4_

  - [ ] 5.4 Checkpoint - WebSocket 联动完成
    - 确认事件桥接不直接操作底层实例
    - _Requirements: 11.1-11.5_

- [ ] 6. 清理和优化
  - [ ] 6.1 在 `frontend/package.json` 中固化经 PoC 验证的依赖版本
    - 确保 PixiJS 与 `pixi-live2d-display` 版本兼容
    - _Requirements: 18.1, 20.1_

  - [ ] 6.2 清理 `frontend/index.html` 中 legacy 看板娘初始化逻辑
    - 删除内联脚本、DOM 劫持、CDN 初始化入口
    - 仅在 feature flag 回退验证通过后移除 legacy 内联启动脚本
    - _Requirements: 1.1, 1.5, 1.6-1.8, 15.5_

  - [ ] 6.3 删除全局控制器与 prototype patch 依赖
    - 移除 `window.__waifuModelCtrl`
    - 移除 `window.__fuxuanActions`
    - 移除 prototype patch
    - _Requirements: 3.5, 4.4_

  - [ ] 6.4 清理 MutationObserver 强保活等遗留 hack
    - 保证新引擎无需依赖全局保活方案
    - _Requirements: 1.1, 17.4_

  - [ ] 6.5 增加单元测试和组件测试
    - 覆盖 ParamController、Store、ChatPanel、Toolbar
    - _Requirements: 17.5, 19.5_

  - [ ] 6.6 增加集成测试和端到端测试
    - 覆盖模型加载、切换、聊天、拖拽、WebSocket 联动
    - _Requirements: 14.1-14.5, 20.5_

  - [ ] 6.7 完成性能和内存泄漏验证
    - 验证首屏、空闲 CPU、切模型、切 tab、反复打开聊天的稳定性
    - _Requirements: 13.5, 17.1-17.3_

  - [ ] 6.8 默认切换到 pixi 引擎
    - 开发环境默认 pixi
    - 验证可回退到 legacy
    - _Requirements: 1.4, 15.5_

  - [ ] 6.9 更新项目文档和迁移说明
    - 记录架构、能力边界、回退方式和模型配置规则
    - _Requirements: 18.5, 20.4_

  - [ ] 6.10 Checkpoint - 迁移完成
    - 确认所有核心功能等价迁移完成
    - 如有回退点或能力差异，形成最终记录
    - _Requirements: 1.5, 14.1-14.5, 15.1-15.5, 20.5_

- [ ]* 7. 可选增强
  - [ ]* 7.1 支持音量驱动 lip-sync
    - 使用真实音频振幅代替文本节奏模拟
    - _Requirements: 8.2_

  - [ ]* 7.2 支持模型资源预加载与缓存优化
    - 预加载常用模型和 motion
    - _Requirements: 17.1_

  - [ ]* 7.3 增加更多情绪预设与组合动作
    - 丰富角色表现
    - _Requirements: 6.1-6.5_

  - [ ]* 7.4 支持模型贴图/服装切换
    - 扩展工具栏功能
    - _Requirements: 4.3_

  - [ ]* 7.5 增加调试面板
    - 显示当前模型、参数、情绪、speaking、socket 状态
    - _Requirements: 17.5_

  - [ ]* 7.6 增加属性测试
    - 验证参数优先级、资源清理、状态同步、降级安全和 StrictMode 幂等性
    - _Requirements: 3.1-3.5, 13.1-13.5, 16.1-16.5_

  - [ ]* 7.7 接入更多业务事件映射模板
    - 扩展 service/build/deploy 等事件表现
    - _Requirements: 11.4_
