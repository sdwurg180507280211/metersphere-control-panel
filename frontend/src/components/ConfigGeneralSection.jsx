import { useState } from 'react'
import GeneralConfigDialog from './GeneralConfigDialog'

function ConfigGeneralSection({ draft, resolved, meta, fieldErrors, fieldWarnings, onChange }) {
  const [showDialog, setShowDialog] = useState(false)

  return (
    <>
      <section className="config-card">
        <div className="config-card-header">
          <div>
            <h3 className="section-title">基础设置</h3>
          </div>
        </div>

        <div style={{ padding: '20px', textAlign: 'center' }}>
          <button
            type="button"
            className="config-primary-btn"
            onClick={() => setShowDialog(true)}
            style={{ padding: '12px 24px' }}
          >
            配置基础设置
          </button>
        </div>
      </section>

      {showDialog && (
        <GeneralConfigDialog
          onClose={() => setShowDialog(false)}
          draft={draft}
          resolved={resolved}
          meta={meta}
          fieldErrors={fieldErrors}
          fieldWarnings={fieldWarnings}
          onChange={onChange}
        />
      )}
    </>
  )
}

export default ConfigGeneralSection
