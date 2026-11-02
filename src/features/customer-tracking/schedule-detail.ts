/**
 * The Performance L3 detail page's arithmetic.
 *
 * Two clocks run on this page and they are not the same one:
 *
 * - **Performance** reads the 30 complete days ending two days ago. The stats tables
 *   are updated with a lag, and a half-ingested "today" would drag every rate in the
 *   page down without saying so.
 * - **Change log** starts on the same day but runs through *now*. A schedule's most
 *   interesting run is usually the latest one, and a change is an event with a
 *   timestamp rather than a measurement of a day.
 *
 * Keeping the two windows here (and not in the component) means the rule is a pure
 * function with a test, and the dates printed on the page are the dates the queries
 * actually asked for.
 */

import type { DateRange } from './filter-context'

import { eachDay } from './values'

export type ScheduleFamily = 'bid' | 'budget' | 'placement' | 'launch'
export type PlacementKey = 'tos' | 'ros' | 'pp'

const FAMILY_BY_ACTION: Record<string, ScheduleFamily> = {
  'Bid Optimization': 'bid',
  // A goal-based bid schedule edits the same targetings and leaves the same log;
  // only its bid rule differs, so the page is the same page.
  'GoalBased Bid Optimization': 'bid',
  'Budget Optimization': 'budget',
  'Placement Optimization': 'placement',
  'Campaign Generation': 'launch',
  'Cyber Minigun': 'launch',
  'Keyword Harvesting': 'launch',
}

/** `null` for an action type this page has no contract for; never a guess. */
export function scheduleFamily(actionType: string): ScheduleFamily | null {
  return FAMILY_BY_ACTION[actionType] ?? null
}

/** Only a bid schedule records targeting-level performance. */
export function hasTargeting(actionType: string): boolean {
  return scheduleFamily(actionType) === 'bid'
}

/** Only bid / budget / placement schedules leave a change log. */
export function hasChangelog(actionType: string): boolean {
  const family = scheduleFamily(actionType)
  return family === 'bid' || family === 'budget' || family === 'placement'
}

/** Whole-day arithmetic on ISO dates, anchored at UTC noon so no zone shifts a day. */
export function shiftIsoDay(iso: string, days: number): string {
  const start = new Date(`${iso}T12:00:00Z`).getTime()
  if (Number.isNaN(start))
    return iso
  return new Date(start + days * 86_400_000).toISOString().slice(0, 10)
}

export interface ScheduleWindows {
  performance: DateRange
  changelog: DateRange
}

/**
 * The two windows, from the operator's local "today".
 *
 * `T-31 … T-2` is 30 inclusive days, so the page never prints a 31-day range and
 * calls it a month. The change log reuses the same start (the runs that produced the
 * first day of performance are context for it) and ends today.
 */
export function scheduleWindows(today: string): ScheduleWindows {
  const from = shiftIsoDay(today, -31)
  return {
    performance: { from, to: shiftIsoDay(today, -2) },
    changelog: { from, to: today },
  }
}

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

export interface ScheduleCampaign {
  campaignId: string
  campaignName: string
  state: string
  budget: number | null
  targets: number
  daysActive: number
  impressions: number
  clicks: number
  adOrders: number
  adSpend: number
  adSales: number
}

export interface ScheduleTargeting {
  campaignId: string
  campaignName: string
  adgroupId: string
  targetId: string
  targetExpression: string
  matchType: string
  impressions: number
  clicks: number
  adOrders: number
  adSpend: number
  adSales: number
}

export interface ScheduleDailyPoint {
  date: string
  campaigns: number
  targets: number
  impressions: number
  clicks: number
  adOrders: number
  adSpend: number
  adSales: number
  /** `null` when the denominator cannot support the ratio - never a fake 0%. */
  acos: number | null
  cpc: number | null
  cvr: number | null
}

function num(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function ratio(part: number, whole: number, scale = 1): number | null {
  return whole > 0 ? part / whole * scale : null
}

export interface CampaignTotals {
  campaigns: number
  targets: number
  impressions: number
  clicks: number
  adOrders: number
  adSpend: number
  adSales: number
  acos: number | null
  cpc: number | null
  cvr: number | null
}

/** The window's totals, read from the same campaign rows the table shows. */
export function campaignTotals(rows: readonly ScheduleCampaign[]): CampaignTotals {
  const totals: CampaignTotals = {
    campaigns: rows.length,
    targets: 0,
    impressions: 0,
    clicks: 0,
    adOrders: 0,
    adSpend: 0,
    adSales: 0,
    acos: null,
    cpc: null,
    cvr: null,
  }
  for (const row of rows) {
    totals.targets += num(row.targets)
    totals.impressions += num(row.impressions)
    totals.clicks += num(row.clicks)
    totals.adOrders += num(row.adOrders)
    totals.adSpend += num(row.adSpend)
    totals.adSales += num(row.adSales)
  }
  totals.acos = ratio(totals.adSpend, totals.adSales, 100)
  totals.cpc = ratio(totals.adSpend, totals.clicks)
  totals.cvr = ratio(totals.adOrders, totals.clicks, 100)
  return totals
}

/**
 * The daily series, zero-filled across the window.
 *
 * A missing day is a real zero for spend/orders, so it belongs on the axis; a trend
 * that skips weekends makes a flat week look like a spike. The rates follow the same
 * rule - `null`, not 0, when there is nothing to divide by.
 */
export function dailyPoints(rows: readonly ScheduleDailyPoint[], window: DateRange): ScheduleDailyPoint[] {
  const byDate = new Map(rows.map(row => [String(row.date), row]))
  return eachDay(window.from, window.to).map((date) => {
    const row = byDate.get(date)
    const spend = num(row?.adSpend)
    const sales = num(row?.adSales)
    const clicks = num(row?.clicks)
    const orders = num(row?.adOrders)
    return {
      date,
      campaigns: num(row?.campaigns),
      targets: num(row?.targets),
      impressions: num(row?.impressions),
      clicks,
      adOrders: orders,
      adSpend: spend,
      adSales: sales,
      acos: ratio(spend, sales, 100),
      cpc: ratio(spend, clicks),
      cvr: ratio(orders, clicks, 100),
    }
  })
}

export interface Coverage {
  /** First and last day that actually carry rows ('' when the window has none). */
  first: string
  last: string
  /** How many days of the window have no source rows. */
  emptyDays: number
  /** The window's last day is not covered: print the source's own last day instead. */
  endsEarly: boolean
}

/**
 * How much of the window the source actually covers.
 *
 * The lakehouse lags, and the page must say "10-02 → 10-30" rather than "the last 30
 * days" when the last two days simply are not there yet. It deliberately does not
 * explain *why* a day is missing: a schedule created mid-window and an ingest delay
 * look identical from here, and guessing would be worse than the fact.
 */
export function coverage(rows: readonly ScheduleDailyPoint[], window: DateRange): Coverage {
  const days = eachDay(window.from, window.to)
  const present = new Set(rows.map(row => String(row.date)))
  const dates = days.filter(day => present.has(day))
  return {
    first: dates[0] ?? '',
    last: dates[dates.length - 1] ?? '',
    emptyDays: days.length - dates.length,
    endsEarly: dates.length > 0 && dates[dates.length - 1] !== window.to,
  }
}

// ---------------------------------------------------------------------------
// Change log
// ---------------------------------------------------------------------------

export interface ChangelogRun {
  runTime: string
  /** Rows the run wrote, including the evaluations it decided not to change. */
  logged: number
  changes: number
  entities: number
  raised: number
  lowered: number
  /** Median absolute move of the run, as a percentage of the old value. */
  medianAbsPct: number | null
  ppChanges: number
  tosChanges: number
  rosChanges: number
}

export interface PlacementMove {
  key: PlacementKey
  label: string
  old: number | null
  new: number | null
  /** True when both sides parse and differ; the same rule the server counts with. */
  changed: boolean
}

export interface ChangelogChange {
  runTime: string
  campaignId?: string | null
  campaignName?: string | null
  targetId?: string | null
  targetExpression?: string | null
  matchType?: string | null
  targetType?: string | null
  sponsoredAdsType?: string | null
  oldValue?: number | null
  newValue?: number | null
  placements?: PlacementMove[]
}

const PLACEMENT_LABEL: Record<PlacementKey, string> = { tos: 'TOS', ros: 'ROS', pp: 'PP' }

/** The three placements in the order Amazon ranks them: top of search first. */
export function placementMoves(row: {
  tosOld?: number | null
  tosNew?: number | null
  rosOld?: number | null
  rosNew?: number | null
  ppOld?: number | null
  ppNew?: number | null
}): PlacementMove[] {
  // Written out rather than keyed by a template literal: the three pairs have
  // different names on purpose in the source table, and a dynamic lookup would let
  // two of them collapse into one silently.
  const pairs: [PlacementKey, number | null | undefined, number | null | undefined][] = [
    ['tos', row.tosOld, row.tosNew],
    ['ros', row.rosOld, row.rosNew],
    ['pp', row.ppOld, row.ppNew],
  ]
  return pairs.map(([key, oldValue, newValue]) => {
    const old = oldValue ?? null
    const next = newValue ?? null
    return {
      key,
      label: PLACEMENT_LABEL[key],
      old,
      new: next,
      changed: old !== null && next !== null && old !== next,
    }
  })
}

export interface ChangeDelta {
  old: number
  new: number
  delta: number
  /** Percentage of the old value; `null` when the old value was 0. */
  pct: number | null
}

/** The signed move of a one-value change, or `null` if either side is missing. */
export function changeDelta(change: Pick<ChangelogChange, 'oldValue' | 'newValue'>): ChangeDelta | null {
  const old = change.oldValue
  const next = change.newValue
  if (old === null || old === undefined || next === null || next === undefined)
    return null
  const delta = next - old
  return { old, new: next, delta, pct: old > 0 ? delta / old * 100 : null }
}

export interface RatedRow {
  acos: number | null
  cpc: number | null
  cvr: number | null
}

/**
 * Attach the derived rates to a row so the table can sort and filter on them.
 *
 * Derived from the row's own sums, never from a mean of means: a table sorted by
 * ACoS must order campaigns by the ratio of their totals, not by an average of daily
 * ratios. The table's column set is shared with every other table in the tool, which
 * is why the rates live on the row rather than in a custom cell.
 */
export function withRates<T extends { adSpend: number, adSales: number, clicks: number, adOrders: number }>(row: T): T & RatedRow {
  return {
    ...row,
    acos: ratio(num(row.adSpend), num(row.adSales), 100),
    cpc: ratio(num(row.adSpend), num(row.clicks)),
    cvr: ratio(num(row.adOrders), num(row.clicks), 100),
  }
}

export interface ChangelogTotals {
  runs: number
  changes: number
  raised: number
  lowered: number
  /** Rows evaluated by the runs, including the ones that ended up unchanged. */
  logged: number
  /**
   * Executions that ran but moved nothing.
   *
   * Not a footnote: a schedule that evaluates 52 campaigns a day and changes none of
   * them for a month is the finding, and 31 empty rows in the ledger need one number
   * at the top to say so.
   */
  unchangedRuns: number
  averageChanges: number
  busiest: ChangelogRun | null
  latest: ChangelogRun | null
}

/** The strip above the ledger. Aggregates sums only; per-run medians stay per run. */
export function changelogTotals(runs: readonly ChangelogRun[]): ChangelogTotals {
  let changes = 0
  let raised = 0
  let lowered = 0
  let logged = 0
  let unchangedRuns = 0
  let busiest: ChangelogRun | null = null
  for (const run of runs) {
    changes += num(run.changes)
    raised += num(run.raised)
    lowered += num(run.lowered)
    logged += num(run.logged)
    if (num(run.changes) === 0)
      unchangedRuns++
    if (!busiest || num(run.changes) > num(busiest.changes))
      busiest = run
  }
  return {
    runs: runs.length,
    changes,
    raised,
    lowered,
    logged,
    unchangedRuns,
    averageChanges: runs.length ? Math.round(changes / runs.length) : 0,
    busiest,
    latest: runs[0] ?? null,
  }
}

/**
 * The magnitude bar's width, as a percentage of the busiest run.
 *
 * A run with one change still has to be visible next to a run with 5,500, or the
 * ledger reads as "nothing happened" for every quiet execution. Hence the 3% floor:
 * it is a legibility floor, not a measurement, and the exact count sits beside it.
 */
export function runBarPercent(changes: number, maxChanges: number): number {
  const value = num(changes)
  if (value <= 0)
    return 0
  if (maxChanges <= 0)
    return 3
  return Math.max(3, Math.min(100, value / maxChanges * 100))
}

/** `+12.4%` / `-3.0%` / `—`; the sign belongs to the reader's question "which way". */
export function formatSignedPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return '—'
  const rounded = Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(1)
  return `${value > 0 ? '+' : ''}${rounded}%`
}

/** `1,284` with grouping; the ledger's counts are read as exact numbers. */
export function formatCount(value: number): string {
  return num(value).toLocaleString('en-US')
}

/**
 * The two parts of a run's timestamp, split without a date library.
 *
 * The lakehouse hands back `2026-11-02 09:33:57` in the schedule's own zone, and
 * re-parsing it into a Date would reinterpret it as UTC and shift the clock by the
 * browser's offset - the one number in the ledger that must not move.
 */
export function runDay(runTime: string): string {
  return String(runTime ?? '').slice(5, 10)
}

export function runClock(runTime: string): string {
  return String(runTime ?? '').slice(11, 16)
}
