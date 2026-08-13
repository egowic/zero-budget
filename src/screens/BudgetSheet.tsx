import { useEffect, useState } from 'react'
import { Sheet } from '../components/Sheet'
import { addBudget, deleteBudget, deriveEndDate, updateBudget } from '../db/mutations'
import type { Budget, Period } from '../db/schema'
import {
  formatAmount,
  formatTyping,
  parseAmount,
  sanitizeTyping,
  toMajor,
} from '../lib/money'
import { addDays, daysBetween, formatRange, today, type IsoDate } from '../lib/dates'

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
  /** Only used by the custom length, where the end is picked rather than derived. */
  const [customEnd, setCustomEnd] = useState<IsoDate>(addDays(today(), 6))
  const [repeats, setRepeats] = useState(true)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Reload the form whenever the sheet opens onto a different budget
  useEffect(() => {
    if (!open) return
    if (budget) {
      setName(budget.name)
      // Raw digits, not the grouped form — the input groups it for display
      setAmountText(String(toMajor(budget.amount)))
      setStartDate(budget.startDate)
      setPeriod(budget.period)
      setCustomEnd(budget.endDate)
      setRepeats(budget.repeats === 1)
    } else {
      setName('')
      setAmountText('')
      setStartDate(today())
      setPeriod({ kind: 'month' })
      setCustomEnd(addDays(today(), 6))
      setRepeats(true)
    }
    setConfirmingDelete(false)
  }, [open, budget])

  const amount = parseAmount(amountText)

  // A custom length is expressed as two dates and stored as a day count, so it
  // still repeats and rolls like any other period.
  const custom = period.kind === 'days'
  const endDate = custom
    ? customEnd < startDate
      ? startDate
      : customEnd
    : deriveEndDate(startDate, period)
  const days = daysBetween(startDate, endDate)
  const effectivePeriod: Period = custom ? { kind: 'days', count: days } : period

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
        period: effectivePeriod,
        repeats: repeats ? 1 : 0,
      })
    } else {
      await addBudget({ name, amount, startDate, period: effectivePeriod, repeats })
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
            // Displayed grouped, stored raw — "30000" reads back as "30,000"
            value={formatTyping(amountText)}
            onChange={(e) => setAmountText(sanitizeTyping(e.target.value))}
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
              onClick={() => {
                if (option.kind === 'days') {
                  // Carry the current end across, so switching to Custom starts
                  // from what is already on screen rather than resetting it
                  setCustomEnd(endDate)
                  setPeriod({ kind: 'days', count: days })
                } else {
                  setPeriod({ kind: option.kind } as Period)
                }
              }}
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

        {/* A month or a week needs only its start — the end follows. A custom
            length has nothing to derive from, so both dates are picked. */}
        <SectionLabel>{custom ? 'Dates' : 'Starts'}</SectionLabel>
        <div className={custom ? 'grid grid-cols-2 gap-2' : ''}>
          <DateField label="Starts" value={startDate} onChange={setStartDate} />
          {custom && (
            <DateField
              label="Ends"
              value={endDate}
              min={startDate}
              onChange={setCustomEnd}
            />
          )}
        </div>

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

function DateField({
  label,
  value,
  min,
  onChange,
}: {
  label: string
  value: IsoDate
  min?: IsoDate
  onChange: (value: IsoDate) => void
}) {
  return (
    <label className="block rounded-2xl bg-surface-2 px-4 py-2.5">
      <span className="block text-[11px] text-faint">{label}</span>
      <input
        type="date"
        value={value}
        min={min}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="tnum w-full bg-transparent text-[14.5px] outline-none"
      />
    </label>
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
