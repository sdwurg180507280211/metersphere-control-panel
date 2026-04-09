import React, { useState, useEffect } from 'react'
import './ConfigSaveBar.css'

function ConfigSaveBar({
  dirtyCount,
  validating,
  saving,
  applying,
  hasUnappliedChanges,
  applyImpact,
  onValidate,
  onSave,
  onSaveAndApply,
  onApply,
  onReset
}) {
  const isDirty = dirtyCount > 0
  const canApply = hasUnappliedChanges && !isDirty
  const requiresRestart = applyImpact?.requiresRestart?.length > 0
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    if (justSaved) {
      const timer = setTimeout(() => setJustSaved(false), 1500)
      return () => clearTimeout(timer)
    }
  }, [justSaved])

  const handleSave = async () => {
    const result = await onSave()
    if (result !== false) setJustSaved(true)
  }

  if (!isDirty && !hasUnappliedChanges) return null

  return (
    <div className="config-save-bar-container">
      <div className="config-save-island">
        <div className="island-info">
          {isDirty ? (
            <span className="island-status dirty">
              <span className="dot" /> 有 {dirtyCount} 项未保存修改
            </span>
          ) : justSaved ? (
            <span className="island-status saved">
              <span className="dot" /> 配置已保存
            </span>
          ) : hasUnappliedChanges ? (
            <span className="island-status unapplied">
              <span className="dot" /> 配置已保存，等待应用生效
              {requiresRestart && <span className="restart-badge" title="部分字段修改需重启控制面板">需重启</span>}
            </span>
          ) : null}
        </div>

        <div className="island-actions">
          {isDirty && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="island-btn-secondary" onClick={onReset} disabled={validating || saving || applying}>
                重置
              </button>
              <button className="island-btn-secondary" onClick={onValidate} disabled={validating || saving || applying}>
                {validating ? '校验中...' : '校验'}
              </button>
              <button className="island-btn-secondary" onClick={handleSave} disabled={validating || saving || applying}>
                {saving ? '保存中...' : justSaved ? '✓ 已保存' : '仅保存'}
              </button>
              <button className="island-btn-primary" onClick={onSaveAndApply} disabled={validating || saving || applying}>
                {applying ? '应用中...' : '保存并应用'}
              </button>
            </div>
          )}

          {canApply && (
            <button className="island-btn-apply" onClick={onApply} disabled={validating || saving || applying}>
              {applying ? '应用中...' : '应用到运行时'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default ConfigSaveBar
