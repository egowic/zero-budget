import { describeSync, useSyncStatus } from '../sync/useSyncStatus'

const STATE_CLASS = {
  disabled: 'bg-faint',
  idle: 'bg-good',
  syncing: 'bg-warn animate-pulse',
  offline: 'bg-faint',
  error: 'bg-over',
} as const

/** A deliberately quiet signed-in/sync signal for the two main screens. */
export function SyncDot() {
  const status = useSyncStatus()
  const state = status.state === 'idle' && status.pending > 0 ? 'syncing' : status.state
  const label = `Signed in · ${describeSync(status)}`

  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATE_CLASS[state]}`}
    />
  )
}
