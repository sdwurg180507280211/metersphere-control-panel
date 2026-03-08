import { useState, useRef, useEffect } from 'react'
import './Tooltip.css'

function Tooltip({ children, content, position = 'top', delay = 300 }) {
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState({ x: 0, y: 0 })
  const triggerRef = useRef(null)
  const timerRef = useRef(null)

  const showTooltip = () => {
    if (!content) return
    timerRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect()
        let x = 0
        let y = 0

        switch (position) {
          case 'top':
            x = rect.left + rect.width / 2
            y = rect.top - 8
            break
          case 'bottom':
            x = rect.left + rect.width / 2
            y = rect.bottom + 8
            break
          case 'left':
            x = rect.left - 8
            y = rect.top + rect.height / 2
            break
          case 'right':
            x = rect.right + 8
            y = rect.top + rect.height / 2
            break
        }

        setCoords({ x, y })
        setVisible(true)
      }
    }, delay)
  }

  const hideTooltip = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    setVisible(false)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  return (
    <>
      <div
        ref={triggerRef}
        className="tooltip-trigger"
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
      >
        {children}
      </div>
      {visible && (
        <div 
          className={`tooltip tooltip-${position}`}
          style={{
            left: coords.x,
            top: coords.y
          }}
        >
          {content}
        </div>
      )}
    </>
  )
}

export default Tooltip
