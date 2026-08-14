import { useEffect, useState } from 'react'
import { Sheet } from '../components/Sheet'
import { CategoryGrid } from '../components/CategoryGrid'
import { Keypad } from '../components/Keypad'
import { useCategories } from '../db/queries'
import { deleteExpense, updateExpense } from '../db/mutations'
import { OTHER_CATEGORY_ID } from '../db/seed'
import type { Expense } from '../db/schema'
import { formatMoney, formatTyping, parseAmount, toMajor } from '../lib/money'
import { formatDate } from '../lib/dates'

interface ExpenseDetailSheetProps {
  expense: Expense | null
  onClose: () => void
}

/**
 * Tapping a timeline row lands here. Recategorising is the common case — an
 * expense entered in a hurry with no category, tidied up later — so the grid
 * is open and edits apply immediately rather than behind a save button.
 */
export function ExpenseDetailSheet({ expense, onClose }: ExpenseDetailSheetProps) {
  const categories = useCategories()
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    expense?.categoryId ?? null,
  )
  const [displayAmount, setDisplayAmount] = useState<number>(expense?.amount ?? 0)
  const [editingAmount, setEditingAmount] = useState(false)
  const [buffer, setBuffer] = useState('')

  // `expense` is the snapshot that was tapped in the timeline: a plain object
  // from that render, not a live reference. Saving a change writes IndexedDB
  // and the timeline behind this sheet updates on its own, but this prop
  // never does — so every field shown here needs its own local copy, updated
  // optimistically on save, or a save would work invisibly. Both fields reset
  // whenever another/currently refreshed expense is opened.
  useEffect(() => {
    setSelectedCategoryId(expense?.categoryId ?? null)
    setDisplayAmount(expense?.amount ?? 0)
    setEditingAmount(false)
  }, [expense?.id, expense?.categoryId, expense?.amount])

  if (!expense) return null

  async function recategorise(categoryId: string | null) {
    if (!expense) return
    // Clearing a category files the expense under Other rather than untagged,
    // matching what happens when one is never chosen in the first place.
    const nextCategoryId = categoryId ?? OTHER_CATEGORY_ID
    const previousCategoryId = selectedCategoryId
    setSelectedCategoryId(nextCategoryId)

    try {
      await updateExpense(expense.id, { categoryId: nextCategoryId })
    } catch (error) {
      // A rare local write failure should not leave the UI claiming a category
      // that was never saved.
      setSelectedCategoryId(previousCategoryId)
      throw error
    }
  }

  async function remove() {
    if (!expense) return
    await deleteExpense(expense.id)
    onClose()
  }

  const typedAmount = parseAmount(buffer)
  const canSaveAmount = typedAmount > 0

  function startEditingAmount() {
    // Seeds from the current value rather than blank — correcting a typo is
    // the common case, and starting from zero would throw away a mostly
    // right number for the sake of a single wrong digit.
    setBuffer(String(toMajor(displayAmount)))
    setEditingAmount(true)
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

  function backspaceAmount() {
    setBuffer((current) => current.slice(0, -1))
  }

  async function saveAmount() {
    if (!expense || !canSaveAmount) return
    const previousAmount = displayAmount
    setDisplayAmount(typedAmount)
    setEditingAmount(false)

    try {
      await updateExpense(expense.id, { amount: typedAmount })
    } catch (error) {
      // A rare local write failure should not leave the UI claiming an
      // amount that was never saved.
      setDisplayAmount(previousAmount)
      throw error
    }
  }

  return (
    <Sheet open={expense !== null} onClose={onClose}>
      <div className="safe-bottom px-4 pt-2 pb-4">
        {editingAmount ? (
          <>
            {/* Same buffer/keypad pattern as entering a new expense, so
                correcting one feels like the same action, not a different
                feature. */}
            <div className="flex items-start justify-center gap-1.5 pt-2 pb-5">
              <span className="mt-3 text-[22px] font-light text-faint">₺</span>
              <span className="tnum text-[46px] leading-none font-light tracking-tight text-text">
                {buffer === '' ? '0' : formatTyping(buffer)}
              </span>
            </div>

            <Keypad onDigit={pushDigit} onDecimal={pushDecimal} onBackspace={backspaceAmount} />

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setEditingAmount(false)}
                className="h-[48px] flex-1 rounded-2xl bg-surface-2 text-[15px] text-muted active:bg-surface-3"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveAmount}
                disabled={!canSaveAmount}
                className={[
                  'h-[48px] flex-1 rounded-2xl text-[15px] font-medium',
                  canSaveAmount ? 'bg-accent text-ink active:scale-[0.985]' : 'bg-surface-2 text-faint',
                ].join(' ')}
              >
                Save
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="pb-5 text-center">
              <button
                type="button"
                onClick={startEditingAmount}
                className="inline-flex items-center gap-1.5 active:opacity-70"
              >
                <span className="tnum text-[34px] leading-none font-light">
                  {formatMoney(displayAmount)}
                </span>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-faint"
                  />
                </svg>
              </button>
              <div className="mt-2 text-[12.5px] text-faint">
                {formatDate(expense.date, { withYear: true })}
                {expense.note && (
                  <>
                    <span className="mx-1.5">·</span>
                    {expense.note}
                  </>
                )}
              </div>
            </div>

            <div className="mb-1 text-[11px] tracking-wide text-faint uppercase">
              Category
            </div>
            <CategoryGrid
              categories={categories}
              selectedId={selectedCategoryId}
              onSelect={recategorise}
            />

            <div className="mt-6">
              <button
                type="button"
                onClick={remove}
                className="h-[48px] w-full rounded-2xl bg-surface-2 text-[15px] text-over active:bg-surface-3"
              >
                Delete expense
              </button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}
