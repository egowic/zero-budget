import { db, newId, type Budget, type Category, type Expense } from './schema'
import { isBuiltInCategory, OTHER_CATEGORY_ID } from './seed'
import { addDays, addMonths, today, type IsoDate } from '../lib/dates'
import type { Minor } from '../lib/money'
import type { Period } from './schema'

/**
 * All writes go through here so that every mutation lands in the outbox in the
 * same transaction as the row itself. If the two could diverge, a change could
 * be saved locally and never pushed — the worst possible failure for a sync
 * system, because it looks like everything worked.
 */

type Table = 'budgets' | 'expenses' | 'categories'

async function enqueue(table: Table, rowId: string): Promise<void> {
  // One pending entry per row is enough; the pusher always sends current state.
  const existing = await db.outbox.where('[table+rowId]').equals([table, rowId]).first()
  if (existing) return
  await db.outbox.add({ table, rowId, queuedAt: Date.now() })
}

// ── Expenses ────────────────────────────────────────────────────────────────

export interface NewExpense {
  amount: Minor
  date?: IsoDate
  categoryId?: string | null
  note?: string | null
}

export async function addExpense(input: NewExpense): Promise<string> {
  const id = newId()
  const now = Date.now()

  const expense: Expense = {
    id,
    amount: input.amount,
    date: input.date ?? today(),
    // Skipping the category is the fast path, not a gap in the data — an
    // untagged expense files itself under Other rather than under nothing.
    categoryId: input.categoryId ?? OTHER_CATEGORY_ID,
    note: input.note ?? null,
    createdAt: now,
    updatedAt: now,
    deleted: 0,
  }

  await db.transaction('rw', db.expenses, db.outbox, async () => {
    await db.expenses.add(expense)
    await enqueue('expenses', id)
  })
  return id
}

export async function updateExpense(
  id: string,
  patch: Partial<Omit<Expense, 'id' | 'createdAt'>>,
): Promise<void> {
  await db.transaction('rw', db.expenses, db.outbox, async () => {
    await db.expenses.update(id, { ...patch, updatedAt: Date.now() })
    await enqueue('expenses', id)
  })
}

export async function deleteExpense(id: string): Promise<void> {
  await db.transaction('rw', db.expenses, db.outbox, async () => {
    await db.expenses.update(id, { deleted: 1, updatedAt: Date.now() })
    await enqueue('expenses', id)
  })
}

// ── Budgets ─────────────────────────────────────────────────────────────────

/**
 * The end of a period is derived, never asked for. A monthly budget starting
 * on the 27th ends on the 26th — that is the only sensible reading, and making
 * the user confirm it every time is a question with one right answer.
 */
export function deriveEndDate(startDate: IsoDate, period: Period): IsoDate {
  switch (period.kind) {
    case 'month':
      return addDays(addMonths(startDate, 1), -1)
    case 'week':
      return addDays(startDate, 6)
    case 'days':
      return addDays(startDate, Math.max(1, period.count) - 1)
  }
}

export interface NewBudget {
  name: string
  amount: Minor
  startDate: IsoDate
  period: Period
  repeats: boolean
}

export async function addBudget(input: NewBudget): Promise<string> {
  const id = newId()
  const now = Date.now()

  const budget: Budget = {
    id,
    name: input.name.trim() || 'Budget',
    amount: input.amount,
    startDate: input.startDate,
    endDate: deriveEndDate(input.startDate, input.period),
    period: input.period,
    repeats: input.repeats ? 1 : 0,
    archived: 0,
    createdAt: now,
    updatedAt: now,
    deleted: 0,
  }

  await db.transaction('rw', db.budgets, db.outbox, async () => {
    await db.budgets.add(budget)
    await enqueue('budgets', id)
  })
  return id
}

export async function updateBudget(
  id: string,
  patch: Partial<Omit<Budget, 'id' | 'createdAt'>>,
): Promise<void> {
  await db.transaction('rw', db.budgets, db.outbox, async () => {
    await db.budgets.update(id, { ...patch, updatedAt: Date.now() })
    await enqueue('budgets', id)
  })
}

export async function deleteBudget(id: string): Promise<void> {
  // Expenses are untouched: they are linked to dates, not to this budget, and
  // the spending happened whether or not the budget still exists.
  await db.transaction('rw', db.budgets, db.outbox, async () => {
    await db.budgets.update(id, { deleted: 1, updatedAt: Date.now() })
    await enqueue('budgets', id)
  })
}

/** The start date of the period following `startDate`. */
export function nextStart(startDate: IsoDate, period: Period): IsoDate {
  switch (period.kind) {
    case 'month':
      // Advance the start by a month and re-derive the end, so a budget that
      // starts on the 31st keeps tracking month ends instead of drifting.
      return addMonths(startDate, 1)
    case 'week':
      return addDays(startDate, 7)
    case 'days':
      return addDays(startDate, Math.max(1, period.count))
  }
}

/**
 * Rolls any repeating budget whose period has ended into its next period.
 * Runs on app start — the user should never open the app to find their monthly
 * budget expired and their daily allowance blank.
 */
export async function rollRecurringBudgets(now: IsoDate = today()): Promise<number> {
  const due = await db.budgets
    .where('deleted')
    .equals(0)
    .filter((b) => b.archived === 0 && b.repeats === 1 && b.endDate < now)
    .toArray()

  let rolled = 0
  for (const budget of due) {
    // A budget untouched for months may need several rolls to catch up.
    let start = nextStart(budget.startDate, budget.period)
    let guard = 0
    while (deriveEndDate(start, budget.period) < now && guard < 240) {
      start = nextStart(start, budget.period)
      guard += 1
    }

    await addBudget({
      name: budget.name,
      amount: budget.amount,
      startDate: start,
      period: budget.period,
      repeats: true,
    })
    // The finished period stays as a record, but stops repeating itself.
    await updateBudget(budget.id, { archived: 1, repeats: 0 })
    rolled += 1
  }
  return rolled
}

// ── Categories ──────────────────────────────────────────────────────────────

export async function addCategory(input: {
  name: string
  icon: string
  color: string
}): Promise<string> {
  const id = newId()
  const now = Date.now()

  await db.transaction('rw', db.categories, db.outbox, async () => {
    // Sort after everything that exists, built-ins included
    const last = await db.categories.orderBy('sortOrder').last()
    await db.categories.add({
      id,
      name: input.name.trim() || 'Category',
      icon: input.icon,
      color: input.color,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      createdAt: now,
      updatedAt: now,
      deleted: 0,
    })
    await enqueue('categories', id)
  })
  return id
}

export async function updateCategory(
  id: string,
  patch: Partial<Pick<Category, 'name' | 'icon' | 'color'>>,
): Promise<void> {
  await db.transaction('rw', db.categories, db.outbox, async () => {
    await db.categories.update(id, { ...patch, updatedAt: Date.now() })
    await enqueue('categories', id)
  })
}

/**
 * Persists the visible category order and queues every changed row for sync.
 * Missing IDs are appended defensively, so a category arriving from another
 * device during a drag cannot disappear from the local ordering.
 */
export async function reorderCategories(orderedIds: string[]): Promise<void> {
  await db.transaction('rw', db.categories, db.outbox, async () => {
    const active = (await db.categories.where('deleted').equals(0).toArray()).sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.createdAt - b.createdAt ||
        a.id.localeCompare(b.id),
    )
    const byId = new Map(active.map((category) => [category.id, category]))
    const seen = new Set<string>()
    const ordered: Category[] = []

    for (const id of orderedIds) {
      const category = byId.get(id)
      if (category && !seen.has(id)) {
        ordered.push(category)
        seen.add(id)
      }
    }
    for (const category of active) {
      if (!seen.has(category.id)) ordered.push(category)
    }

    const now = Date.now()
    for (const [sortOrder, category] of ordered.entries()) {
      if (category.sortOrder === sortOrder) continue
      await db.categories.update(category.id, { sortOrder, updatedAt: now })
      await enqueue('categories', category.id)
    }
  })
}

/**
 * Built-in categories are refused rather than silently ignored, so a caller
 * that gets this wrong fails loudly instead of appearing to work.
 */
export async function deleteCategory(id: string): Promise<void> {
  if (isBuiltInCategory(id)) {
    throw new Error('Built-in categories cannot be deleted.')
  }

  await db.transaction('rw', db.categories, db.expenses, db.outbox, async () => {
    const now = Date.now()
    await db.categories.update(id, { deleted: 1, updatedAt: now })
    await enqueue('categories', id)

    // The expense itself survives; only its label goes away.
    const tagged = await db.expenses.where('categoryId').equals(id).toArray()
    for (const expense of tagged) {
      await db.expenses.update(expense.id, { categoryId: null, updatedAt: now })
      await enqueue('expenses', expense.id)
    }
  })
}
