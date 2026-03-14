function ConfigPathSection({ propertiesConfig, fieldErrors, fieldWarnings, onChange }) {
  const handleChange = (field, value) => {
    onChange('properties.' + field, value)
  }

  return (
    <div className="config-form-grid">
      <div className="config-field-card config-field-card-wide">
        <label className="config-field">
          <span>metersphere.properties 路径</span>
          <input
            value={propertiesConfig?.metersphere ?? ''}
            onChange={(e) => handleChange('metersphere', e.target.value)}
            placeholder="/opt/metersphere/conf/metersphere.properties"
          />
          <FieldMessages path="properties.metersphere" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} />
        </label>
      </div>

      <div className="config-field-card config-field-card-wide">
        <label className="config-field">
          <span>redisson.yml 路径</span>
          <input
            value={propertiesConfig?.redisson ?? ''}
            onChange={(e) => handleChange('redisson', e.target.value)}
            placeholder="/opt/metersphere/conf/redisson.yml"
          />
          <FieldMessages path="properties.redisson" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} />
        </label>
      </div>
    </div>
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

export default ConfigPathSection
