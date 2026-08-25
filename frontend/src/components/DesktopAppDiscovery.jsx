import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import './DesktopAppDiscovery.css'

async function requestJson(url) {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok || data.success === false) {
    throw new Error(data.error?.message || data.error || `请求失败 (${response.status})`)
  }
  return data.data
}

function runtimeLabel(project) {
  const types = project.detectedTypes || []
  if (types.length === 0) return 'PROCESS'
  return types.map((item) => String(item).toUpperCase()).join(' / ')
}

export default function DesktopAppDiscovery({ onClose, onSelect }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const discover = async () => {
    setLoading(true)
    try {
      setData(await requestJson('/api/services/desktop-apps/discover'))
    } catch (error) {
      toast.error(error.message || '自动发现失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    discover()
  }, [])

  const projects = data?.projects || []
  const pending = useMemo(() => projects.filter((project) => !project.registered), [projects])
  const registered = useMemo(() => projects.filter((project) => project.registered), [projects])

  return (
    <div className="desktop-discovery-backdrop desktop-no-drag" onMouseDown={onClose}>
      <section className="desktop-discovery" onMouseDown={(event) => event.stopPropagation()}>
        <header className="desktop-discovery-head">
          <div>
            <span>AUTO DISCOVERY</span>
            <h2>自动发现本地应用</h2>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </header>

        <div className="desktop-discovery-summary">
          <span>{loading ? '扫描中…' : `发现 ${projects.length} 个项目 · ${pending.length} 个未纳管`}</span>
          <button type="button" onClick={discover} disabled={loading}>{loading ? '扫描中' : '重新扫描'}</button>
        </div>

        {data?.roots?.length > 0 && (
          <div className="desktop-discovery-roots">
            <strong>扫描目录</strong>
            {data.roots.map((root) => <span key={root}>{root}</span>)}
          </div>
        )}

        <div className="desktop-discovery-list">
          {!loading && projects.length === 0 ? (
            <div className="desktop-discovery-empty">没有发现可识别的本地项目</div>
          ) : null}

          {pending.map((project) => {
            const first = project.candidates?.[0]
            return (
              <article key={project.cwd} className="desktop-discovery-item">
                <div className="desktop-discovery-title">
                  <div>
                    <strong>{project.suggestedName || project.suggestedId}</strong>
                    <span>{project.cwd}</span>
                  </div>
                  <span className="desktop-discovery-runtime">{runtimeLabel(project)}</span>
                </div>
                <div className="desktop-discovery-meta">
                  {first ? <code>{first.label}</code> : <span>需要手动填写启动命令</span>}
                  {project.suggestedPort ? <span>:{project.suggestedPort}</span> : null}
                </div>
                <button type="button" className="desktop-discovery-add" onClick={() => onSelect(project)}>
                  配置并添加
                </button>
              </article>
            )
          })}

          {registered.length > 0 && (
            <div className="desktop-discovery-managed">
              <strong>已纳管</strong>
              {registered.map((project) => (
                <div key={project.cwd}>
                  <span>{project.suggestedName || project.registeredId}</span>
                  <code>{project.registeredId}</code>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
