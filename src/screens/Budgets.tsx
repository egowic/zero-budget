import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
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
  const gestureRef = useRef<{
    id: string
    pointerId: number
    startX: number
    startY: number
    target: HTMLButtonElement
  } | null>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressClickRef = useRef(false)
  const touchMoveBlockerRef = useRef<((event: TouchEvent) => void) | null>(null)

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

  function clearLongPressTimer() {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  function stopBlockingTouchMove() {
    const blocker = touchMoveBlockerRef.current
    if (blocker) document.removeEventListener('touchmove', blocker)
    touchMoveBlockerRef.current = null
  }

  useEffect(
    () => () => {
      clearLongPressTimer()
      stopBlockingTouchMove()
    },
    [],
  )

  function beginPress(id: string, event: ReactPointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return

    clearLongPressTimer()
    suppressClickRef.current = false
    gestureRef.current = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      target: event.currentTarget,
    }

    longPressTimerRef.current = setTimeout(() => {
      const gesture = gestureRef.current
      if (!gesture || gesture.id !== id) return

      const order = displayedStatuses.map((status) => status.budget.id)
      orderRef.current = order
      draggingIdRef.current = id
      suppressClickRef.current = true
      setDraftOrder(order)
      setDraggingId(id)

      try {
        gesture.target.setPointerCapture(gesture.pointerId)
      } catch {
        // The pointer can disappear between the timer firing and capture.
      }

      const blocker = (touchEvent: TouchEvent) => touchEvent.preventDefault()
      touchMoveBlockerRef.current = blocker
      document.addEventListener('touchmove', blocker, { passive: false })
      navigator.vibrate?.(8)
    }, 380)
  }

  function movePress(event: ReactPointerEvent<HTMLButtonElement>) {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return

    if (!draggingIdRef.current) {
      const moved = Math.hypot(
        event.clientX - gesture.startX,
        event.clientY - gesture.startY,
      )
      if (moved > 10) {
        clearLongPressTimer()
        suppressClickRef.current = true
      }
      return
    }

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

  async function endPress(event: ReactPointerEvent<HTMLButtonElement>) {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return

    clearLongPressTimer()
    gestureRef.current = null
    const wasDragging = draggingIdRef.current !== null

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (wasDragging) {
      event.preventDefault()
      const order = orderRef.current
      draggingIdRef.current = null
      setDraggingId(null)
      stopBlockingTouchMove()
      try {
        if (order) await reorderBudgets(order)
      } finally {
        orderRef.current = null
        setDraftOrder(null)
      }
    }

    setTimeout(() => {
      suppressClickRef.current = false
    }, 0)
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
              onEdit={() => {
                if (!suppressClickRef.current) setEditing(status.budget)
              }}
              onPointerDown={(event) => beginPress(status.budget.id, event)}
              onPointerMove={movePress}
              onPointerEnd={(event) => void endPress(event)}
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
  onPointerDown,
  onPointerMove,
  onPointerEnd,
}: {
  status: BudgetStatus
  index: number
  dragging: boolean
  onEdit: () => void
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerEnd: (event: ReactPointerEvent<HTMLButtonElement>) => void
}) {
  const { budget, remaining, percentUsed, percentTime, dailyAllowance, phase } = status
  const color = STATE_COLOR[status.state]
  const repeat = repeatLabel(budget)

  return (
    <button
      type="button"
      data-budget-id={budget.id}
      onClick={onEdit}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onContextMenu={(event) => event.preventDefault()}
      className={[
        'animate-rise-in block w-full touch-pan-y select-none rounded-[var(--radius-card)]',
        'bg-surface px-5 py-4 text-left transition-[transform,box-shadow,opacity] duration-150',
        'active:bg-surface-2',
        dragging ? 'relative z-10 scale-[1.015] bg-surface-2 shadow-2xl' : '',
      ].join(' ')}
      style={{
        animationDelay: `${Math.min(index, 6) * 35}ms`,
        WebkitTouchCallout: 'none',
      }}
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
        <span className="text-[12.5px] text-faint">
          {remaining < 0 ? 'over' : 'left'}
        </span>
      </div>

      <div className="mt-1 flex items-center justify-between gap-3 text-[12.5px] text-faint">
        <span>
          {formatMoney(status.spent)} spent of {formatMoney(budget.amount)}
        </span>
        <span className="tnum shrink-0" style={{ color }}>
          {formatPercentUsed(percentUsed)}
        </span>
      </div>

      <div className="mt-3.5">
        <ProgressBar percent={percentUsed} color={color} paceMarker={percentTime * 100} />
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
  )
}
