import type { MaybeRefOrGetter } from 'vue'

import { computed, ref, toValue, watch } from 'vue'

import type { ColumnFilter, ColumnSpec } from './types'

import { isActiveFilter, matchFilter, operatorsFor } from './filter-predicates'

/**
 * Apply a list of `ColumnFilter`s to `rows`. Conditions on different columns are
 * ANDed; a multi-select enum condition is ORed inside itself, which is what
 * "is any of" reads as.
 */
export function applyColumnFilters<T>(rows: T[], filters: ColumnFilter[], specs: readonly ColumnSpec[]): T[] {
  const active = filters.filter(isActiveFilter)
  if (active.length === 0)
    return rows
  const byKey = new Map(specs.map(spec => [spec[0], spec]))
  return rows.filter((row) => {
    const record = row as unknown as Record<string, any>
    return active.every((filter) => {
      const spec = byKey.get(filter.key)
      // A filter whose column no longer exists (e.g. a table that swapped specs)
      // must not empty the table.
      return spec ? matchFilter(record, spec, filter) : true
    })
  })
}

/**
 * Reactive column-filter state for one table. Returns a writable `filters` ref
 * (for the toolbar's `v-model`) and a `filtered` computed (for `v-for`).
 *
 * `specs` may be reactive: some tables swap their column set by route (the schedule
 * table shows optimisation columns on an optimisation action and creation columns on
 * a launch action). A filter whose column is no longer present is dropped, because it
 * would otherwise keep narrowing the rows while the toolbar can only render it as a
 * bare column key.
 */
export function useColumnFilters<T>(
  source: MaybeRefOrGetter<T[]>,
  specs: MaybeRefOrGetter<readonly ColumnSpec[]>,
) {
  const filters = ref<ColumnFilter[]>([])
  watch(() => toValue(specs), (current) => {
    const keys = new Set(current.map(spec => spec[0]))
    const kept = filters.value.filter(filter => keys.has(filter.key))
    if (kept.length !== filters.value.length)
      filters.value = kept
  })
  const filtered = computed(() => applyColumnFilters(toValue(source), filters.value, toValue(specs)))
  return { filters, filtered }
}

export { operatorsFor }
