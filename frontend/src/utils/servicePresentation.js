// Presentation only: observations are not lifecycle decisions or root causes.
export function errorText(error) {
  return typeof error === 'string' ? error : typeof error?.message === 'string' ? error.message : ''
}

export function servicePresentation(status = {}, stale = false) {
  const message = errorText(status.error) || errorText(status.health?.error)
  const hasIssue = status.phase === 'failed' || Boolean(message) || status.health?.healthy === false || status.portOccupied === true
  const healthStale = stale || status.healthStale === true
  const healthLabel = healthStale ? '健康状态待刷新'
    : status.health?.healthy === true ? '健康检查通过'
      : status.health?.healthy === false ? '健康检查异常' : '健康状态未知'
  const processLabel = stale || status.processStale === true ? '进程状态待刷新'
    : status.processAlive === true ? '进程存活'
      : status.processAlive === false ? '进程未运行' : '进程状态未确认'
  let hint = ''
  if (status.portOccupied === true) {
    hint = '检查端口占用进程的归属。控制台未接管的进程不会被自动终止。'
  } else if (/\b404\b/.test(message)) {
    hint = '检查项目配置中的健康检查路径和管理端口，再重新检查。'
  } else if (/\b(401|403)\b|权限/.test(message)) {
    hint = '检查健康检查端点的访问权限，不要直接关闭服务的安全校验。'
  } else if (/超时|timeout/i.test(message)) {
    hint = '查看该服务日志，确认启动进度和健康端点响应，再重新检查。'
  } else if (/连接失败|refused/i.test(message)) {
    hint = '检查进程与监听端口，并查看该服务日志；连接失败本身不能确定根因。'
  } else if (hasIssue) {
    hint = '查看该服务日志和健康检查结果，确认原因后再决定是否重启。'
  }
  return { message, hasIssue, healthLabel, processLabel,
    healthTone: healthStale ? 'unknown' : status.health?.healthy === true ? 'ok' : status.health?.healthy === false ? 'warning' : 'unknown',
    hint }
}

const DEPENDENCY_REASONS = {
  NOT_CONFIGURED: '本地未配置，状态未知', DISABLED: '本地已禁用，状态未知',
  PORT_OCCUPIED: '端口占用', SERVICE_FAILED: '服务异常', TRANSITIONING: '状态切换中',
  NOT_RUNNING: '未运行', UNHEALTHY: '健康检查未通过',
  PHASE_UNKNOWN: '阶段未知', HEALTH_UNKNOWN: '健康状态未知', STATUS_UNKNOWN: '状态未知'
}

// Keep the card brief; complete observations remain available in the drawer.
export function compactServicePresentation(status = {}, stale = false) {
  const view = servicePresentation(status, stale)
  const outdated = stale || status.healthStale === true || status.processStale === true
  const summary = view.hasIssue
    ? `${outdated ? '上次异常' : '异常'}：${view.message || (status.portOccupied ? '端口被其他进程占用' : '服务状态异常，请查看详情')}`
    : `${view.processLabel} · ${view.healthLabel}`
  const dependencyNeedsAttention = status.dependencyStatus?.ready === false
    && !stale && !status.dependencyStatusStale
  return {
    ...view,
    summary: `${outdated && view.hasIssue ? '状态待刷新 · ' : ''}${summary}${status.pid ? ` · PID ${status.pid}` : ''}`,
    summaryTone: outdated ? 'unknown' : view.hasIssue ? 'warning' : view.healthTone,
    dependencyNeedsAttention
  }
}

export function dependencyPresentation(status = {}, stale = false) {
  const observation = status.dependencyStatus
  if (!observation || !Array.isArray(observation.dependencies) || observation.dependencies.length === 0) return null
  const outdated = stale || status.dependencyStatusStale === true
  return {
    label: outdated ? '依赖观测待刷新' : observation.ready === true ? '已观测的依赖就绪'
      : observation.ready === false ? '依赖存在未就绪项' : '依赖状态未知',
    note: observation.source === 'preset'
      ? '来源：预设关系，仅供排查参考，不代表此次异常原因。'
      : '依赖观测仅供排查参考，不代表此次异常原因。',
    items: observation.dependencies.filter((item) => item && typeof item.id === 'string').map((item) => ({
      id: item.id,
      name: typeof item.name === 'string' ? item.name : item.id,
      label: outdated ? '待刷新' : item.available === true ? '已观测就绪'
        : DEPENDENCY_REASONS[item.reason] || (item.available === false ? '未就绪' : '状态未知'),
      tone: outdated ? 'unknown' : item.available === true ? 'ok' : item.available === false ? 'warning' : 'unknown'
    }))
  }
}
