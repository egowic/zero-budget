import { ProgressBar } from './ProgressBar'
import { formatPercentUsed, STATE_COLOR } from '../lib/budget'
import type { BudgetStatus } from '../lib/budget'
import { formatMoney } from '../lib/money'
import { formatRange } from '../lib/dates'

interface BudgetHeroProps {
  status: BudgetStatus
  onSwitch?: () => void
}

/**
 * The home screen's answer to "am I fine?".
 *
 * Remaining is the largest thing on screen and the daily allowance sits
 * directly beneath it — those two numbers are the reason the app exists, so
 * nothing else is allowed to compete with them for attention.
 */
export function BudgetHero({ status, onSwitch }: BudgetHeroProps) {
  const color = STATE_COLOR[status.state]
  const { budget, remaining, percentUsed, percentTime, dailyAllowance, daysRemaining } =
    status

  return (
    <div className="rounded-[var(--radius-card)] bg-surface px-5 pt-4 pb-4">
      <button
        type="button"
        onClick={onSwitch}
        disabled={!onSwitch}
        className="flex w-full items-center gap-1.5 text-left"
      >
        <span className="text-[13px] font-medium text-muted">{budget.name}</span>
        {onSwitch && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="m6 9 6 6 6-6"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-faint"
            />
          </svg>
        )}
        <span className="ml-auto text-[12px] text-faint">
          {formatRange(budget.startDate, budget.endDate)}
        </span>
      </button>

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
        <ProgressBar
          percent={percentUsed}
          color={color}
          paceMarker={percentTime * 100}
          paceLabel={status.phase === 'active' ? 'Today' : undefined}
        />
      </div>

      <div className="mt-3 flex items-end justify-between border-t border-hairline pt-3">
        <div>
          <div className="text-[10.5px] tracking-[0.08em] text-faint uppercase">
            Daily limit
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="tnum text-[16px] leading-none font-normal" style={{ color }}>
              {dailyAllowance === null ? '—' : formatMoney(dailyAllowance)}
            </span>
            {dailyAllowance !== null && (
              <span className="text-[12px] text-faint">/ day</span>
            )}
          </div>
        </div>

        <div className="text-right">
          <div className="text-[10.5px] tracking-[0.08em] text-faint uppercase">
            Time left
          </div>
          <div className="mt-1 tnum text-[16px] leading-none font-normal text-muted">
            {status.phase === 'ended'
              ? 'Ended'
              : status.phase === 'upcoming'
                ? 'Not started'
                : `${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}`}
          </div>
        </div>
      </div>

      {status.state !== 'healthy' && status.phase === 'active' && (
        <div
          className="mt-3.5 rounded-xl px-3 py-2 text-[12.5px] leading-snug"
          style={{
            background:
              status.state === 'over'
                ? 'var(--color-over-dim)'
                : 'var(--color-warn-dim)',
            color,
          }}
        >
          {status.state === 'over'
            ? `You're ${formatMoney(-remaining)} over budget.`
            : `Spending fast — ${formatMoney(status.paceDelta)} ahead of an even pace.`}
        </div>
      )}
    </div>
  )
}
