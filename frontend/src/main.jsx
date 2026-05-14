import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/index.css'

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
window.fetch = (input, init = {}) => {
  const token = localStorage.getItem(LOCAL_TOKEN_KEY)
  const url = typeof input === 'string' ? input : input?.url
  const target = url ? new URL(url, window.location.origin) : null

  if (token && target?.origin === window.location.origin && target.pathname.startsWith('/api/') && target.pathname !== '/api/health') {
    const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined))
    headers.set('X-MS-Local-Token', token)
    return nativeFetch(input, { ...init, headers })
  }

  return nativeFetch(input, init)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
