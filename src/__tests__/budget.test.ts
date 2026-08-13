import { describe, expect, it } from 'vitest'
import { computeStatus } from '../lib/budget'
import { deriveEndDate, nextStart } from '../db/mutations'
import { addMonths, daysBetween, formatRange } from '../lib/dates'
import type { Budget, Period } from '../db/schema'

function budget(over: Partial<Budget> = {}): Budget {
  return {
    id: 'b1',
    name: 'Monthly',
    amount: 1_900_000, // ₺19,000
    startDate: '2026-07-27',
    endDate: '2026-08-26',
    period: { kind: 'month' },
    repeats: 1,
    archived: 0,
    deleted: 0,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

describe('period derivation', () => {
  it('ends a monthly budget the day before the next month starts', () => {
    expect(deriveEndDate('2026-07-27', { kind: 'month' })).toBe('2026-08-26')
    expect(deriveEndDate('2026-01-01', { kind: 'month' })).toBe('2026-01-31')
  })

  it('clamps a start date that has no counterpart in the next month', () => {
    // 31 Jan + 1 month must land on 28 Feb, not spill into March
    expect(deriveEndDate('2026-01-31', { kind: 'month' })).toBe('2026-02-27')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
  })

  it('derives week and custom lengths inclusively', () => {
    expect(deriveEndDate('2026-08-10', { kind: 'week' })).toBe('2026-08-16')
    expect(deriveEndDate('2026-08-10', { kind: 'days', count: 8 })).toBe('2026-08-17')
    expect(daysBetween('2026-08-10', '2026-08-17')).toBe(8)
  })

  it('advances a monthly period without drifting off month ends', () => {
    const period: Period = { kind: 'month' }
    let start = '2026-01-31'
    start = nextStart(start, period)
    expect(start).toBe('2026-02-28')
    // Having been clamped once, it does not creep further backwards
    expect(nextStart(start, period)).toBe('2026-03-28')
  })
})

describe('budget status', () => {
  it('spreads what is left over the days that are left, today included', () => {
    // 13 Aug of a 27 Jul – 26 Aug period: 14 days remain including today
    const status = computeStatus(budget(), 510_100, '2026-08-13')
    expect(status.daysTotal).toBe(31)
    expect(status.daysRemaining).toBe(14)
    expect(status.dailyAllowance).toBe(99_200) // ₺992, whole lira
  })

  it('never reports an infinite allowance on the final day', () => {
    const status = computeStatus(budget(), 1_000_000, '2026-08-26')
    expect(status.daysRemaining).toBe(1)
    expect(status.dailyAllowance).toBe(900_000)
  })

  it('withholds an allowance once the budget is spent', () => {
    const status = computeStatus(budget(), 2_000_000, '2026-08-13')
    expect(status.remaining).toBe(-100_000)
    expect(status.dailyAllowance).toBeNull()
    expect(status.state).toBe('over')
  })

  it('flags spending that is meaningfully ahead of an even pace', () => {
    // ~55% of the period elapsed, 90% of the money gone
    const fast = computeStatus(budget(), 1_710_000, '2026-08-13')
    expect(fast.state).toBe('watch')
    expect(fast.paceDelta).toBeGreaterThan(0)

    const steady = computeStatus(budget(), 850_000, '2026-08-13')
    expect(steady.state).toBe('healthy')
  })

  it('reports phases outside the period without dividing by zero', () => {
    const upcoming = computeStatus(budget(), 0, '2026-07-01')
    expect(upcoming.phase).toBe('upcoming')
    expect(upcoming.daysElapsed).toBe(0)
    expect(upcoming.dailyAllowance).toBe(61_200)

    const ended = computeStatus(budget(), 500_000, '2026-09-01')
    expect(ended.phase).toBe('ended')
    expect(ended.daysRemaining).toBe(0)
    expect(ended.dailyAllowance).toBeNull()
  })

  it('handles a single-day budget', () => {
    const oneDay = budget({ startDate: '2026-08-13', endDate: '2026-08-13' })
    const status = computeStatus(oneDay, 0, '2026-08-13')
    expect(status.daysTotal).toBe(1)
    expect(status.daysRemaining).toBe(1)
    expect(status.dailyAllowance).toBe(1_900_000)
  })
})

describe('range formatting', () => {
  it('omits the year within the current year and shows it otherwise', () => {
    const thisYear = new Date().getFullYear()
    expect(formatRange(`${thisYear}-07-27`, `${thisYear}-08-26`)).toBe('Jul 27 – Aug 26')
    expect(formatRange('2031-07-27', '2031-08-26')).toBe('Jul 27 – Aug 26, 2031')
  })
})
