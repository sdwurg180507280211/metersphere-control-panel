import './PropertiesDialog.css'

function GeneralConfigDialog({ onClose, draft, resolved, meta, fieldErrors, fieldWarnings, onChange }) {
  return (
    <div className="log-modal-overlay" onClick={onClose}>
      <div className="log-modal properties-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px' }}>
        <div className="log-modal-header">
          <h3>基础配置</h3>
          <button className="log-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="log-modal-body" style={{ padding: '20px' }}>
          <div className="config-form-grid">
            <div className="config-field-card config-field-card-wide">
              <label className="config-field">
                <span>MeterSphere 项目根目录</span>
                <input value={draft.projectRoot ?? ''} onChange={(e) => onChange('projectRoot', e.target.value)} />
                <small className="config-hint">解析后路径：{resolved?.projectRoot || '-'}</small>
                <FieldMessages path="projectRoot" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} />
              </label>
            </div>

            <div className="config-field-card config-field-card-wide">
              <label className="config-field">
                <span>npm 命令路径</span>
                <input
                  value={draft.npmPath ?? ''}
                  onChange={(e) => onChange('npmPath', e.target.value)}
                  placeholder="/usr/local/bin/npm 或留空自动检测"
                />
                <small className="config-hint">用于前端构建，留空则自动查找 npm</small>
                <FieldMessages path="npmPath" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} />
              </label>
            </div>

            <div className="config-field-card config-field-card-wide">
              <label className="config-field">
                <span>日志最大行数</span>
                <input value={draft.maxLogLines ?? ''} onChange={(e) => onChange('maxLogLines', e.target.value)} />
                <FieldMessages path="maxLogLines" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} />
              </label>
            </div>
          </div>

          <div className="config-meta-grid" style={{ marginTop: '20px' }}>
            <MetaItem label="配置文件" value={meta?.configPath || '-'} />
            <MetaItem label="最近加载" value={meta?.lastLoadedAt || '-'} />
            <MetaItem label="最近保存" value={meta?.lastSavedAt || '尚未保存'} />
            <MetaItem label="最近应用" value={meta?.lastAppliedAt || '尚未应用'} />
          </div>
        </div>

        <div className="properties-footer">
          <button className="properties-btn-cancel" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}

function MetaItem({ label, value }) {
  return (
    <div className="config-meta-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function FieldMessages({ path, fieldErrors, fieldWarnings }) {
  return (
    <>
      {(fieldErrors[path] || []).map((message) => (
        <small key={`${path}-${message}`} className="config-field-error">{message}</small>
      ))}
      {(fieldWarnings[path] || []).map((message) => (
        <small key={`${path}-${message}-warning`} className="config-field-warning">{message}</small>
      ))}
    </>
  )
}

export default GeneralConfigDialog
