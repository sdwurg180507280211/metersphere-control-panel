import React from 'react'
import ReactDOM from 'react-dom/client'
import * as PIXI from 'pixi.js'
import App from './App.jsx'
import './styles/index.css'

// Expose PIXI to global scope for pixi-live2d-display
window.PIXI = PIXI

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
