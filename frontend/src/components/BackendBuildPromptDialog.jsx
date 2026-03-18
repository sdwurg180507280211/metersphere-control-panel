import './BackendBuildPromptDialog.css'

function BackendBuildPromptDialog({ isOpen, onBuildBackend, onCancel }) {
  if (!isOpen) return null

  return (
    <div className="backend-prompt-overlay">
      <div className="backend-prompt-dialog">
        <div className="backend-prompt-header">
          <span className="backend-prompt-icon">🚀</span>
          <h3>前端构建完成</h3>
        </div>
        <div className="backend-prompt-body">
          <p>前端模块已成功构建完成！</p>
          <p>是否继续构建后端服务？</p>
        </div>
        <div className="backend-prompt-footer">
          <button className="btn-cancel" onClick={onCancel}>
            稍后手动构建
          </button>
          <button className="btn-confirm btn-success" onClick={onBuildBackend}>
            立即构建后端
          </button>
        </div>
      </div>
    </div>
  )
}

export default BackendBuildPromptDialog
