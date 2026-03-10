function TabTransition({ children, activeTab, tabId }) {
  const isActive = activeTab === tabId

  return (
    <div style={{ display: isActive ? 'contents' : 'none' }}>
      {children}
    </div>
  )
}

export default TabTransition
