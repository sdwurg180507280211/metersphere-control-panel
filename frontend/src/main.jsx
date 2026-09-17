import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import toast from 'react-hot-toast'
import './styles/index.css'

const DesktopShell = React.lazy(() => import('./components/DesktopShell.jsx'))

const LOCAL_TOKEN_KEY = 'msLocalToken'
const params = new URLSearchParams(window.location.search)
const urlToken = params.get('token')

if (urlToken) {
  localStorage.setItem(LOCAL_TOKEN_KEY, urlToken)
  params.delete('token')
  const nextSearch = params.toString()
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
  window.history.replaceState({}, document.title, nextUrl)
}

const nativeFetch = window.fetch.bind(window)
window.fetch = async (input, init = {}) => {
  const token = localStorage.getItem(LOCAL_TOKEN_KEY)
  const url = typeof input === 'string' ? input : input?.url
  const target = url ? new URL(url, window.location.origin) : null
  const isApiRequest = target?.origin === window.location.origin && target.pathname.startsWith('/api/') && target.pathname !== '/api/health'

  let nextInit = init
  if (token && isApiRequest) {
    const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined))
    headers.set('X-MS-Local-Token', token)
    nextInit = { ...init, headers }
  }

  const response = await nativeFetch(input, nextInit)
  if (isApiRequest && response.status === 401) {
    window.dispatchEvent(new CustomEvent('localAuthExpired'))
    toast.error('访问令牌无效，请使用启动日志中的本地访问地址重新打开')
  }
  return response
}

// Legacy view=hub and desktop=1 URLs now render the same console.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Suspense fallback={<div className="console-loading" role="status">正在打开项目控制台…</div>}>
      <DesktopShell />
    </Suspense>
  </React.StrictMode>,
)
