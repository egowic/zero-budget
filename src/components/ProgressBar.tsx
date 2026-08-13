interface ProgressBarProps {
  /** 0–100; values above 100 render as a full bar with an overflow tint. */
  percent: number
  color: string
  /** Where an even, on-pace burn would sit right now — drawn as a tick. */
  paceMarker?: number
  /** Optional label shown in its own lane above the pace marker. */
  paceLabel?: string
  /** Fixed label rendered inside the track, independently of the fill width. */
  valueLabel?: string
  height?: number
}

export function ProgressBar({
  percent,
  color,
  paceMarker,
  paceLabel,
  valueLabel,
  height = 6,
}: ProgressBarProps) {
  const filled = Math.min(100, Math.max(0, percent))
  const overflowed = percent > 100
  const marker = paceMarker === undefined ? undefined : Math.min(100, Math.max(0, paceMarker))

  return (
    <div className="w-full">
      {paceLabel && marker !== undefined && (
        <div className="relative mb-1 h-[13px]" aria-hidden>
          <span
            className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[9.5px] leading-[13px] font-medium text-faint"
            style={{ left: `clamp(20px, ${marker}%, calc(100% - 20px))` }}
          >
            {paceLabel}
          </span>
        </div>
      )}

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
        {valueLabel && (
          <>
            <span className="pointer-events-none absolute inset-y-0 left-2 z-10 flex items-center whitespace-nowrap text-[10px] leading-none font-semibold text-muted">
              {valueLabel}
            </span>
            <div
              className="pointer-events-none absolute inset-y-0 left-0 z-20 overflow-hidden rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${filled}%` }}
              aria-hidden
            >
              <span className="absolute inset-y-0 left-2 flex items-center whitespace-nowrap text-[10px] leading-none font-semibold text-black/75">
                {valueLabel}
              </span>
            </div>
          </>
        )}
        {marker !== undefined && (paceLabel || (marker > 1 && marker < 99)) && (
          <div
            className="absolute top-0 z-30 h-full w-px bg-white/35"
            style={{ left: `clamp(1px, ${marker}%, calc(100% - 1px))` }}
            aria-hidden
          />
        )}
      </div>
    </div>
  )
}
