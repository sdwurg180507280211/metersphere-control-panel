import './PasswordDialog.css'

function PasswordDialog({
  isOpen,
  title,
  description,
  value,
  error,
  loading,
  onChange,
  onConfirm,
  onCancel
}) {
  if (!isOpen) {
    return null
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    onConfirm()
  }

  return (
    <div className="password-dialog-overlay" onClick={loading ? undefined : onCancel}>
      <div className="password-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="password-dialog-header">
          <span className="password-dialog-icon">🔐</span>
          <h3>{title}</h3>
        </div>

        <form className="password-dialog-body" onSubmit={handleSubmit}>
          <p className="password-dialog-description">{description}</p>

          <label className="password-dialog-label" htmlFor="root-password">
            管理员密码
          </label>
          <input
            id="root-password"
            className="password-dialog-input"
            type="password"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="请输入管理员密码"
            autoFocus
            autoComplete="current-password"
            disabled={loading}
          />

          <p className="password-dialog-hint">密码仅用于本次 sudo 校验，不会在前后端持久化。</p>
          {error ? <p className="password-dialog-error">{error}</p> : null}

          <div className="password-dialog-footer">
            <button className="btn-cancel" type="button" onClick={onCancel} disabled={loading}>
              取消
            </button>
            <button className="btn-confirm btn-info" type="submit" disabled={loading}>
              {loading ? '执行中...' : '确认执行'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default PasswordDialog
