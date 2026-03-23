import { useEffect, useRef } from 'react'
import Live2DController from '../controller/Live2DController'

const WaifuRoot = () => {
  const containerRef = useRef(null)
  const controllerRef = useRef(null)
  const instanceIdRef = useRef(Math.random().toString(36).substr(2, 9))

  useEffect(() => {
    const instanceId = instanceIdRef.current

    // 创建固定在 body 上的容器 - 800x800 固定在右下角
    const div = document.createElement('div')
    div.setAttribute('data-live2d-canvas', 'true')
    div.setAttribute('data-instance-id', instanceId)
    // 使用 position: fixed 相对于 viewport 定位
    div.style.position = 'fixed'
    div.style.bottom = '0'
    div.style.right = '0'
    div.style.width = '800px'
    div.style.height = '800px'
    div.style.zIndex = '9999'
    // 容器不阻挡鼠标事件，但内部 canvas 需要接收事件
    div.style.pointerEvents = 'none'
    document.body.appendChild(div)
    containerRef.current = div

    console.log('[Live2D] Canvas container created:', {
      instanceId,
      position: div.style.position,
      bottom: div.style.bottom,
      right: div.style.right
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

        // 暴露到全局以便调试
        window.__waifuController = controller
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
      } catch (error) {
        console.error('Failed to initialize Live2D:', error)
      }
    }

    initController()

    return () => {
      console.log('[Live2D] Cleaning up instance:', instanceId)

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
