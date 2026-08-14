/**
 * Dates are stored as plain 'YYYY-MM-DD' local calendar days, never as
 * timestamps. A budget that runs "27 July → 26 August" means those calendar
 * days in the user's own timezone; storing UTC instants would shift the
 * boundary for anyone east of Greenwich and silently move spending between
 * periods.
 */

export type IsoDate = string // 'YYYY-MM-DD'

const pad = (n: number) => String(n).padStart(2, '0')

export function toIso(date: Date): IsoDate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Parses an IsoDate into a Date at *local* midnight. */
export function fromIso(iso: IsoDate): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function today(): IsoDate {
  return toIso(new Date())
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const date = fromIso(iso)
  date.setDate(date.getDate() + days)
  return toIso(date)
}

export function addMonths(iso: IsoDate, months: number): IsoDate {
  const date = fromIso(iso)
  const targetDay = date.getDate()
  date.setDate(1)
  date.setMonth(date.getMonth() + months)
  // Clamp to the last day of the target month: 31 Jan + 1 month → 28/29 Feb
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  date.setDate(Math.min(targetDay, lastDay))
  return toIso(date)
}

/** Inclusive day count: daysBetween('2026-08-01', '2026-08-01') === 1 */
export function daysBetween(start: IsoDate, end: IsoDate): number {
  const ms = fromIso(end).getTime() - fromIso(start).getTime()
  return Math.round(ms / 86_400_000) + 1
}

export function isWithin(iso: IsoDate, start: IsoDate, end: IsoDate): boolean {
  return iso >= start && iso <= end
}

export function clamp(iso: IsoDate, start: IsoDate, end: IsoDate): IsoDate {
  if (iso < start) return start
  if (iso > end) return end
  return iso
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** "August 12" — year appended only when it is not the current year. */
export function formatDate(iso: IsoDate, opts: { withYear?: boolean } = {}): string {
  const date = fromIso(iso)
  const showYear = opts.withYear ?? date.getFullYear() !== new Date().getFullYear()
  const base = `${MONTHS[date.getMonth()]} ${date.getDate()}`
  return showYear ? `${base}, ${date.getFullYear()}` : base
}

/** Day header for the timeline: "Today" / "Yesterday" / "Saturday, August 9". */
export function formatDayHeader(iso: IsoDate): string {
  const now = today()
  if (iso === now) return 'Today'
  if (iso === addDays(now, -1)) return 'Yesterday'
  const date = fromIso(iso)
  const within7 = daysBetween(iso, now) <= 7 && iso < now
  if (within7) return `${DAYS[date.getDay()]}, ${formatDate(iso)}`
  return formatDate(iso)
}

/** First and last calendar day of the month containing `iso`. */
export function monthBounds(iso: IsoDate): { start: IsoDate; end: IsoDate } {
  const date = fromIso(iso)
  return {
    start: toIso(new Date(date.getFullYear(), date.getMonth(), 1)),
    end: toIso(new Date(date.getFullYear(), date.getMonth() + 1, 0)),
  }
}

/** "August 2026" */
export function formatMonth(iso: IsoDate): string {
  const date = fromIso(iso)
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

/** True when both dates fall in the same calendar month and year. */
export function isSameMonth(a: IsoDate, b: IsoDate): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}

/** "Jul 27 – Aug 26" for compact budget ranges. */
export function formatRange(start: IsoDate, end: IsoDate): string {
  const s = fromIso(start)
  const e = fromIso(end)
  const short = (d: Date) => `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`
  const yearSuffix =
    e.getFullYear() !== new Date().getFullYear() ? `, ${e.getFullYear()}` : ''
  return `${short(s)} – ${short(e)}${yearSuffix}`
}
