import { describe, expect, it } from 'vitest'
import { buildSyncAlert } from '../sync/useSyncStatus'
import { classifyError } from '../sync/engine'
import type { SyncStatus } from '../sync/engine'

const NOW = Date.parse('2026-08-14T12:00:00Z')
const HOUR = 3_600_000

function status(over: Partial<SyncStatus> = {}): SyncStatus {
  return {
    state: 'idle',
    pending: 0,
    lastSyncedAt: NOW,
    failingSince: null,
    ...over,
  }
}

describe('when a failure earns an interruption', () => {
  it('stays silent while everything works', () => {
    expect(buildSyncAlert(status(), NOW)).toBeNull()
    expect(buildSyncAlert(status({ state: 'syncing' }), NOW)).toBeNull()
  })

  it('stays silent in a local-only build that never promised a backup', () => {
    expect(buildSyncAlert(status({ state: 'disabled', pending: 9 }), NOW)).toBeNull()
  })

  it('speaks up immediately when the session is gone', () => {
    // Nothing about waiting fixes this, so nothing is gained by waiting
    const alert = buildSyncAlert(
      status({ state: 'error', errorKind: 'auth', failingSince: NOW - 1000, pending: 2 }),
      NOW,
    )
    expect(alert?.tone).toBe('critical')
    expect(alert?.action).toBe('signin')
  })

  it('speaks up immediately when the database cannot be reached', () => {
    const alert = buildSyncAlert(
      status({
        state: 'error',
        errorKind: 'unavailable',
        failingSince: NOW - 1000,
        pending: 1,
      }),
      NOW,
    )
    expect(alert?.tone).toBe('critical')
  })

  it('ignores a network blip that has put no data at risk', () => {
    const alert = buildSyncAlert(
      status({
        state: 'error',
        errorKind: 'network',
        failingSince: NOW - 40 * HOUR,
        pending: 0,
      }),
      NOW,
    )
    expect(alert).toBeNull()
  })

  it('ignores a recent network failure even with changes queued', () => {
    const alert = buildSyncAlert(
      status({
        state: 'error',
        errorKind: 'network',
        failingSince: NOW - 2 * HOUR,
        pending: 3,
      }),
      NOW,
    )
    expect(alert).toBeNull()
  })

  it('warns once queued changes have been stuck past the quiet period', () => {
    const alert = buildSyncAlert(
      status({
        state: 'error',
        errorKind: 'network',
        failingSince: NOW - 30 * HOUR,
        pending: 3,
      }),
      NOW,
    )
    expect(alert?.tone).toBe('warning')
    expect(alert?.detail).toContain('3 changes')
    expect(alert?.detail).toContain('1 day')
  })

  it('warns about a long offline stretch, measured from the last real backup', () => {
    const quiet = buildSyncAlert(
      status({ state: 'offline', pending: 2, lastSyncedAt: NOW - 2 * HOUR }),
      NOW,
    )
    expect(quiet).toBeNull()

    const loud = buildSyncAlert(
      status({ state: 'offline', pending: 2, lastSyncedAt: NOW - 20 * HOUR }),
      NOW,
    )
    expect(loud?.tone).toBe('warning')
  })
})

describe('classifying what went wrong', () => {
  it('reads a rejected session as something only the user can fix', () => {
    expect(classifyError({ status: 401, message: 'Unauthorized' })).toBe('auth')
    expect(classifyError({ message: 'JWT expired' })).toBe('auth')
  })

  it('reads a full or paused database as unavailable, not as a blip', () => {
    expect(classifyError({ status: 503 })).toBe('unavailable')
    // Postgres read-only transaction, which is how a full project presents
    expect(classifyError({ code: '25006', message: 'read-only transaction' })).toBe(
      'unavailable',
    )
  })

  it('reads an unreachable host as a network problem', () => {
    expect(classifyError(new TypeError('Failed to fetch'))).toBe('network')
  })

  it('does not guess when it cannot tell', () => {
    expect(classifyError({ message: 'something odd' })).toBe('unknown')
  })
})
