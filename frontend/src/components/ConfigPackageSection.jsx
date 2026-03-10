function ConfigPackageSection({ packageConfig, resolved, fieldErrors, fieldWarnings, onChange }) {
  const defaultServices = Array.isArray(packageConfig.defaultServices)
    ? packageConfig.defaultServices.join(', ')
    : ''

  return (
    <section className="config-card">
      <div className="config-card-header">
        <div>
          <h3 className="section-title">构建与打包</h3>
        </div>
      </div>

      <div className="config-form-grid">
        <label className="config-field config-field-wide">
          <span>打包脚本路径</span>
          <input
            value={packageConfig.scriptPath ?? ''}
            onChange={(e) => onChange('package.scriptPath', e.target.value)}
            placeholder="可选，留空则按候选路径自动探测"
          />
          <FieldMessages path="package.scriptPath" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} />
        </label>

        <label className="config-field config-field-wide">
          <span>默认服务列表</span>
          <input
            value={defaultServices}
            onChange={(e) => onChange('package.defaultServices', splitCsv(e.target.value))}
            placeholder="例如 api-test, test-track"
          />
          <FieldMessages path="package.defaultServices" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} />
        </label>

        <label className="config-field">
          <span>默认镜像版本</span>
          <input value={packageConfig.imageVersion ?? ''} onChange={(e) => onChange('package.imageVersion', e.target.value)} />
        </label>

        <label className="config-field">
          <span>最大线程数</span>
          <input value={packageConfig.maxJobs ?? ''} onChange={(e) => onChange('package.maxJobs', e.target.value)} />
          <FieldMessages path="package.maxJobs" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} />
        </label>

        <label className="config-field config-field-wide">
          <span>输出目录</span>
          <input value={packageConfig.packagePath ?? ''} onChange={(e) => onChange('package.packagePath', e.target.value)} />
        </label>
      </div>

      <div className="config-toggle-row">
        <label className="config-checkbox">
          <input
            type="checkbox"
            checked={Boolean(packageConfig.parallelBuild ?? true)}
            onChange={(e) => onChange('package.parallelBuild', e.target.checked)}
          />
          <span>默认启用并行构建</span>
        </label>
        <label className="config-checkbox">
          <input
            type="checkbox"
            checked={Boolean(packageConfig.buildOnly ?? false)}
            onChange={(e) => onChange('package.buildOnly', e.target.checked)}
          />
          <span>默认仅构建不打包</span>
        </label>
      </div>

      <div className="config-candidate-list">
        <div className="config-subtitle">候选脚本路径</div>
        {(resolved?.packageScriptCandidates || []).length === 0 ? (
          <div className="config-empty-text">暂无候选路径</div>
        ) : (
          (resolved?.packageScriptCandidates || []).map((candidate) => (
            <div key={`${candidate.source}-${candidate.resolvedPath || candidate.path}`} className="config-candidate-item">
              <strong>{candidate.source}</strong>
              <span>{candidate.resolvedPath || candidate.path}</span>
              <em>{candidate.exists ? '已找到' : '未找到'}</em>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function splitCsv(value) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
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

export default ConfigPackageSection
