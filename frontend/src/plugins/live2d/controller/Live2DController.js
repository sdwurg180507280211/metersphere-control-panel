import Live2DStage from '../engine/Live2DStage.js'
import Live2DModelLoader from '../engine/Live2DModelLoader.js'
import Live2DRenderer from '../engine/Live2DRenderer.js'
import LipSyncSystem from '../features/lipSync/LipSyncSystem.js'
import AudioLipSyncSystem from '../features/lipSync/AudioLipSyncSystem.js'
import EyeAnimationSystem from '../features/eyeAnimation/EyeAnimationSystem.js'
import { getTextToSpeechInstance } from '../services/TextToSpeechService.js'
import { getAudioTtsInstance } from '../services/AudioTtsService.js'
import { getSpeechRecognitionInstance } from '../services/SpeechRecognitionService.js'
import { WAIFU_MODELS, DEFAULT_WAIFU_MODEL_ID } from '../config/waifuModels.js'

const AUTO_ACTION_INTERVAL_MIN = 10000 // 最小间隔 10s
const AUTO_ACTION_INTERVAL_MAX = 18000 // 最大间隔 18s

class Live2DController {
  constructor() {
    this.stage = new Live2DStage()
    this.loader = new Live2DModelLoader()
    this.renderer = null
    this.currentModel = null
    this.currentModelId = null
    this.isInitialized = false
    this.availableMotions = []
    this.availableExpressions = []
    this.nonIdleActionTimerId = null // setTimeout id，非 setInterval

    // 眼部动画（自动眨眼 + 空闲视线扫视）
    this.eyeAnim = null

    // 语音和嘴型同步
    this.lipSync = null
    this.tts = null
    this.asr = null
    this.isSpeaking = false
    this.isListening = false
    this.animationFrameId = null
    this.currentSpeechText = '' // 当前正在朗读的文字

    // ASR 结果回调
    this.onASRResult = null
  }

  async init(container) {
    if (this.isInitialized) return

    console.log('[Live2D] Initializing...', container)
    try {
      await this.stage.create(container)
      console.log('[Live2D] Stage created')

      this.renderer = new Live2DRenderer(this.stage)
      console.log('[Live2D] Renderer created')

      await this.loadModel(DEFAULT_WAIFU_MODEL_ID)
      console.log('[Live2D] Model loaded successfully')

      // 设置交互
      this.setupInteraction()
      console.log('[Live2D] Interaction setup complete')

      // 启动眼部动画系统（自动眨眼 + 空闲视线扫视）
      this.initEyeAnimation()

      // 启动每10秒播放非待机动作的定时器
      this.startNonIdleActionTimer()

      this.isInitialized = true
    } catch (error) {
      console.error('[Live2D] Initialization failed:', error)
      this.destroy()
      throw error
    }
  }

  async loadModel(modelId) {
    const modelConfig = WAIFU_MODELS[modelId]
    if (!modelConfig) {
      throw new Error(`Model ${modelId} not found`)
    }

    console.log('[Live2D] Loading model:', modelId, modelConfig)

    if (this.currentModel) {
      this.renderer.detach(this.currentModel)
      this.loader.destroy(this.currentModel)
    }

    const model = await this.loader.load(modelId, modelConfig)
    this.currentModel = model
    this.currentModelId = modelId

    console.log('[Live2D] Model loaded, attaching to stage...')
    this.renderer.attach(model)

    // 计算画布缩放因子：模型坐标和缩放值基于 800x800 设计画布调校，
    // 实际画布可能不同，需要用容器 CSS 尺寸等比缩放。不要使用 renderer.width，
    // 它在 HiDPI 屏幕上是物理像素，会导致重启后比例被 devicePixelRatio 放大。
    const designSize = 800
    const logicalWidth = this.stage.container?.clientWidth || designSize
    this.canvasScaleFactor = logicalWidth / designSize

    this.renderer.setLayout({
      x: modelConfig.position.x * this.canvasScaleFactor,
      y: modelConfig.position.y * this.canvasScaleFactor,
      scale: modelConfig.scale * this.canvasScaleFactor,
      visible: true
    })
    console.log('[Live2D] Model attached and layout set:', {
      x: model.x,
      y: model.y,
      scale: model.scale.x,
      visible: model.visible,
      anchor: { x: model.anchor.x, y: model.anchor.y },
      canvasScaleFactor: this.canvasScaleFactor
    })

    // 分析模型可用的动作和表情
    this.analyzeModel()

    // 重新挂载眼部动画到新模型
    this.initEyeAnimation()

    // 设置交互
    this.setupInteraction()
  }

  async reloadModel() {
    if (this.currentModelId) {
      await this.loadModel(this.currentModelId)
    }
  }

  /**
   * 播放指定动作
   * @param {string} group - 动作组名 (如 'Idle', 'TapBody')
   * @param {number} index - 动作索引，默认为 0
   */
  playMotion(group, index = 0) {
    if (!this.currentModel) {
      console.warn('[Live2D] Model not loaded')
      return false
    }

    try {
      console.log('[Live2D] Playing motion:', group, index)
      this.currentModel.motion(group, index)
      return true
    } catch (error) {
      console.error('[Live2D] Failed to play motion:', error)
      return false
    }
  }

  /**
   * 播放随机动作
   * @param {string[]} excludeGroups - 排除的动作组
   */
  playRandomMotion(excludeGroups = []) {
    if (!this.currentModel || this.availableMotions.length === 0) {
      // 没有预定义动作时，使用随机参数变化
      this.playRandomParam()
      return
    }

    // 过滤排除的组
    const validMotions = this.availableMotions.filter(
      m => !excludeGroups.includes(m.group)
    )

    if (validMotions.length === 0) {
      console.warn('[Live2D] No valid motions available')
      return
    }

    // 随机选择一个动作
    const randomIndex = Math.floor(Math.random() * validMotions.length)
    const motion = validMotions[randomIndex]
    console.log('[Live2D] Playing random motion:', motion.name)
    this.playMotion(motion.group, motion.index)
  }

  /**
   * 播放点击动作 - 随机播放所有非 Idle 动作
   */
  playTapMotion() {
    if (!this.currentModel) {
      console.warn('[Live2D] Model not loaded')
      return
    }

    // 排除 Idle（待机）动作，随机播放所有其它动作
    // 包括 TapBody、FlickHead、Custom 等所有自定义动作都能被触发
    const nonIdleMotions = this.availableMotions.filter(m => m.group !== 'Idle')

    if (nonIdleMotions.length > 0) {
      // 随机选择一个动作
      const randomIndex = Math.floor(Math.random() * nonIdleMotions.length)
      const motion = nonIdleMotions[randomIndex]
      console.log('[Live2D] Playing random non-Idle motion:', motion.group, motion.name)
      this.playMotion(motion.group, motion.index)
      return
    }

    // 如果只有 Idle 动作，尝试播放随机 Idle
    const idleMotions = this.availableMotions.filter(m => m.group === 'Idle')
    if (idleMotions.length > 0) {
      const randomIdle = idleMotions[Math.floor(Math.random() * idleMotions.length)]
      this.playMotion(randomIdle.group, randomIdle.index)
    } else {
      // 最后降级方案：随机参数变化
      this.playRandomParam()
    }
  }

  /**
   * 播放随机参数变化（仅用于没有动作文件的模型的降级方案）
   * 只操作头部角度参数，不触碰眼部（由 EyeAnimationSystem 管理）和嘴部（由 LipSyncSystem 管理）
   */
  playRandomParam() {
    if (!this.currentModel?.internalModel?.coreModel) {
      console.warn('[Live2D] Cannot play random param')
      return
    }

    const coreModel = this.currentModel.internalModel.coreModel

    // 只操作头部角度，避免与 EyeAnimationSystem 和 LipSyncSystem 冲突
    const angleParams = ['ParamAngleX', 'ParamAngleY', 'ParamAngleZ']
    const savedValues = {}

    angleParams.forEach(paramId => {
      try {
        savedValues[paramId] = coreModel.getParameterValueById(paramId)
        coreModel.setParameterValueById(paramId, (Math.random() - 0.5) * 0.6)
      } catch (e) { /* 参数不存在，忽略 */ }
    })

    // 2 秒后恢复
    setTimeout(() => {
      if (this.currentModel?.internalModel?.coreModel) {
        const cm = this.currentModel.internalModel.coreModel
        angleParams.forEach(paramId => {
          try {
            cm.setParameterValueById(paramId, savedValues[paramId] ?? 0)
          } catch (e) {}
        })
      }
    }, 2000)

    console.log('[Live2D] Played random params (angle only)')
  }

  /**
   * 设置表情
   * @param {string} name - 表情名称
   */
  setExpression(name) {
    if (!this.currentModel) {
      console.warn('[Live2D] Model not loaded')
      return false
    }

    try {
      console.log('[Live2D] Setting expression:', name)
      this.currentModel.expression(name)
      return true
    } catch (error) {
      console.error('[Live2D] Failed to set expression:', error)
      return false
    }
  }

  /**
   * 设置交互事件监听
   */
  setupInteraction() {
    if (!this.currentModel) {
      console.warn('[Live2D] Cannot setup interaction: model not loaded')
      return
    }

    const model = this.currentModel

    // 启用交互
    model.interactive = true

    // 移除旧监听器再添加新的 - 避免切换模型后重复绑定
    model.off('pointerdown')
    // 点击事件
    model.on('pointerdown', () => {
      console.log('[Live2D] Model clicked!')
      this.playTapMotion()
    })

    console.log('[Live2D] Interaction setup: click listener attached')
  }

  /**
   * 分析模型可用的动作和表情
   */
  analyzeModel() {
    if (!this.currentModel?.internalModel) {
      console.warn('[Live2D] Cannot analyze model: not loaded')
      return
    }

    const internalModel = this.currentModel.internalModel

    // 分析动作
    this.availableMotions = []
    const motionManager = internalModel.motionManager
    if (motionManager?.definitions) {
      for (const [group, groupMotions] of Object.entries(motionManager.definitions)) {
        if (groupMotions && Array.isArray(groupMotions)) {
          groupMotions.forEach((motion, index) => {
            const motionName = motion.Name || motion.name ||
              (motion.File || motion.file || '').replace('.motion3.json', '').replace('.mtn', '')
            this.availableMotions.push({
              group,
              index,
              name: motionName
            })
          })
        }
      }
    }

    // 分析表情
    this.availableExpressions = []
    const expressions = internalModel.settings?.expressions
    if (expressions && Array.isArray(expressions)) {
      expressions.forEach((expr, index) => {
        const exprName = expr.Name || expr.name ||
          (expr.File || expr.file || '').replace('.exp.json', '').replace('.exp3.json', '')
        this.availableExpressions.push({
          index,
          name: exprName,
          file: expr.File || expr.file
        })
      })
    }

    console.log('[Live2D] Model analyzed:', {
      motions: this.availableMotions.length,
      expressions: this.availableExpressions.length
    })

    return {
      motions: this.availableMotions,
      expressions: this.availableExpressions
    }
  }

  show() {
    this.renderer?.setVisible(true)
  }

  hide() {
    this.renderer?.setVisible(false)
  }

  destroy() {
    // 清理眼部动画
    if (this.eyeAnim) {
      this.eyeAnim.detach()
      this.eyeAnim = null
    }

    // 清理语音
    this.stopSpeaking()
    this.stopListening()
    if (this.audioLipSync) {
      this.audioLipSync.destroy()
      this.audioLipSync = null
    }
    if (this.lipSync) {
      this.lipSync.destroy()
      this.lipSync = null
    }
    if (this.audioTts) {
      this.audioTts.destroy()
      this.audioTts = null
    }
    if (this.tts) {
      this.tts.destroy()
      this.tts = null
    }
    if (this.asr) {
      this.asr.destroy()
      this.asr = null
    }
    this.stopLipSyncTick()

    // 清理定时器
    this.stopNonIdleActionTimer()

    if (this.currentModel) {
      this.renderer?.detach(this.currentModel)
      this.loader.destroy(this.currentModel)
      this.currentModel = null
    }
    this.stage.destroy()
    this.renderer = null
    this.isInitialized = false
  }

  /**
   * 启动随机间隔的非待机动作播放
   * 每次播完后随机等待 10~18s 再播下一个，比固定间隔更自然
   */
  startNonIdleActionTimer() {
    if (this.nonIdleActionTimerId) return

    console.log(`[Live2D] Starting auto-action timer (${AUTO_ACTION_INTERVAL_MIN / 1000}-${AUTO_ACTION_INTERVAL_MAX / 1000}s random intervals)`)
    this.nonIdleActionTimerId = setTimeout(() => {
      this.playRandomActionOrExpression()
      // 播完后安排下一次，不在此处直接调用而是让 startNonIdleActionTimer 的递归版本处理
      this.scheduleNextAutoAction()
    }, 15000) // 首次动作在 15s 后，不立即触发
  }

  /**
   * 安排下一次自动动作
   */
  scheduleNextAutoAction() {
    if (!this.isInitialized) return
    const delay = AUTO_ACTION_INTERVAL_MIN + Math.random() * (AUTO_ACTION_INTERVAL_MAX - AUTO_ACTION_INTERVAL_MIN)
    this.nonIdleActionTimerId = setTimeout(() => {
      this.playRandomActionOrExpression()
      this.scheduleNextAutoAction()
    }, delay)
  }

  /**
   * 随机播放动作或表情
   * 50% 概率播放非待机动作，50% 概率播放随机表情
   */
  playRandomActionOrExpression() {
    const hasMotions = this.availableMotions.length > 0
    const hasExpressions = this.availableExpressions.length > 0

    // 如果没有动作和表情，什么都不做
    if (!hasMotions && !hasExpressions) {
      console.log('[Live2D] No motions or expressions available')
      return
    }

    // 如果没有表情，只播放动作
    if (!hasExpressions) {
      this.playTapMotion()
      return
    }

    // 如果没有动作，只播放表情
    if (!hasMotions) {
      this.playRandomExpression()
      return
    }

    // 随机决定播放动作还是表情 (50% 概率)
    if (Math.random() < 0.5) {
      this.playTapMotion()
    } else {
      this.playRandomExpression()
    }
  }

  /**
   * 随机播放一个表情
   */
  playRandomExpression() {
    if (!this.currentModel || this.availableExpressions.length === 0) {
      console.warn('[Live2D] No expressions available')
      return
    }

    const randomIndex = Math.floor(Math.random() * this.availableExpressions.length)
    const expression = this.availableExpressions[randomIndex]
    console.log('[Live2D] Playing random expression:', expression.name)
    this.setExpression(expression.name)
  }

  /**
   * 停止自动动作定时器
   */
  stopNonIdleActionTimer() {
    if (this.nonIdleActionTimerId) {
      clearTimeout(this.nonIdleActionTimerId)
      this.nonIdleActionTimerId = null
      console.log('[Live2D] Stopped auto-action timer')
    }
  }

  // ========== 眼部动画系统（自动眨眼 + 空闲视线扫视）==========

  /**
   * 初始化眼部动画系统
   * 在模型加载后调用，也可在切换模型后重新调用
   */
  initEyeAnimation() {
    if (!this.currentModel) return

    // 清理旧实例
    if (this.eyeAnim) {
      this.eyeAnim.detach()
      this.eyeAnim = null
    }

    this.eyeAnim = new EyeAnimationSystem()
    this.eyeAnim.attach(this.currentModel)

    // 如果模型有内置 Cubism 眨眼，自定义其参数使其更生动
    if (this.eyeAnim.hasBuiltInBlink) {
      this.eyeAnim.customizeBuiltInBlink({
        interval: 3.5,
        closing: 0.15,
        closed: 0.06,
        opening: 0.15
      })
    }
  }

  // ========== 语音和嘴型同步 API ==========

  /**
   * 初始化语音系统
   * 可以在 init 后调用，也可以按需延迟初始化
   */
  initVoice() {
    // ---- 音频驱动唇形同步（优先） ----
    this.audioLipSync = new AudioLipSyncSystem()

    // ---- 音频 TTS（基于服务端音频，可被 AnalyserNode 分析） ----
    this.audioTts = getAudioTtsInstance({
      voice: 'longxiaochun_v2',
      onStart: () => {
        // 连接 AnalyserNode 到唇形系统
        const analyser = this.audioTts.getAnalyserNode()
        if (analyser) this.audioLipSync.attach(analyser)
        this.audioLipSync.start()
        this.startSpeakingInternal()
      },
      onEnd: () => {
        this.audioLipSync.stop()
        this.stopSpeakingInternal()
      },
      onError: () => {
        this.audioLipSync.stop()
        this.stopSpeakingInternal()
      }
    })

    // ---- 文字驱动唇形同步（降级，用于 SpeechSynthesis 回退） ----
    this.lipSync = new LipSyncSystem(null)

    // ---- 浏览器 TTS（降级） ----
    this.tts = getTextToSpeechInstance({
      lang: 'zh-CN',
      rate: 0.9,
      pitch: 1.1,
      onStart: () => {
        this.lipSync.start(this.currentSpeechText, 'text')
        this.startSpeakingInternal()
      },
      onEnd: () => {
        this.stopSpeakingInternal()
      },
      onError: () => {
        this.stopSpeakingInternal()
      }
    })

    // 初始化 ASR（语音识别）
    this.asr = getSpeechRecognitionInstance({
      lang: 'zh-CN',
      continuous: false,
      interimResults: false,
      onResult: (transcript) => {
        if (this.onASRResult && transcript) {
          this.onASRResult(transcript)
        }
      },
      onStart: () => {
        this.isListening = true
      },
      onEnd: () => {
        this.isListening = false
      },
      onError: (error) => {
        this.isListening = false
        console.error('[ASR]', error)
      }
    })

    console.log('[Live2D] Voice system initialized (TTS + ASR)')
  }

  /**
   * 朗读文字并驱动嘴型
   * 优先使用音频 TTS（服务端音频 → AnalyserNode → RMS 音量驱动口型）
   * 降级使用浏览器 SpeechSynthesis + 文字驱动口型
   * @param {string} text - 要朗读的文字
   * @returns {Promise<boolean>} 是否成功开始
   */
  async speak(text) {
    if (!this.audioTts) {
      this.initVoice()
    }

    if (!text || text.trim().length === 0) {
      return false
    }

    // 停止之前的朗读
    this.stopSpeaking()

    this.currentSpeechText = text.trim()

    // 优先使用音频 TTS（真实音频波形驱动嘴型）
    if (this.audioTts && this.audioTts.isSupported()) {
      try {
        const success = await this.audioTts.speak(this.currentSpeechText)
        if (success) return true
      } catch (e) {
        console.warn('[Live2D] Audio TTS failed, falling back to SpeechSynthesis:', e.message)
      }
    }

    // 降级：浏览器 SpeechSynthesis + 文字驱动嘴型
    if (this.tts && this.tts.isSupported()) {
      const success = this.tts.speak(this.currentSpeechText)
      if (success) return true
    }

    console.warn('[Live2D] No TTS engine available')
    return false
  }

  /**
   * 停止当前朗读
   */
  stopSpeaking() {
    if (this.audioTts) {
      this.audioTts.stop()
    }
    if (this.tts) {
      this.tts.stop()
    }
    this.stopSpeakingInternal()
  }

  /**
   * 内部：开始说话，启动嘴型同步
   */
  startSpeakingInternal() {
    if (!this.currentModel) return

    this.isSpeaking = true

    // 启动统一的动画循环，在 tick 中根据激活的唇形系统选择数据源
    this.startLipSyncTick()
    console.log('[Live2D] Speaking started')
  }

  /**
   * 内部：停止说话，停止嘴型同步
   */
  stopSpeakingInternal() {
    this.isSpeaking = false

    if (this.audioLipSync) {
      this.audioLipSync.stop()
    }
    if (this.lipSync) {
      this.lipSync.stop()
    }

    this.currentSpeechText = ''
    this.stopLipSyncTick()
    console.log('[Live2D] Speaking stopped')
  }

  /**
   * 启动嘴型同步动画循环
   */
  startLipSyncTick() {
    if (this.animationFrameId) {
      return
    }

    let lastTime = performance.now()
    const tick = (currentTime) => {
      const delta = currentTime - lastTime
      lastTime = currentTime

      if (this.lipSync && this.isSpeaking) {
        this.tickLipSync(delta)
      }

      if (this.isSpeaking) {
        this.animationFrameId = requestAnimationFrame(tick)
      }
    }

    this.animationFrameId = requestAnimationFrame(tick)
  }

  /**
   * 停止嘴型同步动画循环
   */
  stopLipSyncTick() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
  }

  /**
   * 嘴型同步 tick - 更新嘴型参数
   * 优先从音频唇形系统（AnalyserNode RMS）读取，降级到文字驱动
   */
  tickLipSync(delta) {
    const coreModel = this.currentModel?.internalModel?.coreModel
    if (!coreModel) return

    let mouthOpen = 0

    // 优先使用音频驱动的唇形数据（与实际声波同步）
    if (this.audioLipSync?.isActive()) {
      this.audioLipSync.tick(delta)
      mouthOpen = this.audioLipSync.currentMouthOpen
    } else if (this.lipSync?.isActive()) {
      // 降级：文字驱动
      this.lipSync.tick(delta)
      mouthOpen = this.lipSync.currentMouthOpen
    }

    if (typeof mouthOpen !== 'number' || mouthOpen === 0) {
      // 如果两个系统都没有活跃输出，逐渐闭嘴
      return
    }

    try {
      coreModel.setParameterValueById('ParamMouthOpenY', mouthOpen)
      coreModel.setParameterValueById('ParamMouthForm', Math.round(mouthOpen * 2) - 1)
    } catch (e) {
      // 参数不存在，忽略
    }
  }

  /**
   * 仅驱动嘴型（不使用 TTS），用于外部语音播放场景
   * 与上面的 speak() 区别：speak() 会调用浏览器 TTS 朗读，本方法只驱动嘴型
   */
  startLipSyncOnly(text = '') {
    if (!this.lipSync) {
      this.initVoice()
    }
    this.currentSpeechText = text
    this.startSpeakingInternal()
  }

  /**
   * 是否正在说话
   */
  getIsSpeaking() {
    return this.isSpeaking
  }

  /**
   * 切换 TTS 启用/禁用
   */
  toggleTtsEnabled() {
    if (!this.tts) {
      this.initVoice()
    }
    const enabled = this.tts.toggleEnabled()
    if (!enabled && this.isSpeaking) {
      this.stopSpeaking()
    }
    return enabled
  }

  /**
   * 获取 TTS 启用状态
   */
  getTtsEnabled() {
    return this.tts?.enabled ?? false
  }

  /**
   * 设置 TTS 语速
   */
  setTtsRate(rate) {
    if (this.tts) {
      this.tts.setRate(rate)
    }
  }

  /**
   * 检查浏览器是否支持 TTS
   */
  isTtsSupported() {
    return 'speechSynthesis' in window
  }

  // ========== 语音识别 (ASR) API ==========

  /**
   * 开始语音识别
   * @param {function(string)} onResult - 识别结果回调
   * @returns {boolean} 是否成功开始
   */
  startListening(onResult) {
    if (!this.asr) {
      this.initVoice()
    }

    if (!this.asr.isSupported()) {
      console.warn('[Live2D] ASR not supported by browser')
      return false
    }

    this.onASRResult = onResult
    return this.asr.start()
  }

  /**
   * 停止语音识别
   */
  stopListening() {
    if (this.asr) {
      this.asr.stop()
    }
    this.isListening = false
  }

  /**
   * 是否正在录音
   */
  getIsListening() {
    return this.isListening
  }

  /**
   * 检查浏览器是否支持 ASR
   */
  isAsrSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  }

  /**
   * 设置 ASR 语言
   */
  setAsrLang(lang) {
    if (this.asr) {
      this.asr.setLang(lang)
    }
  }
}

export default Live2DController
