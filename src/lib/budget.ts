import type { Budget } from '../db/schema'
import { clamp, daysBetween, isWithin, today, type IsoDate } from './dates'
import { MINOR_PER_MAJOR, type Minor } from './money'

export type BudgetState = 'healthy' | 'watch' | 'over'
export type Phase = 'active' | 'upcoming' | 'ended'

export interface BudgetStatus {
  budget: Budget
  phase: Phase

  spent: Minor
  remaining: Minor
  /** 0–100+, clamped at 0 from below but allowed past 100 when overspent. */
  percentUsed: number

  daysTotal: number
  /** Days consumed so far, including today. 0 before the period starts. */
  daysElapsed: number
  /** Days left, including today. 0 once the period has ended. */
  daysRemaining: number
  /** Fraction of the period that has elapsed, 0–1. */
  percentTime: number

  /**
   * The headline number: what can still be spent per remaining day without
   * blowing the budget. null once the period is over or already overspent.
   */
  dailyAllowance: Minor | null
  /** What the even-pace daily figure was at the start, for comparison. */
  baselineDaily: Minor

  /**
   * Signed difference between what has been spent and what an even pace
   * would have spent by now. Negative means under pace (good).
   */
  paceDelta: Minor
  state: BudgetState
}

/**
 * Computes everything the UI needs about one budget from its total spend.
 *
 * `spent` is passed in rather than queried here so this stays pure and
 * testable, and so callers can batch the expensive aggregation.
 */
export function computeStatus(
  budget: Budget,
  spent: Minor,
  now: IsoDate = today(),
): BudgetStatus {
  const { startDate, endDate, amount } = budget

  const daysTotal = Math.max(1, daysBetween(startDate, endDate))

  const phase: Phase =
    now < startDate ? 'upcoming' : now > endDate ? 'ended' : 'active'

  const daysElapsed =
    phase === 'upcoming' ? 0 : daysBetween(startDate, clamp(now, startDate, endDate))

  const daysRemaining =
    phase === 'ended' ? 0 : phase === 'upcoming' ? daysTotal : daysTotal - daysElapsed + 1

  const remaining = amount - spent
  const percentUsed = amount > 0 ? (spent / amount) * 100 : spent > 0 ? 100 : 0
  const percentTime = daysTotal > 0 ? daysElapsed / daysTotal : 0

  // Spread what is left over the days that are left. Today counts as spendable,
  // which is why daysRemaining is inclusive — otherwise the last day of a
  // period would divide by zero and report an infinite allowance.
  //
  // Rounded down to whole currency units: this is a figure to hold in your head
  // while standing in a shop, and the kuruş are noise at that moment.
  const dailyAllowance =
    daysRemaining > 0 && remaining > 0
      ? Math.floor(remaining / daysRemaining / MINOR_PER_MAJOR) * MINOR_PER_MAJOR
      : null

  const baselineDaily = Math.floor(amount / daysTotal)
  const expectedByNow = Math.round(amount * percentTime)
  const paceDelta = spent - expectedByNow

  let state: BudgetState = 'healthy'
  if (remaining < 0) {
    state = 'over'
  } else if (phase === 'active' && percentUsed > percentTime * 100 + 10) {
    // Meaningfully ahead of an even burn — worth flagging before it is too late
    state = 'watch'
  }

  return {
    budget,
    phase,
    spent,
    remaining,
    percentUsed,
    daysTotal,
    daysElapsed,
    daysRemaining,
    percentTime,
    dailyAllowance,
    baselineDaily,
    paceDelta,
    state,
  }
}

/** Does this expense date fall inside the budget's period? */
export function coversDate(budget: Budget, date: IsoDate): boolean {
  return isWithin(date, budget.startDate, budget.endDate)
}

export const STATE_COLOR: Record<BudgetState, string> = {
  healthy: 'var(--color-good)',
  watch: 'var(--color-warn)',
  over: 'var(--color-over)',
}

export const STATE_COLOR_DIM: Record<BudgetState, string> = {
  healthy: 'var(--color-good-dim)',
  watch: 'var(--color-warn-dim)',
  over: 'var(--color-over-dim)',
}
