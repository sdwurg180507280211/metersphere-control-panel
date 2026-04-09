/**
 * TextToSpeechService - 文字转语音服务
 *
 * 使用浏览器内置 Web Speech API 实现文字转语音
 * 支持开始、停止、语速调节、事件回调
 * 自动选择中文语音，优化女声语调
 */

class TextToSpeechService {
  constructor(options = {}) {
    this.enabled = true
    this.lang = options.lang || 'zh-CN'
    this.rate = options.rate || 0.9 // 语速，0.9 更自然
    this.pitch = options.pitch || 1.1 // 音调，略微偏高更接近女声
    this.volume = options.volume || 1.0 // 音量

    this.currentUtterance = null
    this.isSpeaking = false
    this.onStart = options.onStart || null
    this.onEnd = options.onEnd || null
    this.onError = options.onError || null

    this.selectedVoice = null

    // 检查浏览器支持
    this.supported = 'speechSynthesis' in window
    if (!this.supported) {
      console.warn('[TTS] Web Speech API not supported in this browser')
      this.enabled = false
    } else {
      // 尝试加载语音列表并选择中文
      this.trySelectChineseVoice()
    }
  }

  /**
   * 尝试选择中文语音
   */
  trySelectChineseVoice() {
    if (!this.supported) return

    const voices = this.getVoices()
    if (voices.length === 0) {
      // 语音还没加载完，等待一下
      if (typeof speechSynthesis !== 'undefined' && speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = () => {
          this.selectBestChineseVoice()
        }
      }
    } else {
      this.selectBestChineseVoice()
    }
  }

  /**
   * 选择最好的中文语音（优先女声）
   */
  selectBestChineseVoice() {
    const voices = this.getVoices()
    if (voices.length === 0) return

    // 优先选择中文女声
    let chineseVoices = voices.filter(v =>
      v.lang.startsWith('zh') || v.lang.startsWith('cmn')
    )

    if (chineseVoices.length === 0) {
      // 没有中文，使用第一个
      this.selectedVoice = voices[0]
      console.warn('[TTS] No Chinese voice found, using first available:', this.selectedVoice.name)
      return
    }

    // 优先找包含 "Female" 或 "女" 或 "Xiaoxiao" 或 "Yaoyao" 的女声
    const femaleVoices = chineseVoices.filter(v =>
      v.name.toLowerCase().includes('female') ||
      v.name.includes('女') ||
      v.name.includes('Xiaoxiao') ||
      v.name.includes('Yaoyao')
    )

    if (femaleVoices.length > 0) {
      // 偏好 Yaoyao (Google 中文女声) 或 Xiaoxiao
      const preferred = femaleVoices.find(v =>
        v.name.includes('Yaoyao') || v.name.includes('Xiaoxiao')
      )
      this.selectedVoice = preferred || femaleVoices[0]
    } else {
      // 随便选第一个中文
      this.selectedVoice = chineseVoices[0]
    }

    console.log('[TTS] Selected voice:', this.selectedVoice.name, '(lang:', this.selectedVoice.lang, ')')
  }

  /**
   * 获取当前选中的语音
   */
  getSelectedVoice() {
    return this.selectedVoice
  }

  /**
   * 朗读文字
   * @param {string} text - 要朗读的文字
   * @returns {boolean} 是否成功开始
   */
  speak(text) {
    if (!this.enabled || !this.supported) {
      console.warn('[TTS] TTS not enabled or supported')
      return false
    }

    if (!text || text.trim().length === 0) {
      return false
    }

    // 停止之前的朗读
    this.stop()

    try {
      const utterance = new SpeechSynthesisUtterance(text.trim())
      utterance.lang = this.lang
      utterance.rate = this.rate
      utterance.pitch = this.pitch
      utterance.volume = this.volume

      // 使用选中的语音
      if (this.selectedVoice) {
        utterance.voice = this.selectedVoice
      }

      utterance.onstart = () => {
        this.isSpeaking = true
        this.currentUtterance = utterance
        if (this.onStart) {
          this.onStart(text)
        }
        console.log('[TTS] Started speaking')
      }

      utterance.onend = () => {
        this.isSpeaking = false
        this.currentUtterance = null
        if (this.onEnd) {
          this.onEnd()
        }
        console.log('[TTS] Finished speaking')
      }

      utterance.onerror = (event) => {
        this.isSpeaking = false
        this.currentUtterance = null
        console.error('[TTS] Error:', event)
        if (this.onError) {
          this.onError(event)
        }
      }

      window.speechSynthesis.speak(utterance)
      return true
    } catch (error) {
      console.error('[TTS] Failed to speak:', error)
      this.isSpeaking = false
      this.currentUtterance = null
      if (this.onError) {
        this.onError(error)
      }
      return false
    }
  }

  /**
   * 停止当前朗读
   */
  stop() {
    if (!this.supported) return

    try {
      window.speechSynthesis.cancel()
    } catch (e) {
      // ignore
    }

    const wasSpeaking = this.isSpeaking
    this.isSpeaking = false
    this.currentUtterance = null

    if (wasSpeaking && this.onEnd) {
      this.onEnd()
    }
  }

  /**
   * 暂停
   */
  pause() {
    if (!this.supported || !this.isSpeaking) return
    try {
      window.speechSynthesis.pause()
    } catch (e) {
      // ignore
    }
  }

  /**
   * 继续
   */
  resume() {
    if (!this.supported || !this.isSpeaking) return
    try {
      window.speechSynthesis.resume()
    } catch (e) {
      // ignore
    }
  }

  /**
   * 设置语速
   * @param {number} rate - 0.1 ~ 10，默认 1
   */
  setRate(rate) {
    this.rate = Math.max(0.1, Math.min(10, rate))
  }

  /**
   * 设置音调
   * @param {number} pitch - 0 ~ 2，默认 1
   */
  setPitch(pitch) {
    this.pitch = Math.max(0, Math.min(2, pitch))
  }

  /**
   * 设置音量
   * @param {number} volume - 0 ~ 1，默认 1
   */
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume))
  }

  /**
   * 切换启用/禁用
   */
  toggleEnabled() {
    this.enabled = !this.enabled
    if (!this.enabled && this.isSpeaking) {
      this.stop()
    }
    return this.enabled
  }

  /**
   * 是否正在朗读
   */
  getIsSpeaking() {
    return this.isSpeaking
  }

  /**
   * 是否支持
   */
  isSupported() {
    return this.supported
  }

  /**
   * 获取可用语音列表
   */
  getVoices() {
    if (!this.supported) return []
    return window.speechSynthesis.getVoices() || []
  }

  /**
   * 手动设置语音
   */
  setVoice(voice) {
    this.selectedVoice = voice
  }

  /**
   * 重新扫描并选择最佳中文语音
   */
  refreshVoice() {
    this.selectBestChineseVoice()
  }

  /**
   * 销毁
   */
  destroy() {
    this.stop()
    this.onStart = null
    this.onEnd = null
    this.onError = null
  }
}

// 单例
let ttsInstance = null

export function getTextToSpeechInstance(options = {}) {
  if (!ttsInstance) {
    ttsInstance = new TextToSpeechService(options)
  }
  return ttsInstance
}

export default TextToSpeechService
