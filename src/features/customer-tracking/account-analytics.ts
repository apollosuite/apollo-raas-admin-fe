import type { Organization, Split, Status } from './types'

/**
 * What the Accounts page reports, and who it is about.
 *
 * The export holds two populations in one list: 3,640 organizations of which 3,480 are
 * trials, and 3,493 had no spend at all in the window. Averaging those into a health
 * number produced a ring that said "96% churned" while the paying book was 63% healthy -
 * true of accounts, useless as a business statement. Everything here therefore describes
 * the *paying* book (non-trial, spend > 0) and reports what it left out instead of quietly
 * redefining the total.
 */

/** The plan name that marks a trial in this export. */
export const TRIAL_PLAN = '试用版'

/** The health ladder, best to worst; every chart and caption reads it in this order. */
export const STATUS_ORDER: readonly Status[] = ['Healthy', 'Moderate', 'At Risk', 'Churned']

function num(value: unknown): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** SP + SB + SD, because the page is about Amazon's ad revenue as one number. */
export function spendOf(org: Organization): number {
  return splitTotal(org.adSpendSplit)
}

export function splitTotal(value: Partial<Split> | null | undefined): number {
  return num(value?.sp) + num(value?.sb) + num(value?.sd)
}

export interface ManagedBook {
  /** The accounts every number on the page is about. */
  managed: Organization[]
  /** What was left out, and why - shown, not hidden. */
  excluded: { trial: number, noSpend: number }
}

/**
 * The paying book: not a trial, and it actually spent in the window.
 *
 * A non-trial account with no spend is onboarded but idle - a real churn signal, so it is
 * counted out loud rather than dropped silently.
 */
export function managedBook(orgs: readonly Organization[]): ManagedBook {
  const nonTrial = orgs.filter(org => org.plan !== TRIAL_PLAN)
  return {
    managed: nonTrial.filter(org => spendOf(org) > 0),
    excluded: {
      trial: orgs.length - nonTrial.length,
      noSpend: nonTrial.filter(org => spendOf(org) <= 0).length,
    },
  }
}

export interface StatusRow {
  status: Status
  orgs: number
  spend: number
}

/** Organizations and spend per health state, in ladder order. */
export function statusBreakdown(orgs: readonly Organization[]): StatusRow[] {
  return STATUS_ORDER.map((status) => {
    const rows = orgs.filter(org => org.status === status)
    return { status, orgs: rows.length, spend: rows.reduce((sum, org) => sum + spendOf(org), 0) }
  })
}

/** One slice of a donut. */
export interface Slice {
  name: string
  value: number
}

/**
 * The health ladder as a 100% split of *spend* - Amazon's revenue, which is the unit the
 * audience for this page reads. Counts travel in the caption, so one bar is enough.
 */
export function statusSpendShares(rows: readonly StatusRow[]): Slice[] {
  const total = rows.reduce((sum, row) => sum + row.spend, 0)
  if (total <= 0)
    return []
  return rows
    .filter(row => row.spend > 0)
    .map(row => ({ name: row.status, value: row.spend / total * 100 }))
}

/** The one line that says what the bar means, with both units. */
export function statusCaption(rows: readonly StatusRow[]): string {
  const total = rows.reduce((sum, row) => sum + row.spend, 0)
  if (total <= 0)
    return '该区间内没有在管广告花费。'
  return rows
    .filter(row => row.spend > 0)
    .map(row => `${row.status} ${(row.spend / total * 100).toFixed(1)}%（${row.orgs} 个账号）`)
    .join(' · ')
}

/**
 * One slice of the status rose: two variables in one shape.
 *
 * A single donut cannot carry both "how many accounts are in this state" and "how much of
 * the money sits there" - and the two diverge, which is the interesting part. So the
 * angular width is the account share and the outer radius is the spend share: a state with
 * few accounts but heavy spend bulges out past its neighbours. Both shares are of the
 * paying book, so the shape is comparable between ranges.
 */
export interface StatusRadialSlice {
  status: Status
  orgs: number
  spend: number
  /** Share of the book's accounts, 0-1. Drives the slice's angular width. */
  orgShare: number
  /** Share of the book's spend, 0-1. Drives how far the slice protrudes. */
  spendShare: number
  /** Radians, clockwise from 12 o'clock. */
  startAngle: number
  endAngle: number
  /** Polar radii in the chart's own units, not pixels. */
  innerRadius: number
  outerRadius: number
}

/** The donut hole, in radius units. */
export const RADIAL_HOLE = 0.42
/** Where a state with no spend would sit. */
export const RADIAL_BASE = 0.72
/** How far the heaviest state protrudes past the base. */
export const RADIAL_SPAN = 0.46
/** The radius axis maximum, so the furthest slice still has room to breathe. */
export const RADIAL_MAX = 1.24
/** Radians of separation between neighbouring slices. */
const RADIAL_GAP = 0.02

export function statusRadialSlices(rows: readonly StatusRow[]): StatusRadialSlice[] {
  const kept = rows.filter(row => row.orgs > 0)
  const orgs = kept.reduce((sum, row) => sum + row.orgs, 0)
  const spend = kept.reduce((sum, row) => sum + row.spend, 0)
  if (orgs === 0)
    return []
  // Protrusion is relative to the heaviest state rather than to an absolute share, so the
  // biggest spender always reads as the furthest out whatever the range looks like.
  const heaviest = Math.max(...kept.map(row => row.spend))
  let cursor = -Math.PI / 2
  return kept.map((row) => {
    const orgShare = row.orgs / orgs
    const spendShare = spend > 0 ? row.spend / spend : 0
    const span = orgShare * Math.PI * 2
    const slice: StatusRadialSlice = {
      status: row.status,
      orgs: row.orgs,
      spend: row.spend,
      orgShare,
      spendShare,
      startAngle: cursor + RADIAL_GAP / 2,
      endAngle: cursor + span - RADIAL_GAP / 2,
      innerRadius: RADIAL_HOLE,
      outerRadius: RADIAL_BASE + RADIAL_SPAN * (heaviest > 0 ? row.spend / heaviest : 0),
    }
    cursor += span
    return slice
  })
}

/** The sentence that makes a two-variable shape readable without hovering anything. */
export function statusRadialCaption(rows: readonly StatusRow[]): string {
  const slices = statusRadialSlices(rows)
  if (!slices.length)
    return '该区间内没有在管账号。'
  const parts = slices.map(slice =>
    `${slice.status} ${slice.orgs} 个（${(slice.orgShare * 100).toFixed(1)}%）占花费 ${(slice.spendShare * 100).toFixed(1)}%`,
  )
  return `角度＝组织数量占比，外凸程度＝广告花费占比。${parts.join(' · ')}`
}

export interface ScaleSummary {
  advertisers: number
  spend: number
  spendByProduct: { sp: number, sb: number, sd: number }
  profilesEnabled: number
  adsAccountsEnabled: number
  subAccountsEnabled: number
  chats: number
  optimizationEvents: number
  scheduleRuns: number
  campaignsLaunched: number
  /** Share of the window's spend held by the ten biggest advertisers, 0-100. */
  top10Share: number
}

/** The scale of what we run on Amazon's behalf: money first, then the machinery behind it. */
export function scaleSummary(orgs: readonly Organization[]): ScaleSummary {
  const spendByProduct = { sp: 0, sb: 0, sd: 0 }
  let spend = 0
  let profilesEnabled = 0
  let adsAccountsEnabled = 0
  let subAccountsEnabled = 0
  let chats = 0
  let optimizationEvents = 0
  let scheduleRuns = 0
  let campaignsLaunched = 0
  const perOrg: number[] = []
  for (const org of orgs) {
    const own = spendOf(org)
    perOrg.push(own)
    spend += own
    spendByProduct.sp += num(org.adSpendSplit?.sp)
    spendByProduct.sb += num(org.adSpendSplit?.sb)
    spendByProduct.sd += num(org.adSpendSplit?.sd)
    profilesEnabled += num(org.profConn?.[0])
    adsAccountsEnabled += num(org.adsConn?.[0])
    subAccountsEnabled += num(org.subConn?.[0])
    chats += num(org.chats)
    optimizationEvents += num(org.optimizationEvents)
    scheduleRuns += num(org.scheduleRuns)
    campaignsLaunched += splitTotal(org.launched)
  }
  const ranked = [...perOrg].sort((a, b) => b - a)
  const top10 = ranked.slice(0, 10).reduce((sum, value) => sum + value, 0)
  return {
    advertisers: orgs.length,
    spend,
    spendByProduct,
    profilesEnabled,
    adsAccountsEnabled,
    subAccountsEnabled,
    chats,
    optimizationEvents,
    scheduleRuns,
    campaignsLaunched,
    top10Share: spend > 0 ? top10 / spend * 100 : 0,
  }
}

/**
 * The accounts to call about: the biggest spenders in a given health state.
 *
 * Ranked by money rather than by name, because the page's whole point for this audience is
 * how much Amazon revenue sits behind each name.
 */
export function topBySpend(orgs: readonly Organization[], status: Status | undefined, top = 10): Slice[] {
  return orgs
    .filter(org => !status || org.status === status)
    .map(org => ({ name: org.name, value: spendOf(org) }))
    .filter(slice => slice.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, top)
}
