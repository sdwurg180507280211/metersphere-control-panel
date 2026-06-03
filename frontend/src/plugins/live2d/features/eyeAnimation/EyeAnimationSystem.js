/**
 * EyeAnimationSystem - 眼部动画系统
 *
 * 管理两个独立的眼部行为：
 * 1. 自动眨眼：周期性闭合/睁开，模拟自然眨眼
 * 2. 空闲视线扫视：鼠标静止时，眼球随机扫视，模拟"环顾四周"
 *
 * 与 pixi-live2d-display 的 autoFocus 协作：
 * - 鼠标移动时，autoFocus 驱动 FocusController，视线跟随鼠标
 * - 鼠标静止超过阈值后，本系统接管，驱动随机扫视
 * - 鼠标再次移动时，autoFocus 立即恢复控制
 */

class EyeAnimationSystem {
  constructor() {
    this.model = null
    this.isRunning = false
    this.rafId = null
    this._lastTime = 0

    // ---- 鼠标空闲检测 ----
    this.lastMouseMoveTime = 0
    this.isMouseIdle = false
    this.mouseIdleThreshold = 1500 // 1.5 秒静止后判定为空闲

    // ---- 眨眼状态机 ----
    this.blinkPhase = 'idle' // idle | closing | closed | opening
    this.blinkPhaseTimer = 0
    this.nextBlinkTime = this._randomBlinkInterval()
    this.eyeOpenValue = 1.0
    // 检查模型是否自带 Cubism 原生眨眼
    this.hasBuiltInBlink = false

    // ---- 视线扫视 ----
    // 扫视间隔使用加权概率分布，模拟真实眼球运动的不规则性
    this.saccadePhase = 'idle' // idle | focus | pause
    this.saccadePhaseTimer = 0

    this._onMouseMove = this._onMouseMove.bind(this)
    this._onMouseLeave = this._onMouseLeave.bind(this)
  }

  // ========== 生命周期 ==========

  /**
   * 挂载模型并启动动画循环
   */
  attach(model) {
    this.model = model
    this.hasBuiltInBlink = this._detectBuiltInBlink()
    console.log('[EyeAnim] Attached, built-in blink:', this.hasBuiltInBlink)
    this.start()
    window.addEventListener('mousemove', this._onMouseMove, { passive: true })
    document.addEventListener('mouseleave', this._onMouseLeave)
  }

  /**
   * 卸载模型并停止动画循环
   */
  detach() {
    this.stop()
    this.model = null
    window.removeEventListener('mousemove', this._onMouseMove)
    document.removeEventListener('mouseleave', this._onMouseLeave)
  }

  start() {
    if (this.isRunning || !this.model) return
    this.isRunning = true
    this.lastMouseMoveTime = performance.now()
    this._lastTime = performance.now()
    this._tick()
    console.log('[EyeAnim] Started')
  }

  stop() {
    this.isRunning = false
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    // 恢复眼睛开度到正常
    this._setEyeOpen(1.0)
    this.blinkPhase = 'idle'
    this.blinkPhaseTimer = 0
    this.saccadePhase = 'idle'
    this.saccadePhaseTimer = 0
    console.log('[EyeAnim] Stopped')
  }

  // ========== 主循环 ==========

  _tick() {
    if (!this.isRunning) return

    const now = performance.now()
    const dt = Math.min(now - this._lastTime, 100) // 防止切后台后 delta 爆炸
    this._lastTime = now

    this._updateBlink(dt)
    this._updateSaccade(dt, now)

    this.rafId = requestAnimationFrame(() => this._tick())
  }

  // ========== 眨眼系统 ==========

  /**
   * 眨眼状态机
   *
   * idle ──[间隔到]──→ closing ──[150ms]──→ closed ──[60ms]──→ opening ──[150ms]──→ idle
   *
   * 时间参数参考人类自然眨眼: 闭合~100-150ms, 闭合态~30-80ms, 睁开~100-150ms
   */
  _updateBlink(dt) {
    if (this.hasBuiltInBlink) return // 模型自带眨眼时不注入自定义眨眼

    this.blinkPhaseTimer += dt

    switch (this.blinkPhase) {
      case 'idle': {
        if (this.blinkPhaseTimer >= this.nextBlinkTime) {
          this.blinkPhase = 'closing'
          this.blinkPhaseTimer = 0
        }
        break
      }
      case 'closing': {
        // 150ms 闭合，easeInOutQuad
        const t = Math.min(this.blinkPhaseTimer / 150, 1)
        this._setEyeOpen(1 - this._easeInOutQuad(t))
        if (t >= 1) {
          this._setEyeOpen(0)
          this.blinkPhase = 'closed'
          this.blinkPhaseTimer = 0
        }
        break
      }
      case 'closed': {
        // 保持闭合 60ms（模拟真实眨眼的短暂滞留）
        if (this.blinkPhaseTimer >= 60) {
          this.blinkPhase = 'opening'
          this.blinkPhaseTimer = 0
        }
        break
      }
      case 'opening': {
        // 150ms 睁开，easeInOutQuad
        const t = Math.min(this.blinkPhaseTimer / 150, 1)
        this._setEyeOpen(this._easeInOutQuad(t))
        if (t >= 1) {
          this._setEyeOpen(1.0)
          this.blinkPhase = 'idle'
          this.blinkPhaseTimer = 0
          this.nextBlinkTime = this._randomBlinkInterval()
        }
        break
      }
    }
  }

  /**
   * 随机眨眼间隔：3~8 秒，模拟真实不规律眨眼
   */
  _randomBlinkInterval() {
    return 3000 + Math.random() * 5000
  }

  _easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
  }

  /**
   * 直接设置眼睛开合参数
   * 写入 Cubism 标准参数 ParamEyeLOpen/ParamEyeROpen
   */
  _setEyeOpen(value) {
    if (this.eyeOpenValue === value) return
    this.eyeOpenValue = value

    const coreModel = this.model?.internalModel?.coreModel
    if (!coreModel) return

    try {
      coreModel.setParameterValueById('ParamEyeLOpen', value)
      coreModel.setParameterValueById('ParamEyeROpen', value)
    } catch (_) {
      // 模型没有这些参数时静默忽略
    }
  }

  // ========== 视线扫视系统 ==========

  /**
   * 空闲扫视状态机
   *
   * 鼠标移动中 → autoFocus 控制（本系统不干预）
   * 鼠标静止 >1.5s → idle → focus(随机扫视) → pause(短暂停顿) → idle → ...
   */
  _updateSaccade(dt, now) {
    const timeSinceMouseMove = now - this.lastMouseMoveTime

    // 鼠标活跃中 → 重置扫视状态，autoFocus 接管
    if (timeSinceMouseMove < this.mouseIdleThreshold) {
      if (this.isMouseIdle) {
        this.isMouseIdle = false
        this.saccadePhase = 'idle'
        this.saccadePhaseTimer = 0
      }
      return
    }

    // 进入空闲模式
    if (!this.isMouseIdle) {
      this.isMouseIdle = true
      this.saccadePhase = 'idle'
      this.saccadePhaseTimer = 0
    }

    this.saccadePhaseTimer += dt

    switch (this.saccadePhase) {
      case 'idle': {
        // 首次空闲：短暂停顿后开始扫视
        if (this.saccadePhaseTimer >= 600) {
          this._fireSaccade()
          this.saccadePhase = 'focus'
          this.saccadePhaseTimer = 0
        }
        break
      }
      case 'focus': {
        // 注视当前焦点 400-1200ms
        if (this.saccadePhaseTimer >= this._currentSaccadeFocusDuration) {
          this.saccadePhase = 'pause'
          this.saccadePhaseTimer = 0
        }
        break
      }
      case 'pause': {
        // 扫视之间短暂停顿 100-300ms
        if (this.saccadePhaseTimer >= this._currentSaccadePauseDuration) {
          this._fireSaccade()
          this.saccadePhase = 'focus'
          this.saccadePhaseTimer = 0
        }
        break
      }
    }
  }

  /**
   * 执行一次扫视：设置新的焦点目标
   *
   * 使用 model.internalModel.focusController 直接驱动，
   * 坐标范围 [-1, 1]，与 autoFocus 共享同一个 FocusController，
   * 鼠标移动时 autoFocus 会无缝接管。
   */
  _fireSaccade() {
    const focusController = this.model?.internalModel?.focusController
    if (!focusController) return

    // X: 全范围 ±0.9（眼球水平活动范围大）
    // Y: 偏上 -0.5~0.7（自然状态下视线偏上，看"远方"或"思考"）
    const x = (Math.random() - 0.5) * 1.8
    const y = (Math.random() - 0.5) * 1.2 + 0.1

    // 使用 FocusController 的平滑插值
    focusController.focus(x, y, false)

    // 随机注视停留时间 400-1200ms
    this._currentSaccadeFocusDuration = 400 + Math.random() * 800
    // 随机停顿时间 100-300ms
    this._currentSaccadePauseDuration = 100 + Math.random() * 200

    this._lastSaccadeX = x
    this._lastSaccadeY = y
  }

  // ========== 鼠标事件 ==========

  _onMouseMove() {
    this.lastMouseMoveTime = performance.now()
  }

  _onMouseLeave() {
    // 鼠标离开页面时标记为空闲，立即触发扫视
    this.lastMouseMoveTime = 0
  }

  // ========== 工具方法 ==========

  /**
   * 检测模型是否自带 Cubism 原生眨眼
   * 如果模型 model3.json 中定义了 EyeBlinkParameters，Cubism SDK 会自动创建 eyeBlink
   */
  _detectBuiltInBlink() {
    return !!this.model?.internalModel?.eyeBlink
  }

  /**
   * 如果模型有内置眨眼，自定义其参数使其更生动
   */
  customizeBuiltInBlink({
    interval = 3.5,      // 平均眨眼间隔（秒），默认 3.5 比 Cubism 默认更快
    closing = 0.15,      // 闭合耗时（秒）
    closed = 0.08,       // 闭合保持（秒）
    opening = 0.15       // 睁开耗时（秒）
  } = {}) {
    const eyeBlink = this.model?.internalModel?.eyeBlink
    if (!eyeBlink) return false

    eyeBlink.setBlinkingInterval(interval)
    eyeBlink.setBlinkingSetting(closing, closed, opening)
    console.log('[EyeAnim] Built-in blink customized:', { interval, closing, closed, opening })
    return true
  }
}

export default EyeAnimationSystem
