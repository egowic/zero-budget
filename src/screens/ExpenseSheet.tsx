import { useMemo, useRef, useState } from 'react'
import { Sheet } from '../components/Sheet'
import { Keypad } from '../components/Keypad'
import { CategoryGrid } from '../components/CategoryGrid'
import { coveringBudgets, useBudgetStatuses, useCategories } from '../db/queries'
import { addExpense } from '../db/mutations'
import { formatMoney, parseAmount } from '../lib/money'
import { addDays, formatDate, today } from '../lib/dates'

interface ExpenseSheetProps {
  open: boolean
  onClose: () => void
}

const groupFormatter = new Intl.NumberFormat('en-US')

/** Formats the raw keypad buffer for display without disturbing what was typed. */
function formatBuffer(raw: string): string {
  if (raw === '') return '0'
  const [whole, fraction] = raw.split('.')
  const head = whole === '' ? '0' : groupFormatter.format(Number(whole))
  return fraction === undefined ? head : `${head}.${fraction}`
}

export function ExpenseSheet({ open, onClose }: ExpenseSheetProps) {
  const [buffer, setBuffer] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const dateInputRef = useRef<HTMLInputElement>(null)

  const categories = useCategories()
  const budgets = useBudgetStatuses()

  const amount = parseAmount(buffer)
  const canSave = amount > 0

  // Every budget this expense will count against, so the consequence is
  // visible before saving rather than discovered afterwards
  const affected = useMemo(() => coveringBudgets(budgets, date), [budgets, date])

  const isToday = date === today()
  const isYesterday = date === addDays(today(), -1)

  function reset() {
    setBuffer('')
    setCategoryId(null)
    setDate(today())
    setNote('')
    setNoteOpen(false)
  }

  function handleClose() {
    reset()
    onClose()
  }

  function pushDigit(digit: string) {
    setBuffer((current) => {
      const [, fraction] = current.split('.')
      if (fraction !== undefined && fraction.length >= 2) return current
      if (current === '0') return digit
      if (current.replace('.', '').length >= 12) return current
      return current + digit
    })
  }

  function pushDecimal() {
    setBuffer((current) => (current.includes('.') ? current : (current || '0') + '.'))
  }

  function backspace() {
    setBuffer((current) => current.slice(0, -1))
  }

  async function save() {
    if (!canSave) return
    await addExpense({ amount, date, categoryId, note: note.trim() || null })
    handleClose()
  }

  return (
    <Sheet open={open} onClose={handleClose} full>
      <div className="flex h-full flex-col">
        {/* Close on the left, date on the right, nothing in between */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-muted active:bg-surface-3"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="m6 6 12 12M18 6 6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <div className="flex items-center gap-1.5">
            <DateChip label="Today" active={isToday} onClick={() => setDate(today())} />
            <DateChip
              label="Yesterday"
              active={isYesterday}
              onClick={() => setDate(addDays(today(), -1))}
            />
            <button
              type="button"
              onClick={() => dateInputRef.current?.showPicker?.()}
              className={[
                'relative rounded-full px-3 py-1.5 text-[13px] transition-colors',
                !isToday && !isYesterday
                  ? 'bg-surface-3 text-text'
                  : 'bg-surface-2 text-muted',
              ].join(' ')}
            >
              {!isToday && !isYesterday ? formatDate(date) : 'Date'}
              <input
                ref={dateInputRef}
                type="date"
                value={date}
                max={today()}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                className="absolute inset-0 h-full w-full opacity-0"
              />
            </button>
          </div>
        </div>

        {/* Amount — the only required field, so it takes the slack. Any spare
            height on a taller phone pads around this rather than opening a gap
            above the keypad. */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-4">
          <div className="flex items-start gap-1.5">
            <span className="mt-3 text-[26px] font-light text-faint">₺</span>
            <span
              className={[
                'tnum text-[56px] leading-none font-light tracking-tight',
                canSave ? 'text-text' : 'text-faint',
              ].join(' ')}
            >
              {formatBuffer(buffer)}
            </span>
          </div>

          <div className="mt-3 flex min-h-[34px] flex-col items-center gap-1 text-[12.5px] text-faint">
            {affected.length === 0 ? (
              <span>No budget covers this date</span>
            ) : (
              affected.slice(0, 2).map((status) => {
                const after = status.remaining - amount
                return (
                  <span key={status.budget.id}>
                    {status.budget.name}
                    <span className="mx-1.5">·</span>
                    {after >= 0 ? (
                      <>{formatMoney(after)} left</>
                    ) : (
                      <span style={{ color: 'var(--color-over)' }}>
                        {formatMoney(-after)} over
                      </span>
                    )}
                  </span>
                )
              })
            )}
            {affected.length > 2 && <span>+{affected.length - 2} more</span>}
          </div>
        </div>

        {/* Categories — open by default, one tap, entirely skippable */}
        <div className="hide-scrollbar shrink-0 overflow-y-auto px-4">
          <CategoryGrid
            categories={categories}
            selectedId={categoryId}
            onSelect={setCategoryId}
          />

          <div className="mt-4 pb-2">
            {noteOpen ? (
              <input
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onBlur={() => !note && setNoteOpen(false)}
                placeholder="Add a note"
                maxLength={80}
                className="w-full rounded-xl bg-surface-2 px-3.5 py-2.5 text-[14px] outline-none placeholder:text-faint"
              />
            ) : (
              <button
                type="button"
                onClick={() => setNoteOpen(true)}
                className="text-[13px] text-faint active:text-muted"
              >
                + Add a note
              </button>
            )}
          </div>
        </div>

        {/* Keypad and save stay pinned within thumb reach */}
        <div className="safe-bottom px-3 pt-1 pb-2">
          <Keypad onDigit={pushDigit} onDecimal={pushDecimal} onBackspace={backspace} />

          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className={[
              'mt-2 h-[52px] w-full rounded-2xl text-[16px] font-medium',
              'transition-all duration-200',
              canSave
                ? 'bg-accent text-ink active:scale-[0.985]'
                : 'bg-surface-2 text-faint',
            ].join(' ')}
          >
            Save
          </button>
        </div>
      </div>
    </Sheet>
  )
}

function DateChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-full px-3 py-1.5 text-[13px] transition-colors',
        active ? 'bg-surface-3 text-text' : 'bg-surface-2 text-muted',
      ].join(' ')}
    >
      {label}
    </button>
  )
}
