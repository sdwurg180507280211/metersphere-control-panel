import React from 'react'
import './ConfigSaveBar.css'

function ConfigSaveBar({
  dirtyCount,
  validating,
  saving,
  applying,
  onValidate,
  onSave,
  onApply,
  onReset
}) {
  return (
    <div className={`config-save-bar-fixed ${dirtyCount > 0 ? 'is-dirty' : ''}`}>
      <div className="save-bar-info">
        <span className="save-bar-count">
          {dirtyCount > 0 ? `已修改 ${dirtyCount} 项` : '未发现变更'}
        </span>
      </div>
      <div className="save-bar-actions">
        <button 
          className="bar-btn ghost" 
          onClick={onReset} 
          disabled={dirtyCount === 0 || saving || applying || validating}
          title="重置为当前快照"
        >
          <span className="bar-btn-icon">↺</span>
          重置
        </button>
        <button 
          className="bar-btn ghost" 
          onClick={onValidate} 
          disabled={saving || applying || validating}
          title="检查配置合法性"
        >
          <span className="bar-btn-icon">{validating ? '◌' : '🔍'}</span>
          {validating ? '校验中' : '校验'}
        </button>
        <div className="bar-divider" />
        <button 
          className="bar-btn primary" 
          onClick={onSave} 
          disabled={saving || applying}
        >
          <span className="bar-btn-icon">{saving ? '◌' : '💾'}</span>
          {saving ? '保存中' : '保存'}
        </button>
        <button 
          className="bar-btn accent" 
          onClick={onApply} 
          disabled={applying || saving}
        >
          <span className="bar-btn-icon">{applying ? '◌' : '🚀'}</span>
          {applying ? '应用中' : '应用'}
        </button>
      </div>
    </div>
  )
}

export default ConfigSaveBar
