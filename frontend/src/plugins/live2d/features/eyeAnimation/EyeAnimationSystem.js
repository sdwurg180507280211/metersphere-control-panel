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
 *
 * 注意：本系统不再拥有独立 RAF 循环，由 Live2DController 统一驱动 update(dt)。
 */

class EyeAnimationSystem {
  constructor() {
    this.model = null

    // ---- 鼠标空闲检测 ----
    this.lastMouseMoveTime = 0
    this.isMouseIdle = false
    this.mouseIdleThreshold = 1500 // 1.5 秒静止后判定为空闲

    // ---- 眨眼状态机 ----
    this.blinkPhase = 'idle' // idle | closing | closed | opening
    this.blinkPhaseTimer = 0
    this.nextBlinkTime = this._randomBlinkInterval()
    this.eyeOpenValue = 1.0
    this.hasBuiltInBlink = false

    // ---- 视线扫视 ----
    this.saccadePhase = 'idle' // idle | focus | pause
    this.saccadePhaseTimer = 0

    this._onMouseMove = this._onMouseMove.bind(this)
    this._onMouseLeave = this._onMouseLeave.bind(this)
  }

  // ========== 生命周期 ==========

  attach(model) {
    this.model = model
    this.hasBuiltInBlink = this._detectBuiltInBlink()
    this.lastMouseMoveTime = performance.now()
    window.addEventListener('mousemove', this._onMouseMove, { passive: true })
    document.addEventListener('mouseleave', this._onMouseLeave)
    console.log('[EyeAnim] Attached, built-in blink:', this.hasBuiltInBlink)
  }

  detach() {
    this.model = null
    this._setEyeOpen(1.0)
    this.blinkPhase = 'idle'
    this.blinkPhaseTimer = 0
    this.saccadePhase = 'idle'
    this.saccadePhaseTimer = 0
    window.removeEventListener('mousemove', this._onMouseMove)
    document.removeEventListener('mouseleave', this._onMouseLeave)
    console.log('[EyeAnim] Detached')
  }

  // ========== 主更新入口 ==========

  /**
   * 每帧更新 - 由 Live2DController 统一驱动
   * @param {number} dt - 帧间隔 (ms)
   * @param {number} now - 当前时间戳 (performance.now)
   */
  update(dt, now) {
    if (!this.model) return
    this._updateBlink(dt)
    this._updateSaccade(dt, now)
  }

  // ========== 眨眼系统 ==========

  _updateBlink(dt) {
    if (this.hasBuiltInBlink) return

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
        if (this.blinkPhaseTimer >= 60) {
          this.blinkPhase = 'opening'
          this.blinkPhaseTimer = 0
        }
        break
      }
      case 'opening': {
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

  _randomBlinkInterval() {
    return 3000 + Math.random() * 5000
  }

  _easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
  }

  _setEyeOpen(value) {
    if (this.eyeOpenValue === value) return
    this.eyeOpenValue = value

    const coreModel = this.model?.internalModel?.coreModel
    if (!coreModel) return

    try {
      coreModel.setParameterValueById('ParamEyeLOpen', value)
      coreModel.setParameterValueById('ParamEyeROpen', value)
    } catch (_) { /* 静默忽略 */ }
  }

  // ========== 视线扫视系统 ==========

  _updateSaccade(dt, now) {
    const timeSinceMouseMove = now - this.lastMouseMoveTime

    if (timeSinceMouseMove < this.mouseIdleThreshold) {
      if (this.isMouseIdle) {
        this.isMouseIdle = false
        this.saccadePhase = 'idle'
        this.saccadePhaseTimer = 0
      }
      return
    }

    if (!this.isMouseIdle) {
      this.isMouseIdle = true
      this.saccadePhase = 'idle'
      this.saccadePhaseTimer = 0
    }

    this.saccadePhaseTimer += dt

    switch (this.saccadePhase) {
      case 'idle': {
        if (this.saccadePhaseTimer >= 600) {
          this._fireSaccade()
          this.saccadePhase = 'focus'
          this.saccadePhaseTimer = 0
        }
        break
      }
      case 'focus': {
        if (this.saccadePhaseTimer >= this._currentSaccadeFocusDuration) {
          this.saccadePhase = 'pause'
          this.saccadePhaseTimer = 0
        }
        break
      }
      case 'pause': {
        if (this.saccadePhaseTimer >= this._currentSaccadePauseDuration) {
          this._fireSaccade()
          this.saccadePhase = 'focus'
          this.saccadePhaseTimer = 0
        }
        break
      }
    }
  }

  _fireSaccade() {
    const focusController = this.model?.internalModel?.focusController
    if (!focusController) return

    const x = (Math.random() - 0.5) * 1.8
    const y = (Math.random() - 0.5) * 1.2 + 0.1

    focusController.focus(x, y, false)

    this._currentSaccadeFocusDuration = 400 + Math.random() * 800
    this._currentSaccadePauseDuration = 100 + Math.random() * 200
  }

  // ========== 鼠标事件 ==========

  _onMouseMove() {
    this.lastMouseMoveTime = performance.now()
  }

  _onMouseLeave() {
    this.lastMouseMoveTime = 0
  }

  // ========== 工具方法 ==========

  _detectBuiltInBlink() {
    return !!this.model?.internalModel?.eyeBlink
  }

  customizeBuiltInBlink({
    interval = 3.5,
    closing = 0.15,
    closed = 0.08,
    opening = 0.15
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
