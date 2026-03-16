import React, { useState, useEffect } from 'react'
import { useConfigStore } from '../store/useAppStore'
import Tooltip from './Tooltip'

function ConfigField({ label, hint, path, fieldErrors, fieldWarnings, checkPath = false, children }) {
  const dirtyFields = useConfigStore(state => state.dirtyFields)
  const isDirty = dirtyFields.includes(path)

  const [pathExists, setPathExists] = useState(null)
  const [checking, setChecking] = useState(false)

  const errors = fieldErrors?.[path] || []
  const warnings = fieldWarnings?.[path] || []

  // 递归查找 input 元素的 value
  const getInputValue = (node) => {
    if (!node) return null
    if (node.type === 'input') return node.props?.value
    if (node.props?.children) {
      const childArray = Array.isArray(node.props.children)
        ? node.props.children
        : [node.props.children]
      for (const child of childArray) {
        if (child?.type === 'input') return child.props?.value
      }
    }
    return null
  }

  const inputValue = getInputValue(children)

  // 路径探测逻辑
  useEffect(() => {
    if (!checkPath || !inputValue) {
      setPathExists(null)
      return
    }

    const timer = setTimeout(async () => {
      setChecking(true)
      try {
        const res = await fetch('/api/config/validate-path', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: inputValue })
        })
        const data = await res.json()
        setPathExists(data.data.exists)
      } finally {
        setChecking(false)
      }
    }, 500) // 防抖

    return () => clearTimeout(timer)
  }, [inputValue, checkPath])

  return (
    <div className={`config-field-wrapper ${isDirty ? 'config-field-dirty' : ''}`}>
      <div className="config-field-label">
        <span>{label}</span>
        {hint && (
          <Tooltip text={hint}>
            <span className="config-field-hint-icon">ⓘ</span>
          </Tooltip>
        )}
      </div>
      
      <div className="config-field-control" style={{ position: 'relative' }}>
        {children}

        {/* 路径状态指示器 */}
        {checkPath && inputValue && (
          <div className="config-path-indicator">
            {checking ? (
              <div className="config-spinner-mini" />
            ) : pathExists === true ? (
              <span className="path-ok" title="路径有效">✓</span>
            ) : pathExists === false ? (
              <span className="path-error" title="路径不存在">✕</span>
            ) : null}
          </div>
        )}
      </div>

      <div className="config-field-messages">
        {errors.map((msg, i) => <div key={`err-${i}`} className="config-field-error">{msg}</div>)}
        {warnings.map((msg, i) => <div key={`warn-${i}`} className="config-field-warning">{msg}</div>)}
      </div>
    </div>
  )
}

export default ConfigField
