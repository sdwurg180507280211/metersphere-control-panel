import React from 'react'
import './ConfigDiagnosticsPanel.css'

function ConfigDiagnosticsPanel({ diagnostics, validation, loading, onRefresh }) {
  const issues = diagnostics || { errors: [], warnings: [] }
  const totalIssues = (issues.errors?.length || 0) + (issues.warnings?.length || 0)
  const healthScore = Math.max(0, 100 - (totalIssues * 10))

  return (
    <div className="diagnostics-container">
      <div className="diagnostics-header">
        <div className="diagnostics-summary">
          <div className={`summary-score ${healthScore >= 90 ? 'perfect' : healthScore >= 60 ? 'warning' : 'danger'}`}>
            {healthScore}
          </div>
          <div className="summary-info">
            <h4>配置健康评分</h4>
            <p>{totalIssues === 0 ? '配置完美，无任何异常' : `发现 ${totalIssues} 个可优化项，建议处理`}</p>
          </div>
        </div>
        <button className={`diag-refresh-btn ${loading ? 'scanning' : ''}`} onClick={onRefresh} disabled={loading}>
          {loading ? <span className="diag-spinner" /> : '↻'} 重新诊断
        </button>
      </div>

      <div className="diagnostics-body">
        {issues.errors?.length > 0 && (
          <section className="diag-group">
            <h5 className="diag-label error">严重问题 ({issues.errors.length})</h5>
            {issues.errors.map((item, i) => (
              <div key={i} className="diag-card error">
                <span className="diag-icon">✕</span>
                <div className="diag-content">
                  <div className="diag-title">{item.message}</div>
                  {(item.suggestion || item.details?.suggestion) && (
                    <div className="diag-suggestion">建议修复：{item.suggestion || item.details?.suggestion}</div>
                  )}
                  {item.path && <div className="diag-path">字段: <code>{item.path}</code></div>}
                </div>
              </div>
            ))}
          </section>
        )}

        {issues.warnings?.length > 0 && (
          <section className="diag-group">
            <h5 className="diag-label warning">潜在风险 ({issues.warnings.length})</h5>
            {issues.warnings.map((item, i) => (
              <div key={i} className="diag-card warning">
                <span className="diag-icon">!</span>
                <div className="diag-content">
                  <div className="diag-title">{item.message}</div>
                  {(item.suggestion || item.details?.suggestion) && (
                    <div className="diag-suggestion">优化建议：{item.suggestion || item.details?.suggestion}</div>
                  )}
                  {item.path && <div className="diag-path">字段: <code>{item.path}</code></div>}
                </div>
              </div>
            ))}
          </section>
        )}

        {totalIssues === 0 && !loading && (
          <div className="diag-empty">
            <div className="diag-empty-icon">✓</div>
            <p>一切运行良好，未发现配置冲突或环境异常</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default ConfigDiagnosticsPanel
