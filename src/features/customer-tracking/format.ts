/**
 * Metric number formatting for the dense customer-tracking tables.
 *
 * Two representations exist on purpose, and they are not interchangeable:
 *
 * - `formatMetric` is for **display**. Values below 1,000 stay exact (there is no
 *   information to save by writing `0.9K` for 883); at and above 1,000 the value
 *   compacts to K / M / B so a column of numbers can be compared at a glance.
 * - `formatExact` is for **tooltips, filters and detail views**, where the precise
 *   amount must survive. Filter keys must never be compacted: two distinct amounts
 *   can round to the same string and would collapse into one filter option.
 *
 * See the format table in the component preview for the full ladder.
 */

/** Rendered in place of a missing measurement. Never a zero. */
export const EMPTY_METRIC = '—'

export interface MetricFormatOptions {
  /** Prefix with `$`. The unit is not repeated in the column header. */
  currency?: boolean
}

const COMPACT_FROM = 1_000
const UNITS = [
  { suffix: 'K', scale: 1_000 },
  { suffix: 'M', scale: 1_000_000 },
  { suffix: 'B', scale: 1_000_000_000 },
] as const

type UnitSuffix = '' | (typeof UNITS)[number]['suffix']

function finite(value: unknown): number | null {
  // An absent measurement is not a zero: `null` must render as `—`, not `0`.
  if (value === null || value === undefined || value === '')
    return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** `259.6` stays `259.6`; `3.0` collapses to `3`. */
function trim(value: number, digits: number): string {
  return value.toFixed(digits).replace(/\.0+$/, '')
}

/**
 * Pick the unit for a magnitude, stepping up when rounding would print `1000K`.
 * `999_999` rounds to `1000.0K` on one decimal, so it must read as `1M`.
 */
function unitFor(abs: number): UnitSuffix {
  if (abs < COMPACT_FROM)
    return ''
  for (const unit of UNITS) {
    if (abs < unit.scale * COMPACT_FROM)
      return Number((abs / unit.scale).toFixed(1)) >= COMPACT_FROM ? nextUnit(unit.suffix) : unit.suffix
  }
  return 'B'
}

function nextUnit(suffix: UnitSuffix): UnitSuffix {
  const index = UNITS.findIndex(u => u.suffix === suffix)
  return index === -1 || index === UNITS.length - 1 ? 'B' : UNITS[index + 1].suffix
}

/** Compact, scan-friendly value: exact under 1,000, then K / M / B. */
export function formatMetric(value: unknown, options: MetricFormatOptions = {}): string {
  const n = finite(value)
  if (n === null)
    return EMPTY_METRIC
  const sign = n < 0 ? '-' : ''
  const prefix = options.currency ? '$' : ''
  const abs = Math.abs(n)
  const unit = unitFor(abs)
  if (unit === '')
    return `${sign}${prefix}${abs.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
  return `${sign}${prefix}${trim(abs / UNITS.find(u => u.suffix === unit)!.scale, 1)}${unit}`
}

/** Full-precision value for tooltips, filters and detail rows. */
export function formatExact(value: unknown, options: MetricFormatOptions = {}): string {
  const n = finite(value)
  if (n === null)
    return EMPTY_METRIC
  const sign = n < 0 ? '-' : ''
  const prefix = options.currency ? '$' : ''
  return `${sign}${prefix}${Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: options.currency ? 2 : 0,
    maximumFractionDigits: 2,
  })}`
}

/** Share of a total as a percentage. `—` when the total cannot support a ratio. */
export function formatShare(part: number, total: number): string {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0)
    return EMPTY_METRIC
  return `${(part / total * 100).toFixed(1)}%`
}
