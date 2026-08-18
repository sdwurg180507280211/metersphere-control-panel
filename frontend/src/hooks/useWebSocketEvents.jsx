import { useCallback } from 'react'
import { toast } from 'react-hot-toast'
import {
  useBuildStore,
  useInfraStore,
  useLogStore,
  usePackageStore,
  useServiceStore
} from '../store/useAppStore'

function extractError(data, defaultMessage) {
  const { error } = data || {}
  if (typeof error === 'object' && error !== null) {
    return error.message || defaultMessage
  }
  return error || defaultMessage
}

export function useWebSocketEvents(scheduleRefresh) {
  const requestServiceAction = useCallback(async (action, serviceId, serviceName) => {
    try {
      const response = await fetch(`/api/services/${serviceId}/${action}`, { method: 'POST' })
      const data = await response.json()
      if (!data.success) {
        toast.error(extractError(data, action === 'restart' ? '重启失败' : '启动失败'))
        return
      }

      const phase = action === 'restart' ? 'restarting' : 'starting'
      const actionLabel = action === 'restart' ? '重启' : '启动'
      toast.success(`${serviceName} ${actionLabel}命令已发送`)
      useServiceStore.getState().updateServiceStatus(serviceId, { phase, running: false })
    } catch (error) {
      toast.error(`${action === 'restart' ? '重启' : '启动'}失败: ${error.message}`)
    }
  }, [])

  const handleBuildCompleted = useCallback((data) => {
    const { module, linkedService, autoRestart } = data || {}
    if (!module) return

    window.dispatchEvent(new CustomEvent('buildComplete', {
      detail: { status: 'success', module, linkedService, autoRestart }
    }))

    if (autoRestart) {
      toast.success(`${module.name} 构建完成，正在自动重启关联服务...`)
    } else if (!linkedService) {
      toast.success(`${module.name} 构建完成`)
    } else {
      const serviceStatus = linkedService.running ? '运行中' : '已停止'
      const action = linkedService.running ? 'restart' : 'start'
      const actionLabel = linkedService.running ? '重启服务' : '启动服务'

      toast.success((t) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div><strong>{module.name}</strong> 构建完成！</div>
          <div style={{ fontSize: '14px', color: '#666' }}>
            关联服务 <strong>{linkedService.name}</strong> ({serviceStatus})
          </div>
          <button
            onClick={() => {
              toast.dismiss(t.id)
              requestServiceAction(action, linkedService.id, linkedService.name)
            }}
            style={{
              padding: '6px 12px',
              background: linkedService.running ? '#667eea' : '#52c41a',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            {linkedService.running ? '🔄' : '▶️'} {actionLabel}
          </button>
        </div>
      ), { duration: 10000 })
    }

    scheduleRefresh('services', () => useServiceStore.getState().fetchServices(), 500)
  }, [requestServiceAction, scheduleRefresh])

  const handleBatchBuildCompleted = useCallback((data) => {
    const results = data?.results || []
    const servicesToRestart = data?.servicesToRestart || []
    const successCount = results.filter((result) => result.success).length
    const failedCount = results.filter((result) => !result.success && !result.cancelled).length

    if (data?.autoRestart) {
      toast.success(
        <div>
          批量构建完成：{successCount} 成功，{failedCount} 失败
          <br />
          <span style={{ fontSize: '12px', color: '#666' }}>正在自动重启关联服务...</span>
        </div>,
        { duration: 5000 }
      )
    } else if (servicesToRestart.length > 0) {
      toast.success((t) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div>批量构建完成：{successCount} 成功，{failedCount} 失败</div>
          <div style={{ fontSize: '14px', color: '#666' }}>{servicesToRestart.length} 个关联服务待重启</div>
          <button
            onClick={() => {
              toast.dismiss(t.id)
              window.dispatchEvent(new CustomEvent('switchTab', { detail: 'services' }))
            }}
            style={{
              padding: '6px 12px',
              background: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            前往服务管理
          </button>
        </div>
      ), { duration: 10000 })
    } else {
      toast.success(`批量构建完成：${successCount} 成功，${failedCount} 失败`)
    }

    scheduleRefresh('services', () => useServiceStore.getState().fetchServices(), 500)
  }, [scheduleRefresh])

  const handleJobEvent = useCallback((channel, job) => {
    if (!job) return

    const isTerminal = channel === 'job:completed' || channel === 'job:failed'
    const isServiceJob = typeof job.type === 'string' && job.type.startsWith('service.')
    const isBuildJob = typeof job.type === 'string' && job.type.startsWith('frontend.build')
    const isPackageJob = job.type === 'package.run'

    if (isBuildJob) {
      const buildId = job.buildId || job.metadata?.buildId || job.result?.buildId || job.jobId
      if (channel === 'job:progress' && buildId) {
        useBuildStore.getState().updateBuildProgress(buildId, {
          jobId: job.jobId,
          buildId,
          status: job.status,
          overallProgress: job.progress,
          stepName: job.message,
          stage: job.stage,
          moduleId: job.targetId,
          module: job.metadata?.moduleName || job.metadata?.moduleId || job.targetId,
          error: job.error?.message || null
        })
      }

      if (isTerminal) {
        scheduleRefresh('activeBuilds', () => useBuildStore.getState().fetchActiveBuilds(), 300)
        scheduleRefresh('buildHistory', () => useBuildStore.getState().fetchBuildHistory(), 300)
        scheduleRefresh('services', () => useServiceStore.getState().fetchServices(), 500)
      }
    }

    if (isServiceJob) {
      if (channel === 'job:progress' && job.targetId) {
        const phaseMap = {
          infra_check: 'starting',
          prepare: 'starting',
          compile: 'starting',
          stop_old_process: job.type === 'service.stop' ? 'stopping' : 'restarting',
          start_new_process: job.type === 'service.start' ? 'starting' : 'restarting',
          health_check: 'checking_health',
          compensation_start: 'restarting',
          running_children: 'running_children'
        }
        useServiceStore.getState().updateServiceStatus(job.targetId, {
          phase: phaseMap[job.stage] || 'processing'
        })
      }
      if (isTerminal) {
        scheduleRefresh('services', () => useServiceStore.getState().fetchServices(), 300)
      }
    }

    if (['service.batch.start', 'service.batch.stop', 'service.batch.restart'].includes(job.type) && isTerminal) {
      scheduleRefresh('services', () => useServiceStore.getState().fetchServices(), 300)
    }

    if (isPackageJob) {
      usePackageStore.getState().updateCurrentTask(job)
      if (channel === 'job:completed') {
        if (job.status === 'cancelled') {
          toast('打包任务已取消')
        } else {
          toast.success('打包任务已完成')
          scheduleRefresh('packageOptions', () => usePackageStore.getState().fetchOptions(), 500)
        }
        scheduleRefresh('packageHistory', () => usePackageStore.getState().fetchHistory({ page: 1, pageSize: 20 }), 500)
      } else if (channel === 'job:failed') {
        toast.error(job.error?.message || '打包任务失败')
        scheduleRefresh('packageHistory', () => usePackageStore.getState().fetchHistory({ page: 1, pageSize: 20 }), 500)
      }
    }
  }, [scheduleRefresh])

  const handlePackageEvent = useCallback((channel, payload) => {
    if (!payload) return

    const nextStatus = channel === 'package:cancelled'
      ? 'idle'
      : payload.status || (channel === 'package:failed' ? 'failed' : channel === 'package:completed' ? 'success' : 'running')

    usePackageStore.getState().updateCurrentTask({
      jobId: payload.jobId,
      status: nextStatus,
      stage: payload.stage,
      message: payload.message,
      result: payload.result || null,
      error: payload.error || null,
      metadata: {
        services: payload.services,
        serviceImageVersions: payload.serviceImageVersions,
        parallelBuild: payload.parallelBuild,
        maxJobs: payload.maxJobs,
        heartbeatAt: payload.heartbeatAt
      }
    })

    if (channel === 'package:completed') {
      scheduleRefresh('packageOptions', () => usePackageStore.getState().fetchOptions(), 500)
    }
    if (['package:completed', 'package:failed', 'package:cancelled'].includes(channel)) {
      scheduleRefresh('packageHistory', () => usePackageStore.getState().fetchHistory({ page: 1, pageSize: 20 }), 500)
    }
  }, [scheduleRefresh])

  const handleTunnelEvent = useCallback((data) => {
    if (!data) return

    if (data.event === 'connected') {
      if (data.reconnected) toast.success('SSH 隧道已自动重连')
      window.dispatchEvent(new CustomEvent('tunnelStatusChange', { detail: 'RUNNING' }))
    } else if (data.event === 'reconnecting') {
      toast.loading(`SSH 隧道已断开，正在重连 (${data.attempt}/${data.maxRetries})...`, {
        id: 'tunnel-reconnect',
        duration: Math.min(data.delay + 1000, 30000)
      })
      window.dispatchEvent(new CustomEvent('tunnelStatusChange', { detail: 'RECONNECTING' }))
    } else if (data.event === 'disconnected') {
      toast.dismiss('tunnel-reconnect')
      toast.error('SSH 隧道已断开，自动重连失败，请手动重连')
      window.dispatchEvent(new CustomEvent('tunnelStatusChange', { detail: 'STOPPED' }))
    }
  }, [])

  const handleChannelMessage = useCallback((channel, payload) => {
    switch (channel) {
      case 'logs:service':
        useLogStore.getState().appendServiceLog(payload?.lines ? payload : payload?.message)
        break
      case 'logs:build':
      case 'logs:devserver':
        useLogStore.getState().appendBuildLog(payload?.lines ? payload : payload?.message)
        break
      case 'logs:package':
        useLogStore.getState().appendPackageLog(payload?.lines ? payload : payload?.message)
        break
      case 'build:progress':
        useBuildStore.getState().updateBuildProgress(payload?.buildId, payload)
        if (['success', 'failed', 'cancelled'].includes(payload?.status)) {
          scheduleRefresh('services', () => useServiceStore.getState().fetchServices(), 1500)
        }
        break
      case 'service:status':
        if (payload?.serviceId) {
          useServiceStore.getState().updateServiceStatus(payload.serviceId, payload)
        }
        break
      case 'build:completed':
        handleBuildCompleted(payload)
        break
      case 'build:batchCompleted':
        handleBatchBuildCompleted(payload)
        break
      case 'job:progress':
      case 'job:completed':
      case 'job:failed':
        handleJobEvent(channel, payload)
        break
      case 'infra:status':
        useInfraStore.getState().setStatus(payload)
        break
      case 'tunnel:status':
        handleTunnelEvent(payload)
        break
      case 'package:started':
      case 'package:heartbeat':
      case 'package:cancelling':
      case 'package:completed':
      case 'package:failed':
      case 'package:cancelled':
        handlePackageEvent(channel, payload)
        break
      default:
        break
    }
  }, [handleBatchBuildCompleted, handleBuildCompleted, handleJobEvent, handlePackageEvent, handleTunnelEvent, scheduleRefresh])

  const handleConnected = useCallback(() => {
    useServiceStore.getState().fetchServices()
    usePackageStore.getState().fetchActiveTask()
    useInfraStore.getState().fetchInfraStatus()
    useLogStore.getState().loadCommandHistory()
  }, [])

  return { handleChannelMessage, handleConnected }
}
