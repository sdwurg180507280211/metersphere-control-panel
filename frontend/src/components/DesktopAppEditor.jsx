import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import './DesktopAppEditor.css'

async function requestJson(url, init) {
  const response = await fetch(url, init)
  const data = await response.json()
  if (!response.ok || data.success === false) {
    throw new Error(data.error?.message || data.error || `请求失败 (${response.status})`)
  }
  return data.data
}

function toArgsText(args) {
  return Array.isArray(args) ? args.join('\n') : ''
}

function buildInitial(app, detection) {
  const first = detection?.candidates?.[0]
  return {
    id: app?.id || detection?.suggestedId || '',
    name: app?.name || detection?.suggestedName || '',
    group: app?.group || '本地应用',
    runtime: app?.runtime || first?.runtime || detection?.suggestedRuntime || 'process',
    cwd: app?.cwd || detection?.cwd || '',
    port: app?.port || detection?.suggestedPort || '',
    command: app?.start?.command || first?.command || '',
    argsText: toArgsText(app?.start?.args || first?.args),
    env: app?.start?.env || {}
  }
}

export default function DesktopAppEditor({
  app = null,
  initialDetection = null,
  createMode = false,
  onClose,
  onSaved
}) {
  const editing = Boolean(app?.id) && !createMode
  const [form, setForm] = useState(() => buildInitial(app, initialDetection))
  const [detection, setDetection] = useState(initialDetection)
  const [detecting, setDetecting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const candidates = detection?.candidates || []
  const canSave = form.id.trim() && form.name.trim() && form.cwd.trim() && form.command.trim() && !saving

  const detectedLabel = useMemo(() => {
    if (!detection) return null
    const types = detection.detectedTypes || []
    return types.length > 0 ? types.join(' / ') : '未识别框架，可手动配置'
  }, [detection])

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const applyCandidate = (candidate) => {
    setForm((current) => ({
      ...current,
      runtime: candidate.runtime || current.runtime,
      command: candidate.command || '',
      argsText: toArgsText(candidate.args)
    }))
  }

  const detectDirectory = async (cwd) => {
    if (!cwd) return
    setDetecting(true)
    try {
      const result = await requestJson('/api/services/desktop-apps/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd })
      })
      setDetection(result)
      setForm((current) => {
        const first = result.candidates?.[0]
        return {
          ...current,
          cwd: result.cwd || cwd,
          id: editing ? current.id : (current.id || result.suggestedId || ''),
          name: editing ? current.name : (current.name || result.suggestedName || ''),
          runtime: first?.runtime || result.suggestedRuntime || current.runtime,
          port: current.port || result.suggestedPort || '',
          command: current.command || first?.command || '',
          argsText: current.argsText || toArgsText(first?.args)
        }
      })
    } catch (error) {
      toast.error(error.message || '项目识别失败')
    } finally {
      setDetecting(false)
    }
  }

  const chooseDirectory = async () => {
    try {
      let cwd = null
      if (window.desktopBridge?.selectDirectory) {
        cwd = await window.desktopBridge.selectDirectory()
      } else {
        cwd = window.prompt('输入本地项目绝对路径', form.cwd) || null
      }
      if (!cwd) return
      update('cwd', cwd)
      await detectDirectory(cwd)
    } catch (error) {
      toast.error(error.message || '选择目录失败')
    }
  }

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      await requestJson('/api/services/desktop-apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: form.id.trim().toLowerCase(),
          name: form.name.trim(),
          group: form.group.trim() || '本地应用',
          runtime: form.runtime,
          cwd: form.cwd.trim(),
          port: form.port === '' ? null : Number(form.port),
          createOnly: !editing,
          start: {
            command: form.command.trim(),
            args: form.argsText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
            env: form.env
          }
        })
      })
      toast.success(editing ? '应用配置已更新' : '本地应用已添加')
      await onSaved?.()
      onClose?.()
    } catch (error) {
      toast.error(error.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!editing || deleting) return
    if (!window.confirm(`确定删除“${form.name || form.id}”吗？\n\n只删除控制中心配置，不删除项目文件。`)) return
    setDeleting(true)
    try {
      await requestJson(`/api/services/desktop-apps/${encodeURIComponent(form.id)}`, { method: 'DELETE' })
      toast.success('本地应用已移除')
      await onSaved?.()
      onClose?.()
    } catch (error) {
      toast.error(error.message || '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="desktop-editor-backdrop desktop-no-drag" onMouseDown={onClose}>
      <section className="desktop-editor" onMouseDown={(event) => event.stopPropagation()}>
        <header className="desktop-editor-head">
          <div>
            <span>{editing ? 'EDIT LOCAL APP' : 'ADD LOCAL APP'}</span>
            <h2>{editing ? '配置本地应用' : '添加本地应用'}</h2>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </header>

        <div className="desktop-editor-body">
          <div className="desktop-editor-path-row">
            <label>
              <span>项目目录</span>
              <input value={form.cwd} onChange={(event) => update('cwd', event.target.value)} placeholder="/Users/me/Workspace/project" />
            </label>
            <button type="button" className="desktop-editor-detect" onClick={chooseDirectory} disabled={detecting}>
              {detecting ? '识别中…' : '选择目录'}
            </button>
          </div>

          {detection && (
            <div className="desktop-detection-card">
              <div>
                <strong>已识别</strong>
                <span>{detectedLabel}</span>
              </div>
              {detection.suggestedPort ? <span className="desktop-detect-port">建议端口 {detection.suggestedPort}</span> : null}
            </div>
          )}

          {candidates.length > 0 && (
            <div className="desktop-candidate-section">
              <span className="desktop-editor-label">启动方式候选</span>
              <div className="desktop-candidate-list">
                {candidates.map((candidate, index) => {
                  const selected = candidate.command === form.command && toArgsText(candidate.args) === form.argsText
                  return (
                    <button
                      key={`${candidate.command}-${index}`}
                      type="button"
                      className={selected ? 'is-selected' : ''}
                      onClick={() => applyCandidate(candidate)}
                    >
                      <strong>{candidate.label}</strong>
                      <span>{candidate.source}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="desktop-editor-grid">
            <label>
              <span>应用 ID</span>
              <input
                value={form.id}
                disabled={editing}
                onChange={(event) => update('id', event.target.value.toLowerCase())}
                placeholder="poster-web"
              />
            </label>
            <label>
              <span>显示名称</span>
              <input value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Poster Web" />
            </label>
            <label>
              <span>类型</span>
              <select value={form.runtime} onChange={(event) => update('runtime', event.target.value)}>
                <option value="node">Node</option>
                <option value="python">Python</option>
                <option value="java">Java</option>
                <option value="shell">Shell</option>
                <option value="process">Process</option>
              </select>
            </label>
            <label>
              <span>端口（可选）</span>
              <input type="number" min="1" max="65535" value={form.port} onChange={(event) => update('port', event.target.value)} placeholder="3000" />
            </label>
          </div>

          <label className="desktop-editor-block">
            <span>分组</span>
            <input value={form.group} onChange={(event) => update('group', event.target.value)} placeholder="本地应用" />
          </label>

          <label className="desktop-editor-block">
            <span>启动命令</span>
            <input value={form.command} onChange={(event) => update('command', event.target.value)} placeholder="npm" />
            <small>以 `spawn(command, args)` 执行，不经过 shell。</small>
          </label>

          <label className="desktop-editor-block">
            <span>启动参数 · 每行一个</span>
            <textarea
              rows="4"
              value={form.argsText}
              onChange={(event) => update('argsText', event.target.value)}
              placeholder={'run\ndev'}
            />
          </label>
        </div>

        <footer className="desktop-editor-footer">
          {editing ? (
            <button type="button" className="desktop-editor-delete" onClick={handleDelete} disabled={deleting || saving}>
              {deleting ? '删除中…' : '删除应用'}
            </button>
          ) : <span />}
          <div>
            <button type="button" className="desktop-editor-cancel" onClick={onClose}>取消</button>
            <button type="button" className="desktop-editor-save" disabled={!canSave} onClick={handleSave}>
              {saving ? '保存中…' : editing ? '保存配置' : '添加应用'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
