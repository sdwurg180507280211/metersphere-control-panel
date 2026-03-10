function ConfigSaveBar({
  dirtyCount,
  validating,
  saving,
  applying,
  hasUnappliedChanges,
  applyImpact,
  onValidate,
  onSave,
  onApply,
  onReset
}) {
  return (
    <div className="config-save-bar">
      <div className="config-save-status">
        <strong>{dirtyCount > 0 ? `未保存变更 ${dirtyCount} 项` : '草稿已同步'}</strong>
        <span>
          热应用：{(applyImpact?.hotApply || []).join(', ') || '无'}
          {applyImpact?.requiresRestart?.length > 0 ? ` · 需重启：${applyImpact.requiresRestart.join(', ')}` : ''}
          {hasUnappliedChanges ? ' · 已保存未应用' : ''}
        </span>
      </div>

      <div className="config-save-actions">
        <button className="config-secondary-btn" onClick={onReset} disabled={dirtyCount === 0 || saving || applying || validating}>
          重置草稿
        </button>
        <button className="config-secondary-btn" onClick={onValidate} disabled={saving || applying || validating}>
          {validating ? '校验中...' : '校验配置'}
        </button>
        <button className="config-primary-btn" onClick={onSave} disabled={saving || applying}>
          {saving ? '保存中...' : '保存配置'}
        </button>
        <button className="config-primary-btn accent" onClick={onApply} disabled={applying || saving}>
          {applying ? '应用中...' : '应用配置'}
        </button>
      </div>
    </div>
  )
}

export default ConfigSaveBar
