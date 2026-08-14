import { Sheet } from '../components/Sheet'
import type { CategorySlice } from '../db/queries'
import { formatMoney } from '../lib/money'

interface MonthSummarySheetProps {
  open: boolean
  onClose: () => void
  slices: CategorySlice[]
  monthLabel: string
}

/**
 * Where a month actually went.
 *
 * Kept behind a tap rather than sitting on the timeline: the total alone
 * answers the everyday question, and the full split is something you go
 * looking for once in a while, not something worth spending screen on daily.
 */
export function MonthSummarySheet({
  open,
  onClose,
  slices,
  monthLabel,
}: MonthSummarySheetProps) {
  const total = slices.reduce((sum, slice) => sum + slice.total, 0)

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="safe-bottom px-4 pt-2 pb-4">
        <div className="pb-3 text-center text-[15px] font-medium">{monthLabel}</div>

        <div className="flex items-baseline justify-between">
          <span className="text-[12.5px] text-muted">Spent</span>
          <span className="tnum text-[24px] leading-none font-light">
            {formatMoney(total)}
          </span>
        </div>

        <div className="mt-3.5 flex h-1.5 gap-[3px]">
          {slices.map((slice) => (
            <span
              key={slice.categoryId ?? 'none'}
              className="rounded-full"
              style={{
                flex: `${slice.share} 0 0`,
                background: slice.category?.color ?? 'var(--color-surface-3)',
              }}
            />
          ))}
        </div>

        {/* Nothing is truncated here — this view exists precisely for the
            detail the timeline deliberately leaves out. */}
        <div className="mt-4 max-h-[58vh] overflow-y-auto overscroll-contain rounded-[var(--radius-card)] bg-surface-2">
          {slices.map((slice, i) => (
            <div
              key={slice.categoryId ?? 'none'}
              className={[
                'flex items-center gap-3 px-4 py-3',
                i > 0 ? 'border-t border-hairline' : '',
              ].join(' ')}
            >
              <span
                className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[14px]"
                style={{
                  background: slice.category
                    ? `${slice.category.color}1f`
                    : 'var(--color-surface-3)',
                }}
              >
                {slice.category?.icon ?? '·'}
              </span>

              <span className="min-w-0 flex-1 truncate text-[14.5px] text-text">
                {slice.category?.name ?? 'No category'}
              </span>

              <span className="tnum shrink-0 text-[14.5px] text-muted">
                {formatMoney(slice.total)}
              </span>
              <span className="tnum w-9 shrink-0 text-right text-[12px] text-faint">
                {Math.round(slice.share * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  )
}
