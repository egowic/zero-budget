import { useEffect, useState } from 'react'
import { Sheet } from '../components/Sheet'
import { addBudget, deleteBudget, deriveEndDate, updateBudget } from '../db/mutations'
import type { Budget, Period } from '../db/schema'
import { formatAmount, parseAmount } from '../lib/money'
import { daysBetween, formatRange, today, type IsoDate } from '../lib/dates'

interface BudgetSheetProps {
  open: boolean
  /** null = creating a new budget. */
  budget: Budget | null
  onClose: () => void
}

const LENGTHS: { kind: Period['kind']; label: string }[] = [
  { kind: 'month', label: 'Month' },
  { kind: 'week', label: 'Week' },
  { kind: 'days', label: 'Custom' },
]

export function BudgetSheet({ open, budget, onClose }: BudgetSheetProps) {
  const [name, setName] = useState('')
  const [amountText, setAmountText] = useState('')
  const [startDate, setStartDate] = useState<IsoDate>(today())
  const [period, setPeriod] = useState<Period>({ kind: 'month' })
  const [repeats, setRepeats] = useState(true)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Reload the form whenever the sheet opens onto a different budget
  useEffect(() => {
    if (!open) return
    if (budget) {
      setName(budget.name)
      setAmountText(formatAmount(budget.amount))
      setStartDate(budget.startDate)
      setPeriod(budget.period)
      setRepeats(budget.repeats === 1)
    } else {
      setName('')
      setAmountText('')
      setStartDate(today())
      setPeriod({ kind: 'month' })
      setRepeats(true)
    }
    setConfirmingDelete(false)
  }, [open, budget])

  const amount = parseAmount(amountText)
  const endDate = deriveEndDate(startDate, period)
  const days = daysBetween(startDate, endDate)
  const perDay = days > 0 && amount > 0 ? Math.floor(amount / days) : 0
  const canSave = amount > 0

  async function save() {
    if (!canSave) return
    if (budget) {
      await updateBudget(budget.id, {
        name: name.trim() || 'Budget',
        amount,
        startDate,
        endDate,
        period,
        repeats: repeats ? 1 : 0,
      })
    } else {
      await addBudget({ name, amount, startDate, period, repeats })
    }
    onClose()
  }

  async function remove() {
    if (!budget) return
    await deleteBudget(budget.id)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="safe-bottom hide-scrollbar overflow-y-auto px-4 pt-2 pb-4">
        <div className="pb-4 text-center text-[15px] font-medium">
          {budget ? 'Edit budget' : 'New budget'}
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Budget name"
          maxLength={40}
          className="w-full rounded-2xl bg-surface-2 px-4 py-3.5 text-[15px] outline-none placeholder:text-faint"
        />

        <div className="mt-2 flex items-center gap-2 rounded-2xl bg-surface-2 px-4 py-3.5">
          <span className="text-[20px] font-light text-faint">₺</span>
          <input
            value={amountText}
            onChange={(e) => setAmountText(e.target.value.replace(/[^\d.,]/g, ''))}
            inputMode="decimal"
            placeholder="0"
            className="tnum w-full bg-transparent text-[20px] font-light outline-none placeholder:text-faint"
          />
        </div>

        <SectionLabel>Length</SectionLabel>
        <div className="grid grid-cols-3 gap-1.5">
          {LENGTHS.map((option) => (
            <button
              key={option.kind}
              type="button"
              onClick={() =>
                setPeriod(
                  option.kind === 'days'
                    ? { kind: 'days', count: days || 30 }
                    : ({ kind: option.kind } as Period),
                )
              }
              className={[
                'rounded-xl py-2.5 text-[13px] transition-colors',
                period.kind === option.kind
                  ? 'bg-surface-3 text-text'
                  : 'bg-surface-2 text-faint',
              ].join(' ')}
            >
              {option.label}
            </button>
          ))}
        </div>

        {period.kind === 'days' && (
          <div className="mt-2 flex items-center justify-between rounded-2xl bg-surface-2 px-2 py-2">
            <Stepper
              label="−"
              onPress={() =>
                setPeriod({ kind: 'days', count: Math.max(1, period.count - 1) })
              }
            />
            <div className="flex items-baseline gap-1.5">
              <input
                type="number"
                min={1}
                max={365}
                value={period.count}
                onChange={(e) =>
                  setPeriod({
                    kind: 'days',
                    count: Math.min(365, Math.max(1, Number(e.target.value) || 1)),
                  })
                }
                className="tnum w-12 bg-transparent text-center text-[17px] outline-none"
              />
              <span className="text-[13px] text-faint">days</span>
            </div>
            <Stepper
              label="+"
              onPress={() =>
                setPeriod({ kind: 'days', count: Math.min(365, period.count + 1) })
              }
            />
          </div>
        )}

        {/* Only the start is asked for — the end always follows from it */}
        <SectionLabel>Starts</SectionLabel>
        <label className="block rounded-2xl bg-surface-2 px-4 py-3">
          <input
            type="date"
            value={startDate}
            onChange={(e) => e.target.value && setStartDate(e.target.value)}
            className="tnum w-full bg-transparent text-[15px] outline-none"
          />
        </label>

        <p className="mt-2.5 text-center text-[12.5px] text-faint">
          <span className="text-muted">{formatRange(startDate, endDate)}</span>
          <span className="mx-1.5">·</span>
          {days} days
          {perDay > 0 && (
            <>
              <span className="mx-1.5">·</span>
              <span className="tnum text-muted">₺{formatAmount(perDay)}</span> a day
            </>
          )}
        </p>

        <button
          type="button"
          onClick={() => setRepeats((r) => !r)}
          className="mt-4 flex w-full items-center justify-between rounded-2xl bg-surface-2 px-4 py-3.5 text-left"
        >
          <span>
            <span className="block text-[14.5px]">Repeat</span>
            <span className="mt-0.5 block text-[11.5px] leading-snug text-faint">
              {repeats
                ? 'Starts over automatically when the period ends'
                : 'Runs once and then stops'}
            </span>
          </span>
          <Switch on={repeats} />
        </button>

        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className={[
            'mt-4 h-[52px] w-full rounded-2xl text-[16px] font-medium transition-all',
            canSave ? 'bg-accent text-ink active:scale-[0.985]' : 'bg-surface-2 text-faint',
          ].join(' ')}
        >
          {budget ? 'Save' : 'Create'}
        </button>

        {budget && (
          <div className="mt-2">
            {confirmingDelete ? (
              <>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="h-[48px] flex-1 rounded-2xl bg-surface-2 text-[15px] text-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={remove}
                    className="h-[48px] flex-1 rounded-2xl bg-over text-[15px] font-medium text-ink"
                  >
                    Delete
                  </button>
                </div>
                <p className="mt-2 px-2 text-center text-[12px] leading-relaxed text-faint">
                  Your expenses are kept — they just stop counting against this budget.
                </p>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="h-[48px] w-full rounded-2xl text-[14px] text-over active:bg-surface-2"
              >
                Delete budget
              </button>
            )}
          </div>
        )}
      </div>
    </Sheet>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 mb-2 text-[10.5px] tracking-[0.08em] text-faint uppercase">
      {children}
    </div>
  )
}

function Stepper({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="flex h-9 w-11 items-center justify-center rounded-xl text-[18px] text-muted active:bg-surface-3"
    >
      {label}
    </button>
  )
}

function Switch({ on }: { on: boolean }) {
  return (
    <span
      role="switch"
      aria-checked={on}
      className={[
        'relative block h-[30px] w-[50px] shrink-0 rounded-full transition-colors duration-200',
        on ? 'bg-good' : 'bg-surface-3',
      ].join(' ')}
    >
      <span
        className="absolute top-[3px] left-[3px] h-6 w-6 rounded-full bg-white transition-transform duration-200"
        style={{ transform: on ? 'translateX(20px)' : 'translateX(0)' }}
      />
    </span>
  )
}
