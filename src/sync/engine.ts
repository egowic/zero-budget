import { supabase } from './client'
import { ensureSession } from './auth'
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

const CURSOR_KEY = 'syncCursor'
const LAST_SYNCED_KEY = 'lastSyncedAt'

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
      const { error } = await supabase!.from(table).upsert(payload)
      if (error) throw error
    }

    // Only clear what was actually accepted; a failure above leaves the whole
    // batch queued so nothing is lost when the request dies mid-flight.
    await db.outbox.bulkDelete(forTable.map((e) => e.seq!))
  }
}

// ── Pull ────────────────────────────────────────────────────────────────────

async function pull(): Promise<void> {
  const cursor = await getMeta<string>(CURSOR_KEY, '1970-01-01T00:00:00Z')
  let newest = cursor

  for (const table of TABLES) {
    const { data, error } = await supabase!
      .from(table)
      .select('*')
      .gt('updated_at', cursor)
      .order('updated_at', { ascending: true })
      .limit(1000)

    if (error) throw error
    if (!data || data.length === 0) continue

    const incoming = data.map((row) => ({ row, mapped: fromRemote(table, row) }))

    await db.transaction('rw', db.table(table), async () => {
      for (const { mapped } of incoming) {
        const local = await db.table(table).get(mapped.id)
        // Last write wins. A local row that is strictly newer is a change the
        // server has not seen yet; it is sitting in the outbox and would be
        // destroyed by blindly overwriting it here.
        if (local && local.updatedAt > mapped.updatedAt) continue
        await db.table(table).put(mapped)
      }
    })

    for (const { row } of incoming) {
      if (row.updated_at > newest) newest = row.updated_at
    }
  }

  if (newest !== cursor) await setMeta(CURSOR_KEY, newest)
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

    const userId = await ensureSession()
    if (!userId) {
      setStatus({ state: 'offline' })
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
