import { useSyncExternalStore } from 'react'
import { getSyncStatus, subscribeToSync, type SyncStatus } from './engine'

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribeToSync, getSyncStatus, getSyncStatus)
}

/** Short human phrase for the settings row and status dot. */
export function describeSync(status: SyncStatus): string {
  switch (status.state) {
    case 'disabled':
      return 'On this device only'
    case 'syncing':
      return 'Backing up…'
    case 'offline':
      return status.pending > 0 ? `Offline · ${status.pending} waiting` : 'Offline'
    case 'error':
      return status.pending > 0 ? `${status.pending} waiting to back up` : 'Retrying'
    case 'idle':
      if (status.pending > 0) return `${status.pending} waiting`
      if (!status.lastSyncedAt) return 'Backed up'
      return `Backed up ${relativeTime(status.lastSyncedAt)}`
  }
}

function relativeTime(at: number): string {
  const seconds = Math.round((Date.now() - at) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}
