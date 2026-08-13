import { Sheet } from '../components/Sheet'
import { STATE_COLOR, type BudgetStatus } from '../lib/budget'
import { setMeta } from '../db/schema'
import { formatMoney } from '../lib/money'
import { formatRange } from '../lib/dates'

interface BudgetPickerSheetProps {
  open: boolean
  onClose: () => void
  statuses: BudgetStatus[]
  currentId: string | null
}

/** Chooses which budget the home screen leads with when several are running. */
export function BudgetPickerSheet({
  open,
  onClose,
  statuses,
  currentId,
}: BudgetPickerSheetProps) {
  async function pick(id: string) {
    await setMeta('primaryBudgetId', id)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="safe-bottom px-4 pt-2 pb-4">
        <div className="pb-3 text-center text-[15px] font-medium">Switch budget</div>

        <div className="overflow-hidden rounded-[var(--radius-card)] bg-surface-2">
          {statuses.map((status, i) => (
            <button
              key={status.budget.id}
              type="button"
              onClick={() => pick(status.budget.id)}
              className={[
                'flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-surface-3',
                i > 0 ? 'border-t border-hairline' : '',
              ].join(' ')}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: STATE_COLOR[status.state] }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px]">{status.budget.name}</span>
                <span className="block text-[12px] text-faint">
                  {formatRange(status.budget.startDate, status.budget.endDate)}
                </span>
              </span>
              <span className="tnum shrink-0 text-[14px] text-muted">
                {formatMoney(status.remaining)}
              </span>
              {status.budget.id === currentId && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="m5 13 4 4L19 7"
                    stroke="var(--color-good)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  )
}
