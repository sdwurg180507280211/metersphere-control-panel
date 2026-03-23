import Live2DStage from '../engine/Live2DStage.js'
import Live2DModelLoader from '../engine/Live2DModelLoader.js'
import Live2DRenderer from '../engine/Live2DRenderer.js'
import { WAIFU_MODELS, DEFAULT_WAIFU_MODEL_ID } from '../config/waifuModels.js'

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
    this.renderer.setLayout({
      x: modelConfig.position.x,
      y: modelConfig.position.y,
      scale: modelConfig.scale,
      visible: true
    })
    console.log('[Live2D] Model attached and layout set:', {
      x: model.x,
      y: model.y,
      scale: model.scale.x,
      visible: model.visible,
      anchor: { x: model.anchor.x, y: model.anchor.y }
    })

    // 分析模型可用的动作和表情
    this.analyzeModel()
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
   * 播放点击动作（tap_body）
   */
  playTapMotion() {
    if (!this.currentModel) {
      console.warn('[Live2D] Model not loaded')
      return
    }

    // 优先查找 TapBody 动作组
    const tapBodyMotions = this.availableMotions.filter(m => m.group === 'TapBody')

    if (tapBodyMotions.length > 0) {
      // 随机选择一个 TapBody 动作
      const randomIndex = Math.floor(Math.random() * tapBodyMotions.length)
      const motion = tapBodyMotions[randomIndex]
      console.log('[Live2D] Playing TapBody:', motion.name)
      this.playMotion(motion.group, motion.index)
      return
    }

    // 如果没有 TapBody 动作，尝试播放随机 Idle 动作
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
   * 播放随机参数（用于没有动作文件的模型）
   */
  playRandomParam() {
    if (!this.currentModel?.internalModel?.coreModel) {
      console.warn('[Live2D] Cannot play random param')
      return
    }

    const internalModel = this.currentModel.internalModel
    const coreModel = internalModel.coreModel

    // 随机设置一些参数
    const paramIds = [
      'ParamAngleX', 'ParamAngleY', 'ParamAngleZ',
      'ParamEyeLOpen', 'ParamEyeROpen',
      'ParamMouthOpenY', 'ParamMouthForm'
    ]

    paramIds.forEach(paramId => {
      const paramValue = Math.random() * 2 - 1 // -1 to 1
      try {
        coreModel.setParameterValueById(paramId, paramValue)
      } catch (e) {
        // 参数不存在，忽略
      }
    })

    // 2 秒后恢复
    setTimeout(() => {
      if (this.currentModel?.internalModel?.coreModel) {
        paramIds.forEach(paramId => {
          try {
            this.currentModel.internalModel.coreModel.setParameterValueById(paramId, 0)
          } catch (e) {}
        })
      }
    }, 2000)

    console.log('[Live2D] Played random params')
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
    if (this.currentModel) {
      this.renderer?.detach(this.currentModel)
      this.loader.destroy(this.currentModel)
      this.currentModel = null
    }
    this.stage.destroy()
    this.renderer = null
    this.isInitialized = false
  }
}

export default Live2DController
