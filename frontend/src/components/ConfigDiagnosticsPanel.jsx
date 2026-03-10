function ConfigDiagnosticsPanel({ diagnostics, validation, loading, onRefresh }) {
  const errors = validation?.errors || []
  const warnings = validation?.warnings || []

  return (
    <section className="config-card config-panel-card">
      <div className="config-card-header">
        <div>
          <h3 className="section-title">配置诊断</h3>
          <p className="config-section-desc">快速定位 projectRoot、端口冲突和脚本问题。</p>
        </div>
        <button className="config-secondary-btn" onClick={onRefresh} disabled={loading}>
          {loading ? '检测中...' : '重新检测'}
        </button>
      </div>

      <div className="config-diagnostic-summary">
        <div className={`config-status-pill ${errors.length > 0 ? 'error' : 'success'}`}>
          错误 {errors.length}
        </div>
        <div className={`config-status-pill ${warnings.length > 0 ? 'warning' : ''}`}>
          警告 {warnings.length}
        </div>
      </div>

      <DiagnosticBlock title="Project Root" status={diagnostics?.projectRoot?.valid}>
        <DiagnosticItem label="解析路径" value={diagnostics?.projectRoot?.resolvedPath || '-'} />
        <DiagnosticItem label="Maven Wrapper" value={diagnostics?.projectRoot?.hasMavenWrapper ? '存在' : '缺失'} />
        <DiagnosticItem label="匹配 POM 数量" value={String(diagnostics?.projectRoot?.matchedPomCount || 0)} />
      </DiagnosticBlock>

      <DiagnosticBlock title="打包脚本" status={diagnostics?.packageScript?.valid}>
        <DiagnosticItem label="命中路径" value={diagnostics?.packageScript?.resolvedPath || '未命中'} />
        <DiagnosticItem label="来源" value={diagnostics?.packageScript?.source || '-'} />
        <DiagnosticItem label="可执行" value={diagnostics?.packageScript?.executable ? '是' : '否'} />
      </DiagnosticBlock>

      <DiagnosticBlock title="端口分布" status>
        {(diagnostics?.ports || []).map((item) => (
          <div key={`${item.port}-${item.owners?.length || 0}`} className="config-diagnostic-inline">
            <strong>{item.port}</strong>
            <span>{item.owners?.map((owner) => owner.name || owner.id).join(' / ')}</span>
            {item.duplicate ? <em>冲突</em> : <em>正常</em>}
          </div>
        ))}
      </DiagnosticBlock>

      <DiagnosticBlock title="问题列表" status={errors.length === 0}>
        {errors.length === 0 && warnings.length === 0 ? (
          <div className="config-empty-text">当前未发现配置问题</div>
        ) : (
          <div className="config-issue-list">
            {errors.map((item) => (
              <IssueItem key={`${item.path}-${item.message}`} item={item} type="error" />
            ))}
            {warnings.map((item) => (
              <IssueItem key={`${item.path}-${item.message}-warning`} item={item} type="warning" />
            ))}
          </div>
        )}
      </DiagnosticBlock>
    </section>
  )
}

function DiagnosticBlock({ title, status, children }) {
  return (
    <div className="config-diagnostic-block">
      <div className="config-diagnostic-title">
        <span>{title}</span>
        <strong className={status ? 'success' : 'error'}>{status ? '正常' : '异常'}</strong>
      </div>
      {children}
    </div>
  )
}

function DiagnosticItem({ label, value }) {
  return (
    <div className="config-panel-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function IssueItem({ item, type }) {
  return (
    <div className={`config-issue-item ${type}`}>
      <strong>{item.path || 'global'}</strong>
      <span>{item.message}</span>
    </div>
  )
}

export default ConfigDiagnosticsPanel
