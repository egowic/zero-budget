import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { seedIfEmpty } from './db/seed'
import * as mutations from './db/mutations'
import { db } from './db/schema'
import { startSync } from './sync/engine'
import './index.css'

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
