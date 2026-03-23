import { useEffect, useRef } from 'react'
import Live2DCanvas from './Live2DCanvas'
import Live2DController from '../controller/Live2DController'

const WaifuRoot = () => {
  const canvasRef = useRef(null)
  const controllerRef = useRef(null)

  useEffect(() => {
    let mounted = true

    const initController = async () => {
      if (!canvasRef.current) return

      try {
        const controller = new Live2DController()
        controllerRef.current = controller

        if (mounted) {
          await controller.init(canvasRef.current)
        }
      } catch (error) {
        console.error('Failed to initialize Live2D:', error)
      }
    }

    initController()

    return () => {
      mounted = false
      if (controllerRef.current) {
        controllerRef.current.destroy()
        controllerRef.current = null
      }
    }
  }, [])

  return <Live2DCanvas ref={canvasRef} />
}

export default WaifuRoot
