import { useSyncExternalStore } from 'react'
import { getSyncStatus, subscribeToSync, type SyncStatus } from './engine'

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribeToSync, getSyncStatus, getSyncStatus)
}

/**
 * How long a recoverable failure is allowed to stay quiet.
 *
 * A dropped connection fixes itself and is not worth interrupting anyone over.
 * Six hours of unsent changes on a phone used several times a day is not a
 * blip, and by then the person deserves to know before they keep typing into
 * something that is only pretending to be backed up.
 */
const QUIET_PERIOD_MS = 6 * 60 * 60 * 1000

export interface SyncAlert {
  /** 'critical' never resolves on its own; 'warning' still might. */
  tone: 'critical' | 'warning'
  title: string
  detail: string
  /** What the person should do about it, when there is something to do. */
  action: 'signin' | 'inspect'
}

/**
 * Decides whether a failure has earned an interruption.
 *
 * The trigger is not the error itself but the exposure behind it: a failed
 * sync with nothing queued has put no data at risk, while one unsent expense
 * that has been stuck for a day is real, unbacked money.
 */
export function buildSyncAlert(status: SyncStatus, now = Date.now()): SyncAlert | null {
  if (status.state === 'disabled') return null

  const stuckFor = status.failingSince === null ? 0 : now - status.failingSince
  const staleFor = status.lastSyncedAt === null ? null : now - status.lastSyncedAt

  if (status.state === 'error') {
    switch (status.errorKind) {
      // Neither of these heals by waiting, so waiting is not offered.
      case 'auth':
        return {
          tone: 'critical',
          title: 'Signed out — not backing up',
          detail: pendingPhrase(status.pending, 'Sign in again to send them.'),
          action: 'signin',
        }
      case 'unavailable':
        return {
          tone: 'critical',
          title: "Can't reach the database",
          detail: `${describeDuration(stuckFor)} · ${pendingPhrase(status.pending)}`,
          action: 'inspect',
        }
      default:
        if (status.pending === 0 || stuckFor < QUIET_PERIOD_MS) return null
        return {
          tone: 'warning',
          title: 'Backup is failing',
          detail: `${describeDuration(stuckFor)} · ${pendingPhrase(status.pending)}`,
          action: 'inspect',
        }
    }
  }

  // Being offline is expected and self-correcting, but not for days on end
  if (status.state === 'offline' && status.pending > 0) {
    if (staleFor === null || staleFor < QUIET_PERIOD_MS) return null
    return {
      tone: 'warning',
      title: 'Offline — not backed up',
      detail: `${describeDuration(staleFor)} · ${pendingPhrase(status.pending)}`,
      action: 'inspect',
    }
  }

  return null
}

function pendingPhrase(pending: number, suffix?: string): string {
  const base =
    pending === 0
      ? 'Nothing is waiting yet.'
      : `${pending} ${pending === 1 ? 'change is' : 'changes are'} only on this phone.`
  return suffix ? `${base} ${suffix}` : base
}

/** "for 3 days" — deliberately vague below an hour, where precision is noise. */
function describeDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return 'Just started'
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `For ${hours} ${hours === 1 ? 'hour' : 'hours'}`
  const days = Math.floor(hours / 24)
  return `For ${days} ${days === 1 ? 'day' : 'days'}`
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
      // Never fall back to "Backed up 3h ago" here. That timestamp is true but
      // reads as reassurance at the exact moment reassurance is wrong.
      switch (status.errorKind) {
        case 'auth':
          return 'Signed out — not backing up'
        case 'unavailable':
          return "Can't reach the database"
        default:
          return status.pending > 0
            ? `Backup failing · ${status.pending} waiting`
            : 'Backup failing'
      }
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
