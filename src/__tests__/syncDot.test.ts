import { describe, expect, it } from 'vitest'
import { buildSyncDot } from '../sync/useSyncStatus'
import type { SyncStatus } from '../sync/engine'

const NOW = Date.parse('2026-08-14T12:00:00Z')
const SECOND = 1000

function status(over: Partial<SyncStatus> = {}): SyncStatus {
  return {
    state: 'idle',
    pending: 0,
    lastSyncedAt: NOW,
    failingSince: null,
    stateSince: NOW,
    ...over,
  }
}

describe('when the status dot shows itself', () => {
  it('shows nothing at all while everything works', () => {
    expect(buildSyncDot(status(), NOW)).toBeNull()
    expect(buildSyncDot(status({ pending: 3 }), NOW)).toBeNull()
  })

  it('shows nothing in a local-only build that never promised a backup', () => {
    expect(buildSyncDot(status({ state: 'disabled', pending: 9 }), NOW)).toBeNull()
  })

  it('ignores a sync that is simply running', () => {
    // The whole point: an ordinary sync finishes long before the delay
    const syncing = status({ state: 'syncing', stateSince: NOW - 900 })
    expect(buildSyncDot(syncing, NOW)).toBeNull()
  })

  it('appears once a sync has been running too long to be normal', () => {
    const stuck = status({ state: 'syncing', stateSince: NOW - 6 * SECOND })
    expect(buildSyncDot(stuck, NOW)).toBe('warning')
  })

  it('holds a brand new failure back for the delay, then shows it', () => {
    const justFailed = status({
      state: 'error',
      errorKind: 'auth',
      failingSince: NOW - 2 * SECOND,
    })
    expect(buildSyncDot(justFailed, NOW)).toBeNull()

    const settled = status({
      state: 'error',
      errorKind: 'auth',
      failingSince: NOW - 6 * SECOND,
    })
    expect(buildSyncDot(settled, NOW)).toBe('critical')
  })

  it('does not grant a fresh grace period to an outage that predates this launch', () => {
    // failingSince is persisted precisely so reopening the app cannot reset it
    const old = status({
      state: 'error',
      errorKind: 'unavailable',
      failingSince: NOW - 3 * 24 * 3_600_000,
      stateSince: NOW,
    })
    expect(buildSyncDot(old, NOW)).toBe('critical')
  })

  it('reports a broken account even with nothing queued', () => {
    const auth = status({
      state: 'error',
      errorKind: 'auth',
      failingSince: NOW - 30 * SECOND,
      pending: 0,
    })
    expect(buildSyncDot(auth, NOW)).toBe('critical')
  })

  it('stays quiet about network trouble that has put no data at risk', () => {
    // Nothing is waiting, so nothing can be lost — warning here would be noise
    const blip = status({
      state: 'error',
      errorKind: 'network',
      failingSince: NOW - 60 * SECOND,
      pending: 0,
    })
    expect(buildSyncDot(blip, NOW)).toBeNull()
  })

  it('reports network trouble as amber once local changes wait on it', () => {
    // Amber, not red: a connection returns on its own, unlike a dead session
    const risky = status({
      state: 'error',
      errorKind: 'network',
      failingSince: NOW - 60 * SECOND,
      pending: 1,
    })
    expect(buildSyncDot(risky, NOW)).toBe('warning')
  })

  it('treats an unknown failure the same way as a network one', () => {
    const base = { state: 'error' as const, errorKind: 'unknown' as const, failingSince: NOW - 60 * SECOND }
    expect(buildSyncDot(status({ ...base, pending: 0 }), NOW)).toBeNull()
    expect(buildSyncDot(status({ ...base, pending: 2 }), NOW)).toBe('warning')
  })

  it('never uses red for anything that can heal by itself', () => {
    // The tones carry a promise: red means waiting will not fix this
    const selfHealing: Partial<SyncStatus>[] = [
      { state: 'syncing', stateSince: NOW - 60 * SECOND },
      { state: 'offline', pending: 4, stateSince: NOW - 60 * SECOND },
      { state: 'error', errorKind: 'network', failingSince: NOW - 60 * SECOND, pending: 4 },
      { state: 'error', errorKind: 'unknown', failingSince: NOW - 60 * SECOND, pending: 4 },
    ]
    for (const over of selfHealing) {
      expect(buildSyncDot(status(over), NOW)).not.toBe('critical')
    }
  })

  it('says nothing about being offline when everything is already backed up', () => {
    const offline = status({ state: 'offline', pending: 0, stateSince: NOW - 60 * SECOND })
    expect(buildSyncDot(offline, NOW)).toBeNull()
  })

  it('reports being offline once changes are stranded on this phone', () => {
    const stranded = status({ state: 'offline', pending: 2, stateSince: NOW - 6 * SECOND })
    expect(buildSyncDot(stranded, NOW)).toBe('warning')

    const justWentOffline = status({ state: 'offline', pending: 2, stateSince: NOW - SECOND })
    expect(buildSyncDot(justWentOffline, NOW)).toBeNull()
  })
})
