import type { ColumnFilter, ColumnSpec, ColumnType, FilterOperator } from './types'

import { connectionLabel, dateValue, isBlank, needles, splitSeries, tupleMetric } from './values'

/**
 * A predicate registry: each column type offers the operators that actually make
 * sense for its data, and one matcher applies them.
 *
 * The previous implementation ran a case-insensitive substring match on the raw
 * cell value for every column, which meant a number had to be typed in full and
 * unformatted to be found (`259.6` did not match `$259.6K`) and a date could only
 * be searched as a prefix of its ISO string.
 */

export interface OperatorDef {
  value: FilterOperator
  label: string
}

const TEXT_OPS: OperatorDef[] = [
  { value: 'contains', label: 'contains' },
  { value: 'notContains', label: 'does not contain' },
  { value: 'equals', label: 'equals' },
  { value: 'notEquals', label: 'does not equal' },
  { value: 'startsWith', label: 'starts with' },
  { value: 'endsWith', label: 'ends with' },
]

const NUMBER_OPS: OperatorDef[] = [
  { value: 'eq', label: '=' },
  { value: 'neq', label: '≠' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
  { value: 'between', label: 'between' },
  { value: 'notBetween', label: 'not between' },
]

const DATE_OPS: OperatorDef[] = [
  { value: 'on', label: 'on' },
  { value: 'before', label: 'before' },
  { value: 'after', label: 'after' },
  { value: 'between', label: 'between' },
]

const ENUM_OPS: OperatorDef[] = [
  { value: 'isAnyOf', label: 'is any of' },
  { value: 'isNoneOf', label: 'is none of' },
]

const BOOLEAN_OPS: OperatorDef[] = [
  { value: 'isTrue', label: 'is On' },
  { value: 'isFalse', label: 'is Off' },
]

const LIST_OPS: OperatorDef[] = [
  { value: 'containsAny', label: 'contains any of' },
  { value: 'containsAll', label: 'contains all of' },
]

const EMPTY_OPS: OperatorDef[] = [
  { value: 'isEmpty', label: 'is empty' },
  { value: 'isNotEmpty', label: 'is not empty' },
]

const OPERATORS: Record<ColumnType, OperatorDef[]> = {
  text: [...TEXT_OPS, ...EMPTY_OPS],
  enum: [...ENUM_OPS, ...TEXT_OPS, ...EMPTY_OPS],
  connection: [...ENUM_OPS, ...EMPTY_OPS],
  boolean: BOOLEAN_OPS,
  number: [...NUMBER_OPS, ...EMPTY_OPS],
  currency: [...NUMBER_OPS, ...EMPTY_OPS],
  percent: [...NUMBER_OPS, ...EMPTY_OPS],
  date: [...DATE_OPS, ...EMPTY_OPS],
  timestamp: [...DATE_OPS, ...EMPTY_OPS],
  split: [...NUMBER_OPS, ...EMPTY_OPS],
  ratioTuple: [...NUMBER_OPS, ...EMPTY_OPS],
  list: [...LIST_OPS, ...EMPTY_OPS],
}

export function operatorsFor(type: ColumnType): OperatorDef[] {
  return OPERATORS[type] ?? OPERATORS.text
}

export function operatorLabel(type: ColumnType, op: FilterOperator): string {
  return operatorsFor(type).find(o => o.value === op)?.label ?? op
}

/** Operators whose editor needs a second input box. */
export function takesSecondValue(op: FilterOperator): boolean {
  return op === 'between' || op === 'notBetween'
}

/** The kind of editor a value needs. */
export function valueEditorFor(type: ColumnType, op: FilterOperator): 'text' | 'number' | 'date' | 'none' | 'list' {
  if (op === 'isEmpty' || op === 'isNotEmpty' || op === 'isTrue' || op === 'isFalse')
    return 'none'
  if (type === 'date' || type === 'timestamp')
    return 'date'
  if (type === 'number' || type === 'currency' || type === 'percent' || type === 'split' || type === 'ratioTuple')
    return 'number'
  if (type === 'list')
    return 'list'
  return 'text'
}

/** `split` / `ratioTuple` columns let the user pick which metric to compare. */
export function metricOptionsFor(type: ColumnType): { value: string, label: string }[] {
  if (type === 'split') {
    return [
      { value: 'total', label: 'total' },
      { value: 'sp', label: 'SP' },
      { value: 'sb', label: 'SB' },
      { value: 'sd', label: 'SD' },
    ]
  }
  if (type === 'ratioTuple') {
    return [
      { value: 'total', label: 'total' },
      { value: 'enabled', label: 'connected' },
      { value: 'coverage', label: 'connect %' },
    ]
  }
  return []
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

function textMatch(value: string, op: FilterOperator, values: string[]): boolean {
  const v = value.toLowerCase()
  const needle = (values[0] ?? '').trim().toLowerCase()
  switch (op) {
    case 'contains': return v.includes(needle)
    case 'notContains': return !v.includes(needle)
    case 'equals': return v === needle
    case 'notEquals': return v !== needle
    case 'startsWith': return v.startsWith(needle)
    case 'endsWith': return v.endsWith(needle)
    default: return true
  }
}

/** A blank bound is an open end, so "≥ 1000" can be expressed in a between box. */
function bounds(values: string[]): [number, number] {
  const lower = values[0] === '' || values[0] === undefined ? Number.NEGATIVE_INFINITY : Number(values[0])
  const upper = values[1] === '' || values[1] === undefined ? Number.POSITIVE_INFINITY : Number(values[1])
  const lo = Number.isNaN(lower) ? Number.NEGATIVE_INFINITY : lower
  const hi = Number.isNaN(upper) ? Number.POSITIVE_INFINITY : upper
  return lo <= hi ? [lo, hi] : [hi, lo]
}

function numberMatch(n: number, op: FilterOperator, values: string[]): boolean {
  if (!Number.isFinite(n))
    return false
  const one = Number(values[0])
  switch (op) {
    case 'eq': return n === one
    case 'neq': return n !== one
    case 'gt': return n > one
    case 'gte': return n >= one
    case 'lt': return n < one
    case 'lte': return n <= one
    case 'between': {
      const [lo, hi] = bounds(values)
      return n >= lo && n <= hi
    }
    case 'notBetween': {
      const [lo, hi] = bounds(values)
      return n < lo || n > hi
    }
    default: return true
  }
}

function dateMatch(value: string, op: FilterOperator, values: string[]): boolean {
  if (!value)
    return false
  const one = values[0] ?? ''
  switch (op) {
    case 'on': return value === one
    // ISO day strings compare correctly as strings, so no Date parsing is needed.
    case 'before': return value < one
    case 'after': return value > one
    case 'between': {
      const [lo, hi] = bounds(values)
      return value >= String(lo) && value <= String(hi)
    }
    default: return true
  }
}

function setMatch(value: string, op: FilterOperator, values: string[]): boolean {
  const has = values.includes(value)
  if (op === 'isAnyOf')
    return has
  if (op === 'isNoneOf')
    return !has
  return textMatch(value, op, values)
}

function listMatch(value: unknown, op: FilterOperator, values: string[]): boolean {
  const items = (Array.isArray(value) ? value : [value]).map(v => String(v ?? '').toLowerCase())
  const wanted = needles(values)
  if (wanted.length === 0)
    return true
  if (op === 'containsAll')
    return wanted.every(w => items.some(i => i.includes(w)))
  if (op === 'containsAny')
    return wanted.some(w => items.some(i => i.includes(w)))
  return true
}

/** Evaluate one condition against one row. */
export function matchFilter(row: Record<string, any>, spec: ColumnSpec, filter: ColumnFilter): boolean {
  const [key, , type] = spec
  const raw = row[key]
  const op = filter.operator

  if (op === 'isEmpty')
    return isBlank(raw)
  if (op === 'isNotEmpty')
    return !isBlank(raw)

  switch (type) {
    case 'text':
      return textMatch(String(raw ?? ''), op, filter.values)
    case 'enum':
      return setMatch(String(raw ?? ''), op, filter.values)
    case 'connection':
      return setMatch(connectionLabel(raw), op, filter.values)
    case 'boolean':
      return op === 'isTrue' ? !!raw : !raw
    case 'number':
    case 'currency':
    case 'percent':
      return numberMatch(Number(raw), op, filter.values)
    case 'date':
    case 'timestamp':
      return dateMatch(dateValue(raw), op, filter.values)
    case 'split':
      return numberMatch(splitSeries(raw, (filter.series ?? 'total') as any), op, filter.values)
    case 'ratioTuple':
      return numberMatch(tupleMetric(raw, (filter.metric ?? 'total') as any), op, filter.values)
    case 'list':
      return listMatch(raw, op, filter.values)
    default:
      return String(raw ?? '').toLowerCase().includes((filter.values[0] ?? '').toLowerCase())
  }
}

/**
 * A filter is "active" once it can actually narrow something. An operator with a
 * required-but-empty value is still being edited, so it must not filter yet —
 * otherwise the table goes blank while the user is mid-keystroke.
 */
export function isActiveFilter(filter: ColumnFilter): boolean {
  if (filter.operator === 'isEmpty' || filter.operator === 'isNotEmpty' || filter.operator === 'isTrue' || filter.operator === 'isFalse')
    return true
  if (filter.operator === 'between' || filter.operator === 'notBetween')
    return filter.values.some(v => String(v ?? '').trim() !== '')
  return String(filter.values[0] ?? '').trim() !== ''
}

/** Distinct values for an enum column, taken from the unfiltered rows. */
export function distinctValues(rows: any[], key: string): string[] {
  const seen = new Set<string>()
  for (const row of rows) {
    const v = row?.[key]
    if (isBlank(v))
      continue
    seen.add(String(v))
  }
  return [...seen].sort((a, b) => a.localeCompare(b))
}
