import { describe, expect, it } from 'vitest'

import { buildWhere, datePredicate, quote, scopePredicates } from '../sql'

describe('sql builder', () => {
  it('single-quote escapes values', () => {
    expect(quote('a\'b')).toBe('\'a\'\'b\'')
  })

  it('builds a date range predicate', () => {
    expect(datePredicate({ from: '2026-01-01', to: '2026-01-31' })).toBe(
      'event_date BETWEEN \'2026-01-01\' AND \'2026-01-31\'',
    )
  })

  it('builds scope predicates', () => {
    expect(scopePredicates({ amazon_profile_id: 'org-1-p1', action: 'Bid Optimization' })).toEqual([
      'amazon_profile_id = \'org-1-p1\'',
      'action = \'Bid Optimization\'',
    ])
  })

  it('joins date + scope + extra into a WHERE clause', () => {
    const where = buildWhere(
      { from: '2026-01-01', to: '2026-01-31' },
      { scope: { amazon_profile_id: 'org-1-p1' }, extra: ['clicks > 0'] },
    )
    expect(where).toBe(
      'WHERE event_date BETWEEN \'2026-01-01\' AND \'2026-01-31\' AND amazon_profile_id = \'org-1-p1\' AND clicks > 0',
    )
  })
})
