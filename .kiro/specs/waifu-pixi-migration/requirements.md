# 需求文档

## 简介

当前项目中的看板娘逻辑主要堆积在 `frontend/index.html` 中，承担了 Live2D 初始化、资源加载、参数覆盖、聊天 UI、拖拽、情绪系统、WebSocket 联动等过多职责，导致逻辑边界不清、全局 hack 较多、后续维护和扩展成本持续上升。

本功能的目标是将当前基于 `live2d-widgets` 的看板娘实现迁移到基于 `pixi-live2d-display` 的 React + Zustand + Pixi 模块化架构中，在保留现有用户体验的前提下，移除全局 patch 和 DOM 劫持，建立可维护、可测试、可扩展的业务编排层。

本迁移建立在 `pixi-live2d-display` 库之上。该库负责将 Live2D Cubism 2/3/4 模型统一接入 PixiJS 场景，并提供模型加载、动作播放、表情切换、命中测试、视线跟随等基础能力。本规范关注的不是重写底层 Live2D 渲染能力，而是在该库提供的统一抽象之上，构建适用于当前 control panel 项目的业务级看板娘模块系统，包括 React UI、Zustand 状态管理、业务事件桥接、参数优先级调度以及迁移期兼容策略。

---

## 术语表

- **看板娘系统**: 当前项目中的 Live2D 数字人功能，包括模型渲染、交互、聊天、提示与业务联动能力。
- **legacy 引擎**: 当前基于 `live2d-widgets` 和内联脚本的旧实现。
- **pixi 引擎**: 本次迁移目标实现，即基于 `pixi-live2d-display` 的新实现。
- **pixi-live2d-display**: 基于 PixiJS 的 Live2D 模型渲染与交互库，统一支持 Cubism 2/3/4。
- **Live2DModel**: `pixi-live2d-display` 暴露的统一模型入口对象，用于加载、渲染和控制模型。
- **InternalModel**: `pixi-live2d-display` 内部对不同 Cubism runtime 的统一抽象。
- **参数覆盖（Param Overlay）**: 在 motion/expression 之外，对模型参数进行额外写入的业务控制能力。
- **业务编排层**: 本项目新增的 Controller、Store、UI、Service 等模块集合，用于协调 Live2D 与业务状态。
- **引擎层**: 以 `pixi-live2d-display` 为核心的底层模型接入与渲染层。
- **参数映射**: 针对不同模型参数命名差异建立的参数名兼容机制。
- **智能出现**: 根据用户行为、空闲状态或业务事件控制看板娘显示与提示的能力。
- **勿扰模式（DND）**: 限制自动提示、自动出现和非必要动作的模式。

---

## 需求

### 需求 1：从 index.html 中迁出看板娘主逻辑

**用户故事：** 作为前端开发者，我希望将看板娘主逻辑从 `frontend/index.html` 中迁出，以便降低耦合并让功能进入 React 工程体系。

#### 验收标准

1.1. WHEN 新引擎启用时 THEN The System SHALL 不再依赖 `frontend/index.html` 中的大段内联看板娘业务逻辑完成初始化。
1.2. THE System SHALL 将渲染、控制、交互、UI、状态和服务桥接拆分为独立模块。
1.3. THE System SHALL 通过 React 组件挂载看板娘根节点，而不是通过直接操作静态 HTML 完成功能拼装。
1.4. IF legacy 引擎仍保留作为回退方案 THEN The System SHALL 通过 feature flag 显式区分 legacy 与 pixi 两种实现。
1.5. THE System SHALL 在迁移完成后支持清理旧入口逻辑。
1.6. WHEN 应用启动时 THEN The System SHALL 仅初始化由当前 feature flag 指定的一种引擎实现。
1.7. IF feature flag = pixi THEN The System SHALL 阻止 legacy 启动逻辑执行。
1.8. IF feature flag = legacy THEN The System SHALL 不创建 Pixi Application、Pixi canvas 或 pixi Live2D 模型实例。

---

### 需求 2：建立稳定的 Pixi 渲染底座

**用户故事：** 作为前端开发者，我希望在 React 中建立稳定的 Pixi 渲染底座，以便承载 Live2D 模型的挂载、更新和销毁。

#### 验收标准

2.1. WHEN `WaifuRoot` 挂载时 THEN The System SHALL 创建一个可复用的 Pixi 渲染上下文并挂载到指定容器。
2.2. WHEN 模型加载成功时 THEN The System SHALL 将模型实例加入 Pixi stage 并正确设置位置、缩放、层级和可见性。
2.3. WHEN 浏览器窗口尺寸变化或容器布局变化时 THEN The System SHALL 正确处理 resize。
2.4. WHEN 组件卸载或模型切换时 THEN The System SHALL 销毁旧模型实例、事件监听和渲染资源。
2.5. THE System SHALL 保证 React StrictMode 双执行场景下不会产生重复 canvas、重复模型实例或残留监听器。

---

### 需求 3：建立统一参数控制核心

**用户故事：** 作为前端开发者，我希望建立统一的参数控制核心，以便摆脱每帧 patch 和分散写参逻辑，实现多个特性共存。

#### 验收标准

3.1. WHEN gaze、lip-sync、emotion、bounce 或 drag 同时请求写入参数时 THEN The System SHALL 通过统一参数控制器合并这些请求。
3.2. THE System SHALL 对参数请求应用明确的优先级策略，默认优先级为 DRAG > EMOTION > LIP_SYNC > GAZE > IDLE。
3.3. THE System SHALL 对参数变化执行平滑插值或缓动，而不是直接跳变。
3.4. IF motion 或 expression 与参数覆盖发生冲突 THEN The System SHALL 按既定优先级和冲突策略处理，并保证结果稳定可预测。
3.5. THE System SHALL 不再依赖 patch `Live2DCubismCore.Model.prototype.update` 实现参数控制。
3.6. WHEN 多个来源写入不同参数时 THEN The System SHALL 按参数键独立合并，不相关参数不得互相覆盖。
3.7. WHEN 多个来源写入同一参数时 THEN The System SHALL 仅采用该参数最高优先级来源的目标值。
3.8. IF 同一参数存在相同优先级的多个写入来源 THEN The System SHALL 使用最新一次提交作为确定结果。
3.9. WHEN motion 或 expression 与参数覆盖同时生效时 THEN The System SHALL 在 motion / expression 更新后应用参数覆盖，并在来源释放后重新计算最终值。

---

### 需求 4：提供统一模型控制 API

**用户故事：** 作为业务开发者，我希望通过统一的控制器 API 操作看板娘，以便 UI、状态和业务事件都能通过一致入口驱动模型行为。

#### 验收标准

4.1. THE System SHALL 提供统一的 `Live2DController` 作为业务层门面。
4.2. WHEN 业务需要加载或切换模型时 THEN The System SHALL 通过统一 API 执行模型切换。
4.3. WHEN 业务需要触发情绪、说话、显示/隐藏、拖拽位置恢复等能力时 THEN The System SHALL 通过统一 API 调用而不是直接操作底层实例。
4.4. THE System SHALL 隐藏第三方引擎细节，不向 UI 或 Store 暴露底层 Cubism runtime。
4.5. THE System SHALL 保证控制器初始化和销毁流程具备幂等性。

---

### 需求 5：保留并迁移交互能力

**用户故事：** 作为终端用户，我希望迁移后仍保留模型的视线跟随、点击反馈和拖拽能力，以便体验不回退。

#### 验收标准

5.1. WHEN 用户移动鼠标时 THEN The System SHALL 支持模型头部、眼球或身体轻微跟随。
5.2. WHEN 用户点击模型有效区域时 THEN The System SHALL 先基于库提供的 hit test / tap 或等价命中机制识别点击，并将命中结果交给业务层编排 bounce、tap motion 或提示。
5.3. WHEN 用户拖拽模型时 THEN The System SHALL 通过业务层交互控制逻辑实现拖拽移动，并同步更新状态。
5.4. IF 模型缺少某些命中区域、标准参数或库命中能力不足 THEN The System SHALL 允许降级但不得崩溃。
5.5. THE System SHALL 将交互逻辑封装在独立的交互控制层中。
5.6. THE System SHALL 不假设 `pixi-live2d-display` 提供原生拖拽 API。

---

### 需求 6：保留并迁移情绪系统

**用户故事：** 作为终端用户，我希望迁移后仍可看到高兴、惊讶、害羞、担忧等情绪反馈，以便模型表现保持生动。

#### 验收标准

6.1. THE System SHALL 支持定义 happy、surprise、shy、angry、worried 等情绪 preset。
6.2. WHEN 业务或用户交互触发情绪时 THEN The System SHALL 应用参数组合、expression 或 motion。
6.3. IF 某模型不支持指定 expression 或 motion THEN The System SHALL 尝试降级到参数 preset。
6.4. WHEN 情绪生命周期结束时 THEN The System SHALL 自动恢复到 idle 状态或较低优先级状态。
6.5. THE System SHALL 支持业务事件驱动情绪切换。

---

### 需求 7：保留并迁移聊天能力

**用户故事：** 作为终端用户，我希望继续通过看板娘聊天面板与角色对话，以便保留交互式体验。

#### 验收标准

7.1. THE System SHALL 提供独立的 React 聊天面板，而不是通过劫持 `#waifu-tips` 或其他遗留 DOM 实现。
7.2. WHEN 用户发送消息时 THEN The System SHALL 调用聊天服务接口并显示 loading 状态。
7.3. WHEN 接收到聊天回复时 THEN The System SHALL 在面板中展示回复内容。
7.4. WHEN 模型正在说话时 THEN The System SHALL 能驱动 speaking 状态与嘴型联动。
7.5. IF 聊天接口失败 THEN The System SHALL 显示错误信息并允许重试。
7.6. THE System SHALL 支持打开、关闭、滚动到底部等基础聊天体验。
7.7. THE System SHALL 将聊天服务与 UI 渲染解耦。
7.8. THE System SHALL 允许服务层将现有后端聊天接口的请求与响应结构归一化为 UI 使用的统一契约。
7.9. THE System SHALL 将 sessionId、请求格式适配和响应错误归一化逻辑放在 service 或 store 层，而不是放在 UI 组件内。

---

### 需求 8：迁移嘴型同步能力

**用户故事：** 作为终端用户，我希望角色回复时能继续表现出说话效果，以便对话更自然。

#### 验收标准

8.1. WHEN speaking 状态激活时 THEN The System SHALL 驱动嘴型相关参数（如 `ParamMouthOpenY` 或兼容映射参数）。
8.2. THE System SHALL 支持文字驱动或音量驱动两类嘴型来源中的至少一种。
8.3. IF 模型不存在标准嘴型参数 THEN The System SHALL 使用参数映射或降级跳过。
8.4. WHEN speaking 状态结束时 THEN The System SHALL 停止嘴型驱动并恢复正常状态。
8.5. THE System SHALL 不依赖旧版全局控制器实现嘴型同步。
8.6. THE System SHALL 不将 lip-sync 建立在 `pixi-live2d-display` 未公开或未稳定的内建 API 假设之上，而应由业务层参数控制系统负责主实现。

---

### 需求 9：迁移智能出现与提示能力

**用户故事：** 作为终端用户，我希望看板娘仍能在适当时机出现、隐藏或给出轻提示，以便维持陪伴感但不过度打扰。

#### 验收标准

9.1. THE System SHALL 支持根据空闲状态、用户交互或业务事件控制看板娘显示与隐藏。
9.2. THE System SHALL 支持提示气泡或轻提示展示。
9.3. WHEN 连续触发提示条件时 THEN The System SHALL 执行节流或去重。
9.4. IF 勿扰模式开启 THEN The System SHALL 抑制非必要自动提示和主动出现行为。
9.5. THE System SHALL 将智能出现逻辑封装在独立特性模块中。

---

### 需求 10：支持勿扰模式

**用户故事：** 作为终端用户，我希望在需要专注时开启勿扰模式，以便减少看板娘对工作的影响。

#### 验收标准

10.1. WHEN 勿扰模式开启时 THEN The System SHALL 抑制自动提示、自动出现和非必要动作。
10.2. WHEN 勿扰模式关闭时 THEN The System SHALL 恢复允许的自动行为。
10.3. THE System SHALL 在状态层中持久维护 dnd 状态。
10.4. THE System SHALL 允许 UI 层切换勿扰模式。
10.5. THE System SHALL 保证勿扰模式不影响手动打开聊天或手动交互。

---

### 需求 11：支持 WebSocket 业务联动

**用户故事：** 作为使用控制面板的用户，我希望看板娘能响应构建、服务启动和异常等业务事件，以便增强反馈感知。

#### 验收标准

11.1. WHEN 后端事件通过 WebSocket 到达时 THEN The System SHALL 将事件翻译为看板娘动作、情绪或提示。
11.2. THE System SHALL 通过桥接层实现事件映射，而不是在全局对象上直接操作模型。
11.3. IF WebSocket 连接断开 THEN The System SHALL 将联动功能降级但本地功能仍继续工作。
11.4. THE System SHALL 支持为典型业务事件配置默认映射，如构建开始、成功、失败等。
11.5. THE System SHALL 保证 WebSocket 桥接层不直接依赖底层 Pixi/model 实例。
11.6. THE System SHALL 复用主应用现有 WebSocket 连接或事件流，不得为看板娘建立第二条长期连接。
11.7. WHEN 看板娘桥接层不可用时 THEN The System SHALL 降级为空操作且不得影响主应用原有 WebSocket 生命周期。

---

### 需求 12：建立统一状态管理

**用户故事：** 作为前端开发者，我希望通过 Zustand 统一管理看板娘运行时状态，以便解耦 UI、服务和控制器逻辑。

#### 验收标准

12.1. THE System SHALL 使用 Zustand 管理 enabled、ready、visible、dragging、chatOpen、dnd、speaking、activeEmotion、activeModelId、socketLinked、position 等状态。
12.2. THE System SHALL 提供 toggleChat、setDnd、setVisible、setDragging、setSpeaking、triggerEmotion、switchModel、applySocketEvent、setPosition 等动作入口。
12.3. THE System SHALL 保持 Store 不直接持有 Pixi 实例、模型实例或 DOM 引用。
12.4. WHEN 状态变化发生时 THEN The System SHALL 在 UI、Controller 和桥接层之间保持同步一致。
12.5. THE System SHALL 允许迁移后逐步替换遗留全局变量控制方式。

---

### 需求 13：资源清理和生命周期管理

**用户故事：** 作为前端开发者，我希望看板娘模块在挂载、切换和卸载时正确清理资源，以便避免内存泄漏和重复监听。

#### 验收标准

13.1. WHEN 组件卸载时 THEN The System SHALL 清理 Pixi Application、模型实例、RAF 循环和事件监听器。
13.2. WHEN 模型切换时 THEN The System SHALL 正确销毁旧模型并挂载新模型。
13.3. WHEN 交互控制器、聊天面板或桥接层销毁时 THEN The System SHALL 清理各自注册的订阅与监听。
13.4. THE System SHALL 避免重复绑定 window、document 或 Pixi pointer 事件。
13.5. THE System SHALL 在热更新、切 tab、反复显示/隐藏场景下保持稳定。

---

### 需求 14：保证主应用不受影响

**用户故事：** 作为控制面板用户，我希望看板娘迁移后不影响现有主业务界面，以便避免引入回归问题。

#### 验收标准

14.1. THE System SHALL 不遮挡主工作区关键操作区域，除非用户主动拖动到对应区域。
14.2. THE System SHALL 不破坏 toast、tab 切换、快捷键、配置页提示等现有功能。
14.3. IF 看板娘功能初始化失败 THEN The System SHALL 不影响主应用启动和使用。
14.4. THE System SHALL 将看板娘视为可独立降级的附加模块。
14.5. THE System SHALL 保证聊天、提示和浮层的 z-index 与交互边界可控。

---

### 需求 15：提供降级和回退能力

**用户故事：** 作为前端开发者，我希望在模型、接口或引擎异常时系统能优雅降级，以便降低迁移风险。

#### 验收标准

15.1. IF 模型加载失败 THEN The System SHALL 记录错误并回退到默认模型、禁用态或隐藏态。
15.2. IF 某模型缺少必要参数 THEN The System SHALL 跳过该能力并记录警告，不得崩溃。
15.3. IF 聊天接口失败 THEN The System SHALL 将影响限制在聊天面板内。
15.4. IF WebSocket 断开 THEN The System SHALL 保持本地模型交互可用。
15.5. THE System SHALL 支持通过 feature flag 从 pixi 引擎回退到 legacy 引擎。

---

### 需求 16：支持 React StrictMode

**用户故事：** 作为前端开发者，我希望新实现能兼容 React StrictMode，以便与现有工程设置保持一致。

#### 验收标准

16.1. WHEN React StrictMode 导致 mount/unmount 双执行时 THEN The System SHALL 保持初始化逻辑幂等。
16.2. THE System SHALL 不因双执行创建多个 Pixi Application。
16.3. THE System SHALL 不因双执行残留多个模型实例或监听器。
16.4. WHEN 组件重新挂载时 THEN The System SHALL 能恢复正常工作。
16.5. THE System SHALL 将 StrictMode 稳定性纳入测试与验收范围。

---

### 需求 17：保证性能和可维护性

**用户故事：** 作为前端开发者，我希望迁移后的系统性能稳定且结构清晰，以便长期维护和扩展。

#### 验收标准

17.1. THE System SHALL 支持懒加载看板娘模块和模型资源。
17.2. THE System SHALL 避免使用多个分散的动画循环，应统一管理 RAF/ticker。
17.3. THE System SHALL 对高频事件执行节流或防抖。
17.4. THE System SHALL 将模块职责划分清晰，并形成稳定目录结构。
17.5. THE System SHALL 提供可测试的控制器、状态和特性模块。

---

### 需求 18：基于 pixi-live2d-display 的能力优先集成

**用户故事：** 作为前端开发者，我希望迁移方案优先基于 `pixi-live2d-display` 的现有能力进行集成，以便减少重复造轮子并降低维护成本。

#### 验收标准

18.1. THE System SHALL 使用 `pixi-live2d-display` 作为默认的 Live2D 运行时接入层。
18.2. WHEN 实现模型加载能力时 THEN The System SHALL 优先使用 `Live2DModel.from(...)` 或等价官方推荐入口。
18.3. WHEN 实现 motion、expression、hit test、focus 或 drag 相关能力时 THEN The System SHALL 优先复用库提供的 API 或机制。
18.4. IF 某项能力无法由库直接提供 THEN The System SHALL 在业务编排层中补充扩展实现，且不得修改第三方库源码。
18.5. THE System SHALL 将库能力与业务能力的边界在设计文档中明确记录。

---

### 需求 19：Live2D 运行时版本兼容性

**用户故事：** 作为开发者，我希望迁移后的方案能够兼容不同 Cubism 版本模型，以便保留现有模型资源并支持未来扩展。

#### 验收标准

19.1. WHEN 加载 Cubism 2、3 或 4 兼容模型时 THEN The System SHALL 通过统一入口完成加载和挂载。
19.2. IF 不同模型存在参数命名差异 THEN The System SHALL 通过参数映射机制进行兼容。
19.3. IF 某模型不支持特定特性 THEN The System SHALL 优雅降级且不得导致主流程失败。
19.4. THE System SHALL 在模型配置中允许定义模型级能力声明与参数覆盖映射。
19.5. THE System SHALL 将模型兼容性验证纳入测试与验收范围。

---

### 需求 20：库能力边界验证

**用户故事：** 作为迁移实施者，我希望在大规模重构前验证 `pixi-live2d-display` 对关键能力的支持边界，以便降低迁移风险。

#### 验收标准

20.1. WHEN Phase 1 完成时 THEN The System SHALL 验证模型加载、渲染、销毁流程在 React 环境中可稳定运行。
20.2. WHEN Phase 2 开始前 THEN The System SHALL 验证参数写入、motion 播放、expression 切换是否可共存。
20.3. WHEN Phase 4 开始前 THEN The System SHALL 验证 hit test、pointer interaction、drag 或其替代方案是否可落地。
20.4. IF 某能力在库中存在限制 THEN The System SHALL 在设计文档中明确限制、替代方案与影响范围。
20.5. THE System SHALL 在迁移早期形成一份库能力验证清单。
20.6. THE System SHALL 将兼容矩阵、最小 React PoC 和关键能力边界验证作为进入大规模迁移前的阻塞条件。

---

### 需求 21：模型资源与运行时装配

**用户故事：** 作为前端开发者，我希望模型资源路径、Cubism runtime 来源和跨域约束被统一定义，以便迁移后不再依赖全局 hack 或运行时不确定性。

#### 验收标准

21.1. THE System SHALL 将模型 JSON、贴图、motions、expressions 的路径统一收敛到模型配置中，不得在业务代码中散落硬编码 URL。
21.2. WHEN 新引擎加载模型资源时 THEN The System SHALL 优先使用同源静态资源或经验证可访问的资源地址，不得依赖 `window.Image` 全局 patch 解决跨域问题。
21.3. THE System SHALL 将 Cubism runtime 的来源、加载方式和版本约束记录在单一设计位置，并由 PoC 验证。
21.4. IF 资源路径、CORS 或 runtime 装配不满足运行条件 THEN The System SHALL 在 PoC 阶段暴露问题并阻止进入大规模迁移阶段。
21.5. THE System SHALL 将资源装配结果纳入迁移验收清单。
