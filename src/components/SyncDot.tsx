import { useEffect, useState } from 'react'
import { buildSyncDot, describeSync, useSyncStatus } from '../sync/useSyncStatus'

const TONE_CLASS = {
  warning: 'bg-warn animate-pulse',
  critical: 'bg-over',
} as const

/**
 * Re-renders once a second while something is wrong.
 *
 * The dot's visibility depends on elapsed time, not just on state, and a
 * failure that never changes would otherwise never trigger the render that
 * makes it visible. Runs only while unhealthy, so a working app pays nothing.
 */
function useElapsedTicker(active: boolean) {
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setTick((tick) => tick + 1), 1000)
    return () => clearInterval(id)
  }, [active])
}

/**
 * Shows nothing at all while sync is healthy.
 *
 * This used to be a permanent green light. It carried no information anyone
 * could act on — the app is local-first, so saving never waits on the network
 * and "fine" is the safe assumption — while quietly implying there was
 * something here worth checking on every launch.
 */
export function SyncDot() {
  const status = useSyncStatus()
  useElapsedTicker(status.state !== 'idle' && status.state !== 'disabled')

  const tone = buildSyncDot(status)
  if (!tone) return null

  const label = describeSync(status)

  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_CLASS[tone]}`}
    />
  )
}
