import React from 'react'

function ConfigDiagnosticsPanel({ diagnostics, validation, loading, onRefresh }) {
  const issues = diagnostics || { errors: [], warnings: [] }
  const totalIssues = (issues.errors?.length || 0) + (issues.warnings?.length || 0)
  
  return (
    <div className="diagnostics-container">
      <div className="diagnostics-header">
        <div className="diagnostics-summary">
          <div className={`summary-score ${totalIssues === 0 ? 'perfect' : totalIssues < 3 ? 'warning' : 'danger'}`}>
            {totalIssues === 0 ? '100' : 100 - (totalIssues * 10)}
          </div>
          <div className="summary-info">
            <h4>配置健康评分</h4>
            <p>{totalIssues === 0 ? '您的配置非常完美！' : `发现 ${totalIssues} 个可优化项，建议立即处理。`}</p>
          </div>
        </div>
        <button className={`config-scan-btn ${loading ? 'scanning' : ''}`} onClick={onRefresh} disabled={loading}>
          {loading ? <div className="config-spinner-mini" /> : '🔄'} 重新诊断
        </button>
      </div>

      <div className="diagnostics-body">
        {/* 错误类别 */}
        {issues.errors?.length > 0 && (
          <section className="diag-group">
            <h5 className="diag-label error">严重问题 ({issues.errors.length})</h5>
            {issues.errors.map((item, i) => (
              <div key={i} className="diag-card error">
                <div className="diag-icon">❌</div>
                <div className="diag-content">
                  <div className="diag-title">{item.message}</div>
                  {item.suggestion && <div className="diag-suggestion">建议修复：{item.suggestion}</div>}
                  <div className="diag-path">对应字段: <code>{item.path}</code></div>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* 警告类别 */}
        {issues.warnings?.length > 0 && (
          <section className="diag-group">
            <h5 className="diag-label warning">潜在风险 ({issues.warnings.length})</h5>
            {issues.warnings.map((item, i) => (
              <div key={i} className="diag-card warning">
                <div className="diag-icon">⚠️</div>
                <div className="diag-content">
                  <div className="diag-title">{item.message}</div>
                  {item.suggestion && <div className="diag-suggestion">优化建议：{item.suggestion}</div>}
                  <div className="diag-path">对应字段: <code>{item.path}</code></div>
                </div>
              </div>
            ))}
          </section>
        )}

        {totalIssues === 0 && !loading && (
          <div className="diag-empty">
            <div className="diag-empty-icon">🛡️</div>
            <p>一切运行良好，未发现任何配置冲突或环境异常。</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default ConfigDiagnosticsPanel
