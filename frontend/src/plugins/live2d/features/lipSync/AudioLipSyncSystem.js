/**
 * AudioLipSyncSystem - 音频驱动的唇形同步系统
 *
 * 通过 Web Audio API AnalyserNode 实时提取 RMS 音量，
 * 直接映射到 ParamMouthOpenY，使嘴唇动作与真实音频波形同步。
 *
 * 与旧的文字驱动 LipSyncSystem 的区别：
 * - 文字驱动：逐字猜测嘴型，与音频实际节奏不同步
 * - 音频驱动：从 PCM 采样计算 RMS 能量，嘴唇紧跟声波
 */

class AudioLipSyncSystem {
  constructor() {
    this.active = false
    this.analyserNode = null

    // 时间域数据缓冲
    this._timeData = null

    // 当前嘴型状态
    this.currentMouthOpen = 0
    this.targetMouthOpen = 0

    // 平滑参数（参考 airi wlipsync 的调参经验）
    this.smoothSpeed = 12          // 攻击快，衰减慢
    this.releaseSpeed = 4          // 闭嘴稍慢，避免啪嗒声
    this.volumeThreshold = 0.015   // 低于此值的静音阈值
    this.volumeMultiplier = 2.2    // 放大倍数，映射到可见的嘴型范围
    this.volumeClamp = 0.85        // 张口上限，防过度拉伸
  }

  /**
   * 连接 AnalyserNode
   * @param {AnalyserNode} analyserNode
   */
  attach(analyserNode) {
    this.analyserNode = analyserNode
    this._timeData = new Float32Array(analyserNode.fftSize)
    console.log('[AudioLipSync] Attached to AnalyserNode, fftSize:', analyserNode.fftSize)
  }

  detach() {
    this.stop()
    this.analyserNode = null
    this._timeData = null
  }

  start() {
    this.active = true
    this.currentMouthOpen = 0
    this.targetMouthOpen = 0
    console.log('[AudioLipSync] Started (audio-driven)')
  }

  stop() {
    this.active = false
    this.currentMouthOpen = 0
    this.targetMouthOpen = 0
    console.log('[AudioLipSync] Stopped')
  }

  /**
   * 每帧更新 - 从 AnalyserNode 读取时域数据并计算 RMS
   * @param {number} delta - 帧间隔 (ms)
   */
  tick(delta) {
    if (!this.active || !this.analyserNode || !this._timeData) return

    // 读取当前帧的时域数据（PCM 采样值，范围 [-1, 1]）
    this.analyserNode.getFloatTimeDomainData(this._timeData)

    // 计算 RMS (Root Mean Square) 音量
    let sumSquares = 0
    for (let i = 0; i < this._timeData.length; i++) {
      sumSquares += this._timeData[i] * this._timeData[i]
    }
    const rms = Math.sqrt(sumSquares / this._timeData.length)

    // 将 RMS 映射为目标嘴型开度
    if (rms < this.volumeThreshold) {
      this.targetMouthOpen = 0
    } else {
      this.targetMouthOpen = Math.min(this.volumeClamp, rms * this.volumeMultiplier)
    }

    // 平滑插值：上升用攻击速度，下降用释放速度
    const speed = this.targetMouthOpen > this.currentMouthOpen
      ? this.smoothSpeed
      : this.releaseSpeed
    const lerpFactor = 1 - Math.exp(-speed * (delta / 1000))
    this.currentMouthOpen = this.currentMouthOpen + (this.targetMouthOpen - this.currentMouthOpen) * lerpFactor
  }

  /**
   * 设置平滑参数
   */
  setSmoothParams({ attack, release, threshold, multiplier, clamp } = {}) {
    if (attack !== undefined) this.smoothSpeed = attack
    if (release !== undefined) this.releaseSpeed = release
    if (threshold !== undefined) this.volumeThreshold = threshold
    if (multiplier !== undefined) this.volumeMultiplier = multiplier
    if (clamp !== undefined) this.volumeClamp = clamp
  }

  isActive() {
    return this.active
  }

  destroy() {
    this.detach()
  }
}

export default AudioLipSyncSystem
