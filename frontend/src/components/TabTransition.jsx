import { useRef, useEffect, useState } from 'react'
import './TabTransition.css'

function TabTransition({ children, activeTab, tabId }) {
  const [isVisible, setIsVisible] = useState(activeTab === tabId)
  const [isAnimating, setIsAnimating] = useState(false)
  const prevTabRef = useRef(activeTab)

  useEffect(() => {
    if (prevTabRef.current !== activeTab) {
      setIsAnimating(true)
      
      if (activeTab === tabId) {
        // 进入动画
        setIsVisible(true)
        requestAnimationFrame(() => {
          setTimeout(() => setIsAnimating(false), 300)
        })
      } else {
        // 离开动画
        setTimeout(() => {
          setIsVisible(false)
          setIsAnimating(false)
        }, 300)
      }
    }
    prevTabRef.current = activeTab
  }, [activeTab, tabId])

  if (!isVisible && !isAnimating) return null

  const isEntering = activeTab === tabId
  const animationClass = isEntering ? 'tab-enter' : 'tab-exit'

  return (
    <div className={`tab-transition ${animationClass}`}>
      {children}
    </div>
  )
}

export default TabTransition
