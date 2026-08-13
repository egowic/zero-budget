/**
 * Money is stored everywhere as an integer number of minor units (kuruş).
 * Floats are never used for amounts — 0.1 + 0.2 problems in a budget app
 * surface as balances that are off by a kuruş and never reconcile.
 */

export type Minor = number

export const MINOR_PER_MAJOR = 100

export function toMinor(major: number): Minor {
  return Math.round(major * MINOR_PER_MAJOR)
}

export function toMajor(minor: Minor): number {
  return minor / MINOR_PER_MAJOR
}

/**
 * Parses free-form input into minor units. Group separators are stripped and
 * both '.' and ',' are accepted as the decimal mark, so a value pasted or
 * typed in either convention lands on the same number.
 */
export function parseAmount(input: string): Minor {
  const cleaned = input.replace(/[\s,]/g, '')
  if (cleaned === '' || cleaned === '.') return 0
  const value = Number(cleaned)
  return Number.isFinite(value) ? toMinor(value) : 0
}

const wholeFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
})

const preciseFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * Formats an amount for display. Kuruş are dropped unless the value actually
 * has them — "7.078" reads better than "7.078,00" on a summary screen, but
 * a 12,50 coffee should not silently become 13.
 */
export function formatAmount(minor: Minor, opts: { forceDecimals?: boolean } = {}): string {
  const abs = Math.abs(minor)
  const hasKurus = abs % MINOR_PER_MAJOR !== 0
  const formatter = opts.forceDecimals || hasKurus ? preciseFormatter : wholeFormatter
  return formatter.format(toMajor(abs))
}

/** Formats with the currency symbol, e.g. "₺7.078" or "-₺400". */
export function formatMoney(
  minor: Minor,
  opts: { signed?: boolean; forceDecimals?: boolean } = {},
): string {
  const sign = minor < 0 ? '-' : opts.signed && minor > 0 ? '+' : ''
  return `${sign}₺${formatAmount(minor, opts)}`
}

/** Compact form for dense rows: 12,5B / 1,2M. */
export function formatCompact(minor: Minor): string {
  const major = Math.abs(toMajor(minor))
  if (major >= 1_000_000) return `₺${(major / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (major >= 10_000) return `₺${(major / 1000).toFixed(1).replace('.', ',')}B`
  return `₺${wholeFormatter.format(major)}`
}
