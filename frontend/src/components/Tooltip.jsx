import React, { useState, useEffect } from 'react'
import './Tooltip.css'

function Tooltip({ text, children }) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="tooltip-container" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
      {children}
      {visible && text && (
        <div className="tooltip tooltip-top">
          {text}
        </div>
      )}
    </div>
  )
}

export default Tooltip
