import React from 'react'

function ConfigField({ label, hint, path, fieldErrors, fieldWarnings, children }) {
  const errors = fieldErrors?.[path] || []
  const warnings = fieldWarnings?.[path] || []

  return (
    <div className="config-field-wrapper">
      <div className="config-field-label">
        <span>{label}</span>
        {hint && <span className="config-field-hint-icon" title={hint}>ⓘ</span>}
      </div>
      <div className="config-field-control">
        {children}
      </div>
      {hint && <div className="config-field-hint-text">{hint}</div>}
      <div className="config-field-messages">
        {errors.map((msg, i) => (
          <div key={`err-${i}`} className="config-field-error">{msg}</div>
        ))}
        {warnings.map((msg, i) => (
          <div key={`warn-${i}`} className="config-field-warning">{msg}</div>
        ))}
      </div>
    </div>
  )
}

export default ConfigField
