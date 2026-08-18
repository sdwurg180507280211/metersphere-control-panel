import './PackageProgressStepper.css'

const PIPELINE_STEPS = [
  { id: 'preflight', label: '环境检查', shortLabel: '环境' },
  { id: 'dependencies', label: '依赖准备', shortLabel: '依赖' },
  { id: 'service_build', label: '服务构建', shortLabel: '构建' },
  { id: 'export_images', label: '镜像导出', shortLabel: '导出' },
  { id: 'summary', label: '结果汇总', shortLabel: '汇总' }
]

const MODULE_STAGE_LABELS = {
  pending: '等待',
  started: '准备',
  maven: 'Maven',
  jar: '依赖整理',
  docker: 'Docker',
  succeeded: '完成',
  failed: '失败'
}

function normalizeStatus(status) {
  if (['success', 'succeeded', 'completed'].includes(status)) return 'success'
  if (status === 'failed') return 'failed'
  if (status === 'cancelled') return 'cancelled'
  return ['pending', 'running'].includes(status) ? 'running' : 'idle'
}

function resolveDisplayStage(task, buildProgress) {
  if (task?.stage === 'cancelling' || task?.stage === 'cancelled' || task?.stage === 'failed') {
    return buildProgress?.stage || task?.stage
  }
  return task?.stage || buildProgress?.stage || 'preflight'
}

function mapStageToStep(stage, buildOnly) {
  if (['prepare', 'spawn', 'running', 'preflight'].includes(stage)) return 'preflight'
  if (stage === 'dependencies') return 'dependencies'
  if (['build_modules', 'maven_build', 'docker_build'].includes(stage)) return 'service_build'
  if (stage === 'export_images') return buildOnly ? 'summary' : 'export_images'
  if (['summary', 'completed'].includes(stage)) return 'summary'
  return 'preflight'
}

function getModuleDetail(buildProgress) {
  if (!buildProgress) return null

  const total = Number(buildProgress.totalModules) || 0
  const completed = buildProgress.completedModules?.length || 0
  const failed = buildProgress.failedModules || []
  const active = buildProgress.activeModules || []
  const moduleStates = buildProgress.moduleStates || {}

  const activeText = active.slice(0, 2).map((moduleName) => {
    const stage = MODULE_STAGE_LABELS[moduleStates[moduleName]] || moduleStates[moduleName] || '构建'
    return `${moduleName} · ${stage}`
  }).join(' / ')

  return {
    total,
    completed,
    failed,
    active,
    activeText
  }
}

function getFailureText(buildProgress) {
  if (!buildProgress) return null
  if (buildProgress.lastError) return buildProgress.lastError

  const failed = buildProgress.failedModules || []
  if (failed.length === 0) return null

  const failureStages = buildProgress.moduleFailureStages || {}
  const details = failed.slice(0, 2).map((moduleName) => {
    const stage = MODULE_STAGE_LABELS[failureStages[moduleName]] || failureStages[moduleName]
    return stage ? `${moduleName} · ${stage}` : moduleName
  })
  return `失败：${details.join(' / ')}${failed.length > 2 ? ` 等 ${failed.length} 个模块` : ''}`
}

export default function PackageProgressStepper({ task, compact = false }) {
  if (!task) return null

  const status = normalizeStatus(task.status)
  const buildProgress = task.metadata?.buildProgress || task.error?.details?.buildProgress || task.result?.buildProgress || null
  const buildOnly = Boolean(task.metadata?.buildOnly ?? task.result?.buildOnly)
  const steps = buildOnly ? PIPELINE_STEPS.filter((step) => step.id !== 'export_images') : PIPELINE_STEPS
  const displayStage = resolveDisplayStage(task, buildProgress)
  const activeStepId = mapStageToStep(displayStage, buildOnly)
  const activeIndex = Math.max(0, steps.findIndex((step) => step.id === activeStepId))
  const progress = Math.max(0, Math.min(100, Math.round(Number(task.progress) || (status === 'success' ? 100 : 0))))
  const moduleDetail = getModuleDetail(buildProgress)
  const failureText = getFailureText(buildProgress)

  const getStepState = (index) => {
    if (status === 'success') return 'done'
    if (index < activeIndex) return 'done'
    if (index > activeIndex) return 'pending'
    if (status === 'failed') return 'failed'
    if (status === 'cancelled') return 'cancelled'
    return 'active'
  }

  return (
    <div className={`package-pipeline ${compact ? 'package-pipeline-compact' : ''} pipeline-${status}`}>
      <div className="package-pipeline-head">
        <div className="package-pipeline-title-group">
          <span className={`package-pipeline-live-dot ${status === 'running' ? 'is-live' : ''}`} />
          <span className="package-pipeline-title">
            {status === 'failed' ? '打包失败' : status === 'cancelled' ? '打包已取消' : status === 'success' ? '打包完成' : '打包流水线'}
          </span>
          {buildOnly && <span className="package-pipeline-mode">仅构建镜像</span>}
        </div>
        <span className="package-pipeline-percent">{progress}%</span>
      </div>

      <div className="package-pipeline-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}>
        {steps.map((step, index) => {
          const stepState = getStepState(index)
          const isBuildStep = step.id === 'service_build'
          return (
            <div key={step.id} className={`package-pipeline-step step-${stepState}`}>
              {index > 0 && (
                <div className={`package-pipeline-connector connector-${getStepState(index - 1) === 'done' ? 'done' : stepState === 'active' ? 'active' : 'pending'}`}>
                  <span className="package-pipeline-flow" />
                </div>
              )}
              <div className="package-pipeline-node-wrap">
                <div className="package-pipeline-node" aria-label={`${step.label} ${stepState}`}>
                  <span className="package-pipeline-node-core">
                    {stepState === 'done' ? '✓' : stepState === 'failed' ? '×' : stepState === 'cancelled' ? '—' : index + 1}
                  </span>
                  {stepState === 'active' && <span className="package-pipeline-node-pulse" />}
                </div>
                <span className="package-pipeline-step-label">{compact ? step.shortLabel : step.label}</span>
                {!compact && isBuildStep && moduleDetail?.total > 0 && (
                  <span className={`package-pipeline-step-detail ${moduleDetail.failed.length > 0 ? 'has-failure' : ''}`}>
                    {moduleDetail.completed}/{moduleDetail.total}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {!compact && (
        <div className={`package-pipeline-detail ${status === 'failed' ? 'detail-failed' : ''}`}>
          {status === 'failed' && failureText ? (
            <span>{failureText}</span>
          ) : activeStepId === 'service_build' && moduleDetail?.activeText ? (
            <span>当前：{moduleDetail.activeText}{moduleDetail.failed.length > 0 ? ` · ${moduleDetail.failed.length} 个失败` : ''}</span>
          ) : (
            <span>{task.message || '打包任务执行中'}</span>
          )}
        </div>
      )}
    </div>
  )
}
