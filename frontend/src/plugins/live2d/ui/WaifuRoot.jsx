import { useEffect, useRef } from 'react'
import Live2DController from '../controller/Live2DController'
import { WAIFU_MODELS, DEFAULT_WAIFU_MODEL_ID } from '../config/waifuModels.js'
import '../waifu.css'

const WaifuRoot = () => {
  const containerRef = useRef(null)
  const controllerRef = useRef(null)
  const instanceIdRef = useRef(Math.random().toString(36).slice(2, 11))
  const dragStateRef = useRef({
    isDragging: false,
    isResizing: false,
    resizeHandle: null,
    startX: 0,
    startY: 0,
    startContainerWidth: 0,
    startContainerHeight: 0,
    startModelScale: 0,
    startModelX: 0,
    startModelY: 0,
    startLeft: 0,
    startTop: 0
  })
  const currentModelConfigRef = useRef(null)
  const currentScaleRef = useRef(1)

  const STORAGE_KEY = 'waifu-container-state'
  const STORAGE_VERSION = 2

  const saveContainerState = (width, height, left, top, scale) => {
    const state = {
      version: STORAGE_VERSION,
      width,
      height,
      left,
      top,
      scale,
      timestamp: Date.now()
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch (e) {
      console.warn('[Waifu] Failed to save state:', e)
    }
  }

  const loadContainerState = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const state = JSON.parse(saved)
        if (state.version !== STORAGE_VERSION) {
          localStorage.removeItem(STORAGE_KEY)
          return null
        }
        return state
      }
    } catch (e) {
      console.warn('[Waifu] Failed to load state:', e)
    }
    return null
  }

  useEffect(() => {
    const instanceId = instanceIdRef.current

    // 创建固定在 body 上的容器 - 800x800 初始在右下角
    const div = document.createElement('div')
    div.setAttribute('data-live2d-canvas', 'true')
    div.setAttribute('data-instance-id', instanceId)
    div.style.position = 'fixed'
    div.style.zIndex = '9999'
    div.style.pointerEvents = 'auto' // 整个容器接收鼠标事件以便拖拽
    div.style.cursor = 'move'

    // 尝试加载保存的状态
    const defaultSize = Math.min(800, window.innerHeight - 40, window.innerWidth - 40)
    const savedState = loadContainerState()
    if (savedState) {
      // 边界检查：确保容器至少部分在可视区域内
      const sw = window.innerWidth
      const sh = window.innerHeight
      const w = Math.min(savedState.width || defaultSize, sw - 40)
      const h = Math.min(savedState.height || defaultSize, sh - 40)
      const left = Math.min(savedState.left, sw - 100) // 至少 100px 可见
      const top = Math.min(savedState.top, sh - 100)

      div.style.width = w + 'px'
      div.style.height = h + 'px'
      div.style.left = Math.max(0, left) + 'px'
      div.style.top = Math.max(0, top) + 'px'
      div.style.right = 'auto'
      div.style.bottom = 'auto'
      currentScaleRef.current = savedState.scale || 1
    } else {
      // 默认状态：右下角，尺寸不超过视口，避免重启后顶部被裁切
      div.style.right = '20px'
      div.style.bottom = '20px'
      div.style.width = defaultSize + 'px'
      div.style.height = defaultSize + 'px'
      currentScaleRef.current = 1
    }

    document.body.appendChild(div)
    containerRef.current = div

    // 创建全屏拖拽捕获层（透明，用于捕获拖拽事件）
    const dragLayer = document.createElement('div')
    dragLayer.style.position = 'absolute'
    dragLayer.style.top = '0'
    dragLayer.style.left = '0'
    dragLayer.style.right = '0'
    dragLayer.style.bottom = '0'
    dragLayer.style.cursor = 'move'
    dragLayer.style.pointerEvents = 'auto'
    dragLayer.style.zIndex = '9998'
    dragLayer.style.background = 'transparent'
    dragLayer.title = '拖拽移动看板娘'
    div.appendChild(dragLayer)

    // 创建缩放手柄（四个角）
    const createResizeHandle = (position, cursor) => {
      const handle = document.createElement('div')
      handle.style.position = 'absolute'
      handle.style.width = '28px'
      handle.style.height = '28px'
      handle.style.cursor = cursor
      handle.style.pointerEvents = 'auto'
      handle.style.zIndex = '10000'

      // 更明显的视觉提示
      handle.style.backgroundColor = 'rgba(100, 150, 255, 0.03)'
      handle.style.borderRadius = '50%'
      handle.style.border = '1px solid rgba(100, 150, 255, 0.08)'
      handle.style.boxShadow = '0 0 8px rgba(100, 150, 255, 0.5)'
      handle.style.transition = 'all 0.2s ease'

      // 悬停时更明显
      handle.addEventListener('mouseenter', () => {
        handle.style.backgroundColor = 'rgba(100, 150, 255, 0.6)'
        handle.style.transform = 'scale(1.2)'
      })
      handle.addEventListener('mouseleave', () => {
        handle.style.backgroundColor = 'rgba(100, 150, 255, 0.03)'
        handle.style.transform = 'scale(1)'
      })

      switch (position) {
        case 'top-left':
          handle.style.top = '-12px'
          handle.style.left = '-12px'
          break
        case 'top-right':
          handle.style.top = '-12px'
          handle.style.right = '-12px'
          break
        case 'bottom-left':
          handle.style.bottom = '-12px'
          handle.style.left = '-12px'
          break
        case 'bottom-right':
          handle.style.bottom = '-12px'
          handle.style.right = '-12px'
          break
      }
      handle.dataset.resizeHandle = position
      div.appendChild(handle)
      return handle
    }

    const handles = [
      createResizeHandle('top-left', 'nwse-resize'),
      createResizeHandle('top-right', 'nesw-resize'),
      createResizeHandle('bottom-left', 'nesw-resize'),
      createResizeHandle('bottom-right', 'nwse-resize')
    ]

    console.log('[Live2D] Canvas container created:', {
      instanceId,
      position: div.style.position,
      bottom: div.style.bottom,
      right: div.style.right
    })

    // 拖拽逻辑 - 在整个容器上触发
    const onDragStart = (e) => {
      // 如果点击的是缩放手柄，不触发拖拽（让缩放优先）
      if (e.target.dataset.resizeHandle) {
        return
      }
      const state = dragStateRef.current
      state.isDragging = true
      state.startX = e.clientX
      state.startY = e.clientY

      const rect = div.getBoundingClientRect()
      state.startLeft = rect.left
      state.startTop = rect.top

      // 移除 right/bottom，改用 left/top 定位
      div.style.right = 'auto'
      div.style.bottom = 'auto'
      div.style.left = rect.left + 'px'
      div.style.top = rect.top + 'px'

      document.addEventListener('mousemove', onDragMove)
      document.addEventListener('mouseup', onDragEnd)
    }

    const onDragMove = (e) => {
      const state = dragStateRef.current
      if (!state.isDragging || state.isResizing) return

      const dx = e.clientX - state.startX
      const dy = e.clientY - state.startY

      div.style.left = (state.startLeft + dx) + 'px'
      div.style.top = (state.startTop + dy) + 'px'
    }

    const onDragEnd = () => {
      const state = dragStateRef.current
      if (!state.isDragging) return
      state.isDragging = false
      document.removeEventListener('mousemove', onDragMove)
      document.removeEventListener('mouseup', onDragEnd)

      // 保存状态
      const rect = div.getBoundingClientRect()
      saveContainerState(
        rect.width,
        rect.height,
        rect.left,
        rect.top,
        currentScaleRef.current
      )
    }

    // 缩放逻辑 - 同时调整容器和模型 scale
    const onResizeStart = (e) => {
      e.stopPropagation()
      e.preventDefault()
      const state = dragStateRef.current
      state.isResizing = true
      state.resizeHandle = e.target.dataset.resizeHandle
      state.startX = e.clientX
      state.startY = e.clientY

      const rect = div.getBoundingClientRect()
      state.startContainerWidth = rect.width
      state.startContainerHeight = rect.height
      state.startLeft = rect.left
      state.startTop = rect.top

      // 保存当前模型的状态
      if (controllerRef.current && controllerRef.current.currentModel) {
        state.startModelScale = controllerRef.current.currentModel.scale.x
        state.startModelX = controllerRef.current.currentModel.x
        state.startModelY = controllerRef.current.currentModel.y
      }

      // 改用 left/top 定位
      div.style.right = 'auto'
      div.style.bottom = 'auto'
      div.style.left = rect.left + 'px'
      div.style.top = rect.top + 'px'

      document.addEventListener('mousemove', onResizeMove)
      document.addEventListener('mouseup', onResizeEnd)
    }

    const onResizeMove = (e) => {
      const state = dragStateRef.current
      if (!state.isResizing) return

      const dx = e.clientX - state.startX
      const dy = e.clientY - state.startY
      const handle = state.resizeHandle

      let newContainerWidth = state.startContainerWidth
      let newContainerHeight = state.startContainerHeight
      let newLeft = state.startLeft
      let newTop = state.startTop

      // 计算缩放比例
      let scaleChange = 1

      if (handle.includes('right')) {
        newContainerWidth = Math.max(350, state.startContainerWidth + dx)
        scaleChange = newContainerWidth / state.startContainerWidth
      }
      if (handle.includes('left')) {
        newContainerWidth = Math.max(300, state.startContainerWidth - dx)
        scaleChange = newContainerWidth / state.startContainerWidth
        newLeft = state.startLeft + state.startContainerWidth - newContainerWidth
      }
      if (handle.includes('bottom')) {
        newContainerHeight = Math.max(350, state.startContainerHeight + dy)
        if (!handle.includes('left') && !handle.includes('right')) {
          scaleChange = newContainerHeight / state.startContainerHeight
        }
      }
      if (handle.includes('top')) {
        newContainerHeight = Math.max(350, state.startContainerHeight - dy)
        if (!handle.includes('left') && !handle.includes('right')) {
          scaleChange = newContainerHeight / state.startContainerHeight
        }
        newTop = state.startTop + state.startContainerHeight - newContainerHeight
      }

      // 限制最大尺寸
      const maxSize = 1200
      if (newContainerWidth > maxSize) {
        newContainerWidth = maxSize
        scaleChange = newContainerWidth / state.startContainerWidth
      }
      if (newContainerHeight > maxSize) {
        newContainerHeight = maxSize
        if (!handle.includes('left') && !handle.includes('right')) {
          scaleChange = newContainerHeight / state.startContainerHeight
        }
      }

      // 更新容器尺寸和位置
      div.style.width = newContainerWidth + 'px'
      div.style.height = newContainerHeight + 'px'
      div.style.left = newLeft + 'px'
      div.style.top = newTop + 'px'

      // 更新 PIXI 渲染器尺寸
      if (controllerRef.current && controllerRef.current.stage) {
        controllerRef.current.stage.resize(newContainerWidth, newContainerHeight)
        const canvas = div.querySelector('canvas')
        if (canvas) {
          canvas.style.width = newContainerWidth + 'px'
          canvas.style.height = newContainerHeight + 'px'
          canvas.style.pointerEvents = 'none' // canvas 不拦截事件，让拖拽穿透
        }
      }

      // 更新模型 scale 和位置
      if (controllerRef.current && controllerRef.current.currentModel && controllerRef.current.renderer) {
        // 基于缩放开始时的模型状态进行增量修改
        const newModelScale = state.startModelScale * scaleChange
        const newModelX = state.startModelX * scaleChange
        const newModelY = state.startModelY * scaleChange

        controllerRef.current.renderer.setLayout({
          scale: newModelScale,
          x: newModelX,
          y: newModelY
        })

        // 更新 controller 中的 canvasScaleFactor（画布尺寸已变）
        const designSize = 800
        controllerRef.current.canvasScaleFactor = newContainerWidth / designSize

        // 保存当前 scale - 相对于模型配置 × canvasScaleFactor 的总比例
        const modelConfig = currentModelConfigRef.current || WAIFU_MODELS[DEFAULT_WAIFU_MODEL_ID]
        const csf = controllerRef.current.canvasScaleFactor || 1
        currentScaleRef.current = newModelScale / (modelConfig.scale * csf)
      }
    }

    const onResizeEnd = () => {
      const state = dragStateRef.current
      if (!state.isResizing) return
      state.isResizing = false
      document.removeEventListener('mousemove', onResizeMove)
      document.removeEventListener('mouseup', onResizeEnd)

      // 保存状态
      const rect = div.getBoundingClientRect()
      saveContainerState(
        rect.width,
        rect.height,
        rect.left,
        rect.top,
        currentScaleRef.current
      )
    }

    // 绑定事件 - 整个拖拽层监听拖拽
    dragLayer.addEventListener('mousedown', onDragStart)
    div.addEventListener('mousedown', onDragStart)
    handles.forEach(handle => {
      handle.addEventListener('mousedown', onResizeStart)
    })

    // 鼠标滚轮缩放
    const onWheel = (e) => {
      e.preventDefault()
      e.stopPropagation()

      const rect = div.getBoundingClientRect()
      const currentWidth = rect.width
      const currentHeight = rect.height
      const currentLeft = rect.left
      const currentTop = rect.top

      // 计算缩放比例 - 每次滚动缩放 10%
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      const newWidth = Math.max(300, Math.min(1200, currentWidth * delta))
      const newHeight = Math.max(350, Math.min(1200, currentHeight * delta))

      // 保持中心不变进行缩放
      const scaleChange = newWidth / currentWidth
      const widthDiff = newWidth - currentWidth
      const heightDiff = newHeight - currentHeight

      const newLeft = currentLeft - widthDiff / 2
      const newTop = currentTop - heightDiff / 2

      // 更新容器尺寸和位置
      div.style.right = 'auto'
      div.style.bottom = 'auto'
      div.style.width = newWidth + 'px'
      div.style.height = newHeight + 'px'
      div.style.left = newLeft + 'px'
      div.style.top = newTop + 'px'

      // 更新 PIXI 渲染器尺寸
      if (controllerRef.current && controllerRef.current.stage) {
        controllerRef.current.stage.resize(newWidth, newHeight)
        const canvas = div.querySelector('canvas')
        if (canvas) {
          canvas.style.width = newWidth + 'px'
          canvas.style.height = newHeight + 'px'
          canvas.style.pointerEvents = 'none'
        }
      }

      // 更新模型 scale 和位置（基于实际当前值，与拖拽缩放逻辑一致）
      if (controllerRef.current && controllerRef.current.currentModel && controllerRef.current.renderer) {
        const model = controllerRef.current.currentModel
        const startModelScale = model.scale.x
        const startModelX = model.x
        const startModelY = model.y

        const newModelScale = startModelScale * scaleChange
        const newModelX = startModelX * scaleChange
        const newModelY = startModelY * scaleChange

        controllerRef.current.renderer.setLayout({
          scale: newModelScale,
          x: newModelX,
          y: newModelY
        })

        // 更新 canvasScaleFactor（画布尺寸已变）
        const designSize = 800
        controllerRef.current.canvasScaleFactor = newWidth / designSize

        // 更新 currentScaleRef = 当前总scale / (基础scale × canvasScaleFactor)
        const modelConfig = currentModelConfigRef.current || WAIFU_MODELS[DEFAULT_WAIFU_MODEL_ID]
        const csf = controllerRef.current.canvasScaleFactor || 1
        currentScaleRef.current = newModelScale / (modelConfig.scale * csf)
      }

      // 保存状态
      saveContainerState(
        newWidth,
        newHeight,
        newLeft,
        newTop,
        currentScaleRef.current
      )
    }

    // 滚轮事件绑定到容器和拖拽层
    div.addEventListener('wheel', onWheel, { passive: false })
    dragLayer.addEventListener('wheel', onWheel, { passive: false })

    const initController = async () => {
      // 再次检查这个容器是否还属于我们（防止 StrictMode 清理）
      const currentDiv = document.querySelector(`[data-instance-id="${instanceId}"]`)
      if (!currentDiv) {
        console.log('[Live2D] Container already removed, skipping init')
        return
      }

      try {
        const controller = new Live2DController()
        controllerRef.current = controller
        await controller.init(div)

        // 语音系统延迟初始化 - 首次 speak()/startListening() 调用时自动初始化
        // controller.initVoice() 由 speak() 和 startListening() 内部懒加载

        // 保存当前模型配置
        currentModelConfigRef.current = WAIFU_MODELS[DEFAULT_WAIFU_MODEL_ID]

        // 应用保存的 scale（叠加在 canvasScaleFactor 之上）
        if (currentScaleRef.current !== 1 && controller.renderer) {
          const modelConfig = currentModelConfigRef.current
          const csf = controller.canvasScaleFactor || 1

          controller.renderer.setLayout({
            scale: modelConfig.scale * csf * currentScaleRef.current,
            x: modelConfig.position.x * csf * currentScaleRef.current,
            y: modelConfig.position.y * csf * currentScaleRef.current
          })
        }

        // canvas 设置 pointer-events: none 让拖拽穿透
        setTimeout(() => {
          const canvas = div.querySelector('canvas')
          if (canvas) {
            canvas.style.pointerEvents = 'none'
          }
        }, 100)

        // 暴露到全局以便调试
        window.__waifuController = controller

        // 暴露切换模型方法到全局
        window.switchWaifuModel = (modelId) => {
          if (!WAIFU_MODELS[modelId]) {
            console.error(`[Waifu] 模型 "${modelId}" 不存在`)
            console.log('[Waifu] 可用模型:', Object.keys(WAIFU_MODELS))
            return false
          }
          currentModelConfigRef.current = WAIFU_MODELS[modelId]
          return controller.loadModel(modelId)
        }

        // 暴露获取可用模型列表方法
        window.getWaifuModels = () => {
          return Object.values(WAIFU_MODELS).map(m => ({ id: m.id, name: m.name }))
        }

        console.log('[Live2D] Controller initialized:', {
          instanceId,
          controller,
          stage: controller.stage,
          app: controller.stage?.getApp?.(),
          renderer: controller.renderer,
          currentModel: controller.currentModel,
          modelX: controller.currentModel?.x,
          modelY: controller.currentModel?.y,
          modelScale: controller.currentModel?.scale?.x,
          modelVisible: controller.currentModel?.visible
        })

        console.log('[Waifu] 使用方式:')
        console.log('  - switchWaifuModel("rice") - 切换到指定模型')
        console.log('  - getWaifuModels() - 获取可用模型列表')
        console.log('  - 可用模型 ID:', Object.keys(WAIFU_MODELS).join(', '))
      } catch (error) {
        console.error('Failed to initialize Live2D:', error)
      }
    }

    initController()

    return () => {
      console.log('[Live2D] Cleaning up instance:', instanceId)

      // 移除事件监听器
      document.removeEventListener('mousemove', onDragMove)
      document.removeEventListener('mouseup', onDragEnd)
      document.removeEventListener('mousemove', onResizeMove)
      document.removeEventListener('mouseup', onResizeEnd)

      // 只清理属于这个实例的资源
      const currentDiv = document.querySelector(`[data-instance-id="${instanceId}"]`)
      if (!currentDiv) {
        console.log('[Live2D] Container already removed, nothing to clean up')
        return
      }

      if (controllerRef.current) {
        controllerRef.current.destroy()
        controllerRef.current = null
      }
      if (containerRef.current) {
        document.body.removeChild(containerRef.current)
        containerRef.current = null
      }
    }
  }, [])

  return null
}

export default WaifuRoot
