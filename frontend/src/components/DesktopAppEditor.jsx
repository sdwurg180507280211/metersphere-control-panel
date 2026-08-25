import { useState } from 'react'
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

function buildInitial(app) {
  return {
    id: app?.id || '',
    name: app?.name || '',
    startCommand: app?.startCommand || '',
    stopCommand: app?.stopCommand || '',
    statusPort: app?.statusPort || ''
  }
}

export default function DesktopAppEditor({ app = null, onClose, onSaved }) {
  const editing = Boolean(app?.id)
  const [form, setForm] = useState(() => buildInitial(app))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const canSave = form.name.trim()
    && form.startCommand.trim()
    && form.stopCommand.trim()
    && !saving

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      await requestJson('/api/services/desktop-apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editing ? { id: form.id } : {}),
          name: form.name.trim(),
          startCommand: form.startCommand.trim(),
          stopCommand: form.stopCommand.trim(),
          statusPort: form.statusPort === '' ? null : Number(form.statusPort)
        })
      })
      toast.success(editing ? '服务配置已更新' : '本地服务已添加')
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
    if (!window.confirm(`确定删除“${form.name}”吗？\n\n只删除 Local Service Hub 配置，不执行关闭命令。`)) return
    setDeleting(true)
    try {
      await requestJson(`/api/services/desktop-apps/${encodeURIComponent(form.id)}`, { method: 'DELETE' })
      toast.success('本地服务配置已删除')
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
            <span>{editing ? 'EDIT LOCAL SERVICE' : 'ADD LOCAL SERVICE'}</span>
            <h2>{editing ? '配置本地服务' : '添加本地服务'}</h2>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </header>

        <div className="desktop-editor-body">
          <label className="desktop-editor-block">
            <span>服务名称</span>
            <input
              value={form.name}
              onChange={(event) => update('name', event.target.value)}
              placeholder="DeepSeek Harness"
              autoFocus
            />
          </label>

          <label className="desktop-editor-block">
            <span>启动命令</span>
            <textarea
              rows="6"
              value={form.startCommand}
              onChange={(event) => update('startCommand', event.target.value)}
              placeholder={'cd /Users/edy/ideaProjects/deepseek-harness\nnohup npm run dsh -- web > /tmp/dsh-web.log 2>&1 &'}
              spellCheck="false"
            />
            <small>按原样交给本机 shell 执行，可使用 cd、nohup、重定向、环境变量和多行命令。</small>
          </label>

          <label className="desktop-editor-block">
            <span>关闭命令</span>
            <textarea
              rows="7"
              value={form.stopCommand}
              onChange={(event) => update('stopCommand', event.target.value)}
              placeholder={'dsh_pid=$(lsof -tiTCP:3080 -sTCP:LISTEN)\nif [ -n "$dsh_pid" ]; then\n  kill -TERM $dsh_pid\nfi'}
              spellCheck="false"
            />
            <small>建议优先使用应用自己的正常关闭方式或 SIGTERM，不默认强制 kill。</small>
          </label>

          <label className="desktop-editor-block desktop-port-field">
            <span>状态端口（可选）</span>
            <input
              type="number"
              min="1"
              max="65535"
              value={form.statusPort}
              onChange={(event) => update('statusPort', event.target.value)}
              placeholder="3080"
            />
            <small>填写后通过 127.0.0.1 端口判断运行状态；不填写时仍可手动启动和关闭。</small>
          </label>

          <div className="desktop-command-safety">
            命令只会先保存到本机配置；点击对应服务的“启动”或“关闭”时，后端才会按服务 ID 读取并执行。
          </div>
        </div>

        <footer className="desktop-editor-footer">
          {editing ? (
            <button type="button" className="desktop-editor-delete" onClick={handleDelete} disabled={deleting || saving}>
              {deleting ? '删除中…' : '删除配置'}
            </button>
          ) : <span />}
          <div>
            <button type="button" className="desktop-editor-cancel" onClick={onClose}>取消</button>
            <button type="button" className="desktop-editor-save" disabled={!canSave} onClick={handleSave}>
              {saving ? '保存中…' : editing ? '保存配置' : '添加服务'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
