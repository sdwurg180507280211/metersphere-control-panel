import { useEffect, useRef } from 'react'
import Live2DController from '../controller/Live2DController'
import { WAIFU_MODELS, DEFAULT_WAIFU_MODEL_ID } from '../config/waifuModels.js'

const WaifuRoot = () => {
  const containerRef = useRef(null)
  const controllerRef = useRef(null)
  const instanceIdRef = useRef(Math.random().toString(36).substr(2, 9))
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

  useEffect(() => {
    const instanceId = instanceIdRef.current

    // 创建固定在 body 上的容器 - 800x800 初始在右下角
    const div = document.createElement('div')
    div.setAttribute('data-live2d-canvas', 'true')
    div.setAttribute('data-instance-id', instanceId)
    div.style.position = 'fixed'
    div.style.right = '0'
    div.style.bottom = '0'
    div.style.width = '800px'
    div.style.height = '800px'
    div.style.zIndex = '9999'
    div.style.pointerEvents = 'none'
    document.body.appendChild(div)
    containerRef.current = div

    // 创建拖拽手柄区域（顶部透明条）
    const dragHandle = document.createElement('div')
    dragHandle.style.position = 'absolute'
    dragHandle.style.top = '0'
    dragHandle.style.left = '0'
    dragHandle.style.right = '0'
    dragHandle.style.height = '60px'
    dragHandle.style.cursor = 'move'
    dragHandle.style.pointerEvents = 'auto'
    dragHandle.style.zIndex = '10000'
    dragHandle.title = '拖拽移动看板娘'
    div.appendChild(dragHandle)

    // 创建缩放手柄（四个角）
    const createResizeHandle = (position, cursor) => {
      const handle = document.createElement('div')
      handle.style.position = 'absolute'
      handle.style.width = '24px'
      handle.style.height = '24px'
      handle.style.cursor = cursor
      handle.style.pointerEvents = 'auto'
      handle.style.zIndex = '10000'

      // 视觉提示（非常透明的圆点）
      handle.style.backgroundColor = 'rgba(100, 150, 255, 0.03)'
      handle.style.borderRadius = '50%'
      handle.style.border = '1px solid rgba(100, 150, 255, 0.08)'

      switch (position) {
        case 'top-left':
          handle.style.top = '-10px'
          handle.style.left = '-10px'
          break
        case 'top-right':
          handle.style.top = '-10px'
          handle.style.right = '-10px'
          break
        case 'bottom-left':
          handle.style.bottom = '-10px'
          handle.style.left = '-10px'
          break
        case 'bottom-right':
          handle.style.bottom = '-10px'
          handle.style.right = '-10px'
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

    // 拖拽逻辑
    const onDragStart = (e) => {
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
      if (!state.isDragging) return

      const dx = e.clientX - state.startX
      const dy = e.clientY - state.startY

      div.style.left = (state.startLeft + dx) + 'px'
      div.style.top = (state.startTop + dy) + 'px'
    }

    const onDragEnd = () => {
      dragStateRef.current.isDragging = false
      document.removeEventListener('mousemove', onDragMove)
      document.removeEventListener('mouseup', onDragEnd)
    }

    // 缩放逻辑 - 同时调整容器和模型 scale
    const onResizeStart = (e) => {
      e.stopPropagation()
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
        newContainerWidth = Math.max(300, state.startContainerWidth + dx)
        scaleChange = newContainerWidth / state.startContainerWidth
      }
      if (handle.includes('left')) {
        newContainerWidth = Math.max(300, state.startContainerWidth - dx)
        scaleChange = newContainerWidth / state.startContainerWidth
        newLeft = state.startLeft + state.startContainerWidth - newContainerWidth
      }
      if (handle.includes('bottom')) {
        newContainerHeight = Math.max(300, state.startContainerHeight + dy)
        if (!handle.includes('left') && !handle.includes('right')) {
          scaleChange = newContainerHeight / state.startContainerHeight
        }
      }
      if (handle.includes('top')) {
        newContainerHeight = Math.max(300, state.startContainerHeight - dy)
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
        }
      }

      // 更新模型 scale 和位置
      if (controllerRef.current && controllerRef.current.currentModel && controllerRef.current.renderer) {
        const modelConfig = currentModelConfigRef.current || WAIFU_MODELS[DEFAULT_WAIFU_MODEL_ID]
        const baseScale = modelConfig.scale
        const baseX = modelConfig.position.x
        const baseY = modelConfig.position.y

        // 基于初始配置计算新的 scale 和位置
        const newModelScale = baseScale * scaleChange
        const newModelX = baseX * scaleChange
        const newModelY = baseY * scaleChange

        controllerRef.current.renderer.setLayout({
          scale: newModelScale,
          x: newModelX,
          y: newModelY
        })
      }
    }

    const onResizeEnd = () => {
      dragStateRef.current.isResizing = false
      document.removeEventListener('mousemove', onResizeMove)
      document.removeEventListener('mouseup', onResizeEnd)
    }

    // 绑定事件
    dragHandle.addEventListener('mousedown', onDragStart)
    handles.forEach(handle => {
      handle.addEventListener('mousedown', onResizeStart)
    })

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

        // 保存当前模型配置
        currentModelConfigRef.current = WAIFU_MODELS[DEFAULT_WAIFU_MODEL_ID]

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
