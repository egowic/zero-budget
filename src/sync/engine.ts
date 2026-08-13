import { supabase } from './client'
import { currentUserId, ensureSession } from './auth'
import { db, getMeta, setMeta, type Budget, type Category, type Expense } from '../db/schema'

/**
 * Local-first sync.
 *
 * Push drains the outbox; pull takes everything the server has stamped since
 * the last cursor and merges it in. Conflicts resolve last-write-wins on the
 * server's own `updated_at`, which is set by a trigger — device clocks are not
 * trusted to order anything, since a phone hours out of sync would otherwise
 * silently win or lose every conflict.
 *
 * One user with one or two devices does not need anything cleverer than that.
 */

export type SyncState = 'disabled' | 'idle' | 'syncing' | 'offline' | 'error'

export interface SyncStatus {
  state: SyncState
  /** Local changes not yet accepted by the server. */
  pending: number
  lastSyncedAt: number | null
  message?: string
}

type Table = 'budgets' | 'expenses' | 'categories'
const TABLES: Table[] = ['categories', 'budgets', 'expenses']

const CURSOR_KEY_PREFIX = 'syncCursor:'
const LAST_SYNCED_KEY = 'lastSyncedAt'
const PAGE_SIZE = 1000

// ── Status broadcasting ─────────────────────────────────────────────────────

let status: SyncStatus = {
  state: supabase ? 'idle' : 'disabled',
  pending: 0,
  lastSyncedAt: null,
}
const listeners = new Set<() => void>()

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch }
  for (const listener of listeners) listener()
}

export function subscribeToSync(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSyncStatus(): SyncStatus {
  return status
}

async function refreshPending() {
  setStatus({ pending: await db.outbox.count() })
}

// ── Row mapping ─────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

function toRemote(table: Table, row: any, userId: string): Record<string, unknown> {
  const base = {
    id: row.id,
    user_id: userId,
    deleted: row.deleted === 1,
    created_at: new Date(row.createdAt).toISOString(),
  }
  switch (table) {
    case 'budgets':
      return {
        ...base,
        name: row.name,
        amount: row.amount,
        start_date: row.startDate,
        end_date: row.endDate,
        period: row.period,
        repeats: row.repeats === 1,
        archived: row.archived === 1,
      }
    case 'expenses':
      return {
        ...base,
        amount: row.amount,
        category_id: row.categoryId,
        note: row.note,
        date: row.date,
      }
    case 'categories':
      return {
        ...base,
        name: row.name,
        icon: row.icon,
        color: row.color,
        sort_order: row.sortOrder,
      }
  }
}

function fromRemote(table: Table, row: any): Budget | Expense | Category {
  const base = {
    id: row.id,
    deleted: (row.deleted ? 1 : 0) as 0 | 1,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  }
  switch (table) {
    case 'budgets':
      return {
        ...base,
        name: row.name,
        amount: row.amount,
        startDate: row.start_date,
        endDate: row.end_date,
        period: row.period,
        repeats: (row.repeats ? 1 : 0) as 0 | 1,
        archived: (row.archived ? 1 : 0) as 0 | 1,
      } satisfies Budget
    case 'expenses':
      return {
        ...base,
        amount: row.amount,
        categoryId: row.category_id,
        note: row.note,
        date: row.date,
      } satisfies Expense
    case 'categories':
      return {
        ...base,
        name: row.name,
        icon: row.icon,
        color: row.color,
        sortOrder: row.sort_order,
      } satisfies Category
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Push ────────────────────────────────────────────────────────────────────

async function push(userId: string): Promise<void> {
  const entries = await db.outbox.orderBy('seq').toArray()
  if (entries.length === 0) return

  // Categories before budgets before expenses, so foreign keys never dangle
  for (const table of TABLES) {
    const forTable = entries.filter((e) => e.table === table)
    if (forTable.length === 0) continue

    const rows = await db.table(table).bulkGet(forTable.map((e) => e.rowId))
    const payload = rows
      .filter((row): row is NonNullable<typeof row> => row != null)
      .map((row) => toRemote(table, row, userId))

    if (payload.length > 0) {
      const { error } = await supabase!
        .from(table)
        .upsert(payload, { onConflict: 'user_id,id' })
      if (error) throw error
    }

    // Only clear what was actually accepted; a failure above leaves the whole
    // batch queued so nothing is lost when the request dies mid-flight.
    await db.outbox.bulkDelete(forTable.map((e) => e.seq!))
  }
}

// ── Pull ────────────────────────────────────────────────────────────────────

async function pull(): Promise<void> {
  for (const table of TABLES) {
    const cursorKey = `${CURSOR_KEY_PREFIX}${table}`
    const cursor = await getMeta<string>(cursorKey, '1970-01-01T00:00:00Z')
    let newest = cursor
    let offset = 0

    while (true) {
      const { data, error } = await supabase!
        .from(table)
        .select('*')
        .gt('updated_at', cursor)
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1)

      if (error) throw error
      if (!data || data.length === 0) break

      const incoming = data.map((row) => ({ row, mapped: fromRemote(table, row) }))

      await db.transaction('rw', db.table(table), db.outbox, async () => {
        for (const { mapped } of incoming) {
          // A write made while this pull was in flight must survive. It has an
          // outbox row until the next push, which is a stronger signal than a
          // client timestamp from a phone whose clock may be wrong.
          const pending = await db.outbox
            .where('[table+rowId]')
            .equals([table, mapped.id])
            .first()
          if (pending) continue
          await db.table(table).put(mapped)
        }
      })

      for (const { row } of incoming) {
        if (row.updated_at > newest) newest = row.updated_at
      }

      offset += data.length
      if (data.length < PAGE_SIZE) break
    }

    if (newest !== cursor) await setMeta(cursorKey, newest)
  }
}

// ── Orchestration ───────────────────────────────────────────────────────────

let running = false
let queuedRun = false

/**
 * Runs one push/pull cycle. Safe to call as often as you like: overlapping
 * calls collapse into a single trailing run rather than stacking up.
 */
export async function sync(): Promise<void> {
  if (!supabase) return
  if (running) {
    queuedRun = true
    return
  }

  running = true
  setStatus({ state: 'syncing', message: undefined })

  try {
    if (!navigator.onLine) {
      setStatus({ state: 'offline' })
      return
    }

    // Do not create an anonymous account just because somebody opened the
    // deployed URL. Existing users still pull immediately; a new account is
    // created only after a real local mutation has entered the outbox.
    const existingUserId = await currentUserId()
    const userId =
      existingUserId ?? ((await db.outbox.count()) > 0 ? await ensureSession() : null)
    if (!userId) {
      setStatus({ state: 'idle' })
      return
    }

    await push(userId)
    await pull()

    const now = Date.now()
    await setMeta(LAST_SYNCED_KEY, now)
    setStatus({ state: 'idle', lastSyncedAt: now })
  } catch (error) {
    setStatus({
      state: 'error',
      message: error instanceof Error ? error.message : 'Sync failed',
    })
  } finally {
    running = false
    await refreshPending()
    if (queuedRun) {
      queuedRun = false
      void sync()
    }
  }
}

let started = false

/**
 * Wires sync to the moments that matter: app start, regaining focus, coming
 * back online, and any local write. The periodic timer is only a backstop for
 * a second device changing something while this one sits open.
 */
export function startSync(): void {
  if (started || !supabase) return
  started = true

  void (async () => {
    setStatus({ lastSyncedAt: await getMeta<number | null>(LAST_SYNCED_KEY, null) })
    await refreshPending()
    void sync()
  })()

  window.addEventListener('online', () => void sync())
  window.addEventListener('offline', () => setStatus({ state: 'offline' }))

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void sync()
  })

  // Any local mutation lands in the outbox; react to it rather than polling
  db.outbox.hook('creating', () => {
    void refreshPending()
    debouncedSync()
  })

  setInterval(() => void sync(), 5 * 60 * 1000)
}

let debounceTimer: ReturnType<typeof setTimeout> | undefined

/** Batches a burst of entries into one request instead of one per expense. */
function debouncedSync() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => void sync(), 1200)
}
