import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'

import type { ColumnSpec } from '../types'

import { applyColumnFilters, useColumnFilters } from '../use-column-filter'

const spec = (key: string): ColumnSpec => [key, key, 'text']
const row = (name: string) => ({ name })

describe('applyColumnFilters', () => {
  it('ignores a filter whose column no longer exists', () => {
    const rows = [row('a'), row('b')]
    const filters = [{ key: 'gone', operator: 'contains' as const, values: ['zzz'] }]
    expect(applyColumnFilters(rows, filters, [spec('name')])).toHaveLength(2)
  })
})

describe('useColumnFilters with a changing column set', () => {
  it('drops filters for columns the table no longer shows', async () => {
    const specs = ref<readonly ColumnSpec[]>([spec('name'), spec('bidsOptimized')])
    const { filters, filtered } = useColumnFilters([row('a'), row('b')], specs)
    filters.value = [{ key: 'bidsOptimized', operator: 'gt', values: ['0'] }]
    await nextTick()
    expect(filtered.value).toHaveLength(2)

    // Switching to a launch action removes the optimisation column entirely.
    specs.value = [spec('name'), spec('launched')]
    await nextTick()
    await nextTick()
    expect(filters.value).toEqual([])
    expect(filtered.value).toHaveLength(2)
  })

  it('keeps a filter whose column survives the swap', async () => {
    const specs = ref<readonly ColumnSpec[]>([spec('name'), spec('bidsOptimized')])
    const { filters } = useColumnFilters([row('a')], specs)
    filters.value = [{ key: 'name', operator: 'contains', values: ['a'] }]
    specs.value = [spec('name'), spec('launched')]
    await nextTick()
    await nextTick()
    expect(filters.value.map(f => f.key)).toEqual(['name'])
  })
})
