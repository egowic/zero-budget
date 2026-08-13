import { buildSyncAlert, useSyncStatus } from '../sync/useSyncStatus'

interface SyncAlertBarProps {
  /** Opens Settings, where the full error text and the backup export live. */
  onInspect: () => void
}

/**
 * The loud half of the sync signal.
 *
 * The status dot answers "is it fine?" continuously and quietly. This answers
 * "what broke and what do I do?" — but only once a failure has proven itself
 * worth the interruption, so a healthy app looks exactly as it did before.
 *
 * Deliberately a strip rather than a dialog: a failing backup is a condition
 * that persists until fixed, not an event to acknowledge. A dialog would be
 * dismissed reflexively and never seen again, and it would stand between the
 * user and the three-second expense entry the app exists for.
 */
export function SyncAlertBar({ onInspect }: SyncAlertBarProps) {
  const status = useSyncStatus()
  const alert = buildSyncAlert(status)

  if (!alert) return null

  const critical = alert.tone === 'critical'
  const color = critical ? 'var(--color-over)' : 'var(--color-warn)'
  const background = critical ? 'var(--color-over-dim)' : 'var(--color-warn-dim)'

  return (
    <div className="px-4 pb-3">
      <button
        type="button"
        onClick={onInspect}
        className="animate-rise-in flex w-full items-center gap-3 rounded-[14px] px-3.5 py-2.5 text-left active:opacity-80"
        style={{ background }}
      >
        <span
          className="mt-[3px] h-1.5 w-1.5 shrink-0 self-start rounded-full"
          style={{ background: color }}
        />

        <span className="min-w-0 flex-1">
          <span className="block text-[13px] leading-tight font-medium" style={{ color }}>
            {alert.title}
          </span>
          <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">
            {alert.detail}
          </span>
        </span>

        <span className="shrink-0 text-[11.5px] whitespace-nowrap" style={{ color }}>
          {alert.action === 'signin' ? 'Fix' : 'Details'}
        </span>
      </button>
    </div>
  )
}
