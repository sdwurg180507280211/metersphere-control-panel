import React from 'react'

function ConfigRuntimePanel({ runtime, resolved, meta, applyImpact }) {
  if (!runtime) return null

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text)
    alert('已复制到剪贴板')
  }

  return (
    <div className="runtime-container">
      <div className="runtime-grid">
        {/* 第一组：基础环境 */}
        <section className="runtime-card">
          <div className="runtime-card-header">
            <span className="runtime-icon">🏠</span>
            <h5>项目与路径</h5>
          </div>
          <div className="runtime-card-body">
            <RuntimeItem label="项目根目录" value={resolved?.projectRoot} onCopy={handleCopy} isPath />
            <RuntimeItem label="npm 路径" value={resolved?.npmPath} onCopy={handleCopy} isPath />
            <RuntimeItem label="配置文件" value={meta?.configPath} onCopy={handleCopy} isPath />
          </div>
        </section>

        {/* 第二组：缓存与数据 */}
        <section className="runtime-card">
          <div className="runtime-card-header">
            <span className="runtime-icon">💾</span>
            <h5>缓存系统 (Redis)</h5>
          </div>
          <div className="runtime-card-body">
            <RuntimeItem label="运行模式" value={runtime.cache?.configuredMode?.toUpperCase()} isTag />
            <RuntimeItem label="Redis 主机" value={runtime.redis?.host || 'N/A'} />
            <RuntimeItem label="Key 前缀" value={runtime.cache?.keyPrefix} />
          </div>
        </section>

        {/* 第三组：任务引擎 */}
        <section className="runtime-card">
          <div className="runtime-card-header">
            <span className="runtime-icon">⚙️</span>
            <h5>任务执行引擎</h5>
          </div>
          <div className="runtime-card-body">
            <RuntimeItem label="并发数限制" value={resolved?.package?.maxJobs} />
            <RuntimeItem label="健康检查频率" value={`${runtime.timeouts?.healthTimeoutMs / 1000}s`} />
            <RuntimeItem label="任务超时" value={`${runtime.timeouts?.compileTimeoutMs / 60000}min`} />
          </div>
        </section>

        {/* 第四组：外部集成 */}
        <section className="runtime-card">
          <div className="runtime-card-header">
            <span className="runtime-icon">🚀</span>
            <h5>AI 模型集成</h5>
          </div>
          <div className="runtime-card-body">
            <RuntimeItem label="API Base" value={runtime.envOverrides?.ANTHROPIC_BASE_URL || '默认'} />
            <RuntimeItem label="模型名称" value={runtime.envOverrides?.ANTHROPIC_MODEL || '未配置'} />
            <RuntimeItem label="Token 状态" value={runtime.envOverrides?.ANTHROPIC_AUTH_TOKEN ? '已加载 (加密)' : '未加载'} isTag />
          </div>
        </section>
      </div>

      {/* 底部：应用影响 */}
      {applyImpact?.changedPaths?.length > 0 && (
        <div className="runtime-footer-notice">
          <div className="notice-icon">🔔</div>
          <div className="notice-text">
            发现有 {applyImpact.changedPaths.length} 项更改尚未应用到运行时。
            {applyImpact.requiresRestart?.length > 0 && <span className="warning-inline"> 部分更改需要重启后面板才能生效。</span>}
          </div>
        </div>
      )}
    </div>
  )
}

function RuntimeItem({ label, value, onCopy, isPath, isTag }) {
  return (
    <div className="runtime-item">
      <div className="runtime-item-label">{label}</div>
      <div className="runtime-item-value-wrapper">
        <span className={`runtime-item-value ${isPath ? 'mono' : ''} ${isTag ? 'tag' : ''}`}>
          {value || '-'}
        </span>
        {onCopy && value && (
          <button className="runtime-copy-btn" onClick={() => onCopy(value)} title="复制内容">
            📋
          </button>
        )}
      </div>
    </div>
  )
}

export default ConfigRuntimePanel
