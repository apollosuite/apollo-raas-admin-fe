import type { Split } from './types'

/**
 * Value-shape helpers shared by the column renderer and the filter engine.
 *
 * Kept pure and free of component imports on purpose: filtering and sorting are
 * the parts worth unit-testing, and they should not need a DOM to do it.
 */

/** `null`, `undefined` and `''` all mean "no measurement" in these datasets. */
export function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === ''
}

/** `{ sp, sb, sd }` → the total, which is what a split column sorts and filters on. */
export function splitTotal(v: Partial<Split> | null | undefined): number {
  return Number(v?.sp ?? 0) + Number(v?.sb ?? 0) + Number(v?.sd ?? 0)
}

/** One series of a split, or the total. */
export function splitSeries(v: Partial<Split> | null | undefined, series: 'total' | 'sp' | 'sb' | 'sd' = 'total'): number {
  if (series === 'total')
    return splitTotal(v)
  return Number(v?.[series] ?? 0)
}

export type TupleMetric = 'total' | 'enabled' | 'coverage'

/** `[enabled, total]` → whichever metric the user chose to compare. */
export function tupleMetric(v: unknown, metric: TupleMetric = 'total'): number {
  if (!Array.isArray(v))
    return 0
  const enabled = Number(v[0]) || 0
  const total = Number(v[1]) || 0
  if (metric === 'enabled')
    return enabled
  if (metric === 'coverage')
    return total ? enabled / total * 100 : 0
  return total
}

/** True/false or already-a-label → the label shown in the cell. */
export function connectionLabel(v: unknown): string {
  if (typeof v === 'boolean')
    return v ? 'Connected' : 'Disconnected'
  return String(v)
}

/** ISO day text for a Date or an ISO date/timestamp string. */
export function dateValue(v: unknown): string {
  if (isBlank(v))
    return ''
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)
}

/**
 * Normalises a value for sorting: blanks become `undefined` so the built-in
 * `sortUndefined: 'last'` can place them last in both directions. TanStack
 * returns early for undefined BEFORE applying the desc negation, which is what
 * makes "last" mean last rather than "first when descending".
 */
export function sortValue(v: unknown): unknown {
  return isBlank(v) ? undefined : v
}

/** Splits a comma-separated list-filter input into normalised needles. */
export function needles(values: string[]): string[] {
  return values
    .flatMap(v => String(v).split(','))
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
}
