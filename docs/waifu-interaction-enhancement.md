# 看板娘互动增强方案

## 1. 现状分析

当前看板娘交互：
- 固定在右下角
- 鼠标移入显示 tips
- 工具栏固定在左侧
- 被动响应用户操作

局限性：
- 缺乏活力，像静态装饰
- 用户容易忽略其存在
- 互动形式单一

---

## 2. 互动增强方案

### 方案 A：自由漫游模式（推荐）

```
空闲时看板娘在页面边缘随机漫步：

┌─────────────────────────────────────┐
│                                     │
│                                     │
│              🐱  ← 走到这里看看     │
│                                     │
│                                     │
│                         🐱  ← 或者这里│
│                                     │
│    🐱  ← 也可以走到左下角           │
│                                     │
└─────────────────────────────────────┘

触发用户互动时回到右下角
```

**行为规则**：
- 空闲 30 秒后启动漫游
- 只在屏幕底部 20% 区域移动（不遮挡内容）
- 移动速度：缓慢漫步（100px/秒）
- 遇到边缘自动转向
- 用户点击/移入时立即停止漫游，回到固定位置

**技术实现**：
```javascript
const roamManager = {
  enabled: false,
  position: { x: 0, y: 0 },
  target: { x: 0, y: 0 },

  start() {
    this.enabled = true;
    this.pickNewTarget();
    this.animate();
  },

  pickNewTarget() {
    // 在底部区域随机选点
    const margin = 100;
    this.target.x = margin + Math.random() * (window.innerWidth - margin * 2);
    this.target.y = window.innerHeight - 150 - Math.random() * 100;
  },

  animate() {
    if (!this.enabled) return;

    // 平滑移动到目标点
    const dx = this.target.x - this.position.x;
    const dy = this.target.y - this.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 5) {
      // 到达目标，休息 2-5 秒后选新目标
      setTimeout(() => this.pickNewTarget(), 2000 + Math.random() * 3000);
    } else {
      // 继续移动
      this.position.x += (dx / dist) * 2;
      this.position.y += (dy / dist) * 2;
      this.updatePosition();
      requestAnimationFrame(() => this.animate());
    }
  },

  stop() {
    this.enabled = false;
    // 平滑回到右下角
    this.returnToHome();
  }
};
```

---

### 方案 B：视线跟随模式

```
看板娘的眼睛跟随鼠标移动：

┌─────────────────────────────────────┐
│                                     │
│                     👆 鼠标在这里   │
│                                     │
│              🐱                     │
│             (👀←看向鼠标)           │
│                                     │
└─────────────────────────────────────┘
```

**Live2D 原生支持**：
```javascript
// Live2D 模型有视线追踪参数
// 只需要绑定鼠标位置到模型参数

document.addEventListener('mousemove', (e) => {
  const waifu = document.getElementById('waifu');
  const rect = waifu.getBoundingClientRect();

  // 计算鼠标相对于看板娘中心的角度
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  const angleX = (e.clientX - centerX) / window.innerWidth * 30;  // -30 到 30 度
  const angleY = (e.clientY - centerY) / window.innerHeight * 20; // -20 到 20 度

  // 应用到 Live2D 模型参数（如果模型支持）
  if (window.live2DModel) {
    window.live2DModel.setParamFloat('PARAM_ANGLE_X', angleX);
    window.live2DModel.setParamFloat('PARAM_ANGLE_Y', angleY);
  }
});
```

**优点**：
- 无需额外动画，Live2D 原生支持
- 眼神交流增加亲和力
- 实现简单

---

### 方案 C：物理反馈模式

```
点击/拖拽看板娘时的物理效果：

点击时 → 看板娘弹跳一下
        🐱
       /||\   →   🐱
                    ↓
                   /||\

拖拽时 → 可以拖动看板娘到任意位置
        🐱 ← 鼠标拖拽中
       /||\
      拖拽结束后弹性归位
```

**点击弹跳**：
```css
#waifu {
  transition: transform 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

#waifu.bounce {
  animation: bounce 0.5s;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0) scale(1); }
  40% { transform: translateY(-20px) scale(1.05); }
  60% { transform: translateY(-10px) scale(0.95); }
}
```

**拖拽功能**：
```javascript
let isDragging = false;
let startX, startY;
let currentX = 0, currentY = 0;

const waifu = document.getElementById('waifu');

waifu.addEventListener('mousedown', (e) => {
  isDragging = true;
  startX = e.clientX - currentX;
  startY = e.clientY - currentY;
  waifu.style.transition = 'none';
  waifu.style.cursor = 'grabbing';
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  currentX = e.clientX - startX;
  currentY = e.clientY - startY;
  waifu.style.transform = `translate(${currentX}px, ${currentY}px)`;
});

document.addEventListener('mouseup', () => {
  if (!isDragging) return;
  isDragging = false;
  waifu.style.cursor = 'pointer';
  waifu.style.transition = 'transform 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)';

  // 弹性回到原位（或停留在新位置）
  currentX = 0;
  currentY = 0;
  waifu.style.transform = `translate(0, 0)`;
});
```

---

### 方案 D：智能出现模式

```
看板娘根据用户行为智能出现：

场景1：用户长时间无操作
        🐱 突然出现："主人，还在吗？"

场景2：用户滚动到页面底部
        🐱 跟随出现："下面没有内容了哦~"

场景3：用户频繁点击某功能
        🐱 出现提示："这个功能很有趣呢！"

场景4：系统有重要通知
        🐱 匆忙出现："有新消息！"
```

**实现**：
```javascript
const smartAppearance = {
  init() {
    this.trackIdleTime();
    this.trackScroll();
    this.trackClicks();
  },

  trackIdleTime() {
    let idleTimer;
    const resetTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        showWaifuMessage('主人，还在吗？');
      }, 60000); // 1分钟无操作
    };

    document.addEventListener('mousemove', resetTimer);
    document.addEventListener('keypress', resetTimer);
  },

  trackScroll() {
    let lastScrollY = 0;
    window.addEventListener('scroll', () => {
      const currentScrollY = window.scrollY;
      const maxScroll = document.body.scrollHeight - window.innerHeight;

      if (currentScrollY > lastScrollY && currentScrollY > maxScroll - 100) {
        showWaifuMessage('已经到底部了~');
      }
      lastScrollY = currentScrollY;
    });
  }
};
```

---

## 3. 组合推荐

### 轻度增强（推荐）

组合：**B（视线跟随）+ C（点击弹跳）**

- 眼睛跟随鼠标，增加互动感
- 点击有反馈，确认"她是活的"
- 不影响页面操作
- 实现简单，性能好

### 中度增强

组合：**A（漫游）+ B（视线跟随）**

- 空闲时看板娘在底部漫游
- 眼睛始终注视鼠标
- 用户移入时停止漫游并固定
- 增加存在感但不干扰

### 重度增强

组合：**A（漫游）+ B（视线）+ C（物理）+ D（智能）**

- 完整的虚拟宠物体验
- 需要设置"勿扰模式"开关
- 适合个人工具，不适合严肃工作场景

---

## 4. 针对 MeterSphere 控制面板的建议

考虑到这是一个**开发工具/控制面板**，建议采用：

### 首选：轻度增强

```javascript
// 1. 视线跟随（必做）
// 增加亲和力，无干扰

// 2. 点击弹跳（选做）
// 反馈确认，增加趣味

// 3. 智能出现 - 仅保留关键场景
// - 服务启动失败时主动提醒
// - 长时间运行任务完成时通知
```

### 避免过度

❌ 不建议：
- 频繁自动漫游（干扰操作）
- 过多气泡提示（信息噪音）
- 拖拽功能（容易误触）

✅ 建议：
- 提供"静音模式"关闭所有动画
- 记住用户位置偏好
- 动画可配置开关

---

## 5. 实现优先级

| 功能 | 难度 | 效果 | 建议 |
|------|------|------|------|
| 视线跟随 | ⭐⭐ | ⭐⭐⭐⭐ | 优先做 |
| 点击弹跳 | ⭐⭐ | ⭐⭐⭐ | 简单做 |
| 底部漫游 | ⭐⭐⭐ | ⭐⭐⭐ | 可选 |
| 拖拽功能 | ⭐⭐⭐ | ⭐⭐ | 不推荐 |
| 智能出现 | ⭐⭐⭐⭐ | ⭐⭐⭐ | 后期待定 |

---

## 6. 下一步

要我实现哪个方案？

1. **视线跟随** - 30 分钟可完成
2. **点击弹跳** - 15 分钟可完成
3. **两个一起做** - 45 分钟
