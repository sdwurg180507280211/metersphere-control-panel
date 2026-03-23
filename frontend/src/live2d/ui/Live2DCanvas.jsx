import React from 'react'

const Live2DCanvas = React.forwardRef((props, ref) => {
  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        bottom: 0,
        right: 0,
        width: '280px',
        height: '280px',
        zIndex: 9999,
        border: '2px solid red' // 调试用
      }}
    />
  )
})

Live2DCanvas.displayName = 'Live2DCanvas'

export default Live2DCanvas
