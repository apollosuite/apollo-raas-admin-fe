import { describe, expect, it } from 'vitest'

import type { ToolPairRow } from '../agent-analytics'
import type { AgentOrgProfileStat, AgentToolDailyRow } from '../types'

import {
  dailyOrgShares,
  daysBetween,
  fillTrendDays,
  orgProfileKey,
  rankWithTail,
  repeatBuckets,
  rollupBy,
  successRate,
  toolAdoption,
  topNWithOthers,
  trendSummary,
  usageBuckets,
  usageIntensity,
  withToolsUsed,
} from '../agent-analytics'

function profile(over: Partial<AgentOrgProfileStat> = {}): AgentOrgProfileStat {
  return {
    orgId: '1',
    organization: 'Acme',
    amazonProfileId: 'p1',
    name: 'US: Acme',
    marketplace: 'US',
    entity: 'E1',
    chats: 0,
    toolCalls: 0,
    toolsUsed: 0,
    lastActivity: null,
    ...over,
  }
}

describe('topNWithOthers', () => {
  const rows = [
    { name: 'a', value: 50 },
    { name: 'b', value: 30 },
    { name: 'c', value: 15 },
    { name: 'd', value: 5 },
  ]

  it('keeps the heaviest rows and folds the tail into Others', () => {
    expect(topNWithOthers(rows, r => r.value, r => r.name, 2)).toEqual([
      { name: 'a', value: 50 },
      { name: 'b', value: 30 },
      { name: 'Others', value: 20 },
    ])
  })

  it('adds no Others slice when everything fits', () => {
    expect(topNWithOthers(rows, r => r.value, r => r.name, 10).map(s => s.name)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('drops zero-value rows instead of drawing empty slices', () => {
    const withZeros = [...rows, { name: 'e', value: 0 }]
    expect(topNWithOthers(withZeros, r => r.value, r => r.name, 10).some(s => s.name === 'e')).toBe(false)
  })
})

describe('successRate', () => {
  it('is a percentage of calls', () => {
    expect(successRate(95, 100)).toBe(95)
    expect(successRate(1, 3)).toBeCloseTo(33.33, 2)
  })

  it('reports no rate rather than NaN when nothing was called', () => {
    expect(successRate(0, 0)).toBe(0)
  })
})

describe('withToolsUsed', () => {
  it('merges the distinct count by (org, profile)', () => {
    const rows = [profile({ orgId: '1', amazonProfileId: 'p1' }), profile({ orgId: '2', amazonProfileId: 'p2' })]
    const tools = [
      { orgId: '1', amazonProfileId: 'p1', toolsUsed: 7 },
      { orgId: '2', amazonProfileId: 'p2', toolsUsed: 3 },
    ]
    expect(withToolsUsed(rows, tools).map(r => r.toolsUsed)).toEqual([7, 3])
  })

  it('treats an empty profile as a value, not as a missing join', () => {
    // A SQL join on the profile id would match nothing here, and the org-level row
    // would silently report zero tools.
    const rows = [profile({ orgId: '1', amazonProfileId: null, name: null })]
    expect(withToolsUsed(rows, [{ orgId: '1', amazonProfileId: null, toolsUsed: 4 }])[0].toolsUsed).toBe(4)
  })

  it('leaves a row with no tool usage at zero', () => {
    expect(withToolsUsed([profile({ orgId: '9' })], [])[0].toolsUsed).toBe(0)
  })

  it('keys on both ids, so one org can hold many profiles', () => {
    expect(orgProfileKey('1', 'p1')).not.toBe(orgProfileKey('1', 'p2'))
    expect(orgProfileKey('1', null)).toBe(orgProfileKey('1', null))
  })
})

describe('dailyOrgShares', () => {
  const rows: AgentToolDailyRow[] = [
    { date: '2026-09-01', org: 'Acme', calls: 6 },
    { date: '2026-09-01', org: 'Beta', calls: 2 },
    { date: '2026-09-02', org: 'Acme', calls: 3 },
    { date: '2026-09-02', org: 'Beta', calls: 9 },
  ]

  it('normalizes every day to 100%', () => {
    const { categories, series } = dailyOrgShares(rows, 10)
    expect(categories).toEqual(['2026-09-01', '2026-09-02'])
    expect(series.map(s => s.name)).toEqual(['Beta', 'Acme'])
    expect(series[0].values).toEqual([25, 75])
    expect(series[1].values).toEqual([75, 25])
  })

  it('folds the organizations past the cut into one band', () => {
    const many: AgentToolDailyRow[] = [
      { date: '2026-09-01', org: 'a', calls: 5 },
      { date: '2026-09-01', org: 'b', calls: 3 },
      { date: '2026-09-01', org: 'c', calls: 2 },
    ]
    const { series } = dailyOrgShares(many, 1)
    expect(series.map(s => s.name)).toEqual(['a', 'Others'])
    expect(series[0].values).toEqual([50])
    expect(series[1].values).toEqual([50])
  })

  it('adds no Others band when every organization has its own', () => {
    expect(dailyOrgShares(rows, 10).series.some(s => s.name === 'Others')).toBe(false)
  })

  it('returns nothing for an empty range instead of a broken axis', () => {
    expect(dailyOrgShares([], 10)).toEqual({ categories: [], series: [] })
  })
})

describe('usageBuckets', () => {
  it('counts entities per band and keeps a zero band', () => {
    const buckets = usageBuckets([0, 3, 12, 40, 300, 900])
    expect(buckets.map(b => b.name)).toEqual(['0', '1–5', '6–20', '21–100', '101–500', '500+'])
    expect(buckets.map(b => b.value)).toEqual([1, 1, 1, 1, 1, 1])
  })

  it('sums to the population, so the bars can be read as "of N organizations"', () => {
    const values = [0, 2, 2, 7, 30, 120, 120, 640]
    expect(usageBuckets(values).reduce((n, b) => n + b.value, 0)).toBe(values.length)
  })

  it('puts a boundary value in the band it names, not the next one', () => {
    // 5 belongs to "1–5", 6 to "6–20", ..., 501 to "500+".
    expect(usageBuckets([5, 6, 20, 21, 100, 101, 500, 501]).map(b => b.value)).toEqual([0, 1, 2, 2, 2, 1])
  })
})

describe('rollupBy', () => {
  it('sums the finer table grain into one bucket per key', () => {
    // The organization's tool table is one row per (tool, sub account, profile); the
    // chart above it is per sub account.
    const rows = [
      { tool: 'a', subAccount: 'Felix', calls: 3 },
      { tool: 'b', subAccount: 'Felix', calls: 4 },
      { tool: 'a', subAccount: 'Mico', calls: 2 },
    ]
    expect(rollupBy(rows, r => r.subAccount, r => r.subAccount, r => r.calls)).toEqual([
      { key: 'Felix', name: 'Felix', value: 7 },
      { key: 'Mico', name: 'Mico', value: 2 },
    ])
  })

  it('keeps rows without a key in their own bucket instead of dropping them', () => {
    const rolled = rollupBy(
      [{ id: null, calls: 5 }, { id: null, calls: 1 }],
      r => r.id ?? '',
      r => r.id ?? '—',
      r => r.calls,
    )
    expect(rolled).toEqual([{ key: '', name: '—', value: 6 }])
  })

  it('groups by identity, so two profiles sharing a name stay apart', () => {
    const rolled = rollupBy(
      [{ id: 'p1', name: 'US: Acme', calls: 5 }, { id: 'p2', name: 'US: Acme', calls: 3 }],
      r => r.id,
      r => r.name,
      r => r.calls,
    )
    expect(rolled).toHaveLength(2)
  })
})

describe('rankWithTail', () => {
  const rows = [{ name: 'a', value: 60 }, { name: 'b', value: 30 }, { name: 'c', value: 10 }]

  it('keeps the head and reports what the tail holds', () => {
    const rank = rankWithTail(rows, r => r.value, r => r.name, 2)
    expect(rank.slices).toEqual([{ name: 'a', value: 60 }, { name: 'b', value: 30 }])
    expect(rank.tailCount).toBe(1)
    expect(rank.tailValue).toBe(10)
    expect(rank.total).toBe(100)
    expect(rank.topShare).toBeCloseTo(90)
  })

  it('reports no tail when everything fits', () => {
    const rank = rankWithTail(rows, r => r.value, r => r.name, 10)
    expect(rank.tailCount).toBe(0)
    expect(rank.tailValue).toBe(0)
    expect(rank.topShare).toBe(100)
  })

  it('survives an all-zero population', () => {
    const rank = rankWithTail([{ name: 'a', value: 0 }], r => r.value, r => r.name, 5)
    expect(rank.topShare).toBe(0)
    expect(rank.slices).toEqual([])
  })
})

describe('toolAdoption', () => {
  const pairs: ToolPairRow[] = [
    { tool: 'wide', orgId: '1', calls: 3, activeDays: 1 },
    { tool: 'wide', orgId: '2', calls: 3, activeDays: 2 },
    { tool: 'wide', orgId: '3', calls: 2, activeDays: 1 },
    { tool: 'deep', orgId: '1', calls: 90, activeDays: 9 },
    { tool: 'deep', orgId: '1', calls: 10, activeDays: 1 },
  ]

  it('separates breadth from depth', () => {
    const wide = toolAdoption(pairs).find(t => t.tool === 'wide')!
    const deep = toolAdoption(pairs).find(t => t.tool === 'deep')!
    expect(wide.orgs).toBe(3)
    expect(wide.callsPerOrg).toBeCloseTo(8 / 3)
    // One organization twice is one organization, not two.
    expect(deep.orgs).toBe(1)
    expect(deep.callsPerOrg).toBe(100)
  })

  it('reports the median active days per pair', () => {
    expect(toolAdoption(pairs).find(t => t.tool === 'wide')!.medianActiveDays).toBe(1)
    expect(toolAdoption(pairs).find(t => t.tool === 'deep')!.medianActiveDays).toBe(5)
  })
})

describe('repeatBuckets', () => {
  it('splits pairs into one-day, two-to-four, and five-plus', () => {
    const pairs: ToolPairRow[] = [1, 1, 2, 4, 5, 9].map((days, i) => ({ tool: 't', orgId: String(i), calls: 1, activeDays: days }))
    expect(repeatBuckets(pairs)).toEqual([
      { name: '只用过 1 天', value: 2 },
      { name: '2–4 天', value: 2 },
      { name: '≥5 天', value: 2 },
    ])
  })
})

describe('usageIntensity', () => {
  const rows = [
    { orgId: '1', organization: 'Acme', profile: 'p1', calls: 100, activeDays: 10 },
    { orgId: '1', organization: 'Acme', profile: 'p2', calls: 100, activeDays: 1 },
    { orgId: '2', organization: 'Beta', profile: 'p3', calls: 0, activeDays: 0 },
    { orgId: '2', organization: 'Beta', profile: 'p4', calls: 10, activeDays: 5 },
  ]

  it('drops the profiles with no usage', () => {
    expect(usageIntensity(rows).points).toHaveLength(3)
  })

  it('computes the per-day rate that makes an outlier visible', () => {
    const { points } = usageIntensity(rows)
    expect(points.find(p => p.profile === 'p2')!.callsPerDay).toBe(100)
    expect(points.find(p => p.profile === 'p1')!.callsPerDay).toBe(10)
  })

  it('reports the quantiles the chart draws as a reference line', () => {
    const { p50, p95 } = usageIntensity(rows)
    expect(p50).toBe(10)
    expect(p95).toBe(100)
  })

  it('returns zeroed quantiles for an empty population instead of NaN', () => {
    expect(usageIntensity([])).toEqual({ points: [], p50: 0, p95: 0 })
  })
})

describe('daysBetween', () => {
  it('lists every day of an inclusive range', () => {
    expect(daysBetween('2026-08-30', '2026-09-02')).toEqual(['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02'])
  })

  it('crosses a month boundary without losing or repeating a day', () => {
    expect(daysBetween('2026-03-07', '2026-03-10')).toEqual(['2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10'])
  })

  it('returns the single day when from equals to', () => {
    expect(daysBetween('2026-09-17', '2026-09-17')).toEqual(['2026-09-17'])
  })

  it('returns nothing for an unparseable bound instead of looping', () => {
    expect(daysBetween('', '2026-09-17')).toEqual([])
  })
})

describe('fillTrendDays', () => {
  it('turns a day the tool was never called into a visible zero', () => {
    // The export has no row for 09-01/09-02; the chart must still show those days.
    const rows = [
      { date: '2026-08-31', calls: 5, orgs: 2, profiles: 3 },
      { date: '2026-09-03', calls: 9, orgs: 4, profiles: 5 },
    ]
    const days = fillTrendDays(rows, '2026-08-31', '2026-09-03')
    expect(days.map(d => d.date)).toEqual(['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03'])
    expect(days.map(d => d.calls)).toEqual([5, 0, 0, 9])
    expect(days[1]).toEqual({ date: '2026-09-01', calls: 0, orgs: 0, profiles: 0 })
  })

  it('keeps the rows it was given, in range order', () => {
    const rows = [
      { date: '2026-09-02', calls: 2, orgs: 1, profiles: 1 },
      { date: '2026-09-01', calls: 7, orgs: 3, profiles: 4 },
    ]
    expect(fillTrendDays(rows, '2026-09-01', '2026-09-02').map(d => d.calls)).toEqual([7, 2])
  })

  it('returns the whole empty range when the tool has no rows at all', () => {
    expect(fillTrendDays([], '2026-09-01', '2026-09-03').map(d => d.calls)).toEqual([0, 0, 0])
  })
})

describe('trendSummary', () => {
  const days = fillTrendDays([
    { date: '2026-09-01', calls: 10, orgs: 3, profiles: 4 },
    { date: '2026-09-03', calls: 40, orgs: 9, profiles: 12 },
  ], '2026-09-01', '2026-09-04')

  it('reports the peak and the days with no use', () => {
    const summary = trendSummary(days)
    expect(summary.peakCalls).toBe(40)
    expect(summary.peakDate).toBe('2026-09-03')
    expect(summary.daysWithUse).toBe(2)
    expect(summary.quietDays).toBe(2)
    expect(summary.maxOrgs).toBe(9)
  })

  it('reports an empty range without inventing a peak date', () => {
    expect(trendSummary(fillTrendDays([], '2026-09-01', '2026-09-02')))
      .toEqual({ peakCalls: 0, peakDate: '', quietDays: 2, daysWithUse: 0, maxOrgs: 0 })
  })
})
