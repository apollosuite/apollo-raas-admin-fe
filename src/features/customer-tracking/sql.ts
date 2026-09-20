import type { DateRange } from './filter-context'

export interface ScopeFilter {
  org_id?: string
  amazon_profile_id?: string
  action?: string
  tool_id?: string
}

/** SQL single-quote escaping. */
export function quote(value: string): string {
  return `'${value.replace(/'/g, '\'\'')}'`
}

export function datePredicate(range: DateRange, column = 'event_date'): string {
  return `${column} BETWEEN ${quote(range.from)} AND ${quote(range.to)}`
}

export function scopePredicates(scope: ScopeFilter = {}): string[] {
  const preds: string[] = []
  if (scope.org_id)
    preds.push(`org_id = ${quote(scope.org_id)}`)
  if (scope.amazon_profile_id)
    preds.push(`amazon_profile_id = ${quote(scope.amazon_profile_id)}`)
  if (scope.action)
    preds.push(`action = ${quote(scope.action)}`)
  if (scope.tool_id)
    preds.push(`tool_id = ${quote(scope.tool_id)}`)
  return preds
}

export function buildWhere(
  range: DateRange,
  options: { scope?: ScopeFilter, extra?: string[], dateColumn?: string } = {},
): string {
  const preds = [
    datePredicate(range, options.dateColumn ?? 'event_date'),
    ...scopePredicates(options.scope),
    ...(options.extra ?? []),
  ].filter(Boolean)
  return preds.length ? `WHERE ${preds.join(' AND ')}` : ''
}
