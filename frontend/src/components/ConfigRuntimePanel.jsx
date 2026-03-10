function ConfigRuntimePanel({ runtime, resolved, meta, applyImpact }) {
  return (
    <section className="config-card config-panel-card">
      <div className="config-card-header">
        <div>
          <h3 className="section-title">运行时信息</h3>
          <p className="config-section-desc">只读展示环境变量、解析结果和生效边界。</p>
        </div>
      </div>

      <PanelGroup title="解析后配置">
        <PanelItem label="项目根目录" value={resolved?.projectRoot || '-'} />
        <PanelItem label="服务数量" value={String(resolved?.serviceCatalog?.length || 0)} />
        <PanelItem label="前端模块" value={String(resolved?.frontendModules?.length || 0)} />
        <PanelItem label="待应用变更" value={String(applyImpact?.changedPaths?.length || 0)} />
      </PanelGroup>

      <PanelGroup title="缓存 / Redis">
        <PanelItem label="缓存模式" value={runtime?.cache?.configuredMode || '-'} />
        <PanelItem label="Redis Host" value={runtime?.redis?.host || '-'} />
        <PanelItem label="Redis Port" value={String(runtime?.redis?.port || '-')} />
        <PanelItem label="Properties 路径" value={runtime?.redis?.propertiesPath || '-'} />
      </PanelGroup>

      <PanelGroup title="任务与超时">
        <PanelItem label="任务限流窗口" value={`${runtime?.job?.rateLimitWindowSeconds || '-'} 秒`} />
        <PanelItem label="服务健康检查" value={`${runtime?.timeouts?.healthTimeoutMs || '-'} ms`} />
        <PanelItem label="服务启动" value={`${runtime?.timeouts?.startTimeoutMs || '-'} ms`} />
        <PanelItem label="服务 Reload" value={`${runtime?.timeouts?.reloadTimeoutMs || '-'} ms`} />
      </PanelGroup>

      <PanelGroup title="生效说明">
        <PanelItem label="热应用字段" value={(meta?.hotApplySupportedFields || []).join(', ') || '-'} />
        <PanelItem label="需重启字段" value={(meta?.requiresRestartFields || []).join(', ') || '-'} />
        <PanelItem label="存在未应用改动" value={meta?.hasUnappliedChanges ? '是' : '否'} />
      </PanelGroup>
    </section>
  )
}

function PanelGroup({ title, children }) {
  return (
    <div className="config-panel-group">
      <div className="config-subtitle">{title}</div>
      <div className="config-panel-list">{children}</div>
    </div>
  )
}

function PanelItem({ label, value }) {
  return (
    <div className="config-panel-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export default ConfigRuntimePanel
