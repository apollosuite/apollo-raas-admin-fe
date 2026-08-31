import type { MaybeRefOrGetter } from 'vue'

import { computed, ref, toValue } from 'vue'

import type { ColumnFilter } from './types'

/**
 * Convert a raw cell value into a searchable string so a text "contains" filter
 * works uniformly across strings, numbers, booleans, arrays and objects.
 */
export function cellText(row: unknown, key: string): string {
  const v = (row as Record<string, unknown>)[key]
  if (v === null || v === undefined)
    return ''
  if (Array.isArray(v))
    return v.map(item => (typeof item === 'object' ? JSON.stringify(item) : String(item))).join(' ')
  if (typeof v === 'object')
    return JSON.stringify(v)
  return String(v)
}

/**
 * Apply a list of `ColumnFilter`s to `rows`. Every non-empty filter narrows the
 * result by a case-insensitive substring match on that column's cell text.
 */
export function applyColumnFilters<T>(rows: T[], filters: ColumnFilter[]): T[] {
  let result = rows
  for (const f of filters) {
    const needle = f.value.trim().toLowerCase()
    if (!needle)
      continue
    result = result.filter(row => cellText(row, f.key).toLowerCase().includes(needle))
  }
  return result
}

/**
 * Reactive column-filter state for one table. Returns a writable `filters` ref
 * (for the filter bar's `v-model`) and a `filtered` computed (for `v-for`).
 */
export function useColumnFilters<T>(source: MaybeRefOrGetter<T[]>) {
  const filters = ref<ColumnFilter[]>([])
  const filtered = computed(() => applyColumnFilters(toValue(source), filters.value))
  return { filters, filtered }
}
