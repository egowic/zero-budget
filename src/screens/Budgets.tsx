import { useState } from 'react'
import { ProgressBar } from '../components/ProgressBar'
import { SyncDot } from '../components/SyncDot'
import { BudgetSheet } from './BudgetSheet'
import { useBudgetStatuses } from '../db/queries'
import { STATE_COLOR, type BudgetStatus } from '../lib/budget'
import { formatMoney } from '../lib/money'
import { formatDate } from '../lib/dates'
import type { Budget } from '../db/schema'

interface BudgetsProps {
  createOpen: boolean
  onCreateOpenChange: (open: boolean) => void
}

export function Budgets({ createOpen, onCreateOpenChange }: BudgetsProps) {
  const statuses = useBudgetStatuses()
  const [editing, setEditing] = useState<Budget | null>(null)

  return (
    <div className="app-screen min-h-full pb-32">
      <header className="app-header safe-top flex items-center justify-between px-4 pt-3 pb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-[15px] font-semibold tracking-tight text-muted">Budgets</h1>
          <SyncDot />
        </div>
        <button
          type="button"
          onClick={() => onCreateOpenChange(true)}
          className="rounded-full bg-surface-2 px-3.5 py-1.5 text-[13px] text-text active:bg-surface-3"
        >
          New
        </button>
      </header>

      <div className="space-y-3 px-4">
        {statuses.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-dashed border-hairline-strong px-5 py-10 text-center">
            <p className="text-[15px]">No budgets</p>
            <p className="mx-auto mt-1.5 max-w-[260px] text-[13px] leading-relaxed text-faint">
              Pick your own start and end dates. Repeat it monthly, weekly, or not
              at all.
            </p>
            <button
              type="button"
              onClick={() => onCreateOpenChange(true)}
              className="mt-4 rounded-full bg-accent px-5 py-2 text-[14px] font-medium text-ink active:scale-[0.97]"
            >
              Create budget
            </button>
          </div>
        ) : (
          statuses.map((status, i) => (
            <BudgetCard
              key={status.budget.id}
              status={status}
              index={i}
              onEdit={() => setEditing(status.budget)}
            />
          ))
        )}
      </div>

      <BudgetSheet
        open={createOpen || editing !== null}
        budget={editing}
        onClose={() => {
          setEditing(null)
          onCreateOpenChange(false)
        }}
      />
    </div>
  )
}

function repeatLabel(budget: Budget): string | null {
  if (budget.repeats === 0) return null
  switch (budget.period.kind) {
    case 'month':
      return 'Monthly'
    case 'week':
      return 'Weekly'
    case 'days':
      return `Every ${budget.period.count} days`
  }
}

function BudgetCard({
  status,
  index,
  onEdit,
}: {
  status: BudgetStatus
  index: number
  onEdit: () => void
}) {
  const { budget, remaining, percentUsed, percentTime, dailyAllowance, phase } = status
  const color = STATE_COLOR[status.state]
  const repeat = repeatLabel(budget)

  return (
    <button
      type="button"
      onClick={onEdit}
      className="animate-rise-in block w-full rounded-[var(--radius-card)] bg-surface px-5 py-4 text-left active:bg-surface-2"
      style={{ animationDelay: `${Math.min(index, 6) * 35}ms` }}
    >
      <div className="flex items-center gap-2">
        <span className="text-[15px] font-medium">{budget.name}</span>
        {repeat && (
          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10.5px] text-faint">
            {repeat}
          </span>
        )}
        {phase === 'upcoming' && (
          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10.5px] text-faint">
            Not started
          </span>
        )}
      </div>

      <div className="mt-2.5 flex items-baseline gap-1.5">
        <span
          className="tnum text-[28px] leading-none font-light"
          style={{ color: status.state === 'over' ? 'var(--color-over)' : undefined }}
        >
          {formatMoney(remaining)}
        </span>
        <span className="text-[12.5px] text-faint">of {formatMoney(budget.amount)}</span>
      </div>

      <div className="mt-3.5">
        <ProgressBar percent={percentUsed} color={color} paceMarker={percentTime * 100} />
      </div>

      <div className="mt-2.5 flex items-center justify-between text-[11.5px] text-faint">
        <span>{formatDate(budget.startDate, { withYear: true })}</span>
        <span className="tnum" style={{ color }}>
          {percentUsed.toFixed(percentUsed < 10 ? 1 : 0)}%
        </span>
        <span>{formatDate(budget.endDate, { withYear: true })}</span>
      </div>

      {phase === 'active' && (
        <div className="mt-3 flex items-baseline justify-between border-t border-hairline pt-3 text-[12.5px]">
          {dailyAllowance === null ? (
            <span style={{ color }}>Nothing left to spend</span>
          ) : (
            <span>
              <span className="tnum text-text">{formatMoney(dailyAllowance)}</span>
              <span className="text-faint"> / day</span>
            </span>
          )}
          <span className="tnum text-faint">
            {status.daysRemaining} {status.daysRemaining === 1 ? 'day' : 'days'} left
          </span>
        </div>
      )}
    </button>
  )
}
