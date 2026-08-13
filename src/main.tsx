import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { seedIfEmpty } from './db/seed'
import * as mutations from './db/mutations'
import { db } from './db/schema'
import { startSync } from './sync/engine'
import './index.css'

// iOS 27 beta can reserve its Home Screen web-app bottom region twice: once
// outside the web viewport and again through safe-area-inset-bottom. Detect
// that exact standalone geometry so Safari and unaffected iOS versions keep
// their normal safe-area behaviour.
const standalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true
const iosMajor = Number(navigator.userAgent.match(/\bOS (\d+)[._]/)?.[1] ?? 0)
const clippedViewport = window.screen.height - window.innerHeight >= 50

// `display-mode: standalone` is the reliable signal for Safari's “Open as Web
// App” option. Keep it separate from the iOS-version heuristic: recent betas
// can freeze or change their user-agent and safe-area geometry independently.
if (standalone) {
  document.documentElement.classList.add('standalone-web-app')
}

if (standalone && iosMajor >= 27 && clippedViewport) {
  document.documentElement.classList.add('ios-clipped-standalone')
}

// Dev-only console handle for inspecting and seeding the local database
if (import.meta.env.DEV) {
  Object.assign(window, { db, mutations })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Startup work runs after the first paint, never before it. The screen is
// drawn from IndexedDB immediately; anything slower than that is not allowed
// to stand between the user and their numbers.
queueMicrotask(async () => {
  await seedIfEmpty()
  await mutations.rollRecurringBudgets()
  startSync()
})
