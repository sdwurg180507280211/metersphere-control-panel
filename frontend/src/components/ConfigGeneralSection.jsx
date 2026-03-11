import { useState } from 'react'
import toast from 'react-hot-toast'
import CustomSelect from './CustomSelect'

function ConfigGeneralSection({ draft, resolved, meta, fieldErrors, fieldWarnings, onChange }) {
  const [testingRedis, setTestingRedis] = useState(false)

  const handleTestRedis = async () => {
    setTestingRedis(true)
    try {
      const response = await fetch('/api/config/test-redis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: draft.redis?.host || 'localhost',
          port: draft.redis?.port || 6379,
          password: draft.redis?.password || '',
          db: draft.redis?.db || 0
        })
      })
      const result = await response.json()
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error('测试连接失败: ' + error.message)
    } finally {
      setTestingRedis(false)
    }
  }

  return (
    <section className="config-card">
      <div className="config-card-header">
        <div>
          <h3 className="section-title">基础设置</h3>
        </div>
      </div>

      <div className="config-form-grid">
        <div className="config-field-card config-field-card-wide">
          <label className="config-field">
            <span>MeterSphere 项目根目录</span>
            <input value={draft.projectRoot ?? ''} onChange={(e) => onChange('projectRoot', e.target.value)} />
            <small className="config-hint">解析后路径：{resolved?.projectRoot || '-'}</small>
            <FieldMessages path="projectRoot" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} />
          </label>
        </div>

        <div className="config-field-card">
          <label className="config-field">
            <span>日志最大行数</span>
            <input value={draft.maxLogLines ?? ''} onChange={(e) => onChange('maxLogLines', e.target.value)} />
            <FieldMessages path="maxLogLines" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} />
          </label>
        </div>

        <div className="config-field-card config-field-card-wide">
          <label className="config-field">
            <span>metersphere.properties 路径</span>
            <input 
              value={draft.properties?.metersphere ?? ''} 
              onChange={(e) => onChange('properties.metersphere', e.target.value)} 
              placeholder="/opt/metersphere/conf/metersphere.properties" 
            />
            <FieldMessages path="properties.metersphere" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} />
          </label>
        </div>

        <div className="config-field-card config-field-card-wide">
          <label className="config-field">
            <span>redisson.yml 路径</span>
            <input 
              value={draft.properties?.redisson ?? ''} 
              onChange={(e) => onChange('properties.redisson', e.target.value)} 
              placeholder="/opt/metersphere/conf/redisson.yml" 
            />
            <FieldMessages path="properties.redisson" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} />
          </label>
        </div>

        <div className="config-field-card">
          <div className="config-field">
            <span>缓存模式</span>
            <CustomSelect
              value={draft.redis?.mode ?? 'memory'}
              onChange={(value) => onChange('redis.mode', value)}
              options={[
                { value: 'memory', label: '内存缓存' },
                { value: 'redis', label: 'Redis' }
              ]}
            />
          </div>
        </div>

        <div className="config-field-card">
          <label className="config-field">
            <span>Redis 主机</span>
            <input value={draft.redis?.host ?? ''} onChange={(e) => onChange('redis.host', e.target.value)} placeholder="localhost" />
          </label>
        </div>

        <div className="config-field-card">
          <label className="config-field">
            <span>Redis 端口</span>
            <input value={draft.redis?.port ?? ''} onChange={(e) => onChange('redis.port', e.target.value)} placeholder="6379" />
          </label>
        </div>

        <div className="config-field-card">
          <label className="config-field">
            <span>Redis 密码</span>
            <input type="password" value={draft.redis?.password ?? ''} onChange={(e) => onChange('redis.password', e.target.value)} placeholder="可选" />
          </label>
        </div>

        <div className="config-field-card">
          <label className="config-field">
            <span>Redis 数据库</span>
            <input value={draft.redis?.db ?? ''} onChange={(e) => onChange('redis.db', e.target.value)} placeholder="0" />
          </label>
        </div>

        <div className="config-field-card">
          <button
            type="button"
            className="config-primary-btn"
            onClick={handleTestRedis}
            disabled={testingRedis || draft.redis?.mode !== 'redis'}
            style={{ marginTop: '20px', width: '100%' }}
          >
            {testingRedis ? '测试中...' : '测试 Redis 连接'}
          </button>
        </div>
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
