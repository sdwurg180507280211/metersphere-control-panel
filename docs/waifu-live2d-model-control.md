# Live2D 看板娘模型控制技术文档

> 基于对 live2d-widgets@1.0.0 + Cubism 5 SDK 的逆向工程分析

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

## 11. 推荐实现路径

### Phase 1: 视线跟随鼠标
- 监听 `mousemove`，计算鼠标与看板娘的相对位置
- 覆盖 `ParamAngleX/Y`, `ParamEyeBallX/Y`, `ParamBodyAngleX`
- 使用 lerp 平滑过渡

### Phase 2: 聊天时说话动画
- AI 回复时触发 `ParamMouthOpenY` 正弦波动画
- 配合开心表情 (`ParamEyeLSmile`, `ParamMouthForm`)

### Phase 3: 伪走路漫游
- CSS 控制 `#waifu` 位置
- 身体摆动 (`ParamBodyAngleX`) + Y 轴弹跳模拟步伐
- 移动方向自动翻转 (`scaleX(-1)`)
- 空闲 30 秒后触发，用户操作时回到固定位置
