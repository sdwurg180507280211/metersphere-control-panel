function ConfigGeneralSection({ draft, resolved, meta, fieldErrors, fieldWarnings, onChange }) {
  return (
    <section className="config-card">
      <div className="config-card-header">
        <div>
          <h3 className="section-title">基础设置</h3>
          <p className="config-section-desc">编辑控制面板端口、项目根目录和日志容量。</p>
        </div>
      </div>

      <div className="config-form-grid">
        <label className="config-field">
          <span>控制面板端口</span>
          <input value={draft.port ?? ''} onChange={(e) => onChange('port', e.target.value)} />
          <FieldMessages path="port" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} />
        </label>

        <label className="config-field config-field-wide">
          <span>MeterSphere 项目根目录</span>
          <input value={draft.projectRoot ?? ''} onChange={(e) => onChange('projectRoot', e.target.value)} />
          <small className="config-hint">解析后路径：{resolved?.projectRoot || '-'}</small>
          <FieldMessages path="projectRoot" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} />
        </label>

        <label className="config-field">
          <span>日志最大行数</span>
          <input value={draft.maxLogLines ?? ''} onChange={(e) => onChange('maxLogLines', e.target.value)} />
          <FieldMessages path="maxLogLines" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} />
        </label>
      </div>

      <div className="config-meta-grid">
        <MetaItem label="配置文件" value={meta?.configPath || '-'} />
        <MetaItem label="最近加载" value={meta?.lastLoadedAt || '-'} />
        <MetaItem label="最近保存" value={meta?.lastSavedAt || '尚未保存'} />
        <MetaItem label="最近应用" value={meta?.lastAppliedAt || '尚未应用'} />
      </div>
    </section>
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

export default ConfigGeneralSection
