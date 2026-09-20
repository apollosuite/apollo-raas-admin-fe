/**
 * Chart and table shaping for the Agent Analytics pages.
 *
 * Pure functions over the rows the queries return, so the rules that are easy to get
 * subtly wrong - the usage distribution, the Top-N tail, the adoption matrix, the
 * success rate, the 100% daily stack - are asserted in a unit test instead of eyeballed
 * in a chart.
 */

import type { AgentOrgProfileStat, AgentToolDailyRow } from './types'

import { eachDay } from './values'

/** One slice of a donut. */
export interface Slice {
  name: string
  value: number
}

/**
 * The `top` heaviest rows by value, with the tail folded into "Others".
 *
 * A ring of 259 tools or 599 organizations is unreadable and the tail is not what a
 * reviewer reads; folding it keeps the proportions honest because "Others" is drawn at
 * its real total rather than dropped.
 */
export function topNWithOthers<T>(
  rows: readonly T[],
  valueOf: (row: T) => number,
  nameOf: (row: T) => string,
  top = 10,
): Slice[] {
  const sorted = [...rows].sort((a, b) => valueOf(b) - valueOf(a))
  const slices = sorted.slice(0, top).map(row => ({ name: nameOf(row), value: valueOf(row) }))
  const rest = sorted.slice(top).reduce((n, row) => n + valueOf(row), 0)
  if (rest > 0)
    slices.push({ name: 'Others', value: rest })
  return slices.filter(slice => slice.value > 0)
}

/** success / calls as a percentage; with no calls there is no rate to report. */
export function successRate(successes: number, calls: number): number {
  return calls > 0 ? successes / calls * 100 : 0
}

/** The key the roll-up and the distinct-tool counts are merged on. */
export function orgProfileKey(orgId: string, amazonProfileId: string | null): string {
  return `${orgId}|${amazonProfileId ?? ''}`
}

/**
 * Attach the distinct tool count to each roll-up row.
 *
 * The count cannot be summed out of the roll-up (it is a per-day figure) and a SQL
 * join on the profile id would silently drop the organization-level rows, where the
 * profile is empty; a merged lookup on the same key treats "no profile" as a value.
 */
export function withToolsUsed(
  rows: readonly AgentOrgProfileStat[],
  tools: readonly { orgId: string, amazonProfileId: string | null, toolsUsed: number }[],
): AgentOrgProfileStat[] {
  const byKey = new Map(tools.map(entry => [orgProfileKey(entry.orgId, entry.amazonProfileId), entry.toolsUsed]))
  return rows.map(row => ({ ...row, toolsUsed: byKey.get(orgProfileKey(row.orgId, row.amazonProfileId)) ?? 0 }))
}

/**
 * A 100% stacked bar per day: how one tool's calls split across organizations.
 *
 * The heaviest `top` organizations over the range get their own band and the tail is
 * folded into "Others", then every day is normalized to 100% - so a quiet day and a
 * busy day both show composition instead of one hiding under the other.
 */
export function dailyOrgShares(
  rows: readonly AgentToolDailyRow[],
  top = 10,
): { categories: string[], series: { name: string, values: number[] }[] } {
  const totals = new Map<string, number>()
  for (const row of rows)
    totals.set(row.org, (totals.get(row.org) ?? 0) + row.calls)
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([org]) => org)
  const named = new Set(ranked.slice(0, top))
  const buckets = [...ranked.slice(0, top)]
  if (ranked.length > top)
    buckets.push('Others')
  const categories = [...new Set(rows.map(row => row.date))].sort()
  const perDay = new Map<string, Map<string, number>>()
  for (const row of rows) {
    const day = perDay.get(row.date) ?? new Map<string, number>()
    const bucket = named.has(row.org) ? row.org : 'Others'
    day.set(bucket, (day.get(bucket) ?? 0) + row.calls)
    perDay.set(row.date, day)
  }
  const series = buckets.map(bucket => ({
    name: bucket,
    values: categories.map((date) => {
      const day = perDay.get(date)
      const total = [...(day?.values() ?? [])].reduce((n, v) => n + v, 0)
      return total > 0 ? (day?.get(bucket) ?? 0) / total * 100 : 0
    }),
  }))
  return { categories, series }
}

// ---------------------------------------------------------------------------
// Distribution views
//
// The usage data has no head: over 30 days the biggest single organization holds
// 4.3% of the tool calls and the top ten hold 33%, so a part-to-whole chart draws two
// thirds of itself as "Others" and says nothing. A reviewer needs the *shape* of the
// distribution and the outliers inside it - that is what the helpers below produce.
// ---------------------------------------------------------------------------

/** Bands a usage histogram is read in; the zero band is kept so the bars sum to the orgs. */
const USAGE_BANDS: readonly { name: string, min: number, max: number }[] = [
  { name: '0', min: 0, max: 0 },
  { name: '1–5', min: 1, max: 5 },
  { name: '6–20', min: 6, max: 20 },
  { name: '21–100', min: 21, max: 100 },
  { name: '101–500', min: 101, max: 500 },
  { name: '500+', min: 501, max: Number.POSITIVE_INFINITY },
]

/**
 * How many entities fall in each usage band.
 *
 * "Is usage concentrated?" is not answered by a slice of a ring: on the current export
 * most organizations sit between 21 and 500 calls, which means there is no whale to
 * name and the page should stop implying one.
 */
export function usageBuckets(values: readonly number[]): Slice[] {
  return USAGE_BANDS.map(band => ({
    name: band.name,
    value: values.filter(value => value >= band.min && value <= band.max).length,
  }))
}

/**
 * Sum rows into one bucket per key.
 *
 * The tables are deliberately finer than the charts above them - an organization's tool
 * table is one row per (tool, sub account, profile) - so a chart that charts by sub
 * account has to aggregate first. Feeding it the table rows directly drew the same sub
 * account once per tool and profile, and its "top 12" was a top 12 of *combinations*:
 * 252 sub accounts for an organization that has a handful.
 */
export function rollupBy<T>(
  rows: readonly T[],
  keyOf: (row: T) => string,
  labelOf: (row: T) => string,
  valueOf: (row: T) => number,
): { key: string, name: string, value: number }[] {
  const byKey = new Map<string, { key: string, name: string, value: number }>()
  for (const row of rows) {
    const key = keyOf(row)
    const cell = byKey.get(key) ?? { key, name: labelOf(row), value: 0 }
    cell.value += valueOf(row)
    byKey.set(key, cell)
  }
  return [...byKey.values()]
}

/**
 * A ranked list plus an explicit account of everything it left out.
 *
 * The caller prints the tail as a sentence ("Top 15 = 48% · 另有 105 个组织") instead of
 * drawing it as a grey slice, so the chart never hides two thirds of the data.
 */
export function rankWithTail<T>(
  rows: readonly T[],
  valueOf: (row: T) => number,
  nameOf: (row: T) => string,
  top = 15,
): { slices: Slice[], tailCount: number, tailValue: number, total: number, topShare: number } {
  const sorted = [...rows].sort((a, b) => valueOf(b) - valueOf(a))
  const total = sorted.reduce((n, row) => n + valueOf(row), 0)
  const kept = sorted.slice(0, top)
  const topValue = kept.reduce((n, row) => n + valueOf(row), 0)
  return {
    slices: kept.map(row => ({ name: nameOf(row), value: valueOf(row) })).filter(slice => slice.value > 0),
    tailCount: Math.max(0, sorted.length - top),
    tailValue: Math.max(0, total - topValue),
    total,
    topShare: total > 0 ? topValue / total * 100 : 0,
  }
}

/** One tool's usage inside one organization, before it is rolled up per tool. */
export interface ToolPairRow {
  tool: string
  orgId: string
  calls: number
  activeDays: number
}

/** One tool's adoption: how widely it is used, how deeply, and how it fails. */
export interface ToolAdoption {
  tool: string
  /** Organizations that called it: breadth says "people tried it". */
  orgs: number
  calls: number
  /** Calls per using organization: depth says whether they kept going. */
  callsPerOrg: number
  /** Median active days per (org, tool) pair: did they come back after the first day? */
  medianActiveDays: number
}

/** The middle value; exported because the adoption matrix draws it as a reference line. */
export function medianOf(values: readonly number[]): number {
  if (!values.length)
    return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * The adoption matrix: breadth against depth, per tool.
 *
 * A tool used by 60 organizations three times each is a different product decision
 * from one used by three organizations six hundred times, and the call total alone
 * cannot tell them apart - the pair of numbers is the whole story.
 */
export function toolAdoption(pairs: readonly ToolPairRow[]): ToolAdoption[] {
  const byTool = new Map<string, ToolPairRow[]>()
  for (const pair of pairs)
    byTool.set(pair.tool, [...byTool.get(pair.tool) ?? [], pair])
  return [...byTool.entries()].map(([tool, rows]) => {
    const calls = rows.reduce((n, row) => n + row.calls, 0)
    const orgs = new Set(rows.map(row => row.orgId)).size
    return {
      tool,
      orgs,
      calls,
      callsPerOrg: orgs > 0 ? calls / orgs : 0,
      medianActiveDays: medianOf(rows.map(row => row.activeDays)),
    }
  })
}

/**
 * How many (organization, tool) pairs came back after the first day.
 *
 * The closest thing to "do users like it" that the export can answer: a tool everyone
 * tries once and abandons shows up as a mass in the first bucket even when its call
 * count is high.
 */
export function repeatBuckets(pairs: readonly ToolPairRow[]): Slice[] {
  return [
    { name: '只用过 1 天', value: pairs.filter(pair => pair.activeDays <= 1).length },
    { name: '2–4 天', value: pairs.filter(pair => pair.activeDays >= 2 && pair.activeDays <= 4).length },
    { name: '≥5 天', value: pairs.filter(pair => pair.activeDays >= 5).length },
  ]
}

// ---------------------------------------------------------------------------
// Trend
// ---------------------------------------------------------------------------

/** One day on the trend chart, with the days nobody called filled in as zeros. */
export interface TrendDay {
  date: string
  calls: number
  orgs: number
  profiles: number
}

/**
 * Every day from `from` to `to` inclusive; the chart's x axis is the range, not the data.
 *
 * Kept as its own export because the Agent trend tests name it, but the walk itself lives
 * in `values.ts` now, so both trend charts enumerate days the same way.
 */
export function daysBetween(from: string, to: string): string[] {
  return eachDay(from, to)
}

/**
 * The range's days, in order, with the tool's own rows merged onto them.
 *
 * The export only carries days the tool was actually called, so a quiet day arrived as
 * no row at all* and was drawn as a missing bar - indistinguishable from a gap in the
 * data. Zero-filling turns "nobody used it today" into the visible fact it is.
 */
export function fillTrendDays(rows: readonly TrendDay[], from: string, to: string): TrendDay[] {
  const byDate = new Map(rows.map(row => [row.date, row]))
  return daysBetween(from, to).map(date => byDate.get(date) ?? { date, calls: 0, orgs: 0, profiles: 0 })
}

/** What the trend says in a sentence: the peak, the quiet days, and the busiest span. */
export function trendSummary(days: readonly TrendDay[]): {
  peakCalls: number
  peakDate: string
  quietDays: number
  daysWithUse: number
  maxOrgs: number
} {
  const used = days.filter(day => day.calls > 0)
  const peak = used.reduce<TrendDay | undefined>((best, day) => (!best || day.calls > best.calls ? day : best), undefined)
  return {
    peakCalls: peak?.calls ?? 0,
    peakDate: peak?.date ?? '',
    quietDays: days.length - used.length,
    daysWithUse: used.length,
    maxOrgs: days.reduce((max, day) => Math.max(max, day.orgs), 0),
  }
}

/** A point of the intensity scatter: how much one profile used, over how many days. */
export interface UsageIntensity {
  orgId: string
  organization: string
  profile: string
  calls: number
  activeDays: number
  callsPerDay: number
}

/**
 * Calls against active days, per profile, with the reference quantiles.
 *
 * The diagonal is what "normal" looks like - a profile that calls more simply does so
 * over more days - so the outliers worth finding are the points sitting far above it:
 * heavy use squeezed into one or two days. The quantiles give the chart its reference
 * band, because "abnormal" is only meaningful against the population.
 */
export function usageIntensity(
  rows: readonly { orgId: string, organization: string, profile: string, calls: number, activeDays: number }[],
): { points: UsageIntensity[], p50: number, p95: number } {
  const points = rows
    .filter(row => row.calls > 0 && row.activeDays > 0)
    .map(row => ({ ...row, callsPerDay: row.calls / row.activeDays }))
  const perDay = points.map(point => point.callsPerDay).sort((a, b) => a - b)
  const at = (q: number) => perDay.length ? perDay[Math.min(perDay.length - 1, Math.floor(perDay.length * q))] : 0
  return { points, p50: at(0.5), p95: at(0.95) }
}
