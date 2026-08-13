import { memo } from 'react'

interface KeypadProps {
  onDigit: (digit: string) => void
  onDecimal: () => void
  onBackspace: () => void
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

/**
 * A custom pad rather than an <input type="number">.
 *
 * The iOS system keyboard animates in over ~300ms and eats half the screen,
 * which is most of the time budget for an expense entered while standing at a
 * till. This is on screen the instant the sheet opens, and its keys are far
 * larger than the system pad's.
 */
export const Keypad = memo(function Keypad({
  onDigit,
  onDecimal,
  onBackspace,
}: KeypadProps) {
  return (
    <div className="grid grid-cols-3 gap-px bg-transparent select-none">
      {KEYS.map((key) => (
        <Key key={key} onPress={() => onDigit(key)} label={key} />
      ))}
      <Key onPress={onDecimal} label="." />
      <Key onPress={() => onDigit('0')} label="0" />
      <Key onPress={onBackspace} label={<BackspaceIcon />} ariaLabel="Delete" />
    </div>
  )
})

function Key({
  label,
  onPress,
  ariaLabel,
}: {
  label: React.ReactNode
  onPress: () => void
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      // onPointerDown, not onClick: fires on touch-down instead of waiting for
      // release, which makes rapid entry feel mechanical rather than laggy.
      onPointerDown={(e) => {
        e.preventDefault()
        onPress()
      }}
      className={[
        'flex h-[58px] items-center justify-center rounded-2xl',
        'text-[26px] font-light tnum text-text',
        'transition-colors duration-75',
        'active:bg-surface-3',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function BackspaceIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7 6-7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="m12 10 4 4m0-4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
