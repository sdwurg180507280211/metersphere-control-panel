import React from 'react'

const Live2DCanvas = React.forwardRef((props, ref) => {
  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        bottom: 0,
        right: 0,
        width: '800px',
        height: '800px',
        zIndex: 9999,
        pointerEvents: 'none'
      }}
      data-live2d-canvas="true"
    />
  )
})

Live2DCanvas.displayName = 'Live2DCanvas'

export default Live2DCanvas
