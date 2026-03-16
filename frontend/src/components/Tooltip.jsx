import React, { useState, useEffect } from 'react'

function Tooltip({ text, children }) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="tooltip-container" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
      {children}
      {visible && text && (
        <div className="tooltip-box">
          {text}
          <div className="tooltip-arrow" />
        </div>
      )}
    </div>
  )
}

export default Tooltip
