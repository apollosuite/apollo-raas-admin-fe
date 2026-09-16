/**
 * Chart shaping for the Performance pages.
 *
 * Everything here is a pure function over (a) the two server aggregates the
 * schedule page pulls - attribution and first touch - and (b) the schedule rows
 * already held in DuckDB. Keeping the arithmetic out of the page component means
 * the numbers can be asserted in a unit test instead of eyeballed in a chart, and
 * the page only decides layout.
 *
 * The first-touch comparison is deliberately expressed per campaign-day: the
 * "after" window of a campaign first touched late in the selected range is
 * truncated, so raw bucket totals would compare 7 days against 2. Campaign-days
 * are the only denominator that is honest for both sides.
 */

import type { PerfDailyPoint, PerfSchedule, Split } from './types'

export type AttributionSegment = 'this_action' | 'other_actions' | 'untouched'
export type CompositionMetric = 'ad_spend' | 'ad_sales' | 'ad_orders' | 'impressions' | 'clicks' | 'campaigns'

/** One row of the server attribution aggregate (segment x ad product x profile). */
export interface AttributionRow {
  amazon_profile_id: string
  sponsored_ads_type: string
  segment: AttributionSegment
  campaigns: number
  impressions: number
  clicks: number
  ad_orders: number
  ad_spend: number
  ad_sales: number
}

export type FirstTouchBucket = 'before' | 'after'

/** One row of the server first-touch aggregate (bucket x profile). */
export interface FirstTouchRow {
  amazon_profile_id: string
  bucket: FirstTouchBucket
  campaigns: number
  /** Campaign-days in the bucket; the denominator that makes the sides comparable. */
  campaign_days: number
  impressions: number
  clicks: number
  ad_orders: number
  ad_spend: number
  ad_sales: number
}

/** The composition metrics the donut can switch between, in menu order. */
export const COMPOSITION_METRICS: readonly { key: CompositionMetric, label: string }[] = [
  { key: 'ad_spend', label: '广告花费' },
  { key: 'ad_sales', label: '广告销售额' },
  { key: 'ad_orders', label: '广告订单' },
  { key: 'impressions', label: '曝光量' },
  { key: 'clicks', label: '点击量' },
  { key: 'campaigns', label: '广告活动数' },
]

const SEGMENT_ORDER: readonly AttributionSegment[] = ['this_action', 'other_actions', 'untouched']

/**
 * Internal vocabulary: a campaign is either managed by one of our schedules or it
 * is unmanaged. The three segments are the two managed cases plus the baseline,
 * not a different taxonomy.
 */
export const SEGMENT_LABEL: Record<AttributionSegment, string> = {
  this_action: '本功能管理',
  other_actions: '其他功能管理',
  untouched: '未管理',
}

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Sum one numeric field across rows, treating anything unparsable as 0. */
function sum<T>(rows: readonly T[], key: keyof T): number {
  let total = 0
  for (const row of rows)
    total += num(row[key])
  return total
}

function addSplit(target: Split, source: Split): void {
  target.sp += num(source?.sp)
  target.sb += num(source?.sb)
  target.sd += num(source?.sd)
}

function zeroSplit(): Split {
  return { sp: 0, sb: 0, sd: 0 }
}

/**
 * `SPONSORED_PRODUCTS` -> `SP`. The lakehouse view spells ad products out while
 * the app abbreviates them; this is the only place the two meet.
 */
export function adProductLabel(value: unknown): string {
  switch (String(value ?? '').toUpperCase()) {
    case 'SPONSORED_PRODUCTS':
    case 'SP':
      return 'SP'
    case 'SPONSORED_BRANDS':
    case 'SB':
      return 'SB'
    case 'SPONSORED_DISPLAY':
    case 'SD':
      return 'SD'
    default:
      return 'Other'
  }
}

// ---------------------------------------------------------------------------
// Chart 1 - account composition: how much of the account our schedules touch
// ---------------------------------------------------------------------------

export function segmentTotals(rows: readonly AttributionRow[], metric: CompositionMetric): Record<AttributionSegment, number> {
  const totals: Record<AttributionSegment, number> = { this_action: 0, other_actions: 0, untouched: 0 }
  for (const row of rows) {
    if (SEGMENT_ORDER.includes(row.segment))
      totals[row.segment] += num(row[metric])
  }
  return totals
}

/** Donut data for one metric, in business order, with empty slices dropped. */
export function compositionSeries(rows: readonly AttributionRow[], metric: CompositionMetric): { name: string, value: number }[] {
  const totals = segmentTotals(rows, metric)
  return SEGMENT_ORDER
    .map(segment => ({ name: SEGMENT_LABEL[segment], value: totals[segment] }))
    .filter(slice => slice.value > 0)
}

export interface CompositionShare {
  /** Share of the whole account held by this action's campaigns, 0-100. */
  share: number
  part: number
  total: number
  totals: Record<AttributionSegment, number>
}

export function compositionShare(rows: readonly AttributionRow[], metric: CompositionMetric): CompositionShare {
  const totals = segmentTotals(rows, metric)
  const total = totals.this_action + totals.other_actions + totals.untouched
  return { share: total > 0 ? totals.this_action / total * 100 : 0, part: totals.this_action, total, totals }
}

// ---------------------------------------------------------------------------
// Chart 3 - efficiency: ACoS of the managed campaigns vs the unmanaged ones
// ---------------------------------------------------------------------------

export interface EfficiencyTable {
  categories: string[]
  /**
   * A `null` value means "no spend or no sales", i.e. ACoS is undefined for that
   *  segment: a gap in the chart, never a 0% bar that reads as perfect efficiency.
   */
  series: { name: string, values: (number | null)[] }[]
  /** Campaign counts per category per segment, in the same order as `categories`. */
  counts: Record<AttributionSegment, number>[]
  /** Categories with no campaign at all are dropped rather than drawn as 0 ACoS. */
  empty: boolean
}

/**
 * ACoS by ad product for the campaigns this action manages, the campaigns other
 * schedules manage, and the unmanaged baseline.
 *
 * The campaign count travels with every bar because an ACoS over 12 campaigns is
 * not the same claim as one over 12,000, and the honest reading of this chart is
 * "our segment is not cheaper per dollar of sales" - the value story is the
 * within-campaign before/after comparison, not this cross-section.
 */
export function efficiencyByAdProduct(rows: readonly AttributionRow[]): EfficiencyTable {
  const products = ['SP', 'SB', 'SD']
  const acc = new Map<string, { spend: number, sales: number, campaigns: number }>()
  for (const row of rows) {
    const product = adProductLabel(row.sponsored_ads_type)
    if (!products.includes(product))
      continue
    const key = `${product}|${row.segment}`
    const cell = acc.get(key) ?? { spend: 0, sales: 0, campaigns: 0 }
    cell.spend += num(row.ad_spend)
    cell.sales += num(row.ad_sales)
    cell.campaigns += num(row.campaigns)
    acc.set(key, cell)
  }

  const used = products.filter(p => SEGMENT_ORDER.some(s => (acc.get(`${p}|${s}`)?.campaigns ?? 0) > 0))
  const acos = (product: string, segment: AttributionSegment): number | null => {
    const cell = acc.get(`${product}|${segment}`)
    // A segment with campaigns but no spend or no sales has no ACoS. Returning 0
    // would draw it as the most efficient bar on the chart.
    if (!cell || cell.spend <= 0 || cell.sales <= 0)
      return null
    return cell.spend / cell.sales * 100
  }
  const count = (product: string, segment: AttributionSegment) => acc.get(`${product}|${segment}`)?.campaigns ?? 0

  return {
    categories: used.map(product => `${product}\n已管理 ${count(product, 'this_action').toLocaleString('en-US')} · 未管理 ${count(product, 'untouched').toLocaleString('en-US')}`),
    series: SEGMENT_ORDER.map(segment => ({ name: SEGMENT_LABEL[segment], values: used.map(product => acos(product, segment)) })),
    counts: used.map(product => ({ this_action: count(product, 'this_action'), other_actions: count(product, 'other_actions'), untouched: count(product, 'untouched') })),
    empty: used.length === 0,
  }
}

// ---------------------------------------------------------------------------
// Chart 4 - first touch: each campaign against itself, before vs after
// ---------------------------------------------------------------------------

export interface BucketMetrics {
  campaigns: number
  campaignDays: number
  adSpend: number
  adSales: number
  adOrders: number
  impressions: number
  clicks: number
  acos: number
  cvr: number
  cpc: number
  spendPerCampaignDay: number
  salesPerCampaignDay: number
  ordersPerCampaignDay: number
}

export interface FirstTouchSummary {
  windowDays: number
  campaigns: number
  before: BucketMetrics
  after: BucketMetrics
}

/**
 * One side of the first-touch comparison.
 *
 * `campaignDays` is the denominator everything else is divided by: a campaign-day is
 * one campaign observed on one day, so 40 campaigns over a 7-day window contribute
 * at most 280 campaign-days. The per-day figures are therefore "the average campaign
 * on an average day of the window" — the only form in which a before window (always
 * complete) and an after window (cut short for late touches) are comparable.
 */
function bucketMetrics(rows: readonly FirstTouchRow[], bucket: FirstTouchBucket): BucketMetrics {
  const selected = rows.filter(row => row.bucket === bucket)
  const adSpend = sum(selected, 'ad_spend')
  const adSales = sum(selected, 'ad_sales')
  const adOrders = sum(selected, 'ad_orders')
  const clicks = sum(selected, 'clicks')
  const campaignDays = sum(selected, 'campaign_days')
  return {
    campaigns: sum(selected, 'campaigns'),
    campaignDays,
    adSpend,
    adSales,
    adOrders,
    impressions: sum(selected, 'impressions'),
    clicks,
    acos: adSales > 0 ? adSpend / adSales * 100 : 0,
    cvr: clicks > 0 ? adOrders / clicks * 100 : 0,
    cpc: clicks > 0 ? adSpend / clicks : 0,
    spendPerCampaignDay: campaignDays > 0 ? adSpend / campaignDays : 0,
    salesPerCampaignDay: campaignDays > 0 ? adSales / campaignDays : 0,
    ordersPerCampaignDay: campaignDays > 0 ? adOrders / campaignDays : 0,
  }
}

export function firstTouchSummary(rows: readonly FirstTouchRow[], windowDays: number): FirstTouchSummary {
  const before = bucketMetrics(rows, 'before')
  const after = bucketMetrics(rows, 'after')
  // The same campaigns appear in both buckets, so the campaign count is the
  // larger side rather than the sum (a truncated window can lose a campaign).
  return { windowDays, campaigns: Math.max(before.campaigns, after.campaigns), before, after }
}

// ---------------------------------------------------------------------------
// Chart 2 - what the schedules actually did
// ---------------------------------------------------------------------------

/**
 * Stable identifiers for the activity counters. Callers look counters up by these,
 * never by `label`: the labels are display text and a stale string quietly yields 0.
 */
export type ActivityCounterKey
  = | 'schedules'
    | 'scheduleRuns'
    | 'optimizationEvents'
    | 'bidsOptimized'
    | 'budgetsOptimized'
    | 'placementsOptimized'
    | 'campaignsCreated'
    | 'adGroupsCreated'
    | 'targetingsCreated'

export interface ActivityCounter {
  key: ActivityCounterKey
  label: string
  value: number
}

/**
 * The activity counters in one unit (events), so they can share a single axis.
 * `schedules` is included because it is the denominator a reader needs first.
 */
export function activityCounters(schedules: readonly PerfSchedule[]): ActivityCounter[] {
  const total = (pick: (s: PerfSchedule) => unknown) => schedules.reduce((n, s) => n + num(pick(s)), 0)
  const splitTotal = (pick: (s: PerfSchedule) => Split | undefined) =>
    schedules.reduce((n, s) => n + num(pick(s)?.sp) + num(pick(s)?.sb) + num(pick(s)?.sd), 0)
  return [
    { key: 'schedules', label: '调度数', value: schedules.length },
    { key: 'scheduleRuns', label: '调度运行次数', value: total(s => s.scheduleRuns) },
    { key: 'optimizationEvents', label: '优化事件数', value: total(s => s.optimizationEvents) },
    { key: 'bidsOptimized', label: '竞价优化数', value: total(s => s.bidsOptimized) },
    { key: 'budgetsOptimized', label: '预算优化数', value: total(s => s.budgetsOptimized) },
    { key: 'placementsOptimized', label: '版位优化数', value: total(s => s.placementsOptimized) },
    { key: 'campaignsCreated', label: '新建活动数', value: splitTotal(s => s.launched) },
    { key: 'adGroupsCreated', label: '新建广告组数', value: splitTotal(s => s.adGroups) },
    { key: 'targetingsCreated', label: '新建定向数', value: splitTotal(s => s.targeting) },
  ]
}

/**
 * Chinese display names for the action types, which the lakehouse exports in English.
 *
 * Defined here (and re-exported by `mock.ts` for the callers that predate it) because
 * charts read it: a chart legend is reader-facing text, and the action cell only ever
 * showed the same strings.
 */
export const actionCn: Record<string, string> = { 'Bid Optimization': '竞价优化', 'Budget Optimization': '预算优化', 'Placement Optimization': '版位优化', 'Budget Dayparting': '预算分时', 'Goal-Based Optimization': '目标优化', 'GoalBased Bid Optimization': '目标竞价优化', 'Keyword Harvesting': '关键词收割', 'Campaign Generation': '广告活动生成', 'Cyber Minigun': 'Cyber Minigun' }

/** The short form a reader uses for the three actions that create entities. */
const ACTION_ABBREVIATION: Record<string, string> = {
  'Cyber Minigun': 'CMG',
  'Campaign Generation': 'CG',
  'Keyword Harvesting': 'KH',
}

/** Display name for one action type: its Chinese name, plus the abbreviation if it has one. */
export function actionLabel(action: string): string {
  const name = actionCn[action] || action
  const abbreviation = ACTION_ABBREVIATION[action]
  return abbreviation ? `${name}（${abbreviation}）` : name
}

/** What one of the three action-type pies counts. */
export type ScheduleActionMetric = 'scheduleRuns' | 'campaignsCreated' | 'targetingsCreated'

/** The counters the action pies read, so each pie names the same thing it measures. */
export const SCHEDULE_ACTION_METRIC_LABEL: Record<ScheduleActionMetric, string> = {
  scheduleRuns: '按动作类型的调度运行次数',
  campaignsCreated: '按动作类型的新建活动数（CMG/CG/KH）',
  targetingsCreated: '按动作类型的新建定向数（CMG/CG/KH）',
}

/**
 * One slice per action type: what that action's schedules did over the range.
 *
 * Summing the rows rather than counting schedules is what makes the three pies
 * comparable - a single Cyber Minigun schedule can run hundreds of times and create
 * hundreds of campaigns. Action types that produced nothing of the requested kind are
 * dropped, so the created-entity pies show exactly the actions that create entities
 * instead of padding the ring with zero-weight slices.
 */
export function scheduleActionMix(schedules: readonly PerfSchedule[], metric: ScheduleActionMetric): { name: string, value: number }[] {
  const splitTotal = (split: Split | undefined) => num(split?.sp) + num(split?.sb) + num(split?.sd)
  const totals = new Map<string, number>()
  for (const schedule of schedules) {
    const action = schedule.actionType || 'Unknown'
    const value = metric === 'scheduleRuns'
      ? num(schedule.scheduleRuns)
      : splitTotal(metric === 'campaignsCreated' ? schedule.launched : schedule.targeting)
    totals.set(action, (totals.get(action) ?? 0) + value)
  }
  return [...totals.entries()]
    .filter(([, value]) => value > 0)
    .map(([action, value]) => ({ name: actionLabel(action), value }))
    .sort((a, b) => b.value - a.value)
}

/** Schedule health at a glance: how many schedules sit in each lifecycle state. */
export function scheduleStatusBreakdown(schedules: readonly PerfSchedule[]): { name: string, value: number }[] {
  const counts = new Map<string, number>()
  for (const schedule of schedules) {
    const key = schedule.status || 'UNKNOWN'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
}

// ---------------------------------------------------------------------------
// Trend line: which daily metrics a reader can plot, and how each one formats
// ---------------------------------------------------------------------------

export interface TrendMetric {
  /** Key on the daily row, and the series name in the chart. */
  key: string
  label: string
  currency?: boolean
  percent?: boolean
}

/**
 * The daily metrics the trend chart offers, in menu order. The currency measures
 * lead because a spend/sales trend is the first thing a reviewer looks at; the
 * rates follow because they share no unit with them.
 */
export const DAILY_TREND_METRICS: readonly TrendMetric[] = [
  { key: 'adSpend', label: '广告花费', currency: true },
  { key: 'adSales', label: '广告销售额', currency: true },
  { key: 'acos', label: 'ACoS', percent: true },
  { key: 'adOrders', label: '广告订单' },
  { key: 'impressions', label: '曝光量' },
  { key: 'clicks', label: '点击量' },
  { key: 'cpc', label: 'CPC', currency: true },
  { key: 'cvr', label: 'CVR', percent: true },
  { key: 'scheduleRuns', label: '调度运行次数' },
  { key: 'optimizationEvents', label: '优化事件数' },
  { key: 'bidsOptimized', label: '竞价优化数' },
  { key: 'budgetsOptimized', label: '预算优化数' },
  { key: 'placementsOptimized', label: '版位优化数' },
  { key: 'campaignsCreated', label: '新建活动数' },
]

/** The pair a trend opens on: it shares a unit, so one axis still reads true. */
export const DEFAULT_TREND_METRICS: readonly string[] = ['adSpend', 'adSales']

/** How many metrics one trend can plot at once. */
export const MAX_TREND_METRICS = 4

/**
 * Apply one click in the trend's metric row, returning the next selection.
 *
 * Unchecking is always honoured, including down to none (the card then asks for a
 * metric instead of drawing one). Checking stops at `max`.
 *
 * A refused change still returns a *new* array: the caller stores it, which re-renders
 * the row. That matters because the browser has already flipped the checkbox by the
 * time the handler runs, and Vue only writes `checked` back when the bound value
 * changed - so a silently ignored click used to leave the row showing a selection the
 * chart did not have.
 */
export function toggleTrendMetric(selected: readonly string[], key: string, max = MAX_TREND_METRICS): string[] {
  if (selected.includes(key))
    return selected.filter(item => item !== key)
  return selected.length >= max ? [...selected] : [...selected, key]
}

/**
 * Aggregate (profile, date) fact rows into one chart point per date.
 *
 * Two properties matter here. Aggregating in the browser is what lets the trend
 * follow a table filter: the caller passes only the rows whose profile survived the
 * filter, so the chart is a real cross-filter rather than a fixed picture. And the
 * rates are computed per day *after* summing: an ACoS over the whole range is one
 * number, and a trend drawn from it would be a flat line.
 */
export function dailySeries(rows: readonly Record<string, unknown>[]): PerfDailyPoint[] {
  const byDate = new Map<string, PerfDailyPoint>()
  for (const row of rows) {
    const date = String(row.date ?? '')
    if (!date)
      continue
    let point = byDate.get(date)
    if (!point) {
      point = {
        date,
        adSpend: 0,
        adSales: 0,
        adOrders: 0,
        impressions: 0,
        clicks: 0,
        acos: 0,
        cpc: 0,
        cvr: 0,
        scheduleRuns: 0,
        optimizationEvents: 0,
        bidsOptimized: 0,
        budgetsOptimized: 0,
        placementsOptimized: 0,
        campaignsCreated: 0,
      }
      byDate.set(date, point)
    }
    point.adSpend += num(row.spAdSpend) + num(row.sbAdSpend) + num(row.sdAdSpend)
    point.adSales += num(row.adSales)
    point.adOrders += num(row.adOrders)
    point.impressions += num(row.impressions)
    point.clicks += num(row.clicks)
    point.scheduleRuns += num(row.scheduleRuns)
    point.optimizationEvents += num(row.optimizationEvents)
    point.bidsOptimized += num(row.bidsOptimized)
    point.budgetsOptimized += num(row.budgetsOptimized)
    point.placementsOptimized += num(row.placementsOptimized)
    point.campaignsCreated += num(row.spCampaignsCreated) + num(row.sbCampaignsCreated) + num(row.sdCampaignsCreated)
  }
  return [...byDate.values()]
    .map((point) => {
      // The ratios are taken on the summed day, never averaged from daily ratios.
      point.acos = point.adSales > 0 ? point.adSpend / point.adSales * 100 : 0
      point.cpc = point.clicks > 0 ? point.adSpend / point.clicks : 0
      point.cvr = point.clicks > 0 ? point.adOrders / point.clicks * 100 : 0
      return point
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

// L1 roll-up: one row per action type
// ---------------------------------------------------------------------------

export interface PerfScheduleRollup {
  action: string
  type: string
  schedules: number
  active: number
  failed: number
  runs: number
  optimizationEvents: number
  launched: Split
  adGroups: Split
  targeting: Split
}

/** Statuses that mean the schedule is still doing work on a cadence. */
const ACTIVE_STATUS = 'ACTIVE'

/**
 * Collapse the schedule rows to one row per action type. The L1 Performance page
 * shows this so a reviewer can see which action carries the account before
 * drilling into a single schedule at L2.
 */
export function scheduleRollup(schedules: readonly PerfSchedule[]): PerfScheduleRollup[] {
  const groups = new Map<string, PerfScheduleRollup>()
  for (const schedule of schedules) {
    const action = schedule.actionType || 'Unknown'
    let group = groups.get(action)
    if (!group) {
      group = {
        action,
        type: schedule.actionCategory || 'Unknown',
        schedules: 0,
        active: 0,
        failed: 0,
        runs: 0,
        optimizationEvents: 0,
        launched: zeroSplit(),
        adGroups: zeroSplit(),
        targeting: zeroSplit(),
      }
      groups.set(action, group)
    }
    group.schedules += 1
    if (schedule.status === ACTIVE_STATUS)
      group.active += 1
    if (schedule.status === 'FAILED')
      group.failed += 1
    group.runs += num(schedule.scheduleRuns)
    group.optimizationEvents += num(schedule.optimizationEvents)
    addSplit(group.launched, schedule.launched)
    addSplit(group.adGroups, schedule.adGroups)
    addSplit(group.targeting, schedule.targeting)
  }
  return [...groups.values()].sort((a, b) => b.runs - a.runs)
}
