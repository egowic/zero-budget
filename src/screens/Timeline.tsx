import { useMemo, useState } from 'react'
import { BudgetHero } from '../components/BudgetHero'
import { SyncDot } from '../components/SyncDot'
import { SyncAlertBar } from '../components/SyncAlertBar'
import { ExpenseDetailSheet } from './ExpenseDetailSheet'
import { BudgetPickerSheet } from './BudgetPickerSheet'
import {
  useBudgetStatuses,
  useCategoryMap,
  usePrimaryBudget,
  useTimelineMonth,
} from '../db/queries'
import type { DayGroup } from '../db/queries'
import type { Expense } from '../db/schema'
import {
  addMonths,
  formatDayHeader,
  formatMonth,
  isSameMonth,
  monthBounds,
  today,
} from '../lib/dates'
import { formatMoney } from '../lib/money'

interface TimelineProps {
  onCreateBudget: () => void
  onOpenSettings: () => void
}

export function Timeline({ onCreateBudget, onOpenSettings }: TimelineProps) {
  const primary = usePrimaryBudget()
  const allBudgets = useBudgetStatuses()
  const categories = useCategoryMap()

  // Defaults to the current month on every load; browsing away from it does
  // not persist, so the app always opens on "what's happening now."
  const [monthCursor, setMonthCursor] = useState(today)
  const { start, end } = useMemo(() => monthBounds(monthCursor), [monthCursor])
  const days = useTimelineMonth(start, end)
  const isCurrentMonth = isSameMonth(monthCursor, today())

  const [selected, setSelected] = useState<Expense | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <div className="app-screen min-h-full pb-32">
      <header className="app-header safe-top flex items-center justify-between px-4 pt-3 pb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-[15px] font-semibold tracking-tight text-muted">Activity</h1>
          <SyncDot />
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Settings"
          className="flex h-8 w-8 items-center justify-center rounded-full text-faint active:bg-surface-2"
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </header>

      <SyncAlertBar onInspect={onOpenSettings} />

      <div className="px-4">
        {primary ? (
          <BudgetHero
            status={primary}
            onSwitch={allBudgets.length > 1 ? () => setPickerOpen(true) : undefined}
          />
        ) : (
          <EmptyBudget onCreate={onCreateBudget} />
        )}
      </div>

      <MonthNav
        monthCursor={monthCursor}
        atCurrentMonth={isCurrentMonth}
        onPrev={() => setMonthCursor((m) => addMonths(m, -1))}
        onNext={() => setMonthCursor((m) => addMonths(m, 1))}
      />

      {days.length === 0 ? (
        <EmptyTimeline currentMonth={isCurrentMonth} monthLabel={formatMonth(monthCursor)} />
      ) : (
        <div className="mt-3">
          {days.map((day, index) => (
            <DaySection
              key={day.date}
              day={day}
              categories={categories}
              index={index}
              onSelect={setSelected}
            />
          ))}
        </div>
      )}

      <ExpenseDetailSheet
        expense={selected}
        onClose={() => setSelected(null)}
      />
      <BudgetPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        statuses={allBudgets}
        currentId={primary?.budget.id ?? null}
      />
    </div>
  )
}

function DaySection({
  day,
  categories,
  index,
  onSelect,
}: {
  day: DayGroup
  categories: Map<string, { icon: string; name: string; color: string }>
  index: number
  onSelect: (expense: Expense) => void
}) {
  return (
    <section
      className="animate-rise-in"
      style={{ animationDelay: `${Math.min(index, 6) * 28}ms` }}
    >
      {/* Sticky so the day you are scrolling through is always identified */}
      <div className="sticky top-0 z-10 flex items-baseline justify-between bg-ink/85 px-4 py-2 backdrop-blur-md">
        <span className="text-[12.5px] font-medium text-muted">
          {formatDayHeader(day.date)}
        </span>
        <span className="tnum text-[12.5px] text-faint">{formatMoney(day.total)}</span>
      </div>

      <div className="mx-4 overflow-hidden rounded-[var(--radius-card)] bg-surface">
        {day.expenses.map((expense, i) => {
          const category = expense.categoryId ? categories.get(expense.categoryId) : null
          return (
            <button
              key={expense.id}
              type="button"
              onClick={() => onSelect(expense)}
              className={[
                'flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-surface-2',
                i > 0 ? 'border-t border-hairline' : '',
              ].join(' ')}
            >
              <span
                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-[17px]"
                style={{
                  background: category ? `${category.color}1f` : 'var(--color-surface-3)',
                }}
              >
                {category?.icon ?? '·'}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] text-text">
                  {category?.name ?? expense.note ?? 'Expense'}
                </span>
                {category && expense.note && (
                  <span className="block truncate text-[12.5px] text-faint">
                    {expense.note}
                  </span>
                )}
              </span>

              {/* Expenses are uniformly negative, so colouring them all red adds
                  noise without adding information. Neutral reads calmer. */}
              <span className="tnum shrink-0 text-[15px] text-text">
                {formatMoney(-expense.amount)}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function MonthNav({
  monthCursor,
  atCurrentMonth,
  onPrev,
  onNext,
}: {
  monthCursor: string
  atCurrentMonth: boolean
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <div className="mt-6 flex items-center justify-between px-4">
      <button
        type="button"
        onClick={onPrev}
        aria-label="Previous month"
        className="flex h-8 w-8 items-center justify-center rounded-full text-faint active:bg-surface-2"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M15 18l-6-6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <span className="text-[13.5px] font-medium text-text">{formatMonth(monthCursor)}</span>

      <button
        type="button"
        onClick={onNext}
        disabled={atCurrentMonth}
        aria-label="Next month"
        className="flex h-8 w-8 items-center justify-center rounded-full text-faint disabled:opacity-30 active:bg-surface-2"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M9 6l6 6-6 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  )
}

function EmptyBudget({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-hairline-strong px-5 py-8 text-center">
      <p className="text-[15px] text-text">No budget yet</p>
      <p className="mx-auto mt-1.5 max-w-[250px] text-[13px] leading-relaxed text-faint">
        Set one up and this is where you'll see what's safe to spend today.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-4 rounded-full bg-accent px-5 py-2 text-[14px] font-medium text-ink active:scale-[0.97]"
      >
        Create budget
      </button>
    </div>
  )
}

function EmptyTimeline({
  currentMonth,
  monthLabel,
}: {
  currentMonth: boolean
  monthLabel: string
}) {
  return (
    <div className="px-4 pt-14 text-center">
      <p className="text-[13.5px] text-faint">
        {currentMonth ? (
          <>
            Tap <span className="text-muted">+</span> to add your first expense.
          </>
        ) : (
          `No expenses in ${monthLabel}.`
        )}
      </p>
    </div>
  )
}
