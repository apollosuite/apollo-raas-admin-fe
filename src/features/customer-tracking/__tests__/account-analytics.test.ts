import { describe, expect, it } from 'vitest'

import type { Organization } from '../types'

import {
  managedBook,
  RADIAL_BASE,
  RADIAL_HOLE,
  scaleSummary,
  spendOf,
  statusBreakdown,
  statusCaption,
  statusRadialCaption,
  statusRadialSlices,
  statusSpendShares,
  topBySpend,
  TRIAL_PLAN,
} from '../account-analytics'

function org(over: Partial<Organization> = {}): Organization {
  return {
    orgId: '1',
    name: 'Acme',
    plan: 'Hanna Training Service (12 Months)',
    status: 'Healthy',
    joined: '2026-01-01',
    lastActive: '2026-09-16',
    renewal: '2026-03-05',
    adsConn: [1, 2],
    profConn: [3, 4],
    subConn: [5, 6],
    ams: [1, 1],
    sp: [1, 1],
    adSpend: 0,
    adSpendSplit: { sp: 0, sb: 0, sd: 0 },
    chats: 0,
    optimizationEvents: 0,
    scheduleRuns: 0,
    launched: { sp: 0, sb: 0, sd: 0 },
    ...over,
  }
}

function spending(spend: number, over: Partial<Organization> = {}) {
  return org({ adSpendSplit: { sp: spend, sb: 0, sd: 0 }, adSpend: spend, ...over })
}

describe('managedBook', () => {
  it('keeps only the paying, non-trial accounts', () => {
    const book = managedBook([
      spending(1000),
      spending(0), // non-trial but idle
      spending(500, { plan: TRIAL_PLAN }),
      org({ plan: TRIAL_PLAN }), // trial with no spend
    ])
    expect(book.managed).toHaveLength(1)
    expect(book.managed[0].name).toBe('Acme')
  })

  it('reports what it left out instead of silently redefining the total', () => {
    const book = managedBook([
      spending(1000),
      spending(0),
      spending(500, { plan: TRIAL_PLAN }),
      org({ plan: TRIAL_PLAN }),
    ])
    expect(book.excluded).toEqual({ trial: 2, noSpend: 1 })
  })

  it('treats an all-series split as spend and ignores negatives', () => {
    expect(spendOf(org({ adSpendSplit: { sp: 10, sb: 5, sd: -100 } }))).toBe(-85)
    // A negative platform adjustment must not turn a non-spender into a spender.
    expect(managedBook([org({ adSpendSplit: { sp: -10, sb: 0, sd: 0 } })]).managed).toHaveLength(0)
  })
})

describe('statusBreakdown', () => {
  const rows = statusBreakdown([
    spending(100, { status: 'Healthy' }),
    spending(300, { status: 'At Risk' }),
    spending(600, { status: 'Churned' }),
    spending(0, { status: 'Moderate' }),
  ])

  it('keeps the health ladder order', () => {
    expect(rows.map(r => r.status)).toEqual(['Healthy', 'Moderate', 'At Risk', 'Churned'])
  })

  it('counts organizations and sums spend per state', () => {
    expect(rows.map(r => [r.orgs, r.spend])).toEqual([[1, 100], [1, 0], [1, 300], [1, 600]])
  })
})

describe('statusSpendShares', () => {
  it('is a 100% split of spend, dropping empty states', () => {
    const shares = statusSpendShares(statusBreakdown([
      spending(600, { status: 'Healthy' }),
      spending(400, { status: 'At Risk' }),
      spending(0, { status: 'Churned' }),
    ]))
    expect(shares).toEqual([{ name: 'Healthy', value: 60 }, { name: 'At Risk', value: 40 }])
  })

  it('returns nothing rather than NaN when there is no spend', () => {
    expect(statusSpendShares(statusBreakdown([spending(0)]))).toEqual([])
  })
})

describe('statusCaption', () => {
  it('states both units, so one bar is enough', () => {
    const caption = statusCaption(statusBreakdown([
      spending(750, { status: 'Healthy' }),
      spending(250, { status: 'At Risk' }),
    ]))
    expect(caption).toBe('Healthy 75.0%（1 个账号） · At Risk 25.0%（1 个账号）')
  })

  it('says so when the window has no spend at all', () => {
    expect(statusCaption(statusBreakdown([]))).toBe('该区间内没有在管广告花费。')
  })
})

describe('scaleSummary', () => {
  const summary = scaleSummary([
    spending(100, { profConn: [3, 9], adsConn: [2, 5], subConn: [1, 7], chats: 5, optimizationEvents: 11, scheduleRuns: 2, launched: { sp: 1, sb: 2, sd: 3 }, adSpendSplit: { sp: 60, sb: 30, sd: 10 } }),
    spending(100, { profConn: [4, 9], adsConn: [1, 5], subConn: [2, 7], chats: 3, optimizationEvents: 7, scheduleRuns: 1, launched: { sp: 0, sb: 0, sd: 1 }, adSpendSplit: { sp: 100, sb: 0, sd: 0 } }),
  ])

  it('adds the scale up in money and in machinery', () => {
    expect(summary.advertisers).toBe(2)
    expect(summary.spend).toBe(200)
    expect(summary.spendByProduct).toEqual({ sp: 160, sb: 30, sd: 10 })
    expect(summary.profilesEnabled).toBe(7)
    expect(summary.adsAccountsEnabled).toBe(3)
    expect(summary.subAccountsEnabled).toBe(3)
    expect(summary.chats).toBe(8)
    expect(summary.optimizationEvents).toBe(18)
    expect(summary.scheduleRuns).toBe(3)
    expect(summary.campaignsLaunched).toBe(7)
  })

  it('reports how dependent the book is on its biggest advertisers', () => {
    // Two equal advertisers: the top ten hold everything.
    expect(summary.top10Share).toBeCloseTo(100)
    expect(scaleSummary([]).top10Share).toBe(0)
  })
})

describe('topBySpend', () => {
  const orgs = [
    spending(10, { name: 'small', status: 'At Risk' }),
    spending(900, { name: 'big', status: 'At Risk' }),
    spending(500, { name: 'healthy', status: 'Healthy' }),
    spending(0, { name: 'idle', status: 'At Risk' }),
  ]

  it('ranks by money, not by name, and drops non-spenders', () => {
    expect(topBySpend(orgs, 'At Risk', 10)).toEqual([
      { name: 'big', value: 900 },
      { name: 'small', value: 10 },
    ])
  })

  it('honours the cut', () => {
    expect(topBySpend(orgs, undefined, 1)).toEqual([{ name: 'big', value: 900 }])
  })
})

describe('statusRadialSlices', () => {
  const rows = statusBreakdown([
    spending(900, { status: 'Healthy' }),
    spending(10, { status: 'At Risk' }),
    spending(90, { status: 'Churned' }),
  ])

  it('gives each state an angular width in proportion to its accounts', () => {
    const slices = statusRadialSlices(rows)
    expect(slices.map(s => s.orgs)).toEqual([1, 1, 1])
    // Three equal account counts: three equal sectors, 120 degrees each.
    for (const slice of slices)
      expect(slice.endAngle - slice.startAngle).toBeCloseTo(2 * Math.PI / 3, 1)
  })

  it('leaves no gap in the circle and starts at the top', () => {
    const slices = statusRadialSlices(statusBreakdown([
      spending(1, { status: 'Healthy' }),
      spending(1, { status: 'At Risk' }),
      spending(1, { status: 'Churned' }),
      spending(1, { status: 'Moderate' }),
    ]))
    // Just past twelve o'clock: the separation gap is taken off the head of the first slice.
    expect(slices[0].startAngle).toBeGreaterThanOrEqual(-Math.PI / 2)
    expect(slices[0].startAngle).toBeLessThan(-Math.PI / 2 + 0.05)
    // Slices may not overlap, and the last one must close the circle.
    for (let i = 1; i < slices.length; i++)
      expect(slices[i].startAngle).toBeGreaterThanOrEqual(slices[i - 1].endAngle - 1e-9)
    expect(slices[slices.length - 1].endAngle).toBeLessThanOrEqual(-Math.PI / 2 + 2 * Math.PI + 1e-9)
  })

  it('protrudes by spend, so a heavy state bulges past a light one', () => {
    const slices = statusRadialSlices(rows)
    const healthy = slices.find(s => s.status === 'Healthy')!
    const atRisk = slices.find(s => s.status === 'At Risk')!
    expect(healthy.spendShare).toBeCloseTo(0.9, 3)
    expect(healthy.outerRadius).toBeGreaterThan(atRisk.outerRadius)
    // The heaviest state sits at base + span; the lightest barely leaves the base.
    expect(healthy.outerRadius).toBeCloseTo(RADIAL_BASE + 0.46, 3)
    expect(atRisk.outerRadius).toBeGreaterThan(RADIAL_BASE)
    expect(atRisk.innerRadius).toBe(RADIAL_HOLE)
  })

  it('drops states with no accounts rather than drawing an empty sector', () => {
    // statusBreakdown always reports all four states; only the populated one gets a sector.
    expect(statusRadialSlices(statusBreakdown([spending(0, { status: 'Moderate' })])).map(s => s.status))
      .toEqual(['Moderate'])
    expect(statusRadialSlices([])).toEqual([])
  })

  it('does not divide by zero when nobody spent', () => {
    const slices = statusRadialSlices(statusBreakdown([
      spending(0, { status: 'Healthy' }),
      spending(0, { status: 'At Risk' }),
    ]))
    expect(slices.every(s => s.spendShare === 0)).toBe(true)
    expect(slices.every(s => s.outerRadius === RADIAL_BASE)).toBe(true)
  })
})

describe('statusRadialCaption', () => {
  it('names both encodings, and both numbers per state', () => {
    const caption = statusRadialCaption(statusBreakdown([
      spending(750, { status: 'Healthy' }),
      spending(250, { status: 'At Risk' }),
    ]))
    expect(caption).toContain('角度＝组织数量占比')
    expect(caption).toContain('外凸程度＝广告花费占比')
    expect(caption).toContain('Healthy 1 个（50.0%）占花费 75.0%')
    expect(caption).toContain('At Risk 1 个（50.0%）占花费 25.0%')
  })

  it('says so when there is nothing to draw', () => {
    expect(statusRadialCaption([])).toBe('该区间内没有在管账号。')
  })
})
