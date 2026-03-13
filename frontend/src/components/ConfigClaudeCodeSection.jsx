import React from 'react'

function ConfigClaudeCodeSection({ claudeCodeConfig, fieldErrors, fieldWarnings, onChange }) {
  const config = claudeCodeConfig || {};

  return (
    <section className="config-card">
      <div className="config-card-header">
        <div>
          <h3 className="section-title">ClaudeCode 配置</h3>
          <p className="section-subtitle" style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
            配置本地 ClaudeCode CLI 的连接参数，这些参数将通过环境变量传递。
          </p>
        </div>
      </div>

      <div className="config-form-grid">
        <div className="config-field-card config-field-card-wide">
          <label className="config-field">
            <span>Base URL (ANTHROPIC_BASE_URL)</span>
            <input
              value={config.baseUrl ?? ''}
              onChange={(e) => onChange('claudeCode.baseUrl', e.target.value)}
              placeholder="例如: https://coding.dashscope.aliyuncs.com/apps/anthropic"
            />
            <FieldMessages path="claudeCode.baseUrl" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} />
          </label>
        </div>

        <div className="config-field-card config-field-card-wide">
          <label className="config-field">
            <span>Auth Token (ANTHROPIC_AUTH_TOKEN)</span>
            <input
              type="password"
              value={config.authToken ?? ''}
              onChange={(e) => onChange('claudeCode.authToken', e.target.value)}
              placeholder="sk-..."
            />
            <FieldMessages path="claudeCode.authToken" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} />
          </label>
        </div>

        <div className="config-field-card">
          <label className="config-field">
            <span>Model (ANTHROPIC_MODEL)</span>
            <input
              value={config.model ?? ''}
              onChange={(e) => onChange('claudeCode.model', e.target.value)}
              placeholder="例如: qwen3.5-plus, claude-opus-4-6"
            />
            <FieldMessages path="claudeCode.model" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} />
          </label>
        </div>

        <div className="config-field-card">
          <label className="config-field">
            <span>Small Fast Model (ANTHROPIC_SMALL_FAST_MODEL)</span>
            <input
              value={config.smallFastModel ?? ''}
              onChange={(e) => onChange('claudeCode.smallFastModel', e.target.value)}
              placeholder="例如: qwen3.5-plus"
            />
            <FieldMessages path="claudeCode.smallFastModel" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} />
          </label>
        </div>
      </div>
      
      <div style={{ padding: '12px 16px', background: '#f8f9fa', borderRadius: '4px', marginTop: '16px', fontSize: '13px', color: '#555' }}>
        <p style={{ margin: 0, fontWeight: 500, marginBottom: '8px' }}>常用配置参考:</p>
        <ul style={{ margin: 0, paddingLeft: '20px' }}>
          <li><strong>阿里云:</strong> Base URL: <code>https://coding.dashscope.aliyuncs.com/apps/anthropic</code>, Model: <code>qwen3.5-plus</code></li>
          <li><strong>Kimi:</strong> Base URL: <code>https://api.moonshot.cn/anthropic</code>, Model: <code>kimi-k2.5</code></li>
        </ul>
      </div>
    </section>
  )
}

function FieldMessages({ path, fieldErrors, fieldWarnings }) {
  if (!fieldErrors && !fieldWarnings) return null;
  return (
    <>
      {(fieldErrors?.[path] || []).map((message, i) => (
        <small key={`${path}-err-${i}`} className="config-field-error">{message}</small>
      ))}
      {(fieldWarnings?.[path] || []).map((message, i) => (
        <small key={`${path}-warn-${i}`} className="config-field-warning">{message}</small>
      ))}
    </>
  )
}

export default ConfigClaudeCodeSection
