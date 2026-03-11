import { useEffect, useState } from 'react'

function TabTransition({ children, activeTab, tabId }) {
  const isActive = activeTab === tabId
  const [hasMounted, setHasMounted] = useState(isActive)

  useEffect(() => {
    if (isActive) {
      setHasMounted(true)
    }
  }, [isActive])

  if (!hasMounted) {
    return null
  }

  return (
    <div style={{ display: isActive ? 'contents' : 'none' }}>
      {children}
    </div>
  )
}

export default TabTransition
