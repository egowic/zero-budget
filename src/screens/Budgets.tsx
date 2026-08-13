import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ProgressBar } from '../components/ProgressBar'
import { SyncDot } from '../components/SyncDot'
import { BudgetSheet } from './BudgetSheet'
import { useOrderedBudgetStatuses } from '../db/queries'
import { reorderBudgets } from '../db/mutations'
import { formatPercentUsed, STATE_COLOR, type BudgetStatus } from '../lib/budget'
import { formatMoney } from '../lib/money'
import { formatDate } from '../lib/dates'
import type { Budget } from '../db/schema'

interface BudgetsProps {
  createOpen: boolean
  onCreateOpenChange: (open: boolean) => void
}

export function Budgets({ createOpen, onCreateOpenChange }: BudgetsProps) {
  const statuses = useOrderedBudgetStatuses()
  const [editing, setEditing] = useState<Budget | null>(null)
  const [draftOrder, setDraftOrder] = useState<string[] | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const orderRef = useRef<string[] | null>(null)
  const draggingIdRef = useRef<string | null>(null)

  const statusById = new Map(statuses.map((status) => [status.budget.id, status]))
  const displayedStatuses = draftOrder
    ? [
        ...draftOrder.flatMap((id) => {
          const status = statusById.get(id)
          return status ? [status] : []
        }),
        ...statuses.filter((status) => !draftOrder.includes(status.budget.id)),
      ]
    : statuses

  function startReorder(id: string, event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)

    const order = displayedStatuses.map((status) => status.budget.id)
    orderRef.current = order
    draggingIdRef.current = id
    setDraftOrder(order)
    setDraggingId(id)
  }

  function moveReorder(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!draggingIdRef.current) return
    event.preventDefault()
    if (event.clientY < 120) window.scrollBy(0, -10)
    if (event.clientY > window.innerHeight - 140) window.scrollBy(0, 10)

    const draggedId = draggingIdRef.current
    const current = orderRef.current
    const targetId = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-budget-id]')
      ?.dataset.budgetId
    if (!current || !targetId || targetId === draggedId) return

    const from = current.indexOf(draggedId)
    const to = current.indexOf(targetId)
    if (from < 0 || to < 0) return

    const next = [...current]
    next.splice(from, 1)
    next.splice(to, 0, draggedId)
    orderRef.current = next
    setDraftOrder(next)
  }

  async function finishReorder(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!draggingIdRef.current) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    event.preventDefault()
    event.stopPropagation()
    const order = orderRef.current
    draggingIdRef.current = null
    setDraggingId(null)
    try {
      if (order) await reorderBudgets(order)
    } finally {
      orderRef.current = null
      setDraftOrder(null)
    }
  }

  async function moveWithKeyboard(id: string, direction: -1 | 1) {
    const order = displayedStatuses.map((status) => status.budget.id)
    const from = order.indexOf(id)
    const to = from + direction
    if (from < 0 || to < 0 || to >= order.length) return
    ;[order[from], order[to]] = [order[to], order[from]]
    setDraftOrder(order)
    try {
      await reorderBudgets(order)
    } finally {
      setDraftOrder(null)
    }
  }

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
          displayedStatuses.map((status, i) => (
            <BudgetCard
              key={status.budget.id}
              status={status}
              index={i}
              dragging={draggingId === status.budget.id}
              onEdit={() => setEditing(status.budget)}
              onReorderStart={(event) => startReorder(status.budget.id, event)}
              onReorderMove={moveReorder}
              onReorderEnd={(event) => void finishReorder(event)}
              onReorderKey={(direction) =>
                void moveWithKeyboard(status.budget.id, direction)
              }
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
  dragging,
  onEdit,
  onReorderStart,
  onReorderMove,
  onReorderEnd,
  onReorderKey,
}: {
  status: BudgetStatus
  index: number
  dragging: boolean
  onEdit: () => void
  onReorderStart: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onReorderMove: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onReorderEnd: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onReorderKey: (direction: -1 | 1) => void
}) {
  const { budget, remaining, percentUsed, percentTime, dailyAllowance, phase } = status
  const color = STATE_COLOR[status.state]
  const repeat = repeatLabel(budget)

  return (
    <div
      data-budget-id={budget.id}
      className={[
        'animate-rise-in relative w-full rounded-[var(--radius-card)] bg-surface',
        'transition-[transform,box-shadow] duration-150',
        dragging ? 'relative z-10 scale-[1.015] bg-surface-2 shadow-2xl' : '',
      ].join(' ')}
      style={{ animationDelay: `${Math.min(index, 6) * 35}ms` }}
    >
      <button
        type="button"
        onClick={onEdit}
        className="block w-full rounded-[var(--radius-card)] px-5 py-4 text-left active:bg-surface-2"
      >
      <div className="flex items-center gap-2 pr-7">
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
        <span className="text-[12.5px] text-faint">
          {remaining < 0 ? 'over' : 'left'}
        </span>
      </div>

      <div className="mt-1 text-[12.5px] text-faint">
        <span>
          {formatMoney(status.spent)} spent of {formatMoney(budget.amount)}
        </span>
      </div>

      <div className="mt-2.5">
        <ProgressBar
          percent={percentUsed}
          color={color}
          paceMarker={percentTime * 100}
          paceLabel={phase === 'active' ? 'Today' : undefined}
          valueLabel={formatPercentUsed(percentUsed)}
          height={22}
        />
      </div>

      <div className="mt-2.5 flex items-center justify-between text-[11.5px] text-faint">
        <span>{formatDate(budget.startDate, { withYear: true })}</span>
        <span>{formatDate(budget.endDate, { withYear: true })}</span>
      </div>

      {phase !== 'ended' && (
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

      <button
        type="button"
        aria-label={`Reorder ${budget.name}`}
        aria-roledescription="sortable"
        onPointerDown={onReorderStart}
        onPointerMove={onReorderMove}
        onPointerUp={onReorderEnd}
        onPointerCancel={onReorderEnd}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            onReorderKey(-1)
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            onReorderKey(1)
          }
        }}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        className="absolute top-2.5 right-3 flex h-8 w-7 cursor-grab touch-none items-center justify-center rounded-lg text-faint active:cursor-grabbing active:bg-surface-3"
        style={{ touchAction: 'none' }}
      >
        <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden>
          <circle cx="3" cy="3" r="1.1" />
          <circle cx="9" cy="3" r="1.1" />
          <circle cx="3" cy="8" r="1.1" />
          <circle cx="9" cy="8" r="1.1" />
          <circle cx="3" cy="13" r="1.1" />
          <circle cx="9" cy="13" r="1.1" />
        </svg>
      </button>
    </div>
  )
}
