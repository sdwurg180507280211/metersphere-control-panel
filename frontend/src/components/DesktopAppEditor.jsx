import { useEffect, useRef, useState } from 'react'
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

function buildInitial(project) {
  return {
    id: project?.id || '',
    name: project?.name || '',
    startCommand: project?.startCommand || '',
    stopCommand: project?.stopCommand || '',
    statusPort: project?.statusPort || ''
  }
}

export default function CommandProjectEditor({ project = null, onClose, onSaved }) {
  const dialogRef = useRef(null)
  const initial = useRef(buildInitial(project))
  const editing = Boolean(project?.id)
  const [form, setForm] = useState(() => buildInitial(project))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const dirty = Object.keys(form).some((key) => String(form[key]) !== String(initial.current[key]))
  const busy = saving || deleting
  const requestClose = () => {
    if (busy) return
    if (dirty && !window.confirm('项目配置尚未保存。确定放弃这次修改吗？')) return
    onClose?.()
  }
  useEffect(() => {
    const dialog = dialogRef.current
    dialog.showModal()
    return () => dialog.close()
  }, [])
  useEffect(() => {
    const guard = (event) => {
      if (dirty || busy) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [dirty, busy])

  const validPort = form.statusPort === '' || (Number.isInteger(Number(form.statusPort)) && Number(form.statusPort) >= 1 && Number(form.statusPort) <= 65535)
  const canSave = validPort && form.name.trim()
    && form.startCommand.trim()
    && form.stopCommand.trim()
    && !busy

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      await requestJson('/api/projects/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editing ? { id: form.id } : {}),
          type: 'command',
          name: form.name.trim(),
          startCommand: form.startCommand.trim(),
          stopCommand: form.stopCommand.trim(),
          statusPort: form.statusPort === '' ? null : Number(form.statusPort)
        })
      })
      toast.success(editing ? '项目配置已更新' : '项目已添加')
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
    if (!window.confirm(`确定删除“${form.name}”吗？\n\n只删除 Local Service Hub 项目配置，不执行关闭命令。`)) return
    setDeleting(true)
    try {
      await requestJson(`/api/projects/commands/${encodeURIComponent(form.id)}`, { method: 'DELETE' })
      toast.success('项目配置已删除')
      await onSaved?.()
      onClose?.()
    } catch (error) {
      toast.error(error.message || '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <dialog ref={dialogRef} className="desktop-editor-dialog" aria-labelledby="project-editor-title" onCancel={(event) => { event.preventDefault(); requestClose() }}>
      <section className="desktop-editor" onMouseDown={(event) => event.stopPropagation()}>
        <header className="desktop-editor-head">
          <div>
            <span>本地项目</span>
            <h2 id="project-editor-title">{editing ? `配置 ${project.name}` : '添加项目'}</h2>
          </div>
          <button type="button" aria-label="关闭项目配置" disabled={busy} onClick={requestClose}>×</button>
        </header>

        <fieldset className="desktop-editor-body" disabled={busy}>
          <label className="desktop-editor-block">
            <span>项目名称</span>
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
            {!validPort && <small role="alert">端口必须是 1–65535 之间的整数。</small>}
            <small>填写后通过 127.0.0.1 端口判断运行状态；不填写时仍可手动启动和关闭。</small>
          </label>

          <div className="desktop-command-safety">
            命令只会先保存到本机配置；点击对应项目的“启动”或“关闭”时，后端才会按项目 ID 读取并执行。
          </div>
        </fieldset>

        <footer className="desktop-editor-footer">
          {editing ? (
            <button type="button" className="desktop-editor-delete" onClick={handleDelete} disabled={deleting || saving}>
              {deleting ? '删除中…' : '删除配置'}
            </button>
          ) : <span />}
          <div>
            <button type="button" className="desktop-editor-cancel" disabled={busy} onClick={requestClose}>取消</button>
            <button type="button" className="desktop-editor-save" disabled={!canSave} onClick={handleSave}>
              {saving ? '保存中…' : editing ? '保存配置' : '添加项目'}
            </button>
          </div>
        </footer>
      </section>
    </dialog>
  )
}
