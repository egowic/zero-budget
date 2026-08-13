interface ProgressBarProps {
  /** 0–100; values above 100 render as a full bar with an overflow tint. */
  percent: number
  color: string
  /** Where an even, on-pace burn would sit right now — drawn as a tick. */
  paceMarker?: number
  height?: number
}

export function ProgressBar({ percent, color, paceMarker, height = 6 }: ProgressBarProps) {
  const filled = Math.min(100, Math.max(0, percent))
  const overflowed = percent > 100

  return (
    <div
      className="relative w-full overflow-hidden rounded-full bg-surface-3"
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{
          width: `${filled}%`,
          background: color,
          // A hard-edged stripe reads as "past the limit" without needing a label
          backgroundImage: overflowed
            ? 'repeating-linear-gradient(115deg, rgba(0,0,0,0.22) 0 4px, transparent 4px 9px)'
            : undefined,
        }}
      />
      {paceMarker !== undefined && paceMarker > 1 && paceMarker < 99 && (
        <div
          className="absolute top-0 h-full w-px bg-white/35"
          style={{ left: `${paceMarker}%` }}
          aria-hidden
        />
      )}
    </div>
  )
}
