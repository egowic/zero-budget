import { useEffect, useState } from 'react'
import { Sheet } from '../components/Sheet'
import { CategoryGrid } from '../components/CategoryGrid'
import { useCategories } from '../db/queries'
import { deleteExpense, updateExpense } from '../db/mutations'
import { OTHER_CATEGORY_ID } from '../db/seed'
import type { Expense } from '../db/schema'
import { formatMoney } from '../lib/money'
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

  // `expense` is the snapshot that was tapped in the timeline. Keep an
  // immediate local selection while its IndexedDB update propagates back
  // through the live timeline query, then reset whenever another/currently
  // refreshed expense is opened.
  useEffect(() => {
    setSelectedCategoryId(expense?.categoryId ?? null)
  }, [expense?.id, expense?.categoryId])

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

  return (
    <Sheet open={expense !== null} onClose={onClose}>
      <div className="safe-bottom px-4 pt-2 pb-4">
        <div className="pb-5 text-center">
          <div className="tnum text-[34px] leading-none font-light">
            {formatMoney(expense.amount)}
          </div>
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
      </div>
    </Sheet>
  )
}
