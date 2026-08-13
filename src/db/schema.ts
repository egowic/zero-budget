import Dexie, { type EntityTable } from 'dexie'
import type { IsoDate } from '../lib/dates'
import type { Minor } from '../lib/money'

/**
 * Every synced row carries the three fields the sync engine needs:
 *
 *   id         client-generated UUID, so records can be created fully offline
 *   updatedAt  server-stamped epoch ms, used as the last-write-wins clock
 *   deleted    tombstone — a hard delete is invisible to a pull-based sync
 *              and the row would resurrect on the next device
 */
export interface Synced {
  id: string
  updatedAt: number
  deleted: 0 | 1 // Dexie cannot index booleans
}

/**
 * How long one budget period runs. Length and repetition are kept separate
 * because they are genuinely independent questions: an eight-day trip budget
 * that never repeats and a monthly budget that always does are the same shape.
 */
export type Period =
  | { kind: 'month' }
  | { kind: 'week' }
  | { kind: 'days'; count: number }

export interface Budget extends Synced {
  name: string
  /** Total budget for one period, in minor units. */
  amount: Minor
  startDate: IsoDate
  /** Always derived from startDate + period; never entered by hand. */
  endDate: IsoDate
  period: Period
  /** When set, the budget rolls into its next period automatically. */
  repeats: 0 | 1
  archived: 0 | 1
  createdAt: number
}

/**
 * Note what is *not* here: a budget reference.
 *
 * An expense belongs to a date, and every budget whose period covers that date
 * counts it. A trip budget sitting inside the monthly one should see the same
 * spending, and storing a single owning budget would force a choice between
 * them that has no right answer.
 */
export interface Expense extends Synced {
  amount: Minor
  categoryId: string | null
  note: string | null
  date: IsoDate
  createdAt: number
}

export interface Category extends Synced {
  name: string
  /** Emoji — no icon font to ship, renders natively on iOS. */
  icon: string
  color: string
  sortOrder: number
  createdAt: number
}

/** Pending local mutations awaiting push to Supabase. */
export interface OutboxEntry {
  seq?: number
  table: 'budgets' | 'expenses' | 'categories'
  rowId: string
  queuedAt: number
}

export interface MetaEntry {
  key: string
  value: unknown
}

const db = new Dexie('zero') as Dexie & {
  budgets: EntityTable<Budget, 'id'>
  expenses: EntityTable<Expense, 'id'>
  categories: EntityTable<Category, 'id'>
  outbox: EntityTable<OutboxEntry, 'seq'>
  meta: EntityTable<MetaEntry, 'key'>
}

db.version(1).stores({
  budgets: 'id, startDate, endDate, archived, deleted, updatedAt',
  // [date+deleted] serves both the timeline and every budget total, since
  // budget membership is decided by date range rather than by a stored link
  expenses: 'id, date, categoryId, deleted, updatedAt, [date+deleted]',
  categories: 'id, sortOrder, deleted, updatedAt',
  outbox: '++seq, [table+rowId]',
  meta: 'key',
})

export { db }

export function newId(): string {
  return crypto.randomUUID()
}

/** Reads a meta value, returning `fallback` when absent. */
export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key)
  return row === undefined ? fallback : (row.value as T)
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}
