/**
 * SpeechRecognitionService - 语音识别服务
 *
 * 使用浏览器内置 Web Speech API 实现语音识别
 * 支持开始录音、停止录音、结果回调
 * https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
 */

class SpeechRecognitionService {
  constructor(options = {}) {
    this.enabled = true
    this.lang = options.lang || 'zh-CN'
    this.continuous = options.continuous || false // 单次识别
    this.interimResults = options.interimResults || false // 不返回中间结果

    this.recognition = null
    this.isListening = false
    this.onResult = options.onResult || null
    this.onStart = options.onStart || null
    this.onEnd = options.onEnd || null
    this.onError = options.onError || null

    // 检查浏览器支持
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    this.supported = !!SpeechRecognition

    if (!this.supported) {
      console.warn('[ASR] Speech Recognition not supported in this browser')
      this.enabled = false
      return
    }

    // 创建识别器
    this.recognition = new SpeechRecognition()
    this.recognition.lang = this.lang
    this.recognition.continuous = this.continuous
    this.recognition.interimResults = this.interimResults

    // 绑定事件
    this.recognition.onresult = (event) => {
      const transcript = this.processResult(event)
      if (transcript && this.onResult) {
        this.onResult(transcript)
      }
    }

    this.recognition.onstart = () => {
      this.isListening = true
      if (this.onStart) {
        this.onStart()
      }
      console.log('[ASR] Started listening')
    }

    this.recognition.onend = () => {
      this.isListening = false
      if (this.onEnd) {
        this.onEnd()
      }
      console.log('[ASR] Stopped listening')
    }

    this.recognition.onerror = (event) => {
      this.isListening = false
      console.error('[ASR] Error:', event.error)
      if (this.onError) {
        this.onError(event.error)
      }
    }
  }

  /**
   * 处理识别结果
   */
  processResult(event) {
    let transcript = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript
    }
    transcript = transcript.trim()
    console.log('[ASR] Recognized:', transcript)
    return transcript
  }

  /**
   * 开始录音识别
   * @returns {boolean} 是否成功开始
   */
  start() {
    if (!this.enabled || !this.supported || !this.recognition) {
      console.warn('[ASR] ASR not enabled or supported')
      return false
    }

    if (this.isListening) {
      this.stop()
    }

    try {
      this.recognition.start()
      return true
    } catch (error) {
      console.error('[ASR] Failed to start recognition:', error)
      this.isListening = false
      if (this.onError) {
        this.onError(error)
      }
      return false
    }
  }

  /**
   * 停止录音识别
   */
  stop() {
    if (!this.recognition || !this.isListening) {
      return
    }

    try {
      this.recognition.stop()
    } catch (e) {
      // ignore
      this.isListening = false
    }
  }

  /**
   * 中止识别
   */
  abort() {
    if (!this.recognition) {
      return
    }

    try {
      this.recognition.abort()
    } catch (e) {
      // ignore
    }
    this.isListening = false
  }

  /**
   * 设置语言
   */
  setLang(lang) {
    this.lang = lang
    if (this.recognition) {
      this.recognition.lang = lang
    }
  }

  /**
   * 是否正在 listening
   */
  getIsListening() {
    return this.isListening
  }

  /**
   * 是否支持
   */
  isSupported() {
    return this.supported
  }

  /**
   * 切换启用/禁用
   */
  toggleEnabled() {
    this.enabled = !this.enabled
    if (!this.enabled && this.isListening) {
      this.stop()
    }
    return this.enabled
  }

  /**
   * 销毁
   */
  destroy() {
    this.stop()
    this.recognition = null
    this.onResult = null
    this.onStart = null
    this.onEnd = null
    this.onError = null
  }
}

// 单例
let asrInstance = null

export function getSpeechRecognitionInstance(options = {}) {
  if (!asrInstance) {
    asrInstance = new SpeechRecognitionService(options)
  }
  return asrInstance
}

export default SpeechRecognitionService
