import { describe, expect, it } from 'vitest'

import type { ColumnFilter, ColumnSpec } from '../types'

import {
  distinctValues,
  isActiveFilter,
  matchFilter,
  MAX_OPTION_VALUES,
  metricOptionsFor,
  operatorsFor,
  supportsValueOptions,
  takesSecondValue,
  valueEditorFor,
} from '../filter-predicates'

/** `[key, label, type]`; the type is what decides the predicate set. */
const spec = (type: ColumnSpec[2], key = 'v'): ColumnSpec => [key, key, type]

const row = (v: unknown) => ({ v })

function matches(value: unknown, type: ColumnSpec[2], filter: Partial<ColumnFilter>): boolean {
  return matchFilter(row(value), spec(type), { key: 'v', operator: 'contains', values: [], ...filter })
}

describe('text predicates', () => {
  it('matches case-insensitively', () => {
    expect(matches('Anotion Labs', 'text', { operator: 'contains', values: ['anotion'] })).toBe(true)
    expect(matches('Anotion Labs', 'text', { operator: 'notContains', values: ['anotion'] })).toBe(false)
  })

  it('supports equality and prefix/suffix', () => {
    expect(matches('Healthy', 'text', { operator: 'equals', values: ['healthy'] })).toBe(true)
    expect(matches('Healthy', 'text', { operator: 'notEquals', values: ['healthy'] })).toBe(false)
    expect(matches('Healthy', 'text', { operator: 'startsWith', values: ['heal'] })).toBe(true)
    expect(matches('Healthy', 'text', { operator: 'endsWith', values: ['thy'] })).toBe(true)
  })
})

describe('numeric predicates', () => {
  it('compares against the underlying number, not the displayed text', () => {
    // The cell renders $259.6K; a filter must still be able to ask for > 200000.
    expect(matches(259_569.18, 'currency', { operator: 'gt', values: ['200000'] })).toBe(true)
    expect(matches(259_569.18, 'currency', { operator: 'gt', values: ['300000'] })).toBe(false)
  })

  it('supports the full comparison set', () => {
    expect(matches(10, 'number', { operator: 'eq', values: ['10'] })).toBe(true)
    expect(matches(10, 'number', { operator: 'neq', values: ['10'] })).toBe(false)
    expect(matches(10, 'number', { operator: 'gte', values: ['10'] })).toBe(true)
    expect(matches(10, 'number', { operator: 'lte', values: ['10'] })).toBe(true)
    expect(matches(10, 'number', { operator: 'lt', values: ['10'] })).toBe(false)
  })

  it('treats between as inclusive and swaps reversed bounds', () => {
    expect(matches(5, 'number', { operator: 'between', values: ['1', '10'] })).toBe(true)
    expect(matches(10, 'number', { operator: 'between', values: ['1', '10'] })).toBe(true)
    expect(matches(11, 'number', { operator: 'between', values: ['1', '10'] })).toBe(false)
    expect(matches(5, 'number', { operator: 'between', values: ['10', '1'] })).toBe(true)
  })

  it('treats a blank bound as open-ended, so a between box can express >= x', () => {
    expect(matches(1_000, 'number', { operator: 'between', values: ['1000', ''] })).toBe(true)
    expect(matches(999, 'number', { operator: 'between', values: ['1000', ''] })).toBe(false)
    expect(matches(5, 'number', { operator: 'between', values: ['', '10'] })).toBe(true)
  })

  it('never matches a non-numeric value on a comparison', () => {
    expect(matches(null, 'number', { operator: 'gt', values: ['0'] })).toBe(false)
    expect(matches(undefined, 'number', { operator: 'lt', values: ['1'] })).toBe(false)
  })
})

describe('date predicates', () => {
  it('compares ISO days', () => {
    expect(matches('2026-03-01', 'date', { operator: 'on', values: ['2026-03-01'] })).toBe(true)
    expect(matches('2026-03-01', 'date', { operator: 'after', values: ['2026-02-01'] })).toBe(true)
    expect(matches('2026-03-01', 'date', { operator: 'before', values: ['2026-02-01'] })).toBe(false)
    expect(matches('2026-03-01', 'date', { operator: 'between', values: ['2026-01-01', '2026-12-31'] })).toBe(true)
  })

  it('cuts a timestamp to its day', () => {
    expect(matches('2026-09-03 18:49:50.423384+00', 'timestamp', { operator: 'on', values: ['2026-09-03'] })).toBe(true)
  })
})

describe('categorical predicates', () => {
  it('oRs the selection for is any of and excludes it for is none of', () => {
    expect(matches('At Risk', 'enum', { operator: 'isAnyOf', values: ['Healthy', 'At Risk'] })).toBe(true)
    expect(matches('Churned', 'enum', { operator: 'isAnyOf', values: ['Healthy', 'At Risk'] })).toBe(false)
    expect(matches('Churned', 'enum', { operator: 'isNoneOf', values: ['Healthy', 'At Risk'] })).toBe(true)
  })

  it('normalises a boolean connection', () => {
    expect(matches(true, 'connection', { operator: 'isAnyOf', values: ['Connected'] })).toBe(true)
    expect(matches(false, 'connection', { operator: 'isAnyOf', values: ['Connected'] })).toBe(false)
    expect(matches('Disconnected', 'connection', { operator: 'isAnyOf', values: ['Connected'] })).toBe(false)
  })

  it('matches booleans', () => {
    expect(matches(true, 'boolean', { operator: 'isTrue', values: [] })).toBe(true)
    expect(matches(false, 'boolean', { operator: 'isFalse', values: [] })).toBe(true)
  })
})

describe('composite predicates', () => {
  it('filters a split by its total or by one series', () => {
    const value = { sp: 100, sb: 50, sd: 1 }
    expect(matches(value, 'split', { operator: 'eq', values: ['151'] })).toBe(true)
    expect(matches(value, 'split', { operator: 'eq', values: ['100'], series: 'sp' })).toBe(true)
    expect(matches(value, 'split', { operator: 'gt', values: ['200'], series: 'sb' })).toBe(false)
  })

  it('filters a ratioTuple by total, enabled or coverage', () => {
    const value = [3, 5]
    expect(matches(value, 'ratioTuple', { operator: 'eq', values: ['5'], metric: 'total' })).toBe(true)
    expect(matches(value, 'ratioTuple', { operator: 'eq', values: ['3'], metric: 'enabled' })).toBe(true)
    expect(matches(value, 'ratioTuple', { operator: 'lt', values: ['70'], metric: 'coverage' })).toBe(true)
    expect(matches(value, 'ratioTuple', { operator: 'lt', values: ['50'], metric: 'coverage' })).toBe(false)
  })

  it('filters a list by any/all of a comma-separated input', () => {
    const value = ['Bid Optimization', 'Budget Optimization']
    expect(matches(value, 'list', { operator: 'containsAny', values: ['bid, placement'] })).toBe(true)
    expect(matches(value, 'list', { operator: 'containsAll', values: ['bid, budget'] })).toBe(true)
    expect(matches(value, 'list', { operator: 'containsAll', values: ['bid, placement'] })).toBe(false)
  })
})

describe('emptiness', () => {
  it('treats null, undefined and empty string as empty', () => {
    for (const v of [null, undefined, '']) {
      expect(matches(v, 'text', { operator: 'isEmpty', values: [] })).toBe(true)
      expect(matches(v, 'text', { operator: 'isNotEmpty', values: [] })).toBe(false)
    }
    expect(matches('x', 'text', { operator: 'isEmpty', values: [] })).toBe(false)
  })
})

describe('isActiveFilter', () => {
  it('does not filter while the user is still typing a value', () => {
    expect(isActiveFilter({ key: 'a', operator: 'contains', values: [''] })).toBe(false)
    expect(isActiveFilter({ key: 'a', operator: 'contains', values: ['x'] })).toBe(true)
  })

  it('activates a between as soon as either bound is set', () => {
    expect(isActiveFilter({ key: 'a', operator: 'between', values: ['', ''] })).toBe(false)
    expect(isActiveFilter({ key: 'a', operator: 'between', values: ['1', ''] })).toBe(true)
  })

  it('always activates an operator that needs no value', () => {
    expect(isActiveFilter({ key: 'a', operator: 'isEmpty', values: [] })).toBe(true)
    expect(isActiveFilter({ key: 'a', operator: 'isTrue', values: [] })).toBe(true)
  })
})

describe('operator registry', () => {
  it('offers a range for numbers and dates, and a multi-select for enums', () => {
    expect(operatorsFor('number').map(o => o.value)).toContain('between')
    expect(operatorsFor('date').map(o => o.value)).toContain('before')
    expect(operatorsFor('enum').map(o => o.value)).toContain('isAnyOf')
    expect(operatorsFor('text').map(o => o.value)).not.toContain('between')
  })

  it('offers emptiness on every type', () => {
    const types = ['text', 'enum', 'connection', 'number', 'currency', 'percent', 'date', 'timestamp', 'split', 'ratioTuple', 'list'] as const
    for (const type of types) {
      expect(operatorsFor(type).map(o => o.value)).toContain('isEmpty')
    }
  })

  it('knows which operators need a second input box', () => {
    expect(takesSecondValue('between')).toBe(true)
    expect(takesSecondValue('gt')).toBe(false)
  })

  it('picks an editor per type', () => {
    expect(valueEditorFor('date', 'on')).toBe('date')
    expect(valueEditorFor('number', 'gt')).toBe('number')
    expect(valueEditorFor('text', 'contains')).toBe('text')
    expect(valueEditorFor('list', 'containsAny')).toBe('list')
    expect(valueEditorFor('number', 'isEmpty')).toBe('none')
  })

  it('offers a metric selector only on composite columns', () => {
    expect(metricOptionsFor('split').map(o => o.value)).toEqual(['total', 'sp', 'sb', 'sd'])
    expect(metricOptionsFor('ratioTuple').map(o => o.value)).toEqual(['total', 'enabled', 'coverage'])
    expect(metricOptionsFor('number')).toEqual([])
  })
})

describe('distinctValues', () => {
  it('returns sorted unique non-blank values', () => {
    const rows = [{ s: 'b' }, { s: 'a' }, { s: 'b' }, { s: null }, { s: '' }]
    expect(distinctValues(rows, 's')).toEqual(['a', 'b'])
  })

  it('is what a picker is fed, so it must not invent values', () => {
    // The list is the parquet column's own vocabulary, not a guess: a value that never
    // appears in the data must not be offered.
    const rows = [{ tool: 'sp_ad_data_check' }, { tool: 'amazon_web_analyze' }]
    expect(distinctValues(rows, 'tool')).toEqual(['amazon_web_analyze', 'sp_ad_data_check'])
    expect(distinctValues(rows, 'tool')).not.toContain('sp_search_ad_basic_performance')
  })
})

describe('picking values instead of typing them', () => {
  it('offers the membership operators on text columns too, not just enums', () => {
    // Tool, organization and profile are text columns; the user wanted to choose them.
    expect(operatorsFor('text').map(o => o.value)).toContain('isAnyOf')
    expect(operatorsFor('text').map(o => o.value)).toContain('isNoneOf')
  })

  it('decides per type whether a picker is even possible', () => {
    expect(supportsValueOptions('text')).toBe(true)
    expect(supportsValueOptions('enum')).toBe(true)
    expect(supportsValueOptions('connection')).toBe(true)
    expect(supportsValueOptions('number')).toBe(false)
    expect(supportsValueOptions('date')).toBe(false)
  })

  it('keeps the option cap low enough to stay a list', () => {
    expect(MAX_OPTION_VALUES).toBeGreaterThan(530) // the profiles in one export
    expect(MAX_OPTION_VALUES).toBeLessThanOrEqual(2000)
  })

  it('matches membership exactly, unlike the substring operators', () => {
    const filter = { key: 'v', operator: 'isAnyOf' as const, values: ['Felix'] }
    expect(matches('Felix', 'text', filter)).toBe(true)
    // "contains" would have matched this; membership must not.
    expect(matches('Felix the great', 'text', filter)).toBe(false)
    expect(matches('Felix', 'text', { operator: 'isNoneOf', values: ['Felix'] })).toBe(false)
    expect(matches('Mico', 'text', { operator: 'isNoneOf', values: ['Felix'] })).toBe(true)
  })

  it('treats an untouched picker as no constraint, not as match-nothing', () => {
    // The chip is created with an empty value and only becomes "active" once something
    // is picked; a blank set must not blank the table out from under the user.
    expect(matches('Felix', 'text', { operator: 'isAnyOf', values: [] })).toBe(true)
    expect(matches('Felix', 'text', { operator: 'isAnyOf', values: [''] })).toBe(true)
    expect(matches('Felix', 'text', { operator: 'isNoneOf', values: [''] })).toBe(true)
  })
})
