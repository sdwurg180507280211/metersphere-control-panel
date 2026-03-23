# Live2D 看板娘模型控制技术文档

> 基于对 live2d-widgets@1.0.0 + Cubism 5 SDK 的逆向工程分析

## 0. 技术选型评估（结合当前项目）

当前项目采用的是 **`live2d-widgets@1.0.0` CDN + Cubism 5 Core + 页面内增强脚本** 的集成方式。

从 `frontend/index.html` 的实际实现来看，这套方案已经承载了：

- 基础模型加载与工具栏
- tips 气泡系统
- AI 聊天入口与聊天面板
- 点击弹跳、说话动画、情绪表情
- 模型参数 override 注入
- 智能提示与空闲提醒

因此它已经不是“纯展示挂件”，而是一个 **基于第三方运行时二次增强的交互层**。

### 0.0 运行时框架说明：live2d-widgets@1.0.0 CDN

当前项目中的 `live2d-widgets@1.0.0 CDN`，本质上是 **`stevenjoezhang/live2d-widget` 仓库发布出来的前端挂件运行时产物**，通过 jsDelivr 直接加载到页面中使用。

它不是 Live2D 官方 Cubism SDK 本体，而是一个位于 Cubism Core 之上的 **网页挂件层/运行层**。在当前项目中，它主要负责：

- 创建看板娘容器与 canvas
- 渲染工具栏与 tips 气泡
- 读取 `waifu-tips.json` 配置
- 加载模型资源
- 提供 `initWidget()` 初始化入口
- 提供切换模型、切换贴图、截图、关闭等基础交互

结合项目代码，当前接入方式是：

- `frontend/index.html:14` 定义 `live2d-widgets@1.0.0/dist/` CDN 路径
- `frontend/index.html:43-44` 手动加载 `waifu.css` 与 `waifu-tips.js`
- `frontend/index.html:46` 调用 `initWidget({...})` 完成初始化
- `frontend/index.html:49` 额外加载官方 `Cubism 5 Core`

也就是说，当前项目并没有直接使用 `autoload.js` 一键接入，而是 **手动引用 dist 产物并自行组织初始化流程**，然后再叠加页面内增强脚本。

可以将它概括为：

> `live2d-widgets@1.0.0 CDN` 是一个通过 jsDelivr 直接加载的网页 Live2D 挂件运行层，负责看板娘容器、canvas、工具栏、tips 气泡、模型配置读取与基础交互，但不提供稳定公开的底层模型控制接口，因此更适合作为展示型/轻互动挂件基础，而非深度自定义动画框架。

需要特别区分三层来源：

1. **挂件框架**：来自 `stevenjoezhang/live2d-widget`
2. **底层运行核心**：来自 Live2D 官方 `Cubism Core`
3. **模型资源**：来自项目本地 `/live2d/...` 模型与外部模型仓库/静态地址

因此，当前项目所说的“`live2d-widgets@1.0.0 CDN + Cubism 5 Core + 页面内增强脚本`”，更准确的含义是：

- `live2d-widgets@1.0.0` 负责挂件壳子与基础交互
- `Cubism 5 Core` 负责底层模型运行
- 页面内增强脚本负责聊天、表情、说话动画、参数覆盖与业务交互增强

### 0.1 优点

#### 1) 接入成本低，落地快

- 通过 CDN 加载 `waifu.css`、`waifu-tips.js` 和 `Live2DCubismCore` 即可运行
- 页面内直接 `initWidget()` 即可完成初始化
- 对当前项目而言，几乎不需要改动 React 主应用结构
- 非常适合快速验证“看板娘 + 聊天 + 陪伴式交互”的产品想法

**结论**：适合原型期、个人项目、展示型场景、低成本增强场景。

#### 2) 对现有页面侵入性小

当前实现主要通过 `frontend/index.html` 内联脚本追加能力，而不是改造业务主干代码：

- 不影响 `src/main.jsx` 启动链路
- 不要求重构现有前端架构
- 出问题时可整体移除或降级，回滚成本低

这对于 MeterSphere 控制面板这种“业务主界面优先”的项目是明显优势。

#### 3) 内置现成的 UI 能力

`live2d-widgets` 本身已经提供：

- 看板娘容器与 canvas
- 工具栏
- tips 提示气泡
- 切换模型 / 切换贴图 / 截图 / 关闭等常规能力

项目在此基础上只需要做增量增强，而不是从零搭建完整 UI 外壳。

#### 4) Cubism 5 Core 允许做参数级控制

虽然上层实例未公开，但核心模型参数最终可被捕获和写入：

- 头部朝向
- 眼球方向
- 嘴巴开合
- 脸红
- 身体摆动
- 部分手臂动作

这使当前项目能够实现：

- 聊天时嘴巴开合
- 点击后表情反馈
- 预设情绪切换
- 自定义动作组合

**结论**：虽然方式不优雅，但“可控性”比单纯展示型插件强很多。

#### 5) 适合做“轻互动”而非“重动画编辑”

当前模型和方案特别适合：

- 陪伴式提示
- 聊天助手人格化
- 轻量情绪反馈
- 鼠标/事件驱动的简单互动

对于控制面板产品，这类互动已经足够提升趣味性和产品辨识度。

---

### 0.2 缺点

#### 1) 架构上依赖 Hack，稳定性一般

当前最核心的问题是：**模型实例不暴露**。

项目为了拿到核心模型，必须通过 patch `Live2DCubismCore.Model.prototype.update` 的方式捕获实例；为了确保自定义参数生效，还要再次 patch `model.update()` 做 post-update override。

这意味着：

- 强依赖第三方内部实现细节
- 升级 `live2d-widgets` 或 Cubism Core 后可能失效
- 调试难度高，问题定位成本高
- 与其他脚本同时 patch 时可能发生冲突

**结论**：这不是一个稳定公开 API 驱动的集成方案，而是“可用但脆弱”的方案。

#### 2) 页面内联脚本过重，可维护性差

当前看板娘逻辑大量堆叠在 `frontend/index.html` 中，包括：

- 初始化
- 聊天 UI
- innerHTML 劫持
- MutationObserver 兜底
- 模型控制器
- 拖拽管理器
- 智能出现逻辑
- 情绪系统与专属动作

这会带来几个问题：

- 职责混杂，阅读成本高
- 复用困难
- 测试困难
- 与页面结构和第三方 DOM 强耦合
- 后续功能继续增长时容易失控

**结论**：适合快速迭代，但不适合长期持续膨胀。

#### 3) 依赖外部 CDN 与第三方资源，运行可靠性受限

当前实现直接依赖：

- jsDelivr 上的 `live2d-widgets@1.0.0`
- Live2D 官方 Cubism Core 远程脚本
- 外部模型资源地址

潜在问题：

- 网络波动导致加载失败
- 第三方地址变更或限流
- 企业内网 / 离线环境兼容性差
- 首屏加载时序不可完全控

对于控制面板这类偏工具型产品，外部依赖越多，越不利于稳定交付。

#### 4) 参数控制能力强，但动作编排能力弱

当前方案的本质是“参数覆盖”，不是“动作系统扩展”。

所以它擅长：

- 瞬时表情
- 简单过渡
- 嘴巴开合
- 视线/角度变化

但不擅长：

- 复杂长动作编排
- 高质量连续肢体动作
- 多动作混合与优先级管理
- 标准化状态机驱动动画系统

文档中也已验证：

- 真正腿部行走基本不可行
- 复杂动作需要重新制作模型或动作资源

**结论**：更像“参数木偶控制”，不是完整动画引擎接入。

#### 5) 与 live2d-widgets 自带行为天然冲突

当前增强逻辑需要和原库行为共存，例如：

- 原生 tips 更新 vs 聊天模式 UI 劫持
- 原生 style 修改 vs 强制显示聊天面板
- 原生拖拽 / 点击逻辑 vs 自定义拖拽 / 弹跳
- 原生动作系统 vs 参数 override

这就是为什么当前实现里会出现：

- `innerHTML` setter 劫持
- `MutationObserver` 强制保持可见
- 各种 timeout / requestAnimationFrame 协调

这说明：**当前方案不是扩展点友好型架构**，而是在“接管第三方行为”。

#### 6) 类型与模型兼容性不统一

当前项目同时面对 Cubism 2 与 Cubism 5 模型体系差异：

- Cubism 2 参数通常是 `PARAM_*`
- Cubism 3/5 参数通常是 `Param*`

项目里已经需要做参数名映射兼容，但这种兼容只是“尽量适配”，并不能保证所有模型都拥有相同参数、动作和效果。

这意味着：

- 换模型后动作可能失效
- 某些表情预设并不通用
- 文档里描述的能力更多是 **Hiyori/当前模型特定能力**，不是所有模型通用能力

#### 7) 安全与边界控制一般

从工程角度看，当前方案包含一些高耦合 DOM 与全局对象操作：

- 修改 `window.Image`
- 暴露 `window.__waifuModelCtrl`
- 暴露 `window.__fuxuanActions`
- 劫持 DOM 属性行为

这些做法对个人项目问题不大，但从长期工程治理看：

- 全局污染明显
- 与其他脚本发生副作用的风险较高
- 代码边界不清晰

---

### 0.3 综合结论

对当前项目而言，这套技术方案的评价是：

> **短期很合适，长期要收敛。**

#### 适合当前阶段的原因

- 可以快速实现看板娘陪伴体验
- 已经验证了聊天、表情、提示、点击反馈等核心价值
- 对业务主系统侵入较小
- 成本低、效果直观

#### 不适合无限扩展的原因

- 依赖 hack 与第三方内部实现
- 维护成本会随着交互复杂度上升而迅速增加
- 一旦继续加入更多状态、动作、系统事件联动，`index.html` 脚本会进一步膨胀
- 对“复杂动画产品化”并不友好

### 0.5 替代方案对比：live2d-widgets vs pixi-live2d-display vs 官方 Cubism SDK

如果后续要评估是否继续沿用当前方案，或者决定下一阶段是否迁移，那么可以从“挂件能力、模型可控性、工程可维护性、开发成本”四个角度理解这三类路线。

| 维度 | `live2d-widgets` | `pixi-live2d-display` | 官方 Cubism SDK |
|------|------------------|----------------------|-----------------|
| 定位 | 开箱即用的网页看板娘挂件 | 基于 PixiJS 的 Live2D 渲染接入层 | 官方底层运行时与示例体系 |
| 抽象层级 | 高层挂件 | 中层渲染 / 模型控制层 | 底层官方能力 |
| 开箱即用程度 | 很高 | 中等 | 低 |
| 接入成本 | 最低 | 中等 | 最高 |
| UI 自带能力 | 强，内置容器、tools、tips、切换模型等 | 基本没有，需要自己做 | 没有，需要自己做 |
| 模型实例可控性 | 弱，通常不公开，需要 hack | 强，实例控制更直接 | 最强 |
| 参数控制稳定性 | 弱，容易被 motion 每帧覆盖 | 较强 | 强 |
| 动作 / 表情编排 | 弱 | 中等到较强 | 最强 |
| 工程可维护性 | 一般，容易堆 hack | 较好 | 最好 |
| 与业务 UI 解耦 | 弱 | 较好 | 最好 |
| 二次开发自由度 | 低 | 高 | 很高 |
| 对第三方内部实现依赖 | 高 | 中等 | 低 |
| 升级风险 | 高，容易被内部实现变动影响 | 中等 | 相对最低 |
| 适合的典型场景 | 原型、展示、小型轻互动挂件 | 工程化网页看板娘、可持续迭代 | 自建完整角色系统、产品级数字人 |

#### 1) live2d-widgets

优点在于接入最快、现成 UI 最多、对现有业务侵入最低；缺点在于它本质上是挂件框架而不是开放控制框架。

对于当前项目，它适合继续承担：

- 陪伴式提示
- 聊天入口
- 轻量情绪反馈
- 少量点击互动

但不适合继续承担：

- 深度自定义参数系统
- 复杂动作编排
- 多模型统一动画控制
- 长期膨胀的交互逻辑

一句话概括：**适合快速挂载，不适合长期深度定制。**

#### 2) pixi-live2d-display

这类方案比 `live2d-widgets` 更接近“工程化可控的网页 Live2D 接入层”。它通常不附带现成工具栏和 tips 气泡，但能给开发者更高的模型实例控制权，更适合自己实现：

- 聊天面板
- 表情状态机
- 视线跟随
- lip-sync
- 拖拽 / 点击反馈
- 与 React / Vue 业务 UI 的分层集成

它的价值不在于“更省事”，而在于：**更干净、更可控、更适合长期维护。**

对当前项目而言，如果未来仍然想保留“控制面板右下角看板娘”这种产品形态，但又希望摆脱大量 hack，这通常是最平衡的升级方向。

#### 3) 官方 Cubism SDK

官方 Cubism SDK 是能力上限最高、控制粒度最细的路线。它适合：

- 自建完整角色系统
- 自定义动作调度与优先级
- 标准化表情 / 状态机 / lip-sync 封装
- 多模型统一控制层
- 长期产品化演进

但它的代价也最大：

- 接入成本最高
- 需要自己搭建 UI 与运行壳层
- 需要自己处理资源加载、交互、事件、动作管理等基础设施

一句话概括：**最强，也最重。**

#### 4) 结合当前项目的推荐结论

如果按当前 MeterSphere 控制面板场景来判断：

1. **短期**：继续保留 `live2d-widgets` 作为轻互动看板娘方案，但不要再持续叠加新的底层 hack。
2. **中期**：若继续演进网页看板娘能力，优先考虑迁移到 `pixi-live2d-display` 一类更可控的接入层。
3. **长期**：若目标从“看板娘助手”升级为“高自由度数字人 / 正式角色系统”，应考虑转向官方 Cubism SDK 或更完整的虚拟角色框架。

最终可以概括为：

- **要快速落地**：`live2d-widgets`
- **要长期可维护的网页看板娘**：`pixi-live2d-display`
- **要高自由度、产品级角色系统**：官方 Cubism SDK

---

## 1. 技术架构

```
live2d-widgets@1.0.0
  |-- waifu-tips.js          (主入口, initWidget)
  |-- chunk/index2.js        (Cubism 5 SDK 封装, AppDelegate)
  |-- waifu-tips.json        (配置: 模型列表、消息、季节事件)
  |
  |-- Live2DCubismCore       (Cubism 5 Core, 全局变量)
  |     |-- Model            (核心模型实例)
  |     |   |-- parameters   (Float32Array, 可读写)
  |     |   |-- parts        (模型部件)
  |     |   `-- update()     (每帧更新)
  |     `-- Version
  |
  `-- ES Module 封装 (模型实例在模块作用域内, 不暴露到 window)
```

### 关键发现

- **模型实例不暴露**: live2d-widgets 的 `AppDelegate` 实例存储在 ES module 作用域内，无法通过 `window` 直接访问
- **CubismCore 可访问**: `window.Live2DCubismCore` 是全局变量
- **参数可直接写入**: 核心模型的 `parameters.values` 是 `Float32Array`，可直接修改
- **动作系统会覆盖**: 每帧的 motion 系统会重新计算参数值，直接写入会被覆盖

---

## 2. 当前模型信息

### 模型列表 (waifu-tips.json)

| Index | 名称 | 类型 | 说明 |
|-------|------|------|------|
| 0 | Potion-Maker/Pio | Cubism 2 | Pio 酱 |
| 1 | Potion-Maker/Tia | Cubism 2 | Tia 酱 |
| 2 | HyperdimensionNeptunia | Cubism 2 | 超次元海王星系列 (20 个变体) |
| 3 | **Hiyori** | **Cubism 5** | Live2D 官方示例模型 (当前使用) |

### Hiyori 模型详情

- **格式**: Cubism 5 (model3.json, Version 3)
- **来源**: `https://fastly.jsdelivr.net/gh/Live2D/CubismWebSamples/Samples/Resources/Hiyori/`
- **纹理**: 2 张 2048x2048 纹理
- **物理**: Hiyori.physics3.json (头发、衣物物理)
- **姿势**: Hiyori.pose3.json

---

## 3. 可控参数完整列表

### 3.1 面部参数

| 参数 ID | 名称 | 最小值 | 最大值 | 默认值 | 说明 |
|---------|------|--------|--------|--------|------|
| `ParamAngleX` | 角度 X | -30 | 30 | 0 | 头部水平旋转 |
| `ParamAngleY` | 角度 Y | -30 | 30 | 0 | 头部垂直旋转 |
| `ParamAngleZ` | 角度 Z | -30 | 30 | 0 | 头部倾斜 |
| `ParamCheek` | 脸红 | 0 | 1 | 0 | 害羞脸红效果 |

### 3.2 眼部参数

| 参数 ID | 名称 | 最小值 | 最大值 | 默认值 | 说明 |
|---------|------|--------|--------|--------|------|
| `ParamEyeLOpen` | 左眼开合 | 0 | 1 | 1 | 0=闭眼, 1=睁眼 |
| `ParamEyeLSmile` | 左眼笑 | 0 | 1 | 0 | 笑眯眯效果 |
| `ParamEyeROpen` | 右眼开合 | 0 | 1 | 1 | 同左眼 |
| `ParamEyeRSmile` | 右眼笑 | 0 | 1 | 0 | 同左眼 |
| `ParamEyeBallX` | 眼球 X | -1 | 1 | 0 | 眼球水平方向 |
| `ParamEyeBallY` | 眼球 Y | -1 | 1 | 0 | 眼球垂直方向 |

### 3.3 眉毛参数

| 参数 ID | 名称 | 最小值 | 最大值 | 默认值 | 说明 |
|---------|------|--------|--------|--------|------|
| `ParamBrowLY` | 左眉上下 | -1 | 1 | 0 | 上扬/下垂 |
| `ParamBrowRY` | 右眉上下 | -1 | 1 | 0 | 同左 |
| `ParamBrowLX` | 左眉左右 | -1 | 1 | 0 | 水平偏移 |
| `ParamBrowRX` | 右眉左右 | -1 | 1 | 0 | 同左 |
| `ParamBrowLAngle` | 左眉角度 | -1 | 1 | 0 | 倾斜角度 |
| `ParamBrowRAngle` | 右眉角度 | -1 | 1 | 0 | 同左 |
| `ParamBrowLForm` | 左眉变形 | -1 | 1 | 0 | 表情变形 |
| `ParamBrowRForm` | 右眉变形 | -1 | 1 | 0 | 同左 |

### 3.4 嘴部参数

| 参数 ID | 名称 | 最小值 | 最大值 | 默认值 | 说明 |
|---------|------|--------|--------|--------|------|
| `ParamMouthForm` | 嘴巴形状 | -2 | 1 | 1 | 1=微笑, -2=嘟嘴 |
| `ParamMouthOpenY` | 嘴巴开合 | 0 | 1 | 0 | 0=闭嘴, 1=张嘴 (LipSync) |

### 3.5 身体参数

| 参数 ID | 名称 | 最小值 | 最大值 | 默认值 | 说明 |
|---------|------|--------|--------|--------|------|
| `ParamBodyAngleX` | 身体旋转 X | -10 | 10 | 0 | 身体水平摆动 |
| `ParamBodyAngleY` | 身体旋转 Y | -10 | 10 | 0 | 身体纵向 |
| `ParamBodyAngleZ` | 身体旋转 Z | -10 | 10 | 0 | 身体倾斜 |
| `ParamBreath` | 呼吸 | 0 | 1 | 0 | 呼吸起伏 |
| `ParamShoulder` | 肩膀 | 0 | 1 | 0 | 耸肩 |
| `ParamBustY` | 胸部摇摆 | - | - | 0 | 物理驱动 |

### 3.6 肢体参数

| 参数 ID | 名称 | 最小值 | 最大值 | 默认值 | 说明 |
|---------|------|--------|--------|--------|------|
| `ParamArmLA` | 左臂 A | -10 | 10 | 0 | 左臂主动作 |
| `ParamArmRA` | 右臂 A | -10 | 10 | 0 | 右臂主动作 |
| `ParamArmLB` | 左臂 B | -10 | 10 | 0 | 左臂次动作 |
| `ParamArmRB` | 右臂 B | -10 | 10 | 0 | 右臂次动作 |
| `ParamHandL` | 左手 | -1 | 1 | 0 | 左手姿势 |
| `ParamHandR` | 右手 | -1 | 1 | 0 | 右手姿势 |
| `ParamHandLB` | 左手 B 旋转 | -1 | 1 | 0 | 左手旋转 |
| `ParamHandRB` | 右手 B 旋转 | -1 | 1 | 0 | 右手旋转 |
| **`ParamLeg`** | **腿** | **0** | **1** | **1** | **腿部动作 (有限)** |

### 3.7 装饰/物理参数

| 参数 ID | 说明 |
|---------|------|
| `ParamHairAhoge` | 呆毛摇摆 |
| `ParamHairFront` | 前发摇摆 |
| `ParamHairBack` | 后发摇摆 |
| `ParamSideupRibbon` | 发饰摇摆 |
| `ParamRibbon` | 胸前蝴蝶结摇摆 |
| `ParamSkirt` | 裙子摇摆 |
| `ParamSkirt2` | 裙子掀起 |
| `Param_Angle_Rotation_*` | 头发骨骼旋转 (28 个, 物理驱动) |

**总计: 70 个参数, 26 个部件**

---

## 4. 内置动作 (Motions)

| 动作组 | 文件 | 说明 |
|--------|------|------|
| `Idle` (x9) | Hiyori_m01 ~ m10 (跳 m04) | 待机动作循环 |
| `TapBody` (x1) | Hiyori_m04 | 点击身体反应 |

**触发方式**: 点击 canvas 的 Body 区域 -> SDK 自动播放 `TapBody` 动作

---

## 5. 获取模型实例的方法

live2d-widgets 的模型实例封装在 ES module 作用域内，需要通过 hack 方式获取：

### 方法: Patch CubismCore.Model.prototype.update

```javascript
// 通过 Monkey-patch 核心模型的 update 方法捕获实例
const origUpdate = Live2DCubismCore.Model.prototype.update;
let coreModel = null;

Live2DCubismCore.Model.prototype.update = function() {
  if (!coreModel) {
    coreModel = this;
    window.__live2dCoreModel = this;
  }
  return origUpdate.call(this);
};

// 等待一帧后恢复
requestAnimationFrame(() => {
  Live2DCubismCore.Model.prototype.update = origUpdate;
});
```

捕获后可通过 `window.__live2dCoreModel.parameters` 访问所有参数。

---

## 6. 参数控制方法

### 6.1 直接写入 (会被动作系统覆盖)

```javascript
const model = window.__live2dCoreModel;
const params = model.parameters;
const idx = params.ids.indexOf('ParamAngleX');
params.values[idx] = -25; // 下一帧会被 motion 覆盖
```

### 6.2 Post-Update Override (推荐)

在核心模型的 `update()` 之后注入参数覆盖，使其在动作系统之后生效：

```javascript
const model = window.__live2dCoreModel;
const params = model.parameters;

// 存储覆盖值
window.__live2dParamOverrides = {};

// Patch update 方法
const origUpdate = model.update.bind(model);
model.update = function() {
  const result = origUpdate();
  // 动作系统运行完毕后，强制覆盖指定参数
  const overrides = window.__live2dParamOverrides;
  for (const [paramId, value] of Object.entries(overrides)) {
    const idx = params.ids.indexOf(paramId);
    if (idx >= 0) {
      params.values[idx] = value;
    }
  }
  return result;
};

// 使用示例：让看板娘看向左边
window.__live2dParamOverrides = {
  'ParamAngleX': -25,
  'ParamBodyAngleX': -8,
  'ParamEyeBallX': -0.5
};

// 清除覆盖（恢复正常动作）
window.__live2dParamOverrides = {};
```

### 6.3 动画示例

```javascript
let frame = 0;
function animate() {
  const t = frame * 0.05;
  window.__live2dParamOverrides = {
    'ParamAngleX': Math.sin(t) * 30,        // 头部左右摆动
    'ParamAngleY': Math.cos(t * 0.7) * 20,  // 头部上下
    'ParamBodyAngleX': Math.sin(t) * 10,     // 身体跟随
    'ParamEyeBallX': Math.sin(t * 1.5) * 0.8 // 眼球跟随
  };
  frame++;
  requestAnimationFrame(animate);
}
animate();
```

---

## 7. 表情组合速查

### 开心

```javascript
{
  'ParamEyeLSmile': 1, 'ParamEyeRSmile': 1,
  'ParamMouthForm': 1, 'ParamMouthOpenY': 0.3,
  'ParamCheek': 0.5
}
```

### 惊讶

```javascript
{
  'ParamEyeLOpen': 1.2, 'ParamEyeROpen': 1.2,
  'ParamBrowLY': 1, 'ParamBrowRY': 1,
  'ParamMouthOpenY': 0.8, 'ParamMouthForm': 0
}
```

### 害羞

```javascript
{
  'ParamAngleX': -10, 'ParamAngleY': -5,
  'ParamCheek': 1,
  'ParamEyeLOpen': 0.6, 'ParamEyeROpen': 0.6,
  'ParamEyeBallX': -0.5, 'ParamEyeBallY': -0.3
}
```

### 说话 (配合聊天功能)

```javascript
// 用正弦波模拟嘴巴开合
function speakAnimation(duration = 2000) {
  const start = Date.now();
  function frame() {
    const elapsed = Date.now() - start;
    if (elapsed > duration) {
      window.__live2dParamOverrides['ParamMouthOpenY'] = 0;
      return;
    }
    // 随机幅度的嘴巴开合
    const openness = Math.abs(Math.sin(elapsed * 0.015)) * (0.3 + Math.random() * 0.5);
    window.__live2dParamOverrides['ParamMouthOpenY'] = openness;
    requestAnimationFrame(frame);
  }
  frame();
}
```

---

## 8. 位置控制

看板娘的位置通过 CSS 控制 `#waifu` 元素：

```javascript
const waifu = document.getElementById('waifu');

// 直接设置位置
waifu.style.left = '100px';
waifu.style.top = '500px';

// 平滑移动
waifu.style.transition = 'left 2s ease-in-out, top 2s ease-in-out';
waifu.style.left = targetX + 'px';

// 模拟走路弹跳
function pseudoWalk(targetX, duration = 2000) {
  const startX = parseInt(waifu.style.left) || 0;
  const startTime = Date.now();

  function frame() {
    const elapsed = Date.now() - startTime;
    const t = Math.min(elapsed / duration, 1);

    // 线性插值 X 位置
    const x = startX + (targetX - startX) * t;
    // 弹跳 Y (4 步)
    const bounce = Math.sin(t * Math.PI * 4) * 5;

    waifu.style.left = x + 'px';
    waifu.style.transform = `translateY(${bounce}px)`;

    // 移动时身体摆动
    window.__live2dParamOverrides['ParamBodyAngleX'] = Math.sin(t * Math.PI * 4) * 5;

    if (t < 1) requestAnimationFrame(frame);
    else window.__live2dParamOverrides['ParamBodyAngleX'] = 0;
  }
  frame();
}

// 翻转模型 (向左走时)
waifu.style.transform = 'scaleX(-1)'; // 水平翻转
```

---

## 9. 能力边界总结

| 功能 | 可行性 | 方法 |
|------|--------|------|
| 控制头部朝向 | ✅ 100% | ParamAngleX/Y/Z |
| 控制眼球方向 | ✅ 100% | ParamEyeBallX/Y |
| 控制眨眼 | ✅ 100% | ParamEyeLOpen/ROpen |
| 控制嘴巴开合 | ✅ 100% | ParamMouthOpenY (LipSync) |
| 控制表情 | ✅ 100% | 参数组合 (笑/惊/害羞) |
| 控制脸红 | ✅ 100% | ParamCheek |
| 控制手臂 | ✅ 80% | ParamArmLA/RA/LB/RB |
| 控制身体摆动 | ✅ 90% | ParamBodyAngleX/Y/Z |
| 控制位置移动 | ✅ 100% | CSS left/top |
| 模拟走路 (弹跳) | ✅ 90% | CSS 位移 + 身体摆动 |
| 真正腿部行走 | ⚠️ 10% | ParamLeg 效果有限, 无行走骨骼 |
| 自定义复杂动作 | ❌ 5% | 需要重新制作模型 |
| 触发内置动作 | ✅ 80% | 点击 canvas Body 区域触发 TapBody |

---

## 10. 注意事项

1. **性能**: 参数覆盖在每帧执行，避免在 override 回调中做重计算
2. **兼容性**: 仅验证了 Hiyori (Cubism 5) 模型，Cubism 2 模型的控制方式不同
3. **模型切换**: 切换模型后需要重新捕获 `__live2dCoreModel`
4. **冲突**: 参数覆盖会与 live2d-widgets 内置的鼠标跟随、动作播放冲突，需要合理设置优先级
5. **live2d-widgets 事件**: SDK 会分发 `live2d:hoverbody` 和 `live2d:tapbody` 自定义事件到 `window`

---
