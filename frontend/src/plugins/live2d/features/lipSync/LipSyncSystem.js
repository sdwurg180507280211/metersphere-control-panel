/**
 * LipSyncSystem - 嘴型同步系统
 *
 * 驱动说话期间的嘴型参数变化，支持两种模式：
 * 1. text-driven: 文字节奏模拟，适合文字转语音场景
 * 2. volume-driven: 音频音量分析，适合语音播放场景（预留接口）
 *
 * 使用 ParamController 提交嘴型参数，优先级 LIP_SYNC
 * 遵循 spec 设计的优先级策略：DRAG > EMOTION > LIP_SYNC > GAZE > IDLE
 */

export const PRIORITY = {
  LIP_SYNC: 3,
}

class LipSyncSystem {
  constructor(paramController) {
    this.paramController = paramController
    this.active = false
    this.source = null // 'text' | 'audio'
    this.startTime = 0
    this.elapsed = 0

    // 文字驱动配置
    this.currentText = ''
    this.charIndex = 0
    this.lastCharTime = 0
    this.charsPerSecond = 12 // 语速匹配普通话朗读

    // 当前嘴型状态
    this.currentMouthOpen = 0
    this.targetMouthOpen = 0

    // 动画参数
    this.smoothSpeed = 8 // 平滑插值速度
  }

  /**
   * 开始说话
   * @param {string} text - 要说的文字（文字驱动模式）
   * @param {'text' | 'audio'} source - 驱动来源
   */
  start(text = '', source = 'text') {
    if (!this.paramController) {
      console.warn('[LipSync] ParamController not provided')
      return
    }

    this.active = true
    this.source = source
    this.startTime = Date.now()
    this.elapsed = 0
    this.charIndex = 0
    this.lastCharTime = 0
    this.currentText = text || ''
    this.currentMouthOpen = 0
    this.targetMouthOpen = 0

    console.log('[LipSync] Started:', { source, textLength: text.length })
  }

  /**
   * 停止说话
   */
  stop() {
    if (!this.active) return

    this.active = false
    this.source = null
    this.currentText = ''
    this.charIndex = 0

    // 释放参数
    this.releaseParams()
    console.log('[LipSync] Stopped')
  }

  /**
   * 每帧更新 - 由统一动画循环调用
   * @param {number} delta - 帧间隔时间 (ms)
   */
  tick(delta) {
    if (!this.active || !this.paramController) return

    this.elapsed = Date.now() - this.startTime

    if (this.source === 'text') {
      this.updateTextDriven(delta)
    } else if (this.source === 'audio') {
      this.updateAudioDriven(delta)
    }

    // 平滑插值到目标值
    const lerpFactor = 1 - Math.exp(-this.smoothSpeed * (delta / 1000))
    this.currentMouthOpen = this.currentMouthOpen + (this.targetMouthOpen - this.currentMouthOpen) * lerpFactor

    // 提交参数
    this.submitParams()
  }

  /**
   * 文字驱动模式更新 - 根据文字节奏模拟嘴型
   */
  updateTextDriven(delta) {
    if (this.charIndex >= this.currentText.length) {
      // 文字结束，逐渐闭合嘴巴
      this.targetMouthOpen = Math.max(0, this.targetMouthOpen - 0.5 * (delta / 1000))
      if (this.targetMouthOpen <= 0.05 && this.currentMouthOpen <= 0.05) {
        this.stop()
      }
      return
    }

    const timePerChar = 1000 / this.charsPerSecond
    const currentTime = this.elapsed

    // 处理当前字符
    while (this.charIndex < this.currentText.length &&
           currentTime - this.lastCharTime >= timePerChar) {

      const char = this.currentText[this.charIndex]

      // 根据字符类型决定嘴型开合
      if (this.isVowelOrPunctuation(char)) {
        // 元音/标点：张开嘴巴
        this.targetMouthOpen = this.getRandomOpenValue()
      } else if (this.isPauseChar(char)) {
        // 停顿符号：闭合嘴巴
        this.targetMouthOpen = 0
      }
      // 辅音：保持当前状态

      this.charIndex++
      this.lastCharTime = currentTime
    }

    // 自然波动
    this.targetMouthOpen += (Math.random() - 0.5) * 0.1 * (delta / 1000)
    this.targetMouthOpen = Math.max(0, Math.min(1, this.targetMouthOpen))
  }

  /**
   * 音频驱动模式更新（预留接口）
   */
  updateAudioDriven(delta) {
    // TODO: 未来实现音量分析驱动
    // 目前 fallback 到简化的随机波动
    this.targetMouthOpen = 0.3 + Math.random() * 0.4
  }

  /**
   * 提交参数到 ParamController
   */
  submitParams() {
    // 标准参数名映射 - paramMap 会处理模型差异
    const params = {
      ParamMouthOpenY: this.currentMouthOpen,
      ParamMouthForm: Math.round(this.currentMouthOpen * 2) - 1, // -1 到 1 范围
    }

    this.paramController.submit('lipSync', params, PRIORITY.LIP_SYNC)
  }

  /**
   * 释放参数
   */
  releaseParams() {
    if (this.paramController) {
      this.paramController.release('lipSync')
    }
  }

  /**
   * 判断是否为元音（中文拼音对应开口字符）或开口标点
   */
  isVowelOrPunctuation(char) {
    const vowels = 'aeiouAEIOUaoeiuvāēīōūǎěǐǒǔàèìòùáéíóú'
    const openPunct = ',.;!?，。；！？'
    return vowels.includes(char) || openPunct.includes(char)
  }

  /**
   * 判断是否为停顿字符
   */
  isPauseChar(char) {
    const pauses = ' \n\r\t，。；！？、'
    return pauses.includes(char)
  }

  /**
   * 获取随机开口值，让嘴型更自然
   */
  getRandomOpenValue() {
    // 0.3 - 0.8 范围，不同字符开口大小不同
    return 0.3 + Math.random() * 0.5
  }

  /**
   * 设置字符速率（用于调节语速匹配语音）
   * @param {number} cps - 字符每秒
   */
  setCharsPerSecond(cps) {
    this.charsPerSecond = Math.max(5, Math.min(20, cps))
  }

  /**
   * 设置平滑速度
   * @param {number} speed - 平滑插值速度
   */
  setSmoothSpeed(speed) {
    this.smoothSpeed = Math.max(1, Math.min(20, speed))
  }

  /**
   * 是否正在说话
   */
  isActive() {
    return this.active
  }

  /**
   * 销毁
   */
  destroy() {
    this.stop()
    this.paramController = null
  }
}

export default LipSyncSystem
