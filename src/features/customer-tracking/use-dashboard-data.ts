import {
  and,
  cast,
  coalesce,
  column,
  cond,
  count,
  div,
  eq,
  from,
  FromClauseNode,
  gt,
  isBetween,
  join,
  literal,
  max,
  mul,
  Query,
  round,
  sql,
  sum,
} from '@uwdata/mosaic-sql'
import { ref, watch } from 'vue'

import { useAxios } from '@/composables/use-axios'
import { isArrowTableLoaded, isDatasetLoaded, loadArrowDataset, loadDataset, runQuery } from '@/services/mosaic'

import type { ToolPairRow } from './agent-analytics'
import type { ActionTrendActivityRow, ActionTrendMoneyRow, AttributionRow, FirstTouchRow } from './performance-analytics'
import type { AdsAccount, AgentChat, AgentOrgProfileStat, AgentOrgToolStat, AgentToolOrgStat, AgentToolTrendRow, Campaign, Organization, PerfProfile, PerfSchedule, Profile, Schedule, SubAccount, ToolStat } from './types'

import { successRate, withToolsUsed } from './agent-analytics'
import { useFilterContext } from './filter-context'
import { actionTrendFactFor } from './performance-analytics'
import { LAUNCH_CATEGORY } from './types'

export interface DatasetVersion {
  name: string
  key: string
  url: string
  size?: number
  etag?: string
  last_modified?: string
}

export interface DatasetManifest {
  datasets: DatasetVersion[]
}

export async function fetchDatasetManifest(): Promise<DatasetManifest> {
  const { axiosInstance } = useAxios()
  const res = await axiosInstance.get<DatasetManifest>('/customer-tracking/datasets')
  return res.data
}

async function fetchArrow(url: string): Promise<Uint8Array> {
  const { axiosInstance } = useAxios()
  // No custom request headers here on purpose: anything outside the CORS
  // safelist turns a simple GET into a preflighted request, and a header the API
  // does not allow fails the preflight before the request is ever sent. Cache
  // avoidance belongs on the response instead - see the endpoint's Cache-Control.
  const res = await axiosInstance.get<ArrayBuffer>(url, { responseType: 'arraybuffer' })
  return new Uint8Array(res.data)
}

/**
 * POST an Arrow request whose scope is too large for a URL.
 *
 * The schedule charts filter by the schedules the table is showing, and an action
 * can own thousands of them: as a query string that is ~150KB, well past any sane
 * header limit. The body carries the scope instead.
 */
async function postArrow(url: string, body: Record<string, unknown>): Promise<Uint8Array> {
  const { axiosInstance } = useAxios()
  const res = await axiosInstance.post<ArrayBuffer>(url, body, { responseType: 'arraybuffer' })
  return new Uint8Array(res.data)
}

/**
 * A cheap order-independent digest of a pushed-down id list.
 *
 * The cache key must separate two different filters of the same size; a key built
 * from the length and the first/last id would collide on exactly that case. FNV-1a
 * over every character is fast enough for a few thousand ids and hashes in the
 * browser without making the request async.
 */
function hashIds(ids: readonly string[]): string {
  let hash = 0x811C9DC5
  for (const id of ids) {
    for (let i = 0; i < id.length; i++) {
      hash ^= id.charCodeAt(i)
      hash = Math.imul(hash, 0x01000193)
    }
  }
  return (hash >>> 0).toString(36)
}

// ---- Mosaic SQL query builders ----

const col = (name: string, table?: string) => column(name, table)
function dateRange(fromDate: string, toDate: string, table?: string) {
  return isBetween(col('event_date', table), [literal(fromDate), literal(toDate)])
}
/** Same window, for the datasets whose date column is not called `event_date`. */
function datesIn(columnName: string, fromDate: string, toDate: string, table?: string) {
  return isBetween(col(columnName, table), [literal(fromDate), literal(toDate)])
}
function rate100(num: ReturnType<typeof column>, den: ReturnType<typeof column>) {
  return cond(gt(den, 0), mul(div(num, den), 100), 0)
}

// Accounts L1: dim (org identity) LEFT JOIN fact (org x date metrics).
function organizationsQuery(fromDate: string, toDate: string): Query {
  const fact = Query.from('accounts_l1_fact')
    .select({
      org_id: col('org_id'),
      sp_ad_spend: sum(col('sp_ad_spend')),
      sb_ad_spend: sum(col('sb_ad_spend')),
      sd_ad_spend: sum(col('sd_ad_spend')),
      agent_chats: sum(col('agent_chats')),
      schedule_runs: sum(col('schedule_runs')),
      optimization_events: sum(col('optimization_events')),
      sp_campaigns_created: sum(col('sp_campaigns_created')),
      sb_campaigns_created: sum(col('sb_campaigns_created')),
      sd_campaigns_created: sum(col('sd_campaigns_created')),
    })
    .where(isBetween(col('date'), [literal(fromDate), literal(toDate)]))
    .groupby(col('org_id'))
  return Query.from(
    join(from('accounts_l1_dim', 'o'), new FromClauseNode(fact, 'f'), { type: 'LEFT', on: eq(col('org_id', 'f'), col('org_id', 'o')) }),
  ).select({
    orgId: col('org_id', 'o'),
    name: col('org_name', 'o'),
    plan: col('plan', 'o'),
    status: col('status', 'o'),
    // Dates/arrays are cast to scalars: duckdb-wasm mis-decodes DATE and LIST
    // columns (DATE -> object, list<int64> reinterpreted as double).
    joined: cast(col('joined', 'o'), 'VARCHAR'),
    lastActive: cast(col('last_active', 'o'), 'VARCHAR'),
    renewal: cast(col('renewl_date', 'o'), 'VARCHAR'),
    adsConnEnabled: sql`list_extract(${col('ads_accounts', 'o')}, 1)`,
    adsConnTotal: sql`list_extract(${col('ads_accounts', 'o')}, 2)`,
    profConnEnabled: sql`list_extract(${col('profiles', 'o')}, 1)`,
    profConnTotal: sql`list_extract(${col('profiles', 'o')}, 2)`,
    subConnEnabled: sql`list_extract(${col('sub_accounts', 'o')}, 1)`,
    subConnTotal: sql`list_extract(${col('sub_accounts', 'o')}, 2)`,
    amsEnabled: sql`list_extract(${col('ams_api', 'o')}, 1)`,
    amsTotal: sql`list_extract(${col('ams_api', 'o')}, 2)`,
    spEnabled: sql`list_extract(${col('sp_api', 'o')}, 1)`,
    spTotal: sql`list_extract(${col('sp_api', 'o')}, 2)`,
    spAdSpend: round(coalesce(col('sp_ad_spend', 'f'), 0), 2),
    sbAdSpend: round(coalesce(col('sb_ad_spend', 'f'), 0), 2),
    sdAdSpend: round(coalesce(col('sd_ad_spend', 'f'), 0), 2),
    chats: coalesce(col('agent_chats', 'f'), 0),
    optimizationEvents: coalesce(col('optimization_events', 'f'), 0),
    scheduleRuns: coalesce(col('schedule_runs', 'f'), 0),
    launchedSp: coalesce(col('sp_campaigns_created', 'f'), 0),
    launchedSb: coalesce(col('sb_campaigns_created', 'f'), 0),
    launchedSd: coalesce(col('sd_campaigns_created', 'f'), 0),
  })
}

// ---------------------------------------------------------------------------
// Performance page datasets (the per-page OSS export under performance/)
// ---------------------------------------------------------------------------

/**
 * The first-touch window: seven days either side of the touch. A week is long
 * enough for a bid or budget change to reach a meaningful number of auctions, and
 * short enough that the "before" days still exist for a touch on the first day of
 * even the 7-day range preset.
 */
export const FIRST_TOUCH_WINDOW_DAYS = 7

/** L1 profiles: the dim (one row per profile x org) joined to the profile fact. */
function performanceProfilesQuery(fromDate: string, toDate: string): Query {
  const fact = Query.from('performance_l1_profiles_fact')
    .select({
      amazon_profile_id: col('amazon_profile_id'),
      sp_ad_spend: sum(col('sp_ad_spend')),
      sb_ad_spend: sum(col('sb_ad_spend')),
      sd_ad_spend: sum(col('sd_ad_spend')),
      ad_sales: sum(col('ad_sales')),
      total_sales: sum(col('total_sales')),
      impressions: sum(col('impressions')),
      clicks: sum(col('clicks')),
      ad_orders: sum(col('ad_orders')),
      schedule_runs: sum(col('schedule_runs')),
      optimization_events: sum(col('optimization_events')),
      bids_optimized: sum(col('bids_optimized')),
      budgets_optimized: sum(col('budgets_optimized')),
      placements_optimized: sum(col('placements_optimized')),
      sp_campaigns_created: sum(col('sp_campaigns_created')),
      sb_campaigns_created: sum(col('sb_campaigns_created')),
      sd_campaigns_created: sum(col('sd_campaigns_created')),
      sp_targetings_created: sum(col('sp_targetings_created')),
      sb_targetings_created: sum(col('sb_targetings_created')),
      sd_targetings_created: sum(col('sd_targetings_created')),
    })
    .where(isBetween(col('date'), [literal(fromDate), literal(toDate)]))
    .groupby(col('amazon_profile_id'))
  return Query.from(
    join(from('performance_l1_profiles_dim', 'd'), new FromClauseNode(fact, 'f'), { type: 'LEFT', on: eq(col('amazon_profile_id', 'f'), col('amazon_profile_id', 'd')) }),
  ).select({
    orgId: col('org_id', 'd'),
    organization: col('org_name', 'd'),
    amazonProfileId: col('amazon_profile_id', 'd'),
    name: col('amazon_profile_name', 'd'),
    entity: col('entity', 'd'),
    marketplace: col('marketplace', 'd'),
    // TIMESTAMPTZ -> VARCHAR: duckdb-wasm cannot cast a TIMESTAMPTZ straight to DATE.
    connectedAt: cast(col('connected_at', 'd'), 'VARCHAR'),
    plan: col('plan', 'd'),
    adsApi: col('ads_api_connection', 'd'),
    amsApi: col('ams_api_connection', 'd'),
    spApi: col('sp_api_connection', 'd'),
    activeSchedules: coalesce(col('active_schedules', 'd'), 0),
    spAdSpend: coalesce(col('sp_ad_spend', 'f'), 0),
    sbAdSpend: coalesce(col('sb_ad_spend', 'f'), 0),
    sdAdSpend: coalesce(col('sd_ad_spend', 'f'), 0),
    adSales: coalesce(col('ad_sales', 'f'), 0),
    totalSales: coalesce(col('total_sales', 'f'), 0),
    adOrders: coalesce(col('ad_orders', 'f'), 0),
    impressions: coalesce(col('impressions', 'f'), 0),
    clicks: coalesce(col('clicks', 'f'), 0),
    scheduleRuns: coalesce(col('schedule_runs', 'f'), 0),
    optimizationEvents: coalesce(col('optimization_events', 'f'), 0),
    bidsOptimized: coalesce(col('bids_optimized', 'f'), 0),
    budgetsOptimized: coalesce(col('budgets_optimized', 'f'), 0),
    placementsOptimized: coalesce(col('placements_optimized', 'f'), 0),
    spLaunched: coalesce(col('sp_campaigns_created', 'f'), 0),
    sbLaunched: coalesce(col('sb_campaigns_created', 'f'), 0),
    sdLaunched: coalesce(col('sd_campaigns_created', 'f'), 0),
    spTargeting: coalesce(col('sp_targetings_created', 'f'), 0),
    sbTargeting: coalesce(col('sb_targetings_created', 'f'), 0),
    sdTargeting: coalesce(col('sd_targetings_created', 'f'), 0),
  })
}

/** L2 schedules: the schedule dim joined to its per-schedule fact totals. */
function performanceSchedulesQuery(fromDate: string, toDate: string): Query {
  const fact = Query.from('performance_l2_schedules_fact')
    .select({
      schedule_id: col('schedule_id'),
      schedule_runs: sum(col('schedule_runs')),
      optimization_events: sum(col('optimization_events')),
      bids_optimized: sum(col('bids_optimized')),
      budgets_optimized: sum(col('budgets_optimized')),
      placements_optimized: sum(col('placements_optimized')),
      sp_campaigns_created: sum(col('sp_campaigns_created')),
      sb_campaigns_created: sum(col('sb_campaigns_created')),
      sd_campaigns_created: sum(col('sd_campaigns_created')),
      sp_adgroups_created: sum(col('sp_adgroups_created')),
      sb_adgroups_created: sum(col('sb_adgroups_created')),
      sd_adgroups_created: sum(col('sd_adgroups_created')),
      sp_targetings_created: sum(col('sp_targetings_created')),
      sb_targetings_created: sum(col('sb_targetings_created')),
      sd_targetings_created: sum(col('sd_targetings_created')),
    })
    .where(isBetween(col('date'), [literal(fromDate), literal(toDate)]))
    .groupby(col('schedule_id'))
  return Query.from(
    join(from('performance_l2_schedules_dim', 'd'), new FromClauseNode(fact, 'f'), { type: 'LEFT', on: eq(col('schedule_id', 'f'), col('schedule_id', 'd')) }),
  ).select({
    scheduleId: col('schedule_id', 'd'),
    scheduleName: col('schedule_name', 'd'),
    actionType: col('action_type', 'd'),
    actionCategory: col('action_category', 'd'),
    amazonProfileId: col('amazon_profile_id', 'd'),
    profileName: col('amazon_profile_name', 'd'),
    subAccount: col('sub_account', 'd'),
    status: col('status', 'd'),
    deleted: col('is_deleted', 'd'),
    createdDate: cast(col('created_date', 'd'), 'VARCHAR'),
    alertEnabled: col('alert_enabled', 'd'),
    lastRunStatus: col('last_run_status', 'd'),
    lastRunTime: cast(col('last_run_time', 'd'), 'VARCHAR'),
    scheduleRuns: coalesce(col('schedule_runs', 'f'), 0),
    optimizationEvents: coalesce(col('optimization_events', 'f'), 0),
    bidsOptimized: coalesce(col('bids_optimized', 'f'), 0),
    budgetsOptimized: coalesce(col('budgets_optimized', 'f'), 0),
    placementsOptimized: coalesce(col('placements_optimized', 'f'), 0),
    spLaunched: coalesce(col('sp_campaigns_created', 'f'), 0),
    sbLaunched: coalesce(col('sb_campaigns_created', 'f'), 0),
    sdLaunched: coalesce(col('sd_campaigns_created', 'f'), 0),
    spAdGroups: coalesce(col('sp_adgroups_created', 'f'), 0),
    sbAdGroups: coalesce(col('sb_adgroups_created', 'f'), 0),
    sdAdGroups: coalesce(col('sd_adgroups_created', 'f'), 0),
    spTargeting: coalesce(col('sp_targetings_created', 'f'), 0),
    sbTargeting: coalesce(col('sb_targetings_created', 'f'), 0),
    sdTargeting: coalesce(col('sd_targetings_created', 'f'), 0),
  })
}

/**
 * The trend chart's rows: one row per (profile, date), for the whole page or for one
 * profile.
 *
 * Deliberately not grouped by date: these rows are the finest grain the export has, so
 * a table filter - which selects *profiles* - can be applied by re-aggregating them in
 * the browser through `dailySeries`. A pre-aggregated sum cannot be filtered after the
 * fact, which is exactly why the trend used to ignore the tables above it.
 */
function performanceDailyQuery(fromDate: string, toDate: string, profileId?: string): Query {
  let query = Query.from('performance_l1_profiles_fact')
    .select({
      amazonProfileId: col('amazon_profile_id'),
      date: cast(col('date'), 'VARCHAR'),
      spAdSpend: col('sp_ad_spend'),
      sbAdSpend: col('sb_ad_spend'),
      sdAdSpend: col('sd_ad_spend'),
      adSales: col('ad_sales'),
      adOrders: col('ad_orders'),
      impressions: col('impressions'),
      clicks: col('clicks'),
      scheduleRuns: col('schedule_runs'),
      optimizationEvents: col('optimization_events'),
      bidsOptimized: col('bids_optimized'),
      budgetsOptimized: col('budgets_optimized'),
      placementsOptimized: col('placements_optimized'),
      spCampaignsCreated: col('sp_campaigns_created'),
      sbCampaignsCreated: col('sb_campaigns_created'),
      sdCampaignsCreated: col('sd_campaigns_created'),
    })
    .where(isBetween(col('date'), [literal(fromDate), literal(toDate)]))
  if (profileId)
    query = query.where(eq(col('amazon_profile_id'), literal(profileId)))
  return query
}

function profilesQuery(fromDate: string, toDate: string): Query {
  const ad = Query.from('ad_performance')
    .select({
      amazon_profile_id: col('amazon_profile_id'),
      ad_spend: sum(col('ad_spend')),
      ad_sales: sum(col('ad_sales')),
      ad_orders: sum(col('ad_orders')),
      impressions: sum(col('impressions')),
      clicks: sum(col('clicks')),
      optimization_events: sum(col('optimization_events')),
      bids_optimized: sum(col('bids_optimized')),
      budgets_optimized: sum(col('budgets_optimized')),
      placements_optimized: sum(col('placements_optimized')),
    })
    .where(dateRange(fromDate, toDate))
    .groupby(col('amazon_profile_id'))
  const se = Query.from('schedule_events')
    .select({
      amazon_profile_id: col('amazon_profile_id'),
      runs: sum(col('runs')),
      launched_sp: sum(col('launched_sp')),
      launched_sb: sum(col('launched_sb')),
      launched_sd: sum(col('launched_sd')),
      targeting_sp: sum(col('targeting_sp')),
      targeting_sb: sum(col('targeting_sb')),
      targeting_sd: sum(col('targeting_sd')),
    })
    .where(dateRange(fromDate, toDate))
    .groupby(col('amazon_profile_id'))
  const pd = Query.from('profile_daily')
    .select({ amazon_profile_id: col('amazon_profile_id'), chats: sum(col('chats')), active_schedules: sum(col('active_schedules')) })
    .where(dateRange(fromDate, toDate))
    .groupby(col('amazon_profile_id'))
  return Query.from(
    join(
      join(
        join(from('profiles', 'p'), new FromClauseNode(ad, 'ad'), { type: 'LEFT', on: eq(col('amazon_profile_id', 'ad'), col('amazon_profile_id', 'p')) }),
        new FromClauseNode(se, 'se'),
        { type: 'LEFT', on: eq(col('amazon_profile_id', 'se'), col('amazon_profile_id', 'p')) },
      ),
      new FromClauseNode(pd, 'pd'),
      { type: 'LEFT', on: eq(col('amazon_profile_id', 'pd'), col('amazon_profile_id', 'p')) },
    ),
  ).select({
    amazonProfileId: col('amazon_profile_id', 'p'),
    orgId: col('org_id', 'p'),
    name: col('name', 'p'),
    marketplace: col('marketplace', 'p'),
    entity: col('entity', 'p'),
    organization: col('organization', 'p'),
    plan: col('plan', 'p'),
    connectedAt: col('connected_at', 'p'),
    adsApi: col('ads_api', 'p'),
    amsApi: col('ams_api', 'p'),
    spApi: col('sp_api', 'p'),
    adSpend: coalesce(col('ad_spend', 'ad'), 0),
    adSales: coalesce(col('ad_sales', 'ad'), 0),
    adOrders: coalesce(col('ad_orders', 'ad'), 0),
    impressions: coalesce(col('impressions', 'ad'), 0),
    clicks: coalesce(col('clicks', 'ad'), 0),
    acos: rate100(col('ad_spend', 'ad'), col('ad_sales', 'ad')),
    tacos: rate100(col('ad_spend', 'ad'), col('ad_sales', 'ad')),
    cpc: cond(gt(col('clicks', 'ad'), 0), div(col('ad_spend', 'ad'), col('clicks', 'ad')), 0),
    cvr: rate100(col('ad_orders', 'ad'), col('clicks', 'ad')),
    optimizationEvents: coalesce(col('optimization_events', 'ad'), 0),
    bidsOptimized: coalesce(col('bids_optimized', 'ad'), 0),
    budgetsOptimized: coalesce(col('budgets_optimized', 'ad'), 0),
    placementsOptimized: coalesce(col('placements_optimized', 'ad'), 0),
    scheduleRuns: coalesce(col('runs', 'se'), 0),
    activeSchedules: coalesce(col('active_schedules', 'pd'), 0),
    chats: coalesce(col('chats', 'pd'), 0),
    launchedSp: coalesce(col('launched_sp', 'se'), 0),
    launchedSb: coalesce(col('launched_sb', 'se'), 0),
    launchedSd: coalesce(col('launched_sd', 'se'), 0),
    targetingSp: coalesce(col('targeting_sp', 'se'), 0),
    targetingSb: coalesce(col('targeting_sb', 'se'), 0),
    targetingSd: coalesce(col('targeting_sd', 'se'), 0),
  })
}

/**
 * Which schedule attribution maps to which business action, per the flattened
 * campaign view. The view stores a 0/1 flag per action, so the labels are
 * assembled here rather than joining another table in DuckDB.
 */
const MANAGING_ACTIONS: [string, string][] = [
  ['managingBidOpt', 'Bid Optimization'],
  ['managingBudgetOpt', 'Budget Optimization'],
  ['managingGbOpt', 'GoalBased Bid Optimization'],
  ['managingPlacementOpt', 'Placement Optimization'],
]
const LAUNCHING_ACTIONS: [string, string][] = [
  ['launchedCg', 'Campaign Generation'],
  ['launchedCmg', 'Cyber Minigun'],
  ['launchedKh', 'Keyword Harvesting'],
]

/**
 * The campaign table for one profile. The backend has already aggregated the
 * campaign x date rows into one row per campaign for the requested range, so
 * there is nothing left to group here — only presentation fields to derive.
 */
function campaignsQuery(table: string): Query {
  return Query.from(table).select({
    amazonCampaignId: col('amazon_campaign_id'),
    amazonProfileId: col('amazon_profile_id'),
    name: col('amazon_campaign_name'),
    adType: col('sponsored_ads_type'),
    managingBidOpt: col('managing_bid_opt'),
    managingBudgetOpt: col('managing_budget_opt'),
    managingGbOpt: col('managing_gb_opt'),
    managingPlacementOpt: col('managing_placement_opt'),
    launchedCg: col('launched_cg'),
    launchedCmg: col('launched_cmg'),
    launchedKh: col('launched_kh'),
    adSpend: col('ad_spend'),
    adSales: col('ad_sales'),
    adOrders: col('ad_orders'),
    impressions: col('impressions'),
    clicks: col('clicks'),
    acos: rate100(col('ad_spend'), col('ad_sales')),
    cpc: cond(gt(col('clicks'), 0), div(col('ad_spend'), col('clicks')), 0),
    cvr: rate100(col('ad_orders'), col('clicks')),
    optimizationEvents: col('optimization_events'),
    bidsOptimized: col('bids_optimized'),
    budgetsOptimized: col('budgets_optimized'),
    placementsOptimized: col('placements_optimized'),
  })
}

function schedulesQuery(fromDate: string, toDate: string): Query {
  const se = Query.from('schedule_events')
    .select({
      schedule_id: col('schedule_id'),
      runs: sum(col('runs')),
      managed: sum(col('managed')),
      unmanaged: sum(col('unmanaged')),
      bids_optimized: sum(col('bids_optimized')),
      campaigns_launched: sum(col('campaigns_launched')),
      ad_groups: sum(col('ad_groups')),
      targeting: sum(col('targeting')),
    })
    .where(dateRange(fromDate, toDate))
    .groupby(col('schedule_id'))
  return Query.from(
    join(from('schedules', 's'), new FromClauseNode(se, 'se'), { type: 'LEFT', on: eq(col('schedule_id', 'se'), col('id', 's')) }),
  ).select({
    id: col('id', 's'),
    amazonProfileId: col('amazon_profile_id', 's'),
    action: col('action', 's'),
    adType: col('ad_type', 's'),
    name: col('name', 's'),
    status: col('status', 's'),
    user: col('user', 's'),
    alarm: col('alarm', 's'),
    created: col('created', 's'),
    lastResult: col('last_result', 's'),
    runs: coalesce(col('runs', 'se'), 0),
    managed: coalesce(col('managed', 'se'), 0),
    unmanaged: coalesce(col('unmanaged', 'se'), 0),
    bidsOptimized: coalesce(col('bids_optimized', 'se'), 0),
    campaignsLaunched: coalesce(col('campaigns_launched', 'se'), 0),
    adGroups: coalesce(col('ad_groups', 'se'), 0),
    targeting: coalesce(col('targeting', 'se'), 0),
  })
}

/**
 * The Agent page's org + profile roll-up: one row per (organization, profile).
 *
 * The export already carries the org/profile names, the marketplace and the entity,
 * so identity is not joined in from anywhere - and it is the only source of the chat
 * count, which lives nowhere else.
 */
function agentOrgProfileQuery(fromDate: string, toDate: string): Query {
  return Query.from('agent_analytics_l1_org')
    .select({
      orgId: col('org_id'),
      organization: col('org_name'),
      amazonProfileId: col('amazon_profile_id'),
      name: col('amazon_profile_name'),
      marketplace: col('marketplace'),
      entity: col('entity'),
      chats: sum(col('agent_chat_threads')),
      toolCalls: sum(col('tool_calls')),
      lastActivity: cast(max(col('last_agent_activity')), 'VARCHAR'),
    })
    .where(datesIn('date', fromDate, toDate))
    .groupby(col('org_id'), col('org_name'), col('amazon_profile_id'), col('amazon_profile_name'), col('marketplace'), col('entity'))
}

/**
 * Distinct tools per (organization, profile) over the range.
 *
 * The roll-up counts tools per *day*, so summing it would count a tool once for every
 * day it was used. The distinct count only exists in the tool fact, so it is fetched
 * separately and merged by key on the client - which also keeps the rows whose profile
 * is empty, where a SQL join on the profile id would match nothing.
 */
function agentToolsUsedQuery(fromDate: string, toDate: string): Query {
  return Query.from('agent_analytics_shared_tools')
    .select({
      orgId: col('org_id'),
      amazonProfileId: col('amazon_profile_id'),
      toolsUsed: count(col('tool_name')).distinct(),
    })
    .where(datesIn('date', fromDate, toDate))
    .groupby(col('org_id'), col('amazon_profile_id'))
}

/**
 * Calls against active days per (organization, profile).
 *
 * The roll-up collapses the date, and a distribution question needs the date back: an
 * organization that makes 200 calls in one day is a different finding from one that
 * makes 10 a day for three weeks, and the total alone cannot tell them apart.
 */
function agentUsageIntensityQuery(fromDate: string, toDate: string): Query {
  return Query.from('agent_analytics_l1_org')
    .select({
      orgId: col('org_id'),
      organization: col('org_name'),
      amazonProfileId: col('amazon_profile_id'),
      profile: col('amazon_profile_name'),
      calls: sum(col('tool_calls')),
      activeDays: count(cond(gt(col('tool_calls'), 0), col('date'), null)).distinct(),
    })
    .where(datesIn('date', fromDate, toDate))
    .groupby(col('org_id'), col('org_name'), col('amazon_profile_id'), col('amazon_profile_name'))
}

/** One row per (tool, organization): the grain the adoption matrix is built from. */
function agentToolPairsQuery(fromDate: string, toDate: string): Query {
  return Query.from('agent_analytics_shared_tools')
    .select({
      tool: col('tool_name'),
      orgId: col('org_id'),
      calls: sum(col('tool_calls')),
      activeDays: count(col('date')).distinct(),
    })
    .where(datesIn('date', fromDate, toDate))
    .groupby(col('tool_name'), col('org_id'))
}

/**
 * Every organization that has ever used the agent, for the adoption rate.
 *
 * Deliberately unfiltered by date: the denominator is "organizations that onboarded the
 * agent", so it must not shrink with the range - otherwise a one-week range would report
 * a 100% adoption rate by construction.
 */
function agentAllOrgsQuery(): Query {
  return Query.from('agent_analytics_l1_org').select({ orgs: count(col('org_id')).distinct() })
}

/** One row per tool over the range, across every organization. */
function agentToolStatsQuery(fromDate: string, toDate: string): Query {
  return Query.from('agent_analytics_shared_tools')
    .select({
      tool: col('tool_name'),
      orgsUsing: count(col('org_id')).distinct(),
      profilesUsing: count(col('amazon_profile_id')).distinct(),
      calls: sum(col('tool_calls')),
      lastCalled: cast(max(col('last_used')), 'VARCHAR'),
      successCalls: sum(col('success_calls')),
      errors: sum(col('error_calls')),
    })
    .where(datesIn('date', fromDate, toDate))
    .groupby(col('tool_name'))
}

/**
 * The tools one organization used, at tool x sub account x profile grain.
 *
 * The company id travels with the name: the charts above this table aggregate by profile,
 * and a name is not an identity (two profiles in one organization can share one).
 */
function agentOrgToolQuery(orgId: number, fromDate: string, toDate: string): Query {
  return Query.from('agent_analytics_shared_tools')
    .select({
      tool: col('tool_name'),
      subAccount: col('sub_account_name'),
      amazonProfileId: col('amazon_profile_id'),
      name: col('amazon_profile_name'),
      // The same profile name repeats across marketplaces inside one organization, and
      // the chart's axis labels truncate, so the marketplace is what tells two apart.
      marketplace: col('marketplace'),
      calls: sum(col('tool_calls')),
      lastCalled: cast(max(col('last_used')), 'VARCHAR'),
      successCalls: sum(col('success_calls')),
      errors: sum(col('error_calls')),
    })
    .where(and(datesIn('date', fromDate, toDate), eq(col('org_id'), literal(orgId))))
    .groupby(col('tool_name'), col('sub_account_name'), col('amazon_profile_id'), col('amazon_profile_name'), col('marketplace'))
}

/** Which organizations use one tool, at organization x profile grain. */
function agentToolOrgQuery(toolName: string, fromDate: string, toDate: string): Query {
  return Query.from('agent_analytics_shared_tools')
    .select({
      orgId: col('org_id'),
      organization: col('org_name'),
      name: col('amazon_profile_name'),
      // The table shows the marketplace, so it has to be selected *and* grouped by - a
      // column that is only named in the column set renders as an empty cell.
      marketplace: col('marketplace'),
      calls: sum(col('tool_calls')),
      lastCalled: cast(max(col('last_used')), 'VARCHAR'),
      successCalls: sum(col('success_calls')),
      errors: sum(col('error_calls')),
    })
    .where(and(datesIn('date', fromDate, toDate), eq(col('tool_name'), literal(toolName))))
    .groupby(col('org_id'), col('org_name'), col('amazon_profile_name'), col('marketplace'))
}

/**
 * One action's day-by-day counters, per schedule.
 *
 * The per-schedule grain is what makes the chart a cross-filter: the page keeps the rows
 * whose schedule survived the table filter and re-aggregates them in the browser, so a
 * filter on the table redraws the chart without another lakehouse round trip. It is also
 * small - ~4k rows for a month across every action - so loading it once per range and
 * slicing it per action is cheaper than a query per action.
 */
function actionActivityDailyQuery(fromDate: string, toDate: string): Query {
  return Query.from('performance_l2_schedules_fact')
    .select({
      date: cast(col('date'), 'VARCHAR'),
      scheduleId: col('schedule_id'),
      bidsOptimized: sum(col('bids_optimized')),
      budgetsOptimized: sum(col('budgets_optimized')),
      placementsOptimized: sum(col('placements_optimized')),
      spCampaignsCreated: sum(col('sp_campaigns_created')),
      sbCampaignsCreated: sum(col('sb_campaigns_created')),
      sdCampaignsCreated: sum(col('sd_campaigns_created')),
      spTargetingsCreated: sum(col('sp_targetings_created')),
      sbTargetingsCreated: sum(col('sb_targetings_created')),
      sdTargetingsCreated: sum(col('sd_targetings_created')),
    })
    .where(isBetween(col('date'), [literal(fromDate), literal(toDate)]))
    .groupby(col('date'), col('schedule_id'))
}

/**
 * One action's campaigns day by day: the money side of the trend.
 *
 * Which fact to read is decided by the action on screen (the export materialises one file
 * per action type), so a page that never opens that action never downloads it.
 */
function actionTrendMoneyQuery(fact: string, scheduleColumn: string, fromDate: string, toDate: string, profileId?: string): Query {
  const range = isBetween(col('date'), [literal(fromDate), literal(toDate)])
  return Query.from(fact)
    .select({
      date: cast(col('date'), 'VARCHAR'),
      scheduleId: col(scheduleColumn),
      adSpend: sum(col('ad_spend')),
      adSales: sum(col('ad_sales')),
    })
    .where(profileId ? and(range, eq(col('amazon_profile_id'), literal(profileId))) : range)
    .groupby(col('date'), col(scheduleColumn))
}

/**
 * One tool's usage per day: the trend chart's input.
 *
 * Volume and breadth are read together on purpose. A tool can grow because more
 * organizations adopt it or because the same organizations call it harder, and the call
 * total alone cannot tell those apart.
 *
 * Days the tool was never called are absent here (no rows); the caller zero-fills them
 * against the range, because a missing bar otherwise reads as "that day did not exist"
 * rather than "nobody used it".
 */
function agentToolTrendQuery(toolName: string, fromDate: string, toDate: string): Query {
  return Query.from('agent_analytics_shared_tools')
    .select({
      date: cast(col('date'), 'VARCHAR'),
      calls: sum(col('tool_calls')),
      orgs: count(col('org_id')).distinct(),
      profiles: count(col('amazon_profile_id')).distinct(),
    })
    .where(and(datesIn('date', fromDate, toDate), eq(col('tool_name'), literal(toolName))))
    .groupby(col('date'))
}

// Accounts L2 'ads_account' wide table (dim + fact merged, one row per ads account x date).
function adsAccountsQuery(fromDate: string, toDate: string): Query {
  return Query.from('accounts_l2_ads_account')
    .select({
      amazonAdsAccountId: col('amazon_ads_account_id'),
      orgId: col('org_id'),
      name: col('name'),
      profilesEnabled: sql`list_extract(${col('profiles_conn')}, 1)`,
      profilesTotal: sql`list_extract(${col('profiles_conn')}, 2)`,
      amsEnabled: sql`list_extract(${col('ams_conn')}, 1)`,
      amsTotal: sql`list_extract(${col('ams_conn')}, 2)`,
      spAdSpend: round(coalesce(sum(col('sp_ad_spend')), 0), 2),
      sbAdSpend: round(coalesce(sum(col('sb_ad_spend')), 0), 2),
      sdAdSpend: round(coalesce(sum(col('sd_ad_spend')), 0), 2),
      chats: coalesce(sum(col('agent_chats')), 0),
      scheduleRuns: coalesce(sum(col('schedule_runs')), 0),
      optimizationEvents: coalesce(sum(col('optimization_events')), 0),
      launchedSp: coalesce(sum(col('sp_campaigns_created')), 0),
      launchedSb: coalesce(sum(col('sb_campaigns_created')), 0),
      launchedSd: coalesce(sum(col('sd_campaigns_created')), 0),
    })
    .where(isBetween(col('date'), [literal(fromDate), literal(toDate)]))
    .groupby(col('amazon_ads_account_id'), col('org_id'), col('name'), col('profiles_conn'), col('ams_conn'))
}

// Accounts L2 'sub_accounts' wide table (dim + fact merged, one row per sub account x date).
function subAccountsQuery(fromDate: string, toDate: string): Query {
  return Query.from('accounts_l2_sub_accounts')
    .select({
      subAccountId: col('sub_account_id'),
      orgId: col('org_id'),
      name: col('sub_account'),
      role: col('role'),
      lastActive: cast(col('last_active'), 'VARCHAR'),
      adsAccessEnabled: sql`list_extract(${col('ads_account_access')}, 1)`,
      adsAccessTotal: sql`list_extract(${col('ads_account_access')}, 2)`,
      profileAccessEnabled: sql`list_extract(${col('profile_access')}, 1)`,
      profileAccessTotal: sql`list_extract(${col('profile_access')}, 2)`,
      chats: coalesce(sum(col('agent_chats')), 0),
      scheduleRuns: coalesce(sum(col('schedule_runs')), 0),
      optimizationEvents: coalesce(sum(col('optimization_events')), 0),
      launchedSp: coalesce(sum(col('sp_campaigns_created')), 0),
      launchedSb: coalesce(sum(col('sb_campaigns_created')), 0),
      launchedSd: coalesce(sum(col('sd_campaigns_created')), 0),
    })
    .where(isBetween(col('date'), [literal(fromDate), literal(toDate)]))
    .groupby(col('sub_account_id'), col('org_id'), col('sub_account'), col('role'), col('last_active'), col('ads_account_access'), col('profile_access'))
}

// Accounts L2 'profiles' wide table (dim + fact merged, one row per profile x date).
function accountProfilesQuery(fromDate: string, toDate: string): Query {
  return Query.from('accounts_l2_profiles')
    .select({
      amazonProfileId: col('amazon_profile_id'),
      orgId: col('org_id'),
      name: col('amazon_profile_name'),
      entity: col('entity'),
      marketplace: col('marketplace'),
      connectedAt: cast(col('connected_at'), 'VARCHAR'),
      status: col('status'),
      adsApi: col('ads_api_connection'),
      amsApi: col('ams_api_connection'),
      chats: coalesce(sum(col('agent_chats')), 0),
      spAdSpend: round(coalesce(sum(col('sp_ad_spend')), 0), 2),
      sbAdSpend: round(coalesce(sum(col('sb_ad_spend')), 0), 2),
      sdAdSpend: round(coalesce(sum(col('sd_ad_spend')), 0), 2),
      scheduleRuns: coalesce(sum(col('schedule_runs')), 0),
      optimizationEvents: coalesce(sum(col('optimization_events')), 0),
      launchedSp: coalesce(sum(col('sp_campaigns_created')), 0),
      launchedSb: coalesce(sum(col('sb_campaigns_created')), 0),
      launchedSd: coalesce(sum(col('sd_campaigns_created')), 0),
    })
    .where(isBetween(col('date'), [literal(fromDate), literal(toDate)]))
    .groupby(col('amazon_profile_id'), col('amazon_profile_name'), col('org_id'), col('entity'), col('marketplace'), col('connected_at'), col('status'), col('ads_api_connection'), col('ams_api_connection'))
}

function launchOutputQuery(fromDate: string, toDate: string): Query {
  return Query.from(
    join(from('schedule_events', 'se'), from('schedules', 's'), { on: eq(col('id', 's'), col('schedule_id', 'se')) }),
  ).select({
    amazonProfileId: col('amazon_profile_id', 's'),
    action: col('action', 's'),
    adGroups: sum(col('ad_groups', 'se')),
    targeting: sum(col('targeting', 'se')),
    campaignsLaunched: sum(col('campaigns_launched', 'se')),
  }).where(dateRange(fromDate, toDate, 'se')).groupby(col('amazon_profile_id', 's'), col('action', 's'))
}

export interface LaunchOutput {
  amazonProfileId: string
  action: string
  adGroups: number
  targeting: number
  campaignsLaunched: number
}

export function useDashboardData() {
  const { dateRange } = useFilterContext()
  const ready = ref(false)
  const loading = ref(false)
  const campaignsLoading = ref(false)
  const agentChatsLoading = ref(false)
  /** The DuckDB relation holding the conversations currently on screen. */
  const agentChatsTable = ref('')
  const analyticsLoading = ref(false)
  const error = ref<string | null>(null)
  /**
   * What the campaign table currently holds: the request key it was fetched for and
   * how many rows the query returned. A bare key is not enough to skip work — the
   * in-memory rows can be gone (a fresh component) or the DuckDB relation can be
   * missing (worker restart, hot update), and both used to render as a silently
   * empty table while the endpoint had data.
   */
  const campaignsLoaded = ref<{ key: string, rows: number } | null>(null)
  const campaignsProfileId = ref<string | null>(null)
  // The analytics slice is keyed by action + scope + range, so a re-mount on the
  // same URL reuses the Arrow tables instead of re-querying the lakehouse.
  const analyticsLoadedFor = ref<string | null>(null)
  const analyticsScope = ref<{ actionType: string, profileId?: string, scheduleIds?: string[] } | null>(null)
  const computedRefs = new Set<string>()

  const organizations = ref<Organization[]>([])
  const profiles = ref<Profile[]>([])
  const accountProfilesData = ref<Record<string, unknown>[]>([])
  const campaigns = ref<Campaign[]>([])
  const schedules = ref<Schedule[]>([])
  const toolStats = ref<ToolStat[]>([])
  const agentOrgProfiles = ref<AgentOrgProfileStat[]>([])
  const agentOrgTools = ref<AgentOrgToolStat[]>([])
  const agentToolOrgs = ref<AgentToolOrgStat[]>([])
  /** (organization, profile) usage with the active days behind it, for the scatter. */
  const agentUsageRows = ref<{ orgId: string, organization: string, profile: string, calls: number, activeDays: number }[]>([])
  /** (tool, organization) usage, the grain the adoption matrix is built from. */
  const agentToolPairs = ref<ToolPairRow[]>([])
  /** Organizations that have ever used the agent: the adoption rate's denominator. */
  const agentAllOrgs = ref(0)
  /** One tool's per-day calls, organizations and profiles; the trend chart's rows. */
  const agentToolTrend = ref<AgentToolTrendRow[]>([])
  const agentOrgChats = ref<AgentChat[]>([])
  /**
   * Which organization / tool the Agent L2 pages are scoped to, taken from the route
   * by `loadPage`. The scoped queries read it, so a page that is opened before the
   * scope is known returns nothing rather than the whole book of business.
   */
  const agentScope = ref<{ orgId: number, tool: string }>({ orgId: Number.NaN, tool: '' })
  const adsAccounts = ref<AdsAccount[]>([])
  const subAccounts = ref<SubAccount[]>([])
  const performanceProfiles = ref<PerfProfile[]>([])
  const performanceSchedules = ref<PerfSchedule[]>([])
  const perfAttribution = ref<AttributionRow[]>([])
  const perfFirstTouch = ref<FirstTouchRow[]>([])
  /** One row per (profile, date): the finest grain behind the trend charts. */
  const performanceDailyRows = ref<Record<string, unknown>[]>([])
  /**
   * The profile the daily series is scoped to. `profile` pages aggregate one
   * profile; the page-level Performance page aggregates all of them.
   */
  const dailyProfileId = ref<string | null>(null)
  const launchOutput = ref<LaunchOutput[]>([])
  /** Per (day, schedule) counters for the L2 action trend's left axis. */
  const actionActivityRows = ref<ActionTrendActivityRow[]>([])
  /** Per (day, schedule) money for the current action's campaigns - the right axis. */
  const actionTrendMoneyRows = ref<ActionTrendMoneyRow[]>([])
  /** Which (action, profile scope, range) the money rows above belong to. */
  const actionTrendLoadedFor = ref('')

  async function loadOssDatasets(names: string[]): Promise<void> {
    // "Already loaded" is answered by the DuckDB layer, not by this component:
    // the tables outlive any one mount, and a remount must reuse them instead of
    // re-registering the same files (which truncates them mid-read).
    const pending = names.filter(n => !isDatasetLoaded(n))
    if (pending.length === 0)
      return
    const manifest = await fetchDatasetManifest()
    // A dataset may ship as several `part*.parquet` files; load all parts into one table.
    const byName = new Map<string, DatasetVersion[]>()
    for (const d of manifest.datasets) {
      if (!pending.includes(d.name))
        continue
      const parts = byName.get(d.name) ?? []
      parts.push(d)
      byName.set(d.name, parts)
    }
    for (const [name, parts] of byName) {
      await loadDataset(name, parts.map(p => ({
        url: p.url,
        filename: p.key.split('/').pop() || 'part.parquet',
      })))
    }
  }

  async function computeOrganizations(): Promise<void> {
    const fromDate = dateRange.value.from
    const toDate = dateRange.value.to
    organizations.value = (await runQuery<Record<string, unknown>>(organizationsQuery(fromDate, toDate))).map(r => ({
      ...(r as unknown as Organization),
      adsConn: [Number(r.adsConnEnabled), Number(r.adsConnTotal)],
      profConn: [Number(r.profConnEnabled), Number(r.profConnTotal)],
      subConn: [Number(r.subConnEnabled), Number(r.subConnTotal)],
      ams: [Number(r.amsEnabled), Number(r.amsTotal)],
      sp: [Number(r.spEnabled), Number(r.spTotal)],
      adSpendSplit: { sp: Number(r.spAdSpend), sb: Number(r.sbAdSpend), sd: Number(r.sdAdSpend) },
      launched: { sp: Number(r.launchedSp), sb: Number(r.launchedSb), sd: Number(r.launchedSd) },
    }))
  }

  async function computeAccountProfiles(): Promise<void> {
    const fromDate = dateRange.value.from
    const toDate = dateRange.value.to
    accountProfilesData.value = (await runQuery<Record<string, unknown>>(accountProfilesQuery(fromDate, toDate))).map(r => ({
      ...r,
      adSpendSplit: { sp: Number(r.spAdSpend), sb: Number(r.sbAdSpend), sd: Number(r.sdAdSpend) },
      launched: { sp: Number(r.launchedSp), sb: Number(r.launchedSb), sd: Number(r.launchedSd) },
    }))
  }

  async function computePerformanceProfiles(): Promise<void> {
    const rows = await runQuery<Record<string, unknown>>(
      performanceProfilesQuery(dateRange.value.from, dateRange.value.to),
    )
    performanceProfiles.value = rows.map((r) => {
      const adSpendSplit = { sp: Number(r.spAdSpend ?? 0), sb: Number(r.sbAdSpend ?? 0), sd: Number(r.sdAdSpend ?? 0) }
      const spend = adSpendSplit.sp + adSpendSplit.sb + adSpendSplit.sd
      const sales = Number(r.adSales ?? 0)
      const totalSales = Number(r.totalSales ?? 0)
      const clicks = Number(r.clicks ?? 0)
      const orders = Number(r.adOrders ?? 0)
      return {
        ...(r as unknown as PerfProfile),
        // The lakehouse hands this back as a TIMESTAMPTZ string; the calendar day is
        // what belongs next to a profile name.
        connectedAt: String(r.connectedAt ?? '').slice(0, 10),
        adSpendSplit,
        launched: { sp: Number(r.spLaunched ?? 0), sb: Number(r.sbLaunched ?? 0), sd: Number(r.sdLaunched ?? 0) },
        targeting: { sp: Number(r.spTargeting ?? 0), sb: Number(r.sbTargeting ?? 0), sd: Number(r.sdTargeting ?? 0) },
        acos: sales ? spend / sales * 100 : 0,
        tacos: totalSales ? spend / totalSales * 100 : 0,
        cpc: clicks ? spend / clicks : 0,
        cvr: clicks ? orders / clicks * 100 : 0,
      }
    })
  }

  async function computePerformanceSchedules(): Promise<void> {
    const rows = await runQuery<Record<string, unknown>>(
      performanceSchedulesQuery(dateRange.value.from, dateRange.value.to),
    )
    // Deleted schedules are filtered here rather than in SQL so the whole dim
    // stays queryable and the rule is visible in one place.
    performanceSchedules.value = rows
      .filter(r => r.deleted !== true)
      .map(r => ({
        ...(r as unknown as PerfSchedule),
        launched: { sp: Number(r.spLaunched ?? 0), sb: Number(r.sbLaunched ?? 0), sd: Number(r.sdLaunched ?? 0) },
        adGroups: { sp: Number(r.spAdGroups ?? 0), sb: Number(r.sbAdGroups ?? 0), sd: Number(r.sdAdGroups ?? 0) },
        targeting: { sp: Number(r.spTargeting ?? 0), sb: Number(r.sbTargeting ?? 0), sd: Number(r.sdTargeting ?? 0) },
      }))
  }

  async function computeActionActivityDaily(): Promise<void> {
    actionActivityRows.value = await runQuery<ActionTrendActivityRow>(
      actionActivityDailyQuery(dateRange.value.from, dateRange.value.to),
    )
  }

  /**
   * Load the action's own campaign fact and read its per-day money.
   *
   * Called from the schedule page's loader rather than through the ref table, because
   * which dataset to touch is decided by the action on screen while the ref table is
   * static per page. Re-opening an action reuses the table DuckDB already holds.
   */
  async function loadActionTrendMoney(actionType: string, profileId?: string): Promise<void> {
    const spec = actionTrendFactFor(actionType)
    actionTrendMoneyRows.value = []
    if (!spec)
      return
    await loadOssDatasets([spec.fact])
    actionTrendMoneyRows.value = await runQuery<ActionTrendMoneyRow>(
      actionTrendMoneyQuery(spec.fact, spec.column, dateRange.value.from, dateRange.value.to, profileId),
    )
  }

  async function computePerformanceDaily(): Promise<void> {
    performanceDailyRows.value = await runQuery<Record<string, unknown>>(
      performanceDailyQuery(dateRange.value.from, dateRange.value.to, dailyProfileId.value ?? undefined),
    )
  }

  async function computeProfiles(): Promise<void> {
    const fromDate = dateRange.value.from
    const toDate = dateRange.value.to
    profiles.value = (await runQuery<Record<string, unknown>>(profilesQuery(fromDate, toDate))).map(r => ({
      ...(r as unknown as Profile),
      launched: { sp: Number(r.launchedSp), sb: Number(r.launchedSb), sd: Number(r.launchedSd) },
      targeting: { sp: Number(r.targetingSp), sb: Number(r.targetingSb), sd: Number(r.targetingSd) },
    }))
  }

  async function computeSchedules(): Promise<void> {
    schedules.value = await runQuery<Schedule>(schedulesQuery(dateRange.value.from, dateRange.value.to))
  }

  /** The whole Agent page's org+profile roll-up, plus the distinct tools per row. */
  async function computeAgentOrgProfiles(): Promise<void> {
    const fromDate = dateRange.value.from
    const toDate = dateRange.value.to
    const [rows, tools] = await Promise.all([
      runQuery<Record<string, unknown>>(agentOrgProfileQuery(fromDate, toDate)),
      runQuery<Record<string, unknown>>(agentToolsUsedQuery(fromDate, toDate)),
    ])
    agentOrgProfiles.value = withToolsUsed(
      rows.map(r => ({
        orgId: String(r.orgId ?? ''),
        organization: String(r.organization ?? ''),
        amazonProfileId: r.amazonProfileId === null || r.amazonProfileId === undefined ? null : String(r.amazonProfileId),
        name: r.name === null || r.name === undefined ? null : String(r.name),
        marketplace: r.marketplace === null || r.marketplace === undefined ? null : String(r.marketplace),
        entity: r.entity === null || r.entity === undefined ? null : String(r.entity),
        chats: Number(r.chats ?? 0),
        toolCalls: Number(r.toolCalls ?? 0),
        toolsUsed: 0,
        lastActivity: r.lastActivity === null || r.lastActivity === undefined ? null : String(r.lastActivity),
      })),
      tools.map(r => ({
        orgId: String(r.orgId ?? ''),
        amazonProfileId: r.amazonProfileId === null || r.amazonProfileId === undefined ? null : String(r.amazonProfileId),
        toolsUsed: Number(r.toolsUsed ?? 0),
      })),
    )
  }

  async function computeToolStats(): Promise<void> {
    const rows = await runQuery<Record<string, unknown>>(agentToolStatsQuery(dateRange.value.from, dateRange.value.to))
    toolStats.value = rows.map(r => ({
      tool: String(r.tool ?? ''),
      orgsUsing: Number(r.orgsUsing ?? 0),
      profilesUsing: Number(r.profilesUsing ?? 0),
      calls: Number(r.calls ?? 0),
      lastCalled: r.lastCalled === null || r.lastCalled === undefined ? null : String(r.lastCalled),
      // success/calls, per the agreed口径: an error the export never classified still
      // counts against the tool rather than disappearing from the denominator.
      success: successRate(Number(r.successCalls ?? 0), Number(r.calls ?? 0)),
      errors: Number(r.errors ?? 0),
    }))
  }

  async function computeAgentOrgTools(): Promise<void> {
    const orgId = agentScope.value.orgId
    if (!Number.isFinite(orgId)) {
      agentOrgTools.value = []
      return
    }
    const rows = await runQuery<Record<string, unknown>>(agentOrgToolQuery(orgId, dateRange.value.from, dateRange.value.to))
    agentOrgTools.value = rows.map(r => ({
      tool: String(r.tool ?? ''),
      subAccount: String(r.subAccount ?? ''),
      amazonProfileId: r.amazonProfileId === null || r.amazonProfileId === undefined ? null : String(r.amazonProfileId),
      name: r.name === null || r.name === undefined ? null : String(r.name),
      marketplace: r.marketplace === null || r.marketplace === undefined ? null : String(r.marketplace),
      calls: Number(r.calls ?? 0),
      lastCalled: r.lastCalled === null || r.lastCalled === undefined ? null : String(r.lastCalled),
      success: successRate(Number(r.successCalls ?? 0), Number(r.calls ?? 0)),
      errors: Number(r.errors ?? 0),
    }))
  }

  /**
   * Load the conversation export for the current organization, on demand.
   *
   * The tab is what decides: the tools view is opened first and must not wait on a
   * download it does not show. This is also the ref's compute, so once the tab has been
   * opened a date change re-runs it - and finds the relation for the new range missing.
   */
  async function loadAgentChatsCore(): Promise<void> {
    const orgId = agentScope.value.orgId
    if (!Number.isFinite(orgId))
      return
    const from = dateRange.value.from
    const to = dateRange.value.to
    // One relation per (organization, range): an existing relation is reused rather
    // than re-ingested, so the name has to carry both or a second organization would
    // read the first one's conversations.
    const table = `agent_chats_${hashIds([String(orgId), from, to])}`
    agentChatsLoading.value = true
    try {
      if (!isArrowTableLoaded(table)) {
        const params = new URLSearchParams({ org_id: String(orgId), from, to })
        const bytes = await fetchArrow(`/customer-tracking/agent/chats?${params.toString()}`)
        await loadArrowDataset(table, bytes)
      }
      agentChatsTable.value = table
      await computeAgentOrgChats()
      error.value = null
    }
    catch (e) {
      error.value = `agentOrgChats: ${e instanceof Error ? e.message : String(e)}`
    }
    finally {
      agentChatsLoading.value = false
    }
  }

  /** Opening the tab: load it now, and keep it fresh from then on. */
  async function loadAgentChats(): Promise<void> {
    await loadAgentChatsCore()
    computedRefs.add('agentOrgChats')
  }

  async function computeAgentOrgChats(): Promise<void> {
    const table = agentChatsTable.value
    if (!Number.isFinite(agentScope.value.orgId) || !table || !isArrowTableLoaded(table)) {
      agentOrgChats.value = []
      return
    }
    const rows = await runQuery<Record<string, unknown>>(`SELECT * FROM "${table}"`)
    agentOrgChats.value = rows.map(r => ({
      name: String(r.name ?? ''),
      date: String(r.date ?? ''),
      sub: String(r.sub ?? ''),
      first: r.first === null || r.first === undefined ? '' : String(r.first),
      summary: r.summary === null || r.summary === undefined ? '' : String(r.summary),
    }))
  }

  async function computeAgentUsageIntensity(): Promise<void> {
    const rows = await runQuery<Record<string, unknown>>(agentUsageIntensityQuery(dateRange.value.from, dateRange.value.to))
    agentUsageRows.value = rows.map(r => ({
      orgId: String(r.orgId ?? ''),
      organization: String(r.organization ?? ''),
      profile: r.profile === null || r.profile === undefined ? '' : String(r.profile),
      calls: Number(r.calls ?? 0),
      activeDays: Number(r.activeDays ?? 0),
    }))
  }

  async function computeAgentToolPairs(): Promise<void> {
    const rows = await runQuery<Record<string, unknown>>(agentToolPairsQuery(dateRange.value.from, dateRange.value.to))
    agentToolPairs.value = rows.map(r => ({
      tool: String(r.tool ?? ''),
      orgId: String(r.orgId ?? ''),
      calls: Number(r.calls ?? 0),
      activeDays: Number(r.activeDays ?? 0),
    }))
  }

  async function computeAgentAllOrgs(): Promise<void> {
    const rows = await runQuery<Record<string, unknown>>(agentAllOrgsQuery())
    agentAllOrgs.value = Number(rows[0]?.orgs ?? 0)
  }

  async function computeAgentToolOrgs(): Promise<void> {
    const tool = agentScope.value.tool
    if (!tool) {
      agentToolOrgs.value = []
      return
    }
    const rows = await runQuery<Record<string, unknown>>(agentToolOrgQuery(tool, dateRange.value.from, dateRange.value.to))
    agentToolOrgs.value = rows.map(r => ({
      orgId: String(r.orgId ?? ''),
      organization: String(r.organization ?? ''),
      name: r.name === null || r.name === undefined ? null : String(r.name),
      marketplace: r.marketplace === null || r.marketplace === undefined ? null : String(r.marketplace),
      calls: Number(r.calls ?? 0),
      lastCalled: r.lastCalled === null || r.lastCalled === undefined ? null : String(r.lastCalled),
      success: successRate(Number(r.successCalls ?? 0), Number(r.calls ?? 0)),
      errors: Number(r.errors ?? 0),
    }))
  }

  async function computeAgentToolTrend(): Promise<void> {
    const tool = agentScope.value.tool
    if (!tool) {
      agentToolTrend.value = []
      return
    }
    const rows = await runQuery<Record<string, unknown>>(agentToolTrendQuery(tool, dateRange.value.from, dateRange.value.to))
    agentToolTrend.value = rows.map(r => ({
      date: String(r.date ?? ''),
      calls: Number(r.calls ?? 0),
      orgs: Number(r.orgs ?? 0),
      profiles: Number(r.profiles ?? 0),
    }))
  }

  async function computeAdsAccounts(): Promise<void> {
    const fromDate = dateRange.value.from
    const toDate = dateRange.value.to
    adsAccounts.value = (await runQuery<Record<string, unknown>>(adsAccountsQuery(fromDate, toDate))).map(r => ({
      ...(r as unknown as AdsAccount),
      profiles: [Number(r.profilesEnabled), Number(r.profilesTotal)],
      ams: [Number(r.amsEnabled), Number(r.amsTotal)],
      adSpendSplit: { sp: Number(r.spAdSpend), sb: Number(r.sbAdSpend), sd: Number(r.sdAdSpend) },
      launched: { sp: Number(r.launchedSp), sb: Number(r.launchedSb), sd: Number(r.launchedSd) },
    }))
  }

  async function computeSubAccounts(): Promise<void> {
    const fromDate = dateRange.value.from
    const toDate = dateRange.value.to
    subAccounts.value = (await runQuery<Record<string, unknown>>(subAccountsQuery(fromDate, toDate))).map(r => ({
      ...(r as unknown as SubAccount),
      adsAccess: [Number(r.adsAccessEnabled), Number(r.adsAccessTotal)],
      profileAccess: [Number(r.profileAccessEnabled), Number(r.profileAccessTotal)],
      launched: { sp: Number(r.launchedSp), sb: Number(r.launchedSb), sd: Number(r.launchedSd) },
    }))
  }

  async function computeLaunchOutput(): Promise<void> {
    launchOutput.value = await runQuery<LaunchOutput>(launchOutputQuery(dateRange.value.from, dateRange.value.to))
  }

  /** Labels for every attribution flag that is set on this row. */
  function flagsToLabels(row: Record<string, unknown>, pairs: [string, string][]): string[] {
    return pairs.filter(([flag]) => Number(row[flag]) > 0).map(([, label]) => label)
  }

  /**
   * The DuckDB relation holding the current profile's campaigns. Naming it after the
   * profile and range keeps every ingest a first ingest: DuckDB does not replace the
   * rows of a relation that already exists, so a second profile reusing one fixed
   * name would silently keep serving the previous profile's rows.
   */
  const campaignsTable = ref('campaigns')

  async function computeCampaigns(): Promise<void> {
    campaigns.value = (await runQuery<Record<string, unknown>>(campaignsQuery(campaignsTable.value))).map(r => ({
      ...(r as unknown as Campaign),
      managedBy: flagsToLabels(r, MANAGING_ACTIONS),
      // "affected" means the campaign actually received that optimisation, which
      // the counter columns record independently of the schedule attribution.
      affectedBy: [
        Number(r.bidsOptimized) > 0 ? 'Bid Optimization' : '',
        Number(r.budgetsOptimized) > 0 ? 'Budget Optimization' : '',
        Number(r.placementsOptimized) > 0 ? 'Placement Optimization' : '',
      ].filter(Boolean),
      launchedBy: flagsToLabels(r, LAUNCHING_ACTIONS)[0] ?? '',
    }))
  }

  /**
   * Lazily fetch the (heavy) campaign fact + dim from the backend Arrow endpoint
   * and load them into DuckDB. Called only when the user drills into a profile's
   * campaign table or the profile+action analytics page — never on first load.
   */
  async function loadCampaigns(profileId?: string, force = false): Promise<void> {
    // The all-profile campaign fact is ~19.0M rows over the 60-day window
    // (19,040,438 rows across 916 profiles, measured 2026-09-14). Ingesting that
    // into DuckDB-Wasm is not viable, so the unscoped fetch is refused outright
    // instead of being attempted and hanging the page.
    if (!profileId)
      return
    const fromDate = dateRange.value.from
    const toDate = dateRange.value.to
    // The response is a server-side aggregate for one (profile, range), so the
    // range is part of the cache key: widening the dates must refetch.
    const cacheKey = `${profileId}|${fromDate}|${toDate}`
    const table = `campaigns_${[profileId, fromDate, toDate].join('_').replace(/[^A-Z0-9]/gi, '_')}`
    campaignsProfileId.value = profileId
    // Skip only when every precondition still holds: the same request was loaded,
    // its rows are still in memory (a legitimate empty result is remembered too,
    // so it does not refetch on every visit) and the DuckDB relation is present.
    const settled = campaignsLoaded.value
    if (!force && settled?.key === cacheKey && settled.rows === campaigns.value.length && isArrowTableLoaded(table))
      return
    // The scope's table outlives this component, so a second visit needs no request
    // at all. A failure at this point would only report a problem with data the page
    // already has, so the request is skipped while the relation is present.
    if (!force && isArrowTableLoaded(table)) {
      try {
        campaignsTable.value = table
        await computeCampaigns()
        campaignsLoaded.value = { key: cacheKey, rows: campaigns.value.length }
        error.value = null
        return
      }
      catch {
        // The relation went away between the check and the query (recycled, or the
        // worker restarted): fall through and fetch it again.
      }
    }
    campaignsLoading.value = true
    let failed: unknown = null
    for (const attempt of [0, 1]) {
      try {
        // Retry once with a cache-buster (the backend keys its own cache on the
        // profile and range, so the retry is still a hit server-side). Two
        // environment-shaped problems - a cached/evicted body and a transient ingest
        // failure - both used to reach the reader as an empty table that only a
        // manual reload fixed. The app now performs that reload itself.
        const params = new URLSearchParams({ amazon_profile_id: profileId, from: fromDate, to: toDate })
        if (attempt > 0)
          params.set('_', String(Date.now()))
        const bytes = await fetchArrow(`/customer-tracking/performance/campaigns?${params.toString()}`)
        if (!isArrowTableLoaded(table))
          await loadArrowDataset(table, bytes)
        campaignsTable.value = table
        await computeCampaigns()
        failed = null
        if (campaigns.value.length > 0 || attempt > 0)
          break
      }
      catch (e) {
        failed = e
      }
    }
    if (failed) {
      // Leave the key unset so the next visit retries instead of trusting a
      // half-loaded table.
      campaignsLoaded.value = null
      error.value = failed instanceof Error ? failed.message : String(failed)
    }
    else {
      campaignsLoaded.value = { key: cacheKey, rows: campaigns.value.length }
      error.value = null
    }
    campaignsLoading.value = false
  }

  /**
   * Load the two server aggregates behind the schedule page: how the account's
   * spend splits between campaigns this action touched, campaigns other schedules
   * touched, and untouched campaigns, plus each touched campaign's before/after
   * comparison around its first touch.
   *
   * Both read a ~20M row campaign view, so ClickZetta aggregates them and ships
   * Arrow; the browser only ever holds the (small) result.
   */
  /**
   * The category of the action on screen, once the schedule dim has an opinion.
   *
   * The dim is loading in parallel and may not have arrived: deciding too early sent the
   * first-touch query on exactly the pages that cannot show it. The wait is bounded - the
   * dim is a few MB the page needs anyway - and `''` means "not known", which callers treat
   * as "keep the query": a missing card is recoverable, a missing number is not.
   */
  async function actionCategoryOf(actionType: string, waitMs = 8000): Promise<string> {
    if (!performanceSchedules.value.length) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(finish, waitMs)
        const stop = watch(performanceSchedules, finish, { once: true })
        function finish() {
          clearTimeout(timer)
          stop()
          resolve()
        }
      })
    }
    return performanceSchedules.value.find(s => s.actionType === actionType)?.actionCategory ?? ''
  }

  async function loadScheduleAnalytics(actionType: string, profileId?: string, scheduleIds?: string[]): Promise<void> {
    if (!actionType)
      return
    const fromDate = dateRange.value.from
    const toDate = dateRange.value.to
    analyticsScope.value = { actionType, profileId, scheduleIds }
    // `undefined` is "no filter" and an empty array is "the filter kept nothing";
    // the two must not share a cache key just because both look empty.
    const scopeKey = scheduleIds === undefined ? 'all' : `n${scheduleIds.length}:${hashIds(scheduleIds)}`
    // One table per (action, profile scope, range, schedule filter) - everything the
    // payload depends on, and nothing less.
    //
    // Naming the table after the schedule filter alone meant a profile-scoped page
    // reused the unscoped table and a new date range kept the previous numbers: an
    // existing relation is deliberately reused instead of re-ingested (see
    // loadArrowDataset), so anything missing from the name is silently stale data.
    const tableSuffix = hashIds([actionType, profileId ?? 'all', fromDate, toDate, scopeKey])
    const cacheKey = `${actionType}|${profileId ?? 'all'}|${fromDate}|${toDate}|${scopeKey}`
    if (analyticsLoadedFor.value === cacheKey)
      return
    // No profile scope means the whole tracked book of business, which is the same
    // population the L1 tables aggregate.
    const body: Record<string, unknown> = { action_type: actionType, from: fromDate, to: toDate }
    if (profileId)
      body.amazon_profile_ids = [profileId]
    if (scheduleIds !== undefined)
      body.schedule_ids = scheduleIds
    // A campaign-launch action creates campaigns and never touches an existing one,
    // so the first-touch aggregate has no question to answer on its page. It is not
    // fetched at all rather than fetched and hidden: the page waits on both requests
    // before it renders, and querying a number nobody reads is pure latency.
    //
    // Only the decision waits for the schedule dim (see `firstTouchAppliesTo`); the
    // attribution request, which is the slow one, starts straight away.
    analyticsLoading.value = true
    try {
      // One dim read decides both questions. A launch action creates campaigns and never
      // manages one, so it has no first touch to measure *and*, now that its charts are a
      // single client-side trend, nothing on the page reads the attribution aggregate
      // either - fetching it would be pure latency on the page's critical path.
      const category = await actionCategoryOf(actionType)
      const isLaunch = category === LAUNCH_CATEGORY
      const wantsFirstTouch = !isLaunch
      const wantsAttribution = !isLaunch
      const attributionPromise = wantsAttribution
        ? postArrow('/customer-tracking/performance/attribution', body)
        : Promise.resolve(null)
      const firstTouchPromise = wantsFirstTouch
        ? postArrow('/customer-tracking/performance/first-touch', { ...body, window_days: FIRST_TOUCH_WINDOW_DAYS })
        : Promise.resolve(null)
      // The trend's money series rides along: it is its own dataset and its own query, and
      // it does not depend on the schedule filter (that is applied in the browser), so it
      // is keyed and cached separately.
      const trendKey = `${actionType}|${profileId ?? 'all'}|${fromDate}|${toDate}`
      const trendPromise = actionTrendLoadedFor.value === trendKey
        ? Promise.resolve()
        : loadActionTrendMoney(actionType, profileId).then(() => { actionTrendLoadedFor.value = trendKey })
      const [attribution, firstTouch] = await Promise.all([attributionPromise, firstTouchPromise, trendPromise]).then(r => [r[0], r[1]] as const)
      // One physical table per filter scope, rather than replacing a shared
      // \`perf_attribution\`.
      //
      // Re-using one name means every refresh depends on how DuckDB treats an Arrow
      // ingest into an existing relation, and the browser kept serving the previous
      // rows: the charts stayed on the unfiltered aggregate while the request that
      // carried the filter came back with the right bytes. A name derived from the
      // scope cannot collide, so an ingest is always a first ingest into a new table.
      const attributionTable = `perf_attribution_${tableSuffix}`
      const firstTouchTable = `perf_first_touch_${tableSuffix}`
      // A scope's table outlives this component: coming back to a scope must reuse
      // it, both to avoid re-downloading and because re-ingesting into an existing
      // relation is the one path that behaved inconsistently.
      if (attribution && !isArrowTableLoaded(attributionTable))
        await loadArrowDataset(attributionTable, attribution)
      if (firstTouch && !isArrowTableLoaded(firstTouchTable))
        await loadArrowDataset(firstTouchTable, firstTouch)
      const [attributionRows, firstTouchRows] = await Promise.all([
        wantsAttribution ? runQuery<AttributionRow>(`SELECT * FROM "${attributionTable}"`) : Promise.resolve([] as AttributionRow[]),
        wantsFirstTouch
          ? runQuery<FirstTouchRow>(`SELECT * FROM "${firstTouchTable}"`)
          : Promise.resolve([] as FirstTouchRow[]),
      ])
      perfAttribution.value = attributionRows
      perfFirstTouch.value = firstTouchRows
      analyticsLoadedFor.value = cacheKey
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
    finally {
      analyticsLoading.value = false
    }
  }

  const REFS: Record<string, { datasets: string[], compute: () => Promise<void> }> = {
    organizations: { datasets: ['accounts_l1_dim', 'accounts_l1_fact'], compute: computeOrganizations },
    accountProfiles: { datasets: ['accounts_l2_profiles'], compute: computeAccountProfiles },
    profiles: { datasets: ['profiles', 'ad_performance', 'schedule_events', 'profile_daily'], compute: computeProfiles },
    schedules: { datasets: ['schedules', 'schedule_events'], compute: computeSchedules },
    performanceProfiles: { datasets: ['performance_l1_profiles_dim', 'performance_l1_profiles_fact'], compute: computePerformanceProfiles },
    performanceSchedules: { datasets: ['performance_l2_schedules_dim', 'performance_l2_schedules_fact'], compute: computePerformanceSchedules },
    performanceDailyRows: { datasets: ['performance_l1_profiles_fact'], compute: computePerformanceDaily },
    actionActivityDaily: { datasets: ['performance_l2_schedules_fact'], compute: computeActionActivityDaily },
    agentOrgProfiles: { datasets: ['agent_analytics_l1_org', 'agent_analytics_shared_tools'], compute: computeAgentOrgProfiles },
    agentUsageIntensity: { datasets: ['agent_analytics_l1_org'], compute: computeAgentUsageIntensity },
    agentAllOrgs: { datasets: ['agent_analytics_l1_org'], compute: computeAgentAllOrgs },
    toolStats: { datasets: ['agent_analytics_shared_tools'], compute: computeToolStats },
    agentToolPairs: { datasets: ['agent_analytics_shared_tools'], compute: computeAgentToolPairs },
    agentOrgTools: { datasets: ['agent_analytics_shared_tools'], compute: computeAgentOrgTools },
    agentToolOrgs: { datasets: ['agent_analytics_shared_tools'], compute: computeAgentToolOrgs },
    agentToolTrend: { datasets: ['agent_analytics_shared_tools'], compute: computeAgentToolTrend },
    // The conversation export is 67MB; it is only loaded by the page that shows it.
    // Declared for the range watcher to re-run once the tab has loaded it; it is *not*
    // in PAGE_REFS, because loading it with the page would make the tools tab wait on a
    // 67MB download it never shows.
    // Its own loader: the conversations come from an endpoint that filters by
    // organization, not from an OSS dataset this page downloads.
    agentOrgChats: { datasets: [], compute: loadAgentChatsCore },
    adsAccounts: { datasets: ['accounts_l2_ads_account'], compute: computeAdsAccounts },
    subAccounts: { datasets: ['accounts_l2_sub_accounts'], compute: computeSubAccounts },
    launchOutput: { datasets: ['schedule_events', 'schedules'], compute: computeLaunchOutput },
  }

  const PAGE_REFS: Record<string, string[]> = {
    'accounts': ['organizations'],
    'account-detail': ['organizations', 'accountProfiles', 'adsAccounts', 'subAccounts'],
    // 'schedules' feeds the Performance page's Schedules tab (the action_type
    // roll-up). Without it schedules.value stays empty and that tab renders no
    // rows, which also makes the L2 drill-down unreachable.
    'performance': ['performanceProfiles', 'performanceSchedules', 'performanceDailyRows'],
    // Every Performance page reads its identity from the page-level export: the
    // legacy 'profiles' dataset ships a different id set, so using it here made a
    // profile opened from the L1 table resolve to the wrong row (and, in turn, to
    // an empty campaign table).
    'profile': ['performanceProfiles', 'performanceDailyRows', 'campaigns'],
    // The L2 schedule page keeps its own schedule rows (one per schedule) and pulls
    // the campaign-grain aggregates separately, keyed by action + profile scope.
    'schedules': ['performanceProfiles', 'performanceSchedules', 'actionActivityDaily'],
    'agent': ['agentOrgProfiles', 'agentUsageIntensity', 'agentAllOrgs', 'toolStats', 'agentToolPairs'],
    'agent-org': ['agentOrgProfiles', 'agentOrgTools'],
    'agent-tool-orgs': ['agentToolOrgs', 'agentToolTrend'],
  }

  /**
   * The refs whose contents depend on the *route* rather than only on the range.
   *
   * `computedRefs` is what keeps a page load from re-running every query it has ever
   * run; a scoped ref must not be protected by it, or the previous organization's tools
   * stay on screen after the route moves to the next one.
   */
  const SCOPED_REFS = ['agentOrgTools', 'agentOrgChats', 'agentToolOrgs', 'agentToolTrend']

  async function loadPage(page: string, profileId?: string, agentRoute?: { orgId?: string, tool?: string }): Promise<void> {
    const refNames = PAGE_REFS[page] || []
    if (refNames.length === 0)
      return
    for (const rn of SCOPED_REFS)
      computedRefs.delete(rn)
    dailyProfileId.value = page === 'profile' ? profileId ?? null : null
    agentScope.value = {
      orgId: Number(agentRoute?.orgId ?? Number.NaN),
      tool: agentRoute?.tool ? decodeURIComponent(agentRoute.tool) : '',
    }
    ready.value = false
    loading.value = true
    error.value = null
    try {
      const datasets = new Set<string>()
      for (const rn of refNames) {
        if (rn !== 'campaigns')
          REFS[rn].datasets.forEach(d => datasets.add(d))
      }
      await loadOssDatasets([...datasets])
      for (const rn of refNames) {
        if (rn === 'campaigns' || computedRefs.has(rn))
          continue
        try {
          await REFS[rn].compute()
          computedRefs.add(rn)
        }
        catch (e) {
          // Keep loading the remaining refs: one failing query must not blank the page.
          error.value = `${rn}: ${e instanceof Error ? e.message : String(e)}`
        }
      }
      ready.value = true
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
    finally {
      loading.value = false
    }
    if (refNames.includes('campaigns'))
      void loadCampaigns(profileId)
  }

  watch(() => dateRange.value, () => {
    if (!ready.value)
      return
    for (const rn of computedRefs)
      REFS[rn].compute()
    // A range change invalidates the aggregate, so refetch rather than recompute.
    if (campaignsLoaded.value !== null)
      void loadCampaigns(campaignsProfileId.value ?? undefined)
    if (analyticsLoadedFor.value !== null && analyticsScope.value)
      void loadScheduleAnalytics(analyticsScope.value.actionType, analyticsScope.value.profileId, analyticsScope.value.scheduleIds)
  }, { deep: true })

  return { ready, loading, campaignsLoading, analyticsLoading, error, loadPage, loadCampaigns, loadScheduleAnalytics, performanceProfiles, performanceSchedules, performanceDailyRows, actionActivityRows, actionTrendMoneyRows, perfAttribution, perfFirstTouch, organizations, profiles, accountProfilesData, campaigns, schedules, toolStats, agentOrgProfiles, agentOrgTools, agentToolOrgs, agentToolTrend, agentOrgChats, agentUsageRows, agentToolPairs, agentAllOrgs, adsAccounts, subAccounts, launchOutput, loadAgentChats, agentChatsLoading }
}
