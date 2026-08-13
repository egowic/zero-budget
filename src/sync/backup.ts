import { db, type Budget, type Category, type Expense } from '../db/schema'

/**
 * A backup that does not depend on the backend.
 *
 * Cloud sync covers the ordinary failure — a lost or wiped phone. This covers
 * the one it cannot: losing access to the account itself, or Supabase going
 * away. It is a plain JSON file the user owns, readable without this app.
 */

const FORMAT_VERSION = 1

export interface BackupFile {
  format: 'zero-budget-backup'
  version: number
  exportedAt: string
  budgets: Budget[]
  expenses: Expense[]
  categories: Category[]
}

export async function buildBackup(): Promise<BackupFile> {
  const [budgets, expenses, categories] = await Promise.all([
    db.budgets.toArray(),
    db.expenses.toArray(),
    db.categories.toArray(),
  ])

  return {
    format: 'zero-budget-backup',
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    budgets,
    expenses,
    categories,
  }
}

export async function downloadBackup(): Promise<void> {
  const backup = await buildBackup()
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json',
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `zero-backup-${backup.exportedAt.slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export interface RestoreResult {
  budgets: number
  expenses: number
  categories: number
}

/**
 * Merges a backup into the local database rather than replacing it.
 *
 * Rows are keyed by id and the newer `updatedAt` wins, so restoring an old
 * backup onto a device that has since moved on cannot roll it back, and
 * restoring the same file twice changes nothing.
 */
export async function restoreBackup(file: File): Promise<RestoreResult> {
  const text = await file.text()
  const parsed = JSON.parse(text) as BackupFile

  if (parsed.format !== 'zero-budget-backup') {
    throw new Error('That file is not a Zero backup.')
  }
  if (parsed.version > FORMAT_VERSION) {
    throw new Error('That backup came from a newer version of the app.')
  }

  const result: RestoreResult = { budgets: 0, expenses: 0, categories: 0 }

  await db.transaction(
    'rw',
    db.budgets,
    db.expenses,
    db.categories,
    db.outbox,
    async () => {
      for (const [table, rows] of [
        ['categories', parsed.categories],
        ['budgets', parsed.budgets],
        ['expenses', parsed.expenses],
      ] as const) {
        for (const row of rows ?? []) {
          const local = await db.table(table).get(row.id)
          if (local && local.updatedAt >= row.updatedAt) continue
          await db.table(table).put(row)
          // Queue for push so the restored rows reach the cloud copy too
          const queued = await db.outbox
            .where('[table+rowId]')
            .equals([table, row.id])
            .first()
          if (!queued) {
            await db.outbox.add({ table, rowId: row.id, queuedAt: Date.now() })
          }
          result[table] += 1
        }
      }
    },
  )

  return result
}
