import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Category, type Expense } from './schema'
import { computeStatus, type BudgetStatus } from '../lib/budget'
import { today, type IsoDate } from '../lib/dates'
import type { Minor } from '../lib/money'

/**
 * Every hook here reads IndexedDB directly and re-runs automatically when the
 * underlying tables change. That is the whole state layer: the sync engine
 * writes to Dexie and the UI updates itself, so there is no store to keep in
 * agreement with the database and no loading state to thread through.
 */

export function useCategories(): Category[] {
  return (
    useLiveQuery(
      async () => {
        const categories = await db.categories.where('deleted').equals(0).toArray()
        return categories.sort(
          (a, b) =>
            a.sortOrder - b.sortOrder ||
            a.createdAt - b.createdAt ||
            a.id.localeCompare(b.id),
        )
      },
      [],
      [] as Category[],
    ) ?? []
  )
}

export function useCategoryMap(): Map<string, Category> {
  const categories = useCategories()
  return new Map(categories.map((c) => [c.id, c]))
}

/**
 * All live budgets with their computed status, active ones first.
 *
 * Expenses are read once and folded into every budget whose period covers
 * them, so overlapping budgets — a trip inside a month — both reflect the same
 * spending rather than competing for ownership of it.
 */
export function useBudgetStatuses(): BudgetStatus[] {
  return (
    useLiveQuery(async () => {
      const [budgets, expenses] = await Promise.all([
        db.budgets
          .where('deleted')
          .equals(0)
          .filter((b) => b.archived === 0)
          .toArray(),
        db.expenses.where('deleted').equals(0).toArray(),
      ])

      const now = today()
      const statuses = budgets.map((budget) => {
        let spent = 0
        for (const expense of expenses) {
          if (expense.date >= budget.startDate && expense.date <= budget.endDate) {
            spent += expense.amount
          }
        }
        return computeStatus(budget, spent, now)
      })

      const phaseRank = { active: 0, upcoming: 1, ended: 2 } as const
      return statuses.sort(
        (a, b) =>
          phaseRank[a.phase] - phaseRank[b.phase] ||
          a.budget.endDate.localeCompare(b.budget.endDate),
      )
    }, [], [] as BudgetStatus[]) ?? []
  )
}

/** Budgets-screen order, independent from Activity's primary-budget priority. */
export function useOrderedBudgetStatuses(): BudgetStatus[] {
  const statuses = useBudgetStatuses()
  const orderedIds =
    useLiveQuery(
      async () => {
        const value = (await db.meta.get('budgetOrder'))?.value
        return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
      },
      [],
      [] as string[],
    ) ?? []

  const rank = new Map(orderedIds.map((id, index) => [id, index]))
  const fallback = new Map(statuses.map((status, index) => [status.budget.id, index]))
  return [...statuses].sort(
    (a, b) =>
      (rank.get(a.budget.id) ?? orderedIds.length + (fallback.get(a.budget.id) ?? 0)) -
      (rank.get(b.budget.id) ?? orderedIds.length + (fallback.get(b.budget.id) ?? 0)),
  )
}

/** Every budget whose period covers `date`, tightest period first. */
export function coveringBudgets(statuses: BudgetStatus[], date: IsoDate): BudgetStatus[] {
  return statuses
    .filter((s) => s.budget.startDate <= date && s.budget.endDate >= date)
    .sort((a, b) => a.daysTotal - b.daysTotal)
}

/**
 * The budget the home screen leads with. Prefers an explicitly pinned budget,
 * otherwise the active one ending soonest — a week-long trip budget is more
 * urgent than the monthly one it sits inside.
 */
export function usePrimaryBudget(): BudgetStatus | null {
  const statuses = useBudgetStatuses()
  const pinnedId = useLiveQuery(
    async () => (await db.meta.get('primaryBudgetId'))?.value as string | undefined,
    [],
  )

  if (statuses.length === 0) return null
  if (pinnedId) {
    const pinned = statuses.find((s) => s.budget.id === pinnedId)
    if (pinned) return pinned
  }
  return statuses.find((s) => s.phase === 'active') ?? null
}

export interface DayGroup {
  date: IsoDate
  total: Minor
  expenses: Expense[]
}

/**
 * Expenses grouped by calendar day within one calendar month, newest day
 * first. Scoped to a month rather than "last N days with activity" — an
 * unscoped feed keeps growing as history accumulates and eventually mixes
 * spending from unrelated months in one scroll.
 */
export function useTimelineMonth(monthStart: IsoDate, monthEnd: IsoDate): DayGroup[] {
  return (
    useLiveQuery(
      async () => {
        const rows = await db.expenses.where('date').between(monthStart, monthEnd, true, true).toArray()

        const groups = new Map<IsoDate, DayGroup>()
        for (const expense of rows) {
          if (expense.deleted) continue
          let group = groups.get(expense.date)
          if (!group) {
            group = { date: expense.date, total: 0, expenses: [] }
            groups.set(expense.date, group)
          }
          group.total += expense.amount
          group.expenses.push(expense)
        }

        for (const group of groups.values()) {
          // Newest entry of the day on top, matching the day ordering
          group.expenses.sort((a, b) => b.createdAt - a.createdAt)
        }
        return [...groups.values()].sort((a, b) => (a.date < b.date ? 1 : -1))
      },
      [monthStart, monthEnd],
      [] as DayGroup[],
    ) ?? []
  )
}

export interface CategorySlice {
  /**
   * Identity of the slice, independent of whether the category itself has
   * loaded yet. `category` is still null on the first render — keying a list
   * off it would give every slice the same key and leave stale rows on screen.
   */
  categoryId: string | null
  category: Category | null
  total: Minor
  share: number
}

/** Per-category totals over a date range, largest first. */
export function useCategoryBreakdown(
  range: { startDate: IsoDate; endDate: IsoDate } | null,
): CategorySlice[] {
  const categories = useCategories()

  return (
    useLiveQuery(
      async () => {
        if (!range) return []
        const rows = await db.expenses
          .where('date')
          .between(range.startDate, range.endDate, true, true)
          .toArray()

        const totals = new Map<string, Minor>()
        let grand = 0
        for (const expense of rows) {
          if (expense.deleted) continue
          const key = expense.categoryId ?? ''
          totals.set(key, (totals.get(key) ?? 0) + expense.amount)
          grand += expense.amount
        }
        if (grand === 0) return []

        const byId = new Map(categories.map((c) => [c.id, c]))
        return [...totals.entries()]
          .map(([key, total]) => ({
            categoryId: key || null,
            category: key ? (byId.get(key) ?? null) : null,
            total,
            share: total / grand,
          }))
          .sort((a, b) => b.total - a.total)
      },
      [range?.startDate, range?.endDate, categories.length],
      [] as CategorySlice[],
    ) ?? []
  )
}
