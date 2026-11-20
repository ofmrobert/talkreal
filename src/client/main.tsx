import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
import './index.css'
import App from './App'

/**
 * The app is saved on the phone so it opens instantly and works offline. Without the lines below,
 * a new version only showed up on the second visit after it was published. Now the app looks for
 * a new version every time it is opened or brought back to the screen, and reloads once it is in place.
 */
if ('serviceWorker' in navigator) {
  // Only reload when a newer version replaces one that was already running, not on the very first visit.
  const hadVersion = navigator.serviceWorker.controller !== null
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadVersion || reloading) return
    reloading = true
    window.location.reload()
  })
  const lookForUpdate = () =>
    navigator.serviceWorker
      .getRegistration()
      .then((registration) => registration?.update())
      .catch(() => {})
  window.addEventListener('load', lookForUpdate)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && lookForUpdate())
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
