# Live2D 官方模型对比分析

## 调研来源
- 仓库：https://github.com/Live2D/CubismWebSamples
- 时间：2026-03-22
- 目的：寻找适合互动（特别是走路/漫游）的 Live2D 模型

## 模型参数数量对比

| 模型 | 参数数量 | 腿部参数 | 复杂度 |
|------|---------|---------|--------|
| **Mao** | **132** | ❌ 无 | 最复杂 |
| **Natori** | 96 | ❌ 无 | 高 |
| **Rice** | 96 | ✅ **3个** (ParamLegKnee, ParamLegR, ParamLegRUpDw) | 高 |
| **Ren** | 73 | ✅ **2个** (ParamLegR, ParamLegL) | 中 |
| **Hiyori** | 70 | ⚠️ 1个 (ParamLeg, 效果有限) | 中 |
| **Haru** | 42 | ❌ 无 | 低 |
| **Wanko** | 25 | ❌ 无 | 低 |
| **Mark** | 21 | ❌ 无 | 最简单 |

## 关键发现

### 1. Rice 模型 - 最适合走路互动 ⭐⭐⭐⭐⭐

**腿部参数：**
- `ParamLegKnee` - 屈伸（膝盖弯曲）
- `ParamLegR` - 右足の位置（右脚位置）
- `ParamLegRUpDw` - 右足の上下（右脚上下）

**优势：**
- 有膝盖弯曲控制，可以做出真实的走路动作
- 有脚部位置和上下控制
- 96个参数，表情和身体动作都很丰富

**适用场景：**
- ✅ 走路漫游
- ✅ 跳跃动作
- ✅ 蹲下/站起
- ✅ 丰富的表情互动

### 2. Ren 模型 - 次优选择 ⭐⭐⭐⭐

**腿部参数：**
- `ParamLegR` - 右脚
- `ParamLegL` - 左脚

**优势：**
- 左右脚独立控制
- 73个参数，表情丰富
- 可以做简单的走路动作

**局限：**
- 没有膝盖控制，走路不如 Rice 自然

### 3. Hiyori 模型 - 当前使用 ⭐⭐⭐

**腿部参数：**
- `ParamLeg` - 腿（0-1范围，效果有限）

**问题：**
- 只有一个腿部参数，无法做出真实走路
- 适合"伪走路"（滑动+弹跳）

### 4. Mao 模型 - 参数最多但无腿部 ⭐⭐⭐

**特点：**
- 132个参数，是所有模型中最复杂的
- 手臂控制非常细致（8个手臂参数）
- **但没有腿部参数**

**适用场景：**
- ✅ 上半身表情和动作
- ❌ 不适合走路漫游

## 推荐方案

### 方案 A：换用 Rice 模型（推荐）⭐⭐⭐⭐⭐

**优势：**
- 真正的腿部动作能力
- 可以实现自然的走路动画
- 参数丰富（96个），表情互动不输 Hiyori

**工作量：**
- 修改 `frontend/index.html` 中的模型配置
- 调整参数名称（Rice 的参数名可能与 Hiyori 不同）
- 重新测试所有互动功能

### 方案 B：保持 Hiyori + 伪走路 ⭐⭐⭐

**优势：**
- 无需换模型
- 通过 CSS 位移 + 弹跳 + 身体摆动模拟走路

**局限：**
- 不是真正的腿部动画
- 看起来像"飘着走"

### 方案 C：使用 Ren 模型（折中）⭐⭐⭐⭐

**优势：**
- 有左右脚独立控制
- 参数数量适中（73个）
- 可以做简单的走路动作

**局限：**
- 没有膝盖控制，不如 Rice 自然

## 下一步建议

1. **如果追求最强互动**：换用 **Rice 模型**
2. **如果想快速实现**：保持 Hiyori，使用伪走路方案
3. **如果想平衡**：换用 **Ren 模型**

## 技术实现参考

### Rice 模型走路动画示例

```javascript
// 真实的走路动画（Rice 模型）
function realWalk() {
  const walkCycle = Date.now() * 0.003;

  // 膝盖弯曲（模拟迈步）
  modelCtrl.paramOverrides['ParamLegKnee'] =
    Math.abs(Math.sin(walkCycle)) * 0.5;

  // 右脚位置（前后摆动）
  modelCtrl.paramOverrides['ParamLegR'] =
    Math.sin(walkCycle) * 0.8;

  // 右脚上下（抬腿）
  modelCtrl.paramOverrides['ParamLegRUpDw'] =
    Math.max(0, Math.sin(walkCycle)) * 0.6;

  // 配合身体摆动
  modelCtrl.paramOverrides['ParamBodyAngleX'] =
    Math.sin(walkCycle) * 5;
}
```

### Hiyori 伪走路方案（当前）

```javascript
// 伪走路（CSS + 身体摆动）
function fakeWalk() {
  const walkPhase = Date.now() * 0.008;

  // CSS 位移
  waifu.style.left = targetX + 'px';

  // Y轴弹跳
  waifu.style.marginBottom =
    Math.sin(walkPhase * Math.PI * 4) * 3 + 'px';

  // 身体摆动
  modelCtrl.paramOverrides['ParamBodyAngleX'] =
    Math.sin(walkPhase * Math.PI * 4) * 5;
}
```

## 结论

**如果你想要真正的走路动画，必须换模型。推荐 Rice 或 Ren。**

**如果接受"伪走路"（滑动效果），可以继续用 Hiyori。**
