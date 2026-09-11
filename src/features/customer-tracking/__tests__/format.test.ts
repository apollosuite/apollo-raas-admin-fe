import { describe, expect, it } from 'vitest'

import { EMPTY_METRIC, formatExact, formatMetric, formatShare } from '../format'

describe('formatMetric', () => {
  it('keeps sub-1,000 values exact rather than writing 0.9K', () => {
    expect(formatMetric(0)).toBe('0')
    expect(formatMetric(883.2)).toBe('883.2')
    expect(formatMetric(999.99)).toBe('999.99')
    expect(formatMetric(883.2, { currency: true })).toBe('$883.2')
  })

  it('compacts at and above 1,000', () => {
    expect(formatMetric(1_000)).toBe('1K')
    expect(formatMetric(1_500)).toBe('1.5K')
    expect(formatMetric(259_569.18, { currency: true })).toBe('$259.6K')
    expect(formatMetric(3_564.07, { currency: true })).toBe('$3.6K')
  })

  it('steps up a unit when one decimal would print 1000K', () => {
    expect(formatMetric(999_999)).toBe('1M')
    expect(formatMetric(1_000_000)).toBe('1M')
    expect(formatMetric(1_250_000)).toBe('1.3M')
    expect(formatMetric(1_000_000_000)).toBe('1B')
  })

  it('keeps the sign outside the unit', () => {
    expect(formatMetric(-1_500)).toBe('-1.5K')
    expect(formatMetric(-1_500, { currency: true })).toBe('-$1.5K')
  })

  it('renders missing values as an em dash, never as zero', () => {
    expect(formatMetric(null)).toBe(EMPTY_METRIC)
    expect(formatMetric(undefined)).toBe(EMPTY_METRIC)
    expect(formatMetric(Number.NaN)).toBe(EMPTY_METRIC)
  })
})

describe('formatExact', () => {
  it('keeps full precision for tooltips and filter keys', () => {
    expect(formatExact(259_569.18, { currency: true })).toBe('$259,569.18')
    expect(formatExact(883, { currency: true })).toBe('$883.00')
    expect(formatExact(883.2)).toBe('883.2')
    expect(formatExact(null)).toBe(EMPTY_METRIC)
  })
})

describe('formatShare', () => {
  it('reports a series share of its row total', () => {
    expect(formatShare(259_569.18, 385_623.09)).toBe('67.3%')
    expect(formatShare(1, 4)).toBe('25.0%')
  })

  it('refuses to divide by a total that cannot support a ratio', () => {
    expect(formatShare(0, 0)).toBe(EMPTY_METRIC)
    expect(formatShare(5, Number.NaN)).toBe(EMPTY_METRIC)
  })
})
