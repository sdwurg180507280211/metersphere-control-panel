function ConfigServicesSection({ services, fieldErrors, fieldWarnings, onAddService, onUpdateService, onRemoveService }) {
  const entries = Object.entries(services)

  return (
    <section className="config-card">
      <div className="config-card-header">
        <div>
          <h3 className="section-title">服务配置</h3>
          <p className="config-section-desc">在同一页面维护 pom、端口、健康检查和启动顺序。</p>
        </div>
        <button className="config-secondary-btn" onClick={() => onAddService()}>+ 新增服务</button>
      </div>

      <div className="config-services-table">
        <div className="config-services-head">
          <span>服务</span>
          <span>POM</span>
          <span>端口</span>
          <span>健康端口</span>
          <span>健康检查</span>
          <span>顺序</span>
          <span>启用</span>
          <span />
        </div>

        {entries.length === 0 ? (
          <div className="config-empty-text">暂无服务配置</div>
        ) : entries.map(([serviceId, service]) => (
          <div key={serviceId} className="config-services-row">
            <div className="config-service-identity">
              <strong>{serviceId}</strong>
              <input value={service.name ?? ''} onChange={(e) => onUpdateService(serviceId, { name: e.target.value })} placeholder="服务名称" />
              <FieldMessages path={`services.${serviceId}.name`} fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} />
            </div>

            <div className="config-service-cell config-service-cell-wide">
              <input value={service.pom ?? ''} onChange={(e) => onUpdateService(serviceId, { pom: e.target.value })} />
              <FieldMessages path={`services.${serviceId}.pom`} fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} />
            </div>

            <div className="config-service-cell">
              <input value={service.port ?? ''} onChange={(e) => onUpdateService(serviceId, { port: e.target.value })} />
              <FieldMessages path={`services.${serviceId}.port`} fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} />
            </div>

            <div className="config-service-cell">
              <input value={service.healthCheckPort ?? ''} onChange={(e) => onUpdateService(serviceId, { healthCheckPort: e.target.value })} />
              <FieldMessages path={`services.${serviceId}.healthCheckPort`} fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} />
            </div>

            <div className="config-service-cell config-service-cell-wide">
              <input value={service.healthCheck ?? ''} onChange={(e) => onUpdateService(serviceId, { healthCheck: e.target.value })} />
              <FieldMessages path={`services.${serviceId}.healthCheck`} fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} />
            </div>

            <div className="config-service-cell">
              <input value={service.startOrder ?? ''} onChange={(e) => onUpdateService(serviceId, { startOrder: e.target.value })} />
              <FieldMessages path={`services.${serviceId}.startOrder`} fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} />
            </div>

            <label className="config-checkbox config-service-toggle">
              <input type="checkbox" checked={service.enabled !== false} onChange={(e) => onUpdateService(serviceId, { enabled: e.target.checked })} />
              <span>{service.enabled !== false ? '已启用' : '已停用'}</span>
            </label>

            <button className="config-danger-btn" onClick={() => onRemoveService(serviceId)}>删除</button>
          </div>
        ))}
      </div>
    </section>
  )
}

function FieldMessages({ path, fieldErrors, fieldWarnings }) {
  return (
    <>
      {(fieldErrors[path] || []).map((message) => (
        <small key={`${path}-${message}`} className="config-field-error">{message}</small>
      ))}
      {(fieldWarnings[path] || []).map((message) => (
        <small key={`${path}-${message}-warning`} className="config-field-warning">{message}</small>
      ))}
    </>
  )
}

export default ConfigServicesSection
