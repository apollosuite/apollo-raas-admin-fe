/**
 * The action categories the schedules dim uses, and the one thing that decides which
 * half of the metrics applies.
 *
 * An *optimisation* schedule changes bids, budgets and placements on campaigns that
 * already exist; a *campaign launch* schedule creates campaigns, ad groups and
 * targetings and never optimises anything. Both the table columns and the charts read
 * these, so they live with the shared vocabulary rather than in either of them.
 */
export const OPTIMIZATION_CATEGORY = 'Optimization'
export const LAUNCH_CATEGORY = 'Campaign Launch'

export type TrackingPage = 'accounts' | 'account-detail' | 'performance' | 'profile' | 'schedules' | 'agent' | 'agent-profile' | 'tool-profiles'
export type RangeKey = '7d' | '30d' | '90d'
export type Status = 'Healthy' | 'Moderate' | 'At Risk' | 'Churned'

/**
 * The value shape a column holds, which decides three things at once: how the
 * cell renders, how it sorts, and which filter predicates it offers.
 *
 * Deliberately per-column, not per-key: `targeting` is a `split` in the profile
 * table but a plain `number` in the launch tables, so the type has to travel
 * with the column definition rather than being looked up by name.
 */
export type ColumnType
  /** Names, ids, free text. */
  = | 'text'
  /** A closed set of labels from the data (marketplace, role, action, status…). */
    | 'enum'
  /** Connected / Disconnected. */
    | 'connection'
  /** On / Off. */
    | 'boolean'
  /** Counts and other plain numbers. */
    | 'number'
  /** Money; rendered compact (K/M) with the exact amount on hover. */
    | 'currency'
  /** A 0–100 percentage. */
    | 'percent'
  /** A day, stored as an ISO date string. */
    | 'date'
  /** A moment, stored as an ISO timestamp string. */
    | 'timestamp'
  /** `{ sp, sb, sd }`; sorts and filters by the total. */
    | 'split'
  /** `[enabled, total]`; not sortable, filterable by total/enabled/coverage. */
    | 'ratioTuple'
  /** `string[]`; not sortable, filterable by any/all. */
    | 'list'

/** `[key, label, type]` — the single source of truth for sorting and filtering. */
export type ColumnSpec = readonly [key: string, label: string, type: ColumnType]

export type FilterOperator
  = | 'isEmpty'
    | 'isNotEmpty'
  // text
    | 'contains'
    | 'notContains'
    | 'equals'
    | 'notEquals'
    | 'startsWith'
    | 'endsWith'
  // numeric (also used on split totals / ratioTuple metrics)
    | 'eq'
    | 'neq'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'between'
    | 'notBetween'
  // date
    | 'on'
    | 'before'
    | 'after'
  // enum / connection
    | 'isAnyOf'
    | 'isNoneOf'
  // boolean
    | 'isTrue'
    | 'isFalse'
  // list
    | 'containsAny'
    | 'containsAll'

/**
 * One committed filter condition. `values` holds a single value, or two for the
 * `between` / `notBetween` operators, or the whole selected set for
 * `isAnyOf` / `isNoneOf`.
 */
export interface ColumnFilter {
  key: string
  operator: FilterOperator
  values: string[]
  /** `split` columns only: which series to compare. Defaults to the total. */
  series?: 'total' | 'sp' | 'sb' | 'sd'
  /** `ratioTuple` columns only: which metric to compare. Defaults to the total. */
  metric?: 'total' | 'enabled' | 'coverage'
}

export interface Split { sp: number, sb: number, sd: number }
export interface Organization {
  orgId: string
  name: string
  plan: string
  status: Status
  joined: string
  lastActive: string
  renewal: string
  adsConn: [number, number]
  profConn: [number, number]
  subConn: [number, number]
  ams: [number, number]
  sp: [number, number]
  adSpend: number
  adSpendSplit: Split
  chats: number
  optimizationEvents: number
  scheduleRuns: number
  launched: Split
}
export interface AdsAccount {
  amazonAdsAccountId: string
  orgId: string
  name: string
  profiles: [number, number]
  ams: [number, number]
  adSpendSplit: Split
  chats: number
  optimizationEvents: number
  scheduleRuns: number
  launched: Split
}
export interface SubAccount {
  subAccountId: string
  orgId: string
  name: string
  role: string
  lastActive: string
  adsAccess: [number, number]
  profileAccess: [number, number]
  chats: number
  optimizationEvents: number
  scheduleRuns: number
  launched: Split
}
export interface Profile {
  amazonProfileId: string
  name: string
  marketplace: string
  entity: string
  organization: string
  orgId: string
  plan: string
  connectedAt: string
  adsApi: boolean
  amsApi: boolean
  spApi: boolean
  adSpend: number
  adSales: number
  acos: number
  tacos: number
  adOrders: number
  impressions: number
  clicks: number
  cpc: number
  cvr: number
  scheduleRuns: number
  activeSchedules: number
  optimizationEvents: number
  bidsOptimized: number
  budgetsOptimized: number
  placementsOptimized: number
  chats: number
  launched: Split
  targeting: Split
}
/**
 * A row of the Performance L1 profile table.
 *
 * Comes from the page/level OSS export (performance_l1_profiles_dim joined to
 * performance_l1_profiles_fact), not the legacy 'profiles' dataset. The dim holds
 * one row per (profile, org) pair, so a profile serving several orgs appears once
 * per org - by design, since profile<->org is many-to-many.
 */
export interface PerfProfile {
  orgId: string
  organization: string
  amazonProfileId: string
  name: string
  entity: string
  marketplace: string
  plan: string
  connectedAt: string
  adsApi: string
  amsApi: string
  spApi: string
  activeSchedules: number
  adSpendSplit: Split
  adSales: number
  acos: number
  tacos: number
  adOrders: number
  impressions: number
  clicks: number
  cpc: number
  cvr: number
  scheduleRuns: number
  optimizationEvents: number
  bidsOptimized: number
  budgetsOptimized: number
  placementsOptimized: number
  launched: Split
  targeting: Split
}

/**
 * One day of the Performance trend series.
 *
 * Derived from performance_l1_profiles_fact for the page's date range, scoped to
 * every profile on the L1 page or to one profile on the L2 profile page. The
 * derived rates are computed per day, which is what a trend line needs: an ACoS
 * over the whole range would be a flat line by construction.
 */
export interface PerfDailyPoint {
  /**
   * The trend chart plots whichever metrics the reader picks, so it addresses them by
   * key at runtime; the index signature is what lets a daily point be handed to it
   * without a cast.
   */
  [metric: string]: number | string
  date: string
  /** SP + SB + SD, because a spend trend is only interesting as a total. */
  adSpend: number
  adSales: number
  adOrders: number
  impressions: number
  clicks: number
  acos: number
  cpc: number
  cvr: number
  scheduleRuns: number
  optimizationEvents: number
  bidsOptimized: number
  budgetsOptimized: number
  placementsOptimized: number
  campaignsCreated: number
}

/**
 * One schedule of the Performance L2 schedule table, aggregated over the
 * selected range from performance_l2_schedules_{dim,fact}.
 */
export interface PerfSchedule {
  scheduleId: string
  scheduleName: string
  actionType: string
  actionCategory: string
  amazonProfileId: string
  profileName: string
  subAccount: string
  status: string
  createdDate: string
  alertEnabled: string
  lastRunStatus: string
  lastRunTime: string
  scheduleRuns: number
  optimizationEvents: number
  bidsOptimized: number
  budgetsOptimized: number
  placementsOptimized: number
  launched: Split
  adGroups: Split
  targeting: Split
}

export interface Campaign {
  amazonCampaignId: string
  amazonProfileId: string
  name: string
  adType: string
  managedBy: string[]
  affectedBy: string[]
  launchedBy: string
  adSpend: number
  adSales: number
  acos: number
  adOrders: number
  impressions: number
  clicks: number
  cpc: number
  cvr: number
  optimizationEvents: number
  bidsOptimized: number
  budgetsOptimized: number
  placementsOptimized: number
}
export interface Schedule {
  id: string
  amazonProfileId: string
  action: string
  adType: string
  name: string
  status: 'Active' | 'Paused'
  user: string
  alarm: boolean
  created: string
  lastResult: 'Success' | 'Partial' | 'Failed'
  runs: number
  managed: number
  unmanaged: number
  bidsOptimized: number
  campaignsLaunched: number
  adGroups: number
  targeting: number
}
export interface ToolStat { tool: string, profilesUsing: number, calls: number, lastCalled: string | null, success: number | null, errors: number }
export interface AgentChat { name: string, date: string, sub: string, first: string, summary: string }
