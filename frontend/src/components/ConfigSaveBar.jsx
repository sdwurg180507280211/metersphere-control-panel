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
    <div className="config-save-bar">
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
  )
}

export default ConfigSaveBar
