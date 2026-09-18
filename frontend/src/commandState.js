export function commandState(project, status, manualRunning, busy) {
  const known = status?.statusKnown === true
  const running = known && status.running === true
  const phase = busy || (known ? status.phase : 'unknown')
  const labels = { running: '端口可访问', stopped: '端口未监听', starting: '启动中…', stopping: '关闭中…', unknown: '运行状态未验证' }
  const port = status?.port || project.statusPort
  return {
    known, running, port,
    canVisit: Boolean(port && running && !busy),
    lastStartIssued: !known && manualRunning === true,
    label: labels[phase] || labels.unknown,
    tone: busy ? 'busy' : !known ? 'unknown' : running ? 'running' : 'stopped'
  }
}
