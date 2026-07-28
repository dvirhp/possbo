import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/theme.css'
import './styles/main.css'

// Remove legacy workers and caches so this origin cannot serve outdated
// application metadata, icons, or HTML.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations()
      .then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
      .catch(() => {})
  })
}

if ('caches' in window) {
  window.caches.keys()
    .then(keys => Promise.all(keys.map(key => window.caches.delete(key))))
    .catch(() => {})
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
