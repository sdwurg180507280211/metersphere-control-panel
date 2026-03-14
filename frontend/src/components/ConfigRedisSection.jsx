import { useState } from 'react'
import toast from 'react-hot-toast'
import CustomSelect from './CustomSelect'

function ConfigRedisSection({ redisConfig, fieldErrors, fieldWarnings, onChange }) {
  const [testing, setTesting] = useState(false)

  const handleTest = async () => {
    setTesting(true)
    try {
      const response = await fetch('/api/config/test-redis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: redisConfig?.host || 'localhost',
          port: redisConfig?.port || 6379,
          password: redisConfig?.password || '',
          db: redisConfig?.db || 0
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
      setTesting(false)
    }
  }

  const handleChange = (field, value) => {
    onChange('redis.' + field, value)
  }

  return (
    <div className="config-form-grid">
      <div className="config-field-card">
        <div className="config-field">
          <span>缓存模式</span>
          <CustomSelect
            value={redisConfig?.mode ?? 'memory'}
            onChange={(value) => handleChange('mode', value)}
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
          <input 
            value={redisConfig?.host ?? ''} 
            onChange={(e) => handleChange('host', e.target.value)} 
            placeholder="localhost"
            disabled={redisConfig?.mode !== 'redis'}
          />
        </label>
      </div>

      <div className="config-field-card">
        <label className="config-field">
          <span>Redis 端口</span>
          <input 
            value={redisConfig?.port ?? ''} 
            onChange={(e) => handleChange('port', e.target.value)} 
            placeholder="6379"
            disabled={redisConfig?.mode !== 'redis'}
          />
        </label>
      </div>

      <div className="config-field-card">
        <label className="config-field">
          <span>Redis 密码</span>
          <input 
            type="password" 
            value={redisConfig?.password ?? ''} 
            onChange={(e) => handleChange('password', e.target.value)} 
            placeholder="可选"
            disabled={redisConfig?.mode !== 'redis'}
          />
        </label>
      </div>

      <div className="config-field-card">
        <label className="config-field">
          <span>Redis 数据库</span>
          <input 
            value={redisConfig?.db ?? ''} 
            onChange={(e) => handleChange('db', e.target.value)} 
            placeholder="0"
            disabled={redisConfig?.mode !== 'redis'}
          />
        </label>
      </div>

      <div className="config-field-card">
        <button
          type="button"
          className="config-primary-btn"
          onClick={handleTest}
          disabled={testing || redisConfig?.mode !== 'redis'}
          style={{ marginTop: '20px', width: '100%' }}
        >
          {testing ? '测试中...' : '测试 Redis 连接'}
        </button>
      </div>
    </div>
  )
}

export default ConfigRedisSection
