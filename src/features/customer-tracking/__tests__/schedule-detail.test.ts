import { describe, expect, it } from 'vitest'

import type { ChangelogRun, ScheduleCampaign, ScheduleDailyPoint } from '../schedule-detail'

import {
  campaignTotals,
  changeDelta,
  changelogTotals,
  coverage,
  dailyPoints,
  formatSignedPct,
  hasChangelog,
  hasTargeting,
  placementMoves,
  runBarPercent,
  runDays,
  scheduleFamily,
  scheduleWindows,
  shiftIsoDay,
} from '../schedule-detail'

function campaign(overrides: Partial<ScheduleCampaign> = {}): ScheduleCampaign {
  return {
    campaignId: 'c1',
    campaignName: 'Campaign',
    state: 'DELIVERING',
    budget: 10,
    targets: 0,
    daysActive: 30,
    impressions: 0,
    clicks: 0,
    adOrders: 0,
    adSpend: 0,
    adSales: 0,
    ...overrides,
  }
}

function run(overrides: Partial<ChangelogRun> = {}): ChangelogRun {
  return {
    runTime: '2026-11-02 09:33:57',
    logged: 100,
    changes: 100,
    entities: 100,
    raised: 80,
    lowered: 20,
    medianAbsPct: 1,
    ppChanges: 0,
    tosChanges: 0,
    rosChanges: 0,
    ...overrides,
  }
}

describe('scheduleWindows', () => {
  it('reads 30 complete days, ending two days before today', () => {
    const windows = scheduleWindows('2026-11-02')
    expect(windows.performance).toEqual({ from: '2026-10-02', to: '2026-10-31' })
    // Same start, through today: the latest run is the one an operator opens for.
    expect(windows.changelog).toEqual({ from: '2026-10-02', to: '2026-11-02' })
  })

  it('crosses a month and a year boundary without drifting', () => {
    expect(scheduleWindows('2026-03-01').performance).toEqual({ from: '2026-01-29', to: '2026-02-27' })
    expect(scheduleWindows('2027-01-01').performance).toEqual({ from: '2026-12-01', to: '2026-12-30' })
  })

  it('shifts whole days, ignoring a DST transition in the operator zone', () => {
    expect(shiftIsoDay('2026-03-29', 1)).toBe('2026-03-30')
    expect(shiftIsoDay('2026-03-29', -1)).toBe('2026-03-28')
  })
})

describe('action families', () => {
  it('maps the two bid variants to the same page', () => {
    expect(scheduleFamily('Bid Optimization')).toBe('bid')
    expect(scheduleFamily('GoalBased Bid Optimization')).toBe('bid')
    expect(scheduleFamily('Budget Optimization')).toBe('budget')
    expect(scheduleFamily('Placement Optimization')).toBe('placement')
    expect(scheduleFamily('Cyber Minigun')).toBe('launch')
    expect(scheduleFamily('Something New')).toBeNull()
  })

  it('offers targeting rows and a change log only where the source has them', () => {
    expect(hasTargeting('Bid Optimization')).toBe(true)
    expect(hasTargeting('GoalBased Bid Optimization')).toBe(true)
    expect(hasTargeting('Budget Optimization')).toBe(false)

    expect(hasChangelog('Bid Optimization')).toBe(true)
    expect(hasChangelog('Budget Optimization')).toBe(true)
    expect(hasChangelog('Placement Optimization')).toBe(true)
    expect(hasChangelog('Campaign Generation')).toBe(false)
    expect(hasChangelog('Keyword Harvesting')).toBe(false)
  })
})

describe('campaignTotals', () => {
  it('sums the window and derives the rates from the sums, not from row averages', () => {
    const totals = campaignTotals([
      campaign({ adSpend: 100, adSales: 400, clicks: 50, adOrders: 10, impressions: 1000, targets: 3 }),
      campaign({ adSpend: 300, adSales: 600, clicks: 150, adOrders: 20, impressions: 3000, targets: 5 }),
    ])
    expect(totals.campaigns).toBe(2)
    expect(totals.targets).toBe(8)
    expect(totals.adSpend).toBe(400)
    expect(totals.adSales).toBe(1000)
    expect(totals.acos).toBe(40)
    expect(totals.cpc).toBe(2)
    expect(totals.cvr).toBe(15)
  })

  it('leaves a rate undefined when the denominator cannot support it', () => {
    const totals = campaignTotals([campaign({ adSpend: 25, adSales: 0, clicks: 0 })])
    // 0% ACoS would read as perfect efficiency; there were no sales at all.
    expect(totals.acos).toBeNull()
    expect(totals.cpc).toBeNull()
    expect(totals.cvr).toBeNull()
  })

  it('is empty rather than NaN for no rows', () => {
    const totals = campaignTotals([])
    expect(totals.campaigns).toBe(0)
    expect(totals.adSpend).toBe(0)
    expect(totals.acos).toBeNull()
  })
})

describe('dailyPoints', () => {
  const window = { from: '2026-10-02', to: '2026-10-04' }

  it('fills a missing day with zeros instead of dropping it from the axis', () => {
    const rows: ScheduleDailyPoint[] = [{
      date: '2026-10-02',
      campaigns: 2,
      targets: 4,
      impressions: 100,
      clicks: 10,
      adOrders: 2,
      adSpend: 20,
      adSales: 100,
      acos: 20,
      cpc: 2,
      cvr: 20,
    }]
    const points = dailyPoints(rows, window)
    expect(points.map(point => point.date)).toEqual(['2026-10-02', '2026-10-03', '2026-10-04'])
    expect(points[1]).toMatchObject({ adSpend: 0, adSales: 0, campaigns: 0 })
    // A day with no data has no ACoS, which is different from a 0% ACoS.
    expect(points[1].acos).toBeNull()
    expect(points[0].acos).toBe(20)
    expect(points[0].cpc).toBe(2)
  })

  it('recomputes the rates per day after summing', () => {
    const rows: ScheduleDailyPoint[] = [{
      date: '2026-10-03',
      campaigns: 1,
      targets: 0,
      impressions: 10,
      clicks: 4,
      adOrders: 1,
      adSpend: 30,
      adSales: 120,
      acos: 0,
      cpc: 0,
      cvr: 0,
    }]
    const point = dailyPoints(rows, window)[1]
    expect(point.acos).toBe(25)
    expect(point.cpc).toBe(7.5)
    expect(point.cvr).toBe(25)
  })
})

describe('coverage', () => {
  const window = { from: '2026-10-02', to: '2026-10-31' }

  it('reports the source’s own last day when the ingest has not caught up', () => {
    const rows = [
      { date: '2026-10-02' },
      { date: '2026-10-03' },
    ] as ScheduleDailyPoint[]
    const result = coverage(rows, window)
    expect(result.first).toBe('2026-10-02')
    expect(result.last).toBe('2026-10-03')
    expect(result.endsEarly).toBe(true)
    expect(result.emptyDays).toBe(28)
  })

  it('says the window is covered only when its last day carries rows', () => {
    const result = coverage([{ date: '2026-10-31' }] as ScheduleDailyPoint[], window)
    expect(result.endsEarly).toBe(false)
    expect(result.last).toBe('2026-10-31')
  })

  it('handles a window with no rows at all', () => {
    expect(coverage([], window)).toEqual({ first: '', last: '', emptyDays: 30, endsEarly: false })
  })
})

describe('changelogTotals', () => {
  it('sums the runs and points at the busiest one, newest first for "latest"', () => {
    const totals = changelogTotals([
      run({ runTime: '2026-11-02 09:00:00', changes: 10, raised: 8, lowered: 2, logged: 12 }),
      run({ runTime: '2026-11-01 09:00:00', changes: 50, raised: 40, lowered: 10, logged: 50 }),
    ])
    expect(totals.runs).toBe(2)
    expect(totals.changes).toBe(60)
    expect(totals.raised).toBe(48)
    expect(totals.lowered).toBe(12)
    expect(totals.logged).toBe(62)
    expect(totals.unchangedRuns).toBe(0)
    expect(totals.averageChanges).toBe(30)
    expect(totals.busiest?.runTime).toBe('2026-11-01 09:00:00')
    expect(totals.latest?.runTime).toBe('2026-11-02 09:00:00')
  })

  it('counts a run that evaluated rows but changed nothing as unchanged', () => {
    const totals = changelogTotals([
      run({ changes: 0, raised: 0, lowered: 0, logged: 52 }),
      run({ changes: 0, raised: 0, lowered: 0, logged: 69 }),
      run({ changes: 1, raised: 0, lowered: 1, logged: 69 }),
    ])
    expect(totals.unchangedRuns).toBe(2)
    expect(totals.changes).toBe(1)
    expect(totals.logged).toBe(190)
  })

  it('survives a schedule that has not run in the window', () => {
    expect(changelogTotals([])).toMatchObject({ runs: 0, changes: 0, busiest: null, latest: null })
  })
})

describe('runDays', () => {
  const window = { from: '2026-10-02', to: '2026-10-04' }

  it('collapses several runs on one day and sums their changes', () => {
    const days = runDays([
      run({ runTime: '2026-10-02 09:00:00', changes: 10 }),
      run({ runTime: '2026-10-02 17:00:00', changes: 5 }),
      run({ runTime: '2026-10-03 09:00:00', changes: 0 }),
    ], window)
    expect(days).toEqual([
      { date: '2026-10-02', runs: 2, changes: 15 },
      // A run that changed nothing is still a day the schedule ran.
      { date: '2026-10-03', runs: 1, changes: 0 },
    ])
  })

  it('drops runs outside the performance window', () => {
    const days = runDays([
      run({ runTime: '2026-10-01 23:00:00' }),
      run({ runTime: '2026-10-04 23:00:00' }),
      run({ runTime: '2026-10-05 09:00:00' }),
    ], window)
    expect(days.map(day => day.date)).toEqual(['2026-10-04'])
  })

  it('is empty when the schedule never ran in the window', () => {
    expect(runDays([], window)).toEqual([])
  })
})

describe('runBarPercent', () => {
  it('scales against the busiest run and keeps a single change visible', () => {
    expect(runBarPercent(0, 100)).toBe(0)
    expect(runBarPercent(100, 100)).toBe(100)
    expect(runBarPercent(50, 100)).toBe(50)
    // A quiet run next to a 5,500-change run still has to show something.
    expect(runBarPercent(1, 5500)).toBe(3)
  })

  it('never exceeds the track', () => {
    expect(runBarPercent(200, 100)).toBe(100)
  })
})

describe('changeDelta', () => {
  it('signs the move and expresses it against the old value', () => {
    const delta = changeDelta({ oldValue: 0.99, newValue: 1 })
    expect(delta?.delta).toBeCloseTo(0.01, 6)
    expect(delta?.pct).toBeCloseTo(1.01, 2)
    expect(changeDelta({ oldValue: 2, newValue: 1 })?.pct).toBe(-50)
  })

  it('refuses to invent a percentage against a zero base', () => {
    expect(changeDelta({ oldValue: 0, newValue: 5 })?.pct).toBeNull()
    expect(changeDelta({ oldValue: null, newValue: 5 })).toBeNull()
    expect(changeDelta({ oldValue: 5, newValue: null })).toBeNull()
  })
})

describe('placementMoves', () => {
  it('marks only fields the schedule actually set and moved', () => {
    const moves = placementMoves({ tosOld: 20, tosNew: 30, rosOld: 20, rosNew: null, ppOld: 0, ppNew: null })
    expect(moves.map(move => move.label)).toEqual(['TOS', 'ROS', 'PP'])
    expect(moves[0]).toMatchObject({ changed: true, old: 20, new: 30 })
    // An empty new value is "not set", not a cut to zero.
    expect(moves[1].changed).toBe(false)
    expect(moves[2].changed).toBe(false)
    expect(moves[1].new).toBeNull()
  })

  it('does not call an equal value a change', () => {
    const moves = placementMoves({ tosOld: 30, tosNew: 30 })
    expect(moves[0].changed).toBe(false)
  })
})

describe('formatSignedPct', () => {
  it('carries the direction and never prints a fake number', () => {
    expect(formatSignedPct(1.0101)).toBe('+1.0%')
    expect(formatSignedPct(-50)).toBe('-50.0%')
    expect(formatSignedPct(0)).toBe('0.0%')
    expect(formatSignedPct(null)).toBe('—')
    expect(formatSignedPct(Number.NaN)).toBe('—')
  })
})
