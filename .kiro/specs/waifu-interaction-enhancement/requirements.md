# 看板娘互动增强 Requirements

## Spec Metadata

- 类型：Feature Spec
- Workflow：Design-First
- 来源文档：
  - `docs/waifu-interaction-enhancement.md`
  - `docs/waifu-chat-design.md`
  - `docs/waifu-live2d-model-control.md`

## 背景

当前 `metersphere-control-panel` 已集成 Live2D 看板娘（live2d-widgets@1.0.0 + Cubism 5 Hiyori 模型），第一轮"轻度增强"已完成视线跟随、点击弹跳、说话动画和 AI 聊天功能。

本 spec 升级为**最强互动模式**：在已有基础上，新增自由漫游、拖拽、智能出现、勿扰模式，打造完整的虚拟宠物体验。

## 范围

### 已完成（Phase 1 轻度增强）

- ✅ R1. 模型实例捕获与参数覆盖
- ✅ R2. 视线跟随鼠标
- ✅ R3. 点击弹跳
- ✅ R4. 说话动画
- ✅ R5. AI 聊天后端代理
- ✅ R6. 看板娘聊天 UI
- ✅ R7. 兼容性要求

### 本轮新增（Phase 2 最强互动）

- R8. 自由漫游模式（方案 A）
- R9. 拖拽功能（方案 C 补全）
- R10. 智能出现模式（方案 D）
- R11. 勿扰模式与偏好持久化
- R12. 情绪表情系统
- R13. WebSocket 系统事件联动

### 不包含

- 语音合成（TTS 朗读）
- 多角色切换（程序员/测试/萌妹人格）
- 自定义 Live2D 模型导入

## 关键术语

- **看板娘**：页面右下角的 Live2D 角色，基于 live2d-widgets@1.0.0 CDN 加载
- **Hiyori 模型**：Cubism 5 官方示例模型，拥有 70 个可控参数、26 个部件
- **Post-Update Override**：在 CubismCore.Model.update() 之后注入参数覆盖，使其在动作系统之后生效的技术方案
- **modelCtrl**：全局模型控制器（`window.__waifuModelCtrl`），负责模型捕获、参数覆盖、视线跟随、弹跳和说话动画
- **roamManager**：漫游管理器，控制看板娘在屏幕底部区域的自由移动
- **smartAppearance**：智能出现管理器，根据用户行为和系统事件触发看板娘主动互动
- **勿扰模式**：用户可一键关闭所有增强动画和主动提醒，仅保留基础看板娘显示
- **Home 位置**：看板娘的默认固定位置（右下角），漫游结束或用户交互时回归

## Requirements

### ── 已完成 ──

### R1. 模型实例捕获与参数覆盖 ✅

- WHEN 页面加载且 Live2DCubismCore 初始化完成
  THE SYSTEM SHALL 通过 Monkey-patch `Live2DCubismCore.Model.prototype.update` 捕获核心模型实例。
- WHEN 模型实例捕获成功
  THE SYSTEM SHALL 在模型的 `update()` 方法之后注入参数覆盖钩子，使覆盖值在动作系统之后生效。
- WHEN 参数覆盖钩子安装完成
  THE SYSTEM SHALL 恢复原始 `prototype.update` 方法，避免持续 Monkey-patch 影响性能。
- THE SYSTEM SHALL 将模型控制器暴露为 `window.__waifuModelCtrl`，供聊天脚本等外部模块调用。

### R2. 视线跟随鼠标 ✅

- WHEN 用户移动鼠标
  THE SYSTEM SHALL 计算鼠标相对于看板娘脸部中心的归一化偏移量。
- WHEN 归一化偏移量更新
  THE SYSTEM SHALL 通过 lerp 平滑过渡更新以下参数：ParamAngleX/Y（头部旋转）、ParamEyeBallX/Y（眼球方向）、ParamBodyAngleX（身体摆动）。
- THE SYSTEM SHALL 将参数值限制在模型定义的安全范围内。
- THE SYSTEM SHALL 使用 `requestAnimationFrame` 驱动动画循环，保持 60fps 流畅度。

### R3. 点击弹跳 ✅

- WHEN 用户点击 Live2D canvas
  THE SYSTEM SHALL 触发 CSS 弹跳动画（translateY + scale 组合，时长 0.6s）。
- WHEN 弹跳触发
  THE SYSTEM SHALL 同时设置笑脸表情参数。
- WHEN 弹跳动画结束
  THE SYSTEM SHALL 清除表情覆盖参数，恢复正常状态。
- IF 弹跳动画正在播放中
  THE SYSTEM SHALL 忽略重复点击，避免动画叠加。

### R4. 说话动画 ✅

- WHEN AI 聊天发送消息
  THE SYSTEM SHALL 启动说话动画，通过正弦波驱动 ParamMouthOpenY 参数模拟嘴巴开合。
- WHEN AI 回复消息到达
  THE SYSTEM SHALL 根据回复文字长度计算说话时长（每字符 80ms，上限 5000ms），播放说话动画。
- WHEN 说话动画结束或被中断
  THE SYSTEM SHALL 清除 ParamMouthOpenY 覆盖，恢复正常嘴部状态。

### R5. AI 聊天后端代理 ✅

- WHEN 前端发送聊天消息到 `/api/chat/message`
  THE SYSTEM SHALL 将消息代理到通义千问 OpenAI 兼容 API，附带系统提示词和会话历史。
- THE SYSTEM SHALL 从配置文件读取 API Key、baseUrl 和模型名称，不在前端暴露敏感信息。
- THE SYSTEM SHALL 按 sessionId 维护独立会话历史，单个会话最多保留 20 条消息。
- WHEN 会话超过 30 分钟无活动
  THE SYSTEM SHALL 自动清理该会话历史。
- WHEN API 请求失败
  THE SYSTEM SHALL 返回结构化错误响应。

### R6. 看板娘聊天 UI ✅

- WHEN 用户点击工具栏中的 chat 图标
  THE SYSTEM SHALL 将 `#waifu-tips` 气泡切换为聊天模式。
- WHEN 聊天模式激活
  THE SYSTEM SHALL 劫持 innerHTML setter 并通过 MutationObserver 强制保持气泡可见。
- WHEN 用户在输入框按 Enter
  THE SYSTEM SHALL 发送消息到后端 API，显示加载状态，渲染回复。
- WHEN 用户再次点击 chat 图标
  THE SYSTEM SHALL 退出聊天模式，恢复原始气泡，保留聊天记录。

### R7. 兼容性要求 ✅

- WHEN 互动增强功能加载后
  THE SYSTEM SHALL CONTINUE TO 保持 live2d-widgets 原有行为不被破坏。
- WHEN Live2DCubismCore 加载失败或模型捕获失败
  THE SYSTEM SHALL 优雅降级。

### ── 本轮新增 ──

### R8. 自由漫游模式

**用户故事：** 作为用户，我希望看板娘在我不操作时能自己在页面底部走动，以便让她看起来有生命力而不是静态装饰。

#### 验收标准

1. WHEN 用户无鼠标/键盘操作超过 30 秒且勿扰模式未开启
   THEN THE SYSTEM SHALL 启动漫游模式，看板娘开始在屏幕底部区域随机移动。
2. WHEN 漫游模式启动
   THE SYSTEM SHALL 仅在屏幕底部 20% 高度区域内移动，不遮挡主要内容。
3. WHEN 看板娘漫游移动中
   THE SYSTEM SHALL 以 CSS `left` 属性驱动水平位移，配合 Y 轴弹跳（`translateY` 正弦波）模拟步伐节奏。
4. WHEN 看板娘漫游移动中
   THE SYSTEM SHALL 通过 ParamBodyAngleX 参数驱动身体左右摆动，增强走路感。
5. WHEN 看板娘移动方向从右向左
   THE SYSTEM SHALL 通过 `scaleX(-1)` 水平翻转模型，使其面朝行进方向。
6. WHEN 看板娘到达漫游目标点
   THE SYSTEM SHALL 随机等待 2~5 秒后选取新的目标点继续移动。
7. WHEN 用户产生任何鼠标或键盘操作
   THEN THE SYSTEM SHALL 立即停止漫游，看板娘平滑回到 Home 位置（右下角）。
8. WHEN 看板娘回到 Home 位置
   THE SYSTEM SHALL 清除翻转和位移变换，恢复正常朝向。
9. WHEN 聊天模式激活
   THE SYSTEM SHALL 暂停漫游并回到 Home 位置，聊天结束后重新计时空闲。
10. THE SYSTEM SHALL 漫游移动速度约 100px/秒，保持缓慢漫步感。

### R9. 拖拽功能

**用户故事：** 作为用户，我希望能拖拽看板娘到页面任意位置，以便在她遮挡内容时移开她。

#### 验收标准

1. WHEN 用户在 Live2D canvas 上按住鼠标超过 150ms
   THEN THE SYSTEM SHALL 进入拖拽模式，鼠标样式变为 `grabbing`。
2. WHEN 拖拽模式激活且用户移动鼠标
   THE SYSTEM SHALL 实时更新看板娘位置跟随鼠标。
3. WHEN 拖拽模式激活
   THE SYSTEM SHALL 暂停视线跟随，改为设置惊讶表情（ParamEyeLOpen=1.2, ParamBrowLY=1, ParamBrowRY=1）。
4. WHEN 用户释放鼠标
   THE SYSTEM SHALL 结束拖拽，看板娘以弹性动画（cubic-bezier(0.68, -0.55, 0.265, 1.55)）回到 Home 位置。
5. IF 用户在 canvas 上快速点击（按住时间 < 150ms）
   THE SYSTEM SHALL 触发点击弹跳（R3），不进入拖拽模式。
6. WHEN 拖拽结束
   THE SYSTEM SHALL 恢复视线跟随和正常表情。

### R10. 智能出现模式

**用户故事：** 作为用户，我希望看板娘能根据我的操作和系统状态主动说话，以便获得有用的提示和陪伴感。

#### 验收标准

1. WHEN 用户无操作超过 60 秒且勿扰模式未开启
   THEN THE SYSTEM SHALL 触发看板娘显示随机陪伴消息（如"主人，还在吗？"、"要不要休息一下？"）。
2. WHEN 后端通过 WebSocket 推送服务状态变更事件
   IF 事件为服务启动失败
   THEN THE SYSTEM SHALL 看板娘显示惊讶表情并提示"xx 服务启动失败了！快看看日志~"。
3. WHEN 后端通过 WebSocket 推送服务状态变更事件
   IF 事件为服务启动成功
   THEN THE SYSTEM SHALL 看板娘显示开心表情并提示"xx 服务启动成功啦~"。
4. WHEN 前端构建任务完成
   THE SYSTEM SHALL 看板娘主动通知"构建完成！"或"构建失败了..."。
5. WHEN 智能提示触发
   THE SYSTEM SHALL 同步设置对应情绪表情参数（开心/惊讶/害羞/担心）。
6. THE SYSTEM SHALL 对智能提示设置冷却时间（同类提示间隔至少 30 秒），避免消息轰炸。
7. WHEN 聊天模式激活
   THE SYSTEM SHALL 暂停智能提示，避免干扰聊天。

### R11. 勿扰模式与偏好持久化

**用户故事：** 作为用户，我希望能一键关闭所有增强动画和主动提醒，以便在需要专注工作时不被干扰，并且下次打开页面时记住我的选择。

#### 验收标准

1. WHEN 用户点击工具栏中的勿扰模式图标
   THEN THE SYSTEM SHALL 立即关闭：漫游、智能提示、拖拽。保留：视线跟随、点击弹跳（被动响应）、聊天功能。
2. WHEN 勿扰模式开启
   THE SYSTEM SHALL 工具栏图标显示为激活状态（高亮 + tooltip 变更）。
3. WHEN 用户再次点击勿扰模式图标
   THE SYSTEM SHALL 恢复所有被关闭的功能。
4. THE SYSTEM SHALL 将勿扰模式状态持久化到 `localStorage`，页面刷新后恢复用户选择。
5. THE SYSTEM SHALL 将看板娘的自定义位置偏好（如果未来支持"停留在拖拽位置"）持久化到 `localStorage`。

### R12. 情绪表情系统

**用户故事：** 作为用户，我希望看板娘在不同场景下显示不同表情，以便让互动更生动真实。

#### 验收标准

1. THE SYSTEM SHALL 定义以下预设表情，每个表情为一组参数覆盖值：
   - **开心**：ParamEyeLSmile=1, ParamEyeRSmile=1, ParamMouthForm=1, ParamMouthOpenY=0.3, ParamCheek=0.5
   - **惊讶**：ParamEyeLOpen=1.2, ParamEyeROpen=1.2, ParamBrowLY=1, ParamBrowRY=1, ParamMouthOpenY=0.8, ParamMouthForm=0
   - **害羞**：ParamAngleX=-10, ParamAngleY=-5, ParamCheek=1, ParamEyeLOpen=0.6, ParamEyeROpen=0.6, ParamEyeBallX=-0.5, ParamEyeBallY=-0.3
   - **担心**：ParamBrowLY=-0.5, ParamBrowRY=-0.5, ParamMouthForm=-1, ParamEyeLOpen=0.8, ParamEyeROpen=0.8
   - **生气**：ParamBrowLAngle=-1, ParamBrowRAngle=-1, ParamBrowLY=-1, ParamBrowRY=-1, ParamMouthForm=-2
2. WHEN 情绪表情被触发
   THE SYSTEM SHALL 通过 lerp 平滑过渡到目标表情（不跳变）。
3. WHEN 情绪表情持续指定时长后
   THE SYSTEM SHALL 平滑过渡回默认表情。
4. WHEN 视线跟随与情绪表情同时生效
   THE SYSTEM SHALL 让情绪表情参数优先级高于视线跟随的同名参数。

### R13. WebSocket 系统事件联动

**用户故事：** 作为用户，我希望看板娘能实时感知系统状态变化并做出反应，以便我在操作控制面板时获得即时反馈。

#### 验收标准

1. WHEN 前端 WebSocket 收到服务状态变更事件
   THE SYSTEM SHALL 将事件分发给 smartAppearance 模块处理。
2. WHEN 收到 `service:status` 事件且状态为 `error` 或 `stopped`（非用户主动停止）
   THE SYSTEM SHALL 触发担心表情 + 提示消息。
3. WHEN 收到 `service:status` 事件且状态为 `running`
   THE SYSTEM SHALL 触发开心表情 + 提示消息。
4. WHEN 收到 `build:complete` 事件
   IF 构建成功 THEN THE SYSTEM SHALL 触发开心表情 + "构建成功~"。
   IF 构建失败 THEN THE SYSTEM SHALL 触发担心表情 + "构建失败了..."。
5. THE SYSTEM SHALL 不主动轮询后端状态，仅响应 WebSocket 推送事件。
