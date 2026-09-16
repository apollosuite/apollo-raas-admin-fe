import { describe, expect, it } from 'vitest'

import type { AttributionRow, FirstTouchRow } from '../performance-analytics'
import type { PerfSchedule } from '../types'

import {
  actionLabel,
  activityCounters,
  adProductLabel,
  compositionSeries,
  compositionShare,
  dailySeries,
  efficiencyByAdProduct,
  firstTouchSummary,
  scheduleActionMix,
  scheduleRollup,
  scheduleStatusBreakdown,
  segmentTotals,
  segmentVocabulary,
  toggleTrendMetric,
} from '../performance-analytics'
import { LAUNCH_CATEGORY, OPTIMIZATION_CATEGORY } from '../types'

function attribution(over: Partial<AttributionRow> = {}): AttributionRow {
  return {
    amazon_profile_id: 'p1',
    sponsored_ads_type: 'SPONSORED_PRODUCTS',
    segment: 'untouched',
    campaigns: 0,
    impressions: 0,
    clicks: 0,
    ad_orders: 0,
    ad_spend: 0,
    ad_sales: 0,
    ...over,
  }
}

function firstTouch(over: Partial<FirstTouchRow> = {}): FirstTouchRow {
  return {
    amazon_profile_id: 'p1',
    bucket: 'before',
    campaigns: 0,
    campaign_days: 0,
    impressions: 0,
    clicks: 0,
    ad_orders: 0,
    ad_spend: 0,
    ad_sales: 0,
    ...over,
  }
}

function schedule(over: Partial<PerfSchedule> = {}): PerfSchedule {
  return {
    scheduleId: 's1',
    scheduleName: 'Bid schedule',
    actionType: 'Bid Optimization',
    actionCategory: 'Optimization',
    amazonProfileId: 'p1',
    profileName: 'US: Demo',
    subAccount: 'cassandra',
    status: 'ACTIVE',
    createdDate: '2026-08-01',
    alertEnabled: 'On',
    lastRunStatus: 'COMPLETED',
    lastRunTime: '2026-09-14T11:56:09',
    scheduleRuns: 10,
    optimizationEvents: 12,
    bidsOptimized: 7,
    budgetsOptimized: 0,
    placementsOptimized: 0,
    launched: { sp: 0, sb: 0, sd: 0 },
    adGroups: { sp: 0, sb: 0, sd: 0 },
    targeting: { sp: 0, sb: 0, sd: 0 },
    ...over,
  }
}

describe('adProductLabel', () => {
  it('maps the lakehouse spellings onto the app abbreviations', () => {
    expect(adProductLabel('SPONSORED_PRODUCTS')).toBe('SP')
    expect(adProductLabel('SPONSORED_BRANDS')).toBe('SB')
    expect(adProductLabel('SPONSORED_DISPLAY')).toBe('SD')
  })

  it('passes through the abbreviations and rejects anything else', () => {
    expect(adProductLabel('sb')).toBe('SB')
    expect(adProductLabel(null)).toBe('Other')
    expect(adProductLabel('SPONSORED_TV')).toBe('Other')
  })
})

describe('composition', () => {
  const rows = [
    attribution({ segment: 'this_action', ad_spend: 100, campaigns: 5, impressions: 10 }),
    attribution({ segment: 'other_actions', ad_spend: 200, campaigns: 20, impressions: 20 }),
    attribution({ segment: 'untouched', ad_spend: 700, campaigns: 300, impressions: 30 }),
  ]

  it('totals each segment for the selected metric', () => {
    expect(segmentTotals(rows, 'ad_spend')).toEqual({ this_action: 100, other_actions: 200, untouched: 700 })
    expect(segmentTotals(rows, 'campaigns').untouched).toBe(300)
  })

  it('ignores rows whose segment is not one of the three', () => {
    const withNoise = [...rows, attribution({ segment: 'bogus' as never, ad_spend: 9999 })]
    expect(segmentTotals(withNoise, 'ad_spend').untouched).toBe(700)
  })

  it('builds a donut in business order and drops empty slices', () => {
    expect(compositionSeries(rows, 'ad_spend').map(s => s.name)).toEqual([
      '本功能管理',
      '其他功能管理',
      '未管理',
    ])
    expect(compositionSeries([attribution({ segment: 'this_action', ad_spend: 5 })], 'ad_spend')).toEqual([
      { name: '本功能管理', value: 5 },
    ])
  })

  it('reports the action share of the whole account', () => {
    const share = compositionShare(rows, 'ad_spend')
    expect(share.part).toBe(100)
    expect(share.total).toBe(1000)
    expect(share.share).toBeCloseTo(10)
  })

  it('reports a zero share rather than NaN when there is no data', () => {
    expect(compositionShare([], 'ad_spend')).toMatchObject({ share: 0, total: 0 })
  })

  it('names the same buckets by creation on a launch action page', () => {
    const created = segmentVocabulary(LAUNCH_CATEGORY)
    // The numbers are the same rows; only the question changes.
    expect(compositionSeries(rows, 'ad_spend', created)).toEqual([
      { name: '由本功能创建', value: 100 },
      { name: '由其它功能创建', value: 200 },
      { name: '在 Hanna 之外创建', value: 700 },
    ])
  })

  it('falls back to the managed words for an unknown category', () => {
    expect(segmentVocabulary(undefined).thisAction).toBe('本功能管理')
    expect(segmentVocabulary(OPTIMIZATION_CATEGORY).thisAction).toBe('本功能管理')
  })
})

describe('efficiencyByAdProduct on a launch action page', () => {
  const rows = [
    attribution({ sponsored_ads_type: 'SPONSORED_PRODUCTS', segment: 'this_action', ad_spend: 250, ad_sales: 1000, campaigns: 40 }),
    attribution({ sponsored_ads_type: 'SPONSORED_PRODUCTS', segment: 'untouched', ad_spend: 200, ad_sales: 1000, campaigns: 600 }),
  ]

  it('labels the bars by creation and keeps the counts', () => {
    const table = efficiencyByAdProduct(rows, segmentVocabulary(LAUNCH_CATEGORY))
    expect(table.series.map(s => s.name)).toEqual(['由本功能创建', '由其它功能创建', '在 Hanna 之外创建'])
    expect(table.categories).toEqual(['SP\n本功能创建 40 · Hanna 外创建 600'])
  })
})

describe('efficiencyByAdProduct', () => {
  const rows = [
    attribution({ sponsored_ads_type: 'SPONSORED_PRODUCTS', segment: 'this_action', ad_spend: 250, ad_sales: 1000, campaigns: 40 }),
    attribution({ sponsored_ads_type: 'SPONSORED_PRODUCTS', segment: 'untouched', ad_spend: 200, ad_sales: 1000, campaigns: 600 }),
    attribution({ sponsored_ads_type: 'SPONSORED_BRANDS', segment: 'this_action', ad_spend: 90, ad_sales: 100, campaigns: 4 }),
  ]

  it('computes ACoS per ad product and segment', () => {
    const table = efficiencyByAdProduct(rows)
    expect(table.series.find(s => s.name === '本功能管理')?.values).toEqual([25, 90])
    // SB has no unmanaged campaigns, so that bar is a gap rather than a 0 ACoS.
    expect(table.series.find(s => s.name === '未管理')?.values).toEqual([20, null])
  })

  it('prints both campaign counts under each ad product', () => {
    const table = efficiencyByAdProduct(rows)
    expect(table.categories).toEqual(['SP\n已管理 40 · 未管理 600', 'SB\n已管理 4 · 未管理 0'])
  })

  it('drops ad products with no campaigns and flags an empty table', () => {
    const onlySp = efficiencyByAdProduct([rows[1]])
    expect(onlySp.categories).toHaveLength(1)
    expect(efficiencyByAdProduct([]).empty).toBe(true)
  })

  it('reports ACoS as undefined, not 0, when a segment has no sales', () => {
    // 0% would draw as the most efficient bar on the chart; the truth is "no data".
    const noSales = efficiencyByAdProduct([attribution({ segment: 'this_action', ad_spend: 10, ad_sales: 0, campaigns: 1 })])
    expect(noSales.series[0].values[0]).toBeNull()

    const noSpend = efficiencyByAdProduct([attribution({ segment: 'this_action', ad_spend: 0, ad_sales: 500, campaigns: 1 })])
    expect(noSpend.series[0].values[0]).toBeNull()
  })
})

describe('firstTouchSummary', () => {
  it('normalises both windows per campaign-day', () => {
    const summary = firstTouchSummary([
      firstTouch({ bucket: 'before', campaigns: 2, campaign_days: 14, ad_spend: 140, ad_sales: 700, ad_orders: 7, clicks: 70 }),
      firstTouch({ bucket: 'after', campaigns: 2, campaign_days: 7, ad_spend: 140, ad_sales: 700, ad_orders: 7, clicks: 70 }),
    ], 7)
    expect(summary.windowDays).toBe(7)
    expect(summary.campaigns).toBe(2)
    // The same total over half the campaign-days is double the daily rate.
    expect(summary.before.spendPerCampaignDay).toBe(10)
    expect(summary.after.spendPerCampaignDay).toBe(20)
    expect(summary.before.acos).toBeCloseTo(20)
    expect(summary.after.acos).toBeCloseTo(20)
  })

  it('reports zeros instead of NaN when a bucket is missing', () => {
    const summary = firstTouchSummary([], 7)
    expect(summary.campaigns).toBe(0)
    expect(summary.after.spendPerCampaignDay).toBe(0)
    expect(summary.after.cvr).toBe(0)
  })
})

describe('dailySeries', () => {
  /** One (profile, date) fact row, as the detail query returns it. */
  const row = (over: Record<string, unknown> = {}) => ({
    amazonProfileId: 'p1',
    date: '2026-09-01',
    spAdSpend: 100,
    sbAdSpend: 0,
    sdAdSpend: 0,
    adSales: 400,
    adOrders: 8,
    impressions: 1000,
    clicks: 50,
    scheduleRuns: 3,
    optimizationEvents: 5,
    bidsOptimized: 1,
    budgetsOptimized: 2,
    placementsOptimized: 3,
    spCampaignsCreated: 4,
    sbCampaignsCreated: 0,
    sdCampaignsCreated: 0,
    ...over,
  })

  it('sums the same day across profiles before taking a ratio', () => {
    // This is what makes the trend follow a table filter: the caller passes only the
    // rows of the profiles the table kept, and the day is rebuilt from them.
    const points = dailySeries([
      row({ amazonProfileId: 'p1', spAdSpend: 100, adSales: 400 }),
      row({ amazonProfileId: 'p2', spAdSpend: 300, adSales: 400 }),
    ])
    expect(points).toHaveLength(1)
    expect(points[0].adSpend).toBe(400)
    expect(points[0].adSales).toBe(800)
    expect(points[0].acos).toBe(50)
  })

  it('derives the rates per day rather than over the range', () => {
    const points = dailySeries([row(), row({ date: '2026-09-02', spAdSpend: 200, adSales: 400 })])
    expect(points.map(p => p.acos)).toEqual([25, 50])
  })

  it('sorts by date so the category axis reads left to right', () => {
    const points = dailySeries([row({ date: '2026-09-03' }), row({ date: '2026-09-01' })])
    expect(points.map(p => p.date)).toEqual(['2026-09-01', '2026-09-03'])
  })

  it('reports 0 instead of NaN when a day has no clicks or no sales', () => {
    const points = dailySeries([row({ clicks: 0, adSales: 0 })])
    expect(points[0].cpc).toBe(0)
    expect(points[0].cvr).toBe(0)
    expect(points[0].acos).toBe(0)
  })

  it('treats missing columns as zero and ignores rows without a date', () => {
    const points = dailySeries([{ date: '2026-09-01' }, { date: '' }])
    expect(points).toHaveLength(1)
    expect(points[0]).toMatchObject({ adSpend: 0, adSales: 0, clicks: 0, scheduleRuns: 0, campaignsCreated: 0 })
  })
})

describe('activityCounters', () => {
  it('sums the per-schedule splits into one count per counter', () => {
    const counters = activityCounters([
      schedule({ launched: { sp: 2, sb: 1, sd: 3 } }),
      schedule({ scheduleRuns: 5, optimizationEvents: 1, launched: { sp: 0, sb: 0, sd: 1 } }),
    ])
    // The label is display text; look the counters up by their stable key.
    const byKey = Object.fromEntries(counters.map(c => [c.key, c.value]))
    expect(byKey.schedules).toBe(2)
    expect(byKey.scheduleRuns).toBe(15)
    expect(byKey.optimizationEvents).toBe(13)
    expect(byKey.campaignsCreated).toBe(7)
    expect(counters[0].label).toBe('调度数')
  })

  it('breaks the schedules down by lifecycle status, largest first', () => {
    const breakdown = scheduleStatusBreakdown([
      schedule({ status: 'PAUSED' }),
      schedule({ status: 'ACTIVE' }),
      schedule({ status: 'ACTIVE' }),
    ])
    expect(breakdown).toEqual([{ name: 'ACTIVE', value: 2 }, { name: 'PAUSED', value: 1 }])
  })
})

describe('activityCounters by action category', () => {
  const rows = [schedule({ scheduleRuns: 3, optimizationEvents: 2, bidsOptimized: 1, launched: { sp: 4, sb: 0, sd: 0 }, adGroups: { sp: 5, sb: 0, sd: 0 }, targeting: { sp: 6, sb: 0, sd: 0 } })]

  it('lists only what a launch action can produce', () => {
    expect(activityCounters(rows, LAUNCH_CATEGORY).map(c => c.key)).toEqual([
      'schedules',
      'scheduleRuns',
      'campaignsCreated',
      'adGroupsCreated',
      'targetingsCreated',
    ])
  })

  it('lists only what an optimisation action can produce', () => {
    expect(activityCounters(rows, OPTIMIZATION_CATEGORY).map(c => c.key)).toEqual([
      'schedules',
      'scheduleRuns',
      'optimizationEvents',
      'bidsOptimized',
      'budgetsOptimized',
      'placementsOptimized',
    ])
  })

  it('keeps every counter when the category is unknown', () => {
    expect(activityCounters(rows)).toHaveLength(9)
    expect(activityCounters(rows, 'Something New')).toHaveLength(9)
  })
})
describe('scheduleRollup', () => {
  it('collapses schedules to one row per action type', () => {
    const rows = scheduleRollup([
      schedule(),
      schedule({ scheduleId: 's2', status: 'PAUSED', scheduleRuns: 4, launched: { sp: 1, sb: 0, sd: 0 } }),
      schedule({ scheduleId: 's3', actionType: 'Cyber Minigun', actionCategory: 'Campaign Launch', status: 'LAUNCHED', launched: { sp: 0, sb: 2, sd: 0 } }),
    ])
    const bid = rows.find(r => r.action === 'Bid Optimization')
    expect(bid).toMatchObject({ type: 'Optimization', schedules: 2, active: 1, failed: 0, runs: 14, optimizationEvents: 24 })
    expect(bid?.launched).toEqual({ sp: 1, sb: 0, sd: 0 })
    // Ordered by activity, so the busiest action opens the table.
    expect(rows[0].action).toBe('Bid Optimization')
  })

  it('counts a failed schedule separately from an active one', () => {
    const rows = scheduleRollup([schedule({ status: 'FAILED' }), schedule({ scheduleId: 's2', status: 'ACTIVE' })])
    expect(rows[0]).toMatchObject({ active: 1, failed: 1 })
  })
})

describe('scheduleActionMix', () => {
  const rows = [
    schedule({ scheduleId: 's1', scheduleRuns: 10, launched: { sp: 2, sb: 1, sd: 0 }, targeting: { sp: 5, sb: 0, sd: 0 } }),
    schedule({ scheduleId: 's2', actionType: 'Campaign Generation', scheduleRuns: 5, launched: { sp: 0, sb: 0, sd: 3 } }),
    schedule({ scheduleId: 's3', actionType: 'Cyber Minigun', scheduleRuns: 190, launched: { sp: 40, sb: 0, sd: 0 }, targeting: { sp: 0, sb: 0, sd: 12 } }),
  ]

  it('sums each action type and orders the ring by size', () => {
    expect(scheduleActionMix(rows, 'scheduleRuns')).toEqual([
      { name: 'Cyber Minigun（CMG）', value: 190 },
      { name: '竞价优化', value: 10 },
      { name: '广告活动生成（CG）', value: 5 },
    ])
  })

  it('counts created entities across the whole split', () => {
    expect(scheduleActionMix(rows, 'campaignsCreated')).toEqual([
      { name: 'Cyber Minigun（CMG）', value: 40 },
      { name: '竞价优化', value: 3 },
      { name: '广告活动生成（CG）', value: 3 },
    ])
  })

  it('drops the action types that created nothing of that kind', () => {
    // Bid Optimization only targets here (5) and Cyber Minigun only targets (12).
    expect(scheduleActionMix(rows, 'targetingsCreated')).toEqual([
      { name: 'Cyber Minigun（CMG）', value: 12 },
      { name: '竞价优化', value: 5 },
    ])
    expect(scheduleActionMix([schedule()], 'campaignsCreated')).toEqual([])
  })
})

describe('toggleTrendMetric', () => {
  it('adds a metric and removes it again', () => {
    expect(toggleTrendMetric(['adSpend'], 'adSales')).toEqual(['adSpend', 'adSales'])
    expect(toggleTrendMetric(['adSpend', 'adSales'], 'adSpend')).toEqual(['adSales'])
  })

  it('lets the last metric go, so the row can reach an empty selection', () => {
    expect(toggleTrendMetric(['adSpend'], 'adSpend')).toEqual([])
    expect(toggleTrendMetric([], 'adSpend')).toEqual(['adSpend'])
  })

  it('ignores a metric past the cap but returns a fresh list', () => {
    const selected = ['adSpend', 'adSales', 'acos', 'cpc']
    const next = toggleTrendMetric(selected, 'cvr')
    expect(next).toEqual(selected)
    // A refused click still has to re-render: the browser has already flipped the
    // checkbox, and Vue only writes `checked` back when the bound value changed.
    expect(next).not.toBe(selected)
  })

  it('honours an explicit cap', () => {
    expect(toggleTrendMetric(['acos'], 'cpc', 1)).toEqual(['acos'])
    expect(toggleTrendMetric(['acos', 'cpc'], 'cvr', 2)).toEqual(['acos', 'cpc'])
  })
})

describe('actionLabel', () => {
  it('translates the known action types and keeps the unknown ones', () => {
    expect(actionLabel('Keyword Harvesting')).toBe('关键词收割（KH）')
    expect(actionLabel('Budget Optimization')).toBe('预算优化')
    expect(actionLabel('Something New')).toBe('Something New')
  })
})
