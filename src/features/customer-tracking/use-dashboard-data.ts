import {
  avg,
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
import { loadArrowDataset, loadDataset, runQuery } from '@/services/mosaic'

import type { AdsAccount, AgentChat, Campaign, Organization, Profile, Schedule, SubAccount, ToolStat } from './types'

import { useFilterContext } from './filter-context'

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
  const res = await axiosInstance.get<ArrayBuffer>(url, { responseType: 'arraybuffer' })
  return new Uint8Array(res.data)
}

function parseJson<T>(value: unknown): T {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    }
    catch {
      return value as unknown as T
    }
  }
  return value as T
}

// ---- Mosaic SQL query builders ----

const col = (name: string, table?: string) => column(name, table)
function dateRange(fromDate: string, toDate: string, table?: string) {
  return isBetween(col('event_date', table), [literal(fromDate), literal(toDate)])
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

function campaignsQuery(fromDate: string, toDate: string): Query {
  const fact = Query.from('campaigns_fact')
    .select({
      amazon_campaign_id: col('amazon_campaign_id'),
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
    .where(isBetween(col('date'), [literal(fromDate), literal(toDate)]))
    .groupby(col('amazon_campaign_id'))
  return Query.from(
    join(from('campaigns_dim', 'd'), new FromClauseNode(fact, 'f'), { type: 'LEFT', on: eq(col('amazon_campaign_id', 'f'), col('amazon_campaign_id', 'd')) }),
  ).select({
    amazonCampaignId: col('amazon_campaign_id', 'd'),
    amazonProfileId: col('amazon_profile_id', 'd'),
    name: col('amazon_campaign_name', 'd'),
    adType: col('sponsored_ads_type', 'd'),
    managedBy: col('managed_by', 'd'),
    affectedBy: col('affected_by', 'd'),
    launchedBy: col('launched_by', 'd'),
    adSpend: coalesce(col('ad_spend', 'f'), 0),
    adSales: coalesce(col('ad_sales', 'f'), 0),
    adOrders: coalesce(col('ad_orders', 'f'), 0),
    impressions: coalesce(col('impressions', 'f'), 0),
    clicks: coalesce(col('clicks', 'f'), 0),
    acos: rate100(col('ad_spend', 'f'), col('ad_sales', 'f')),
    cpc: cond(gt(col('clicks', 'f'), 0), div(col('ad_spend', 'f'), col('clicks', 'f')), 0),
    cvr: rate100(col('ad_orders', 'f'), col('clicks', 'f')),
    optimizationEvents: coalesce(col('optimization_events', 'f'), 0),
    bidsOptimized: coalesce(col('bids_optimized', 'f'), 0),
    budgetsOptimized: coalesce(col('budgets_optimized', 'f'), 0),
    placementsOptimized: coalesce(col('placements_optimized', 'f'), 0),
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

function toolStatsQuery(fromDate: string, toDate: string): Query {
  return Query.from('agent_events')
    .select({
      tool: col('tool'),
      profilesUsing: count(col('amazon_profile_id')).distinct(),
      calls: sum(col('calls')),
      lastCalled: max(col('event_date')),
      success: round(avg(col('success')), 1),
      errors: sum(col('errors')),
    })
    .where(dateRange(fromDate, toDate))
    .groupby(col('tool'))
}

function agentChatsQuery(): Query {
  return Query.from('agent_chats').select({
    name: col('name'),
    date: col('date'),
    sub: col('sub'),
    first: col('first'),
    summary: col('summary'),
  })
}

function agentProfileQuery(fromDate: string, toDate: string): Query {
  const ae = Query.from('agent_events')
    .select({
      amazon_profile_id: col('amazon_profile_id'),
      calls: sum(col('calls')),
      tools_used: count(col('tool')).distinct(),
      last_activity: max(col('event_date')),
    })
    .where(dateRange(fromDate, toDate))
    .groupby(col('amazon_profile_id'))
  const pd = Query.from('profile_daily')
    .select({ amazon_profile_id: col('amazon_profile_id'), chats: sum(col('chats')) })
    .where(dateRange(fromDate, toDate))
    .groupby(col('amazon_profile_id'))
  return Query.from(
    join(
      join(from('profiles', 'p'), new FromClauseNode(ae, 'ae'), { type: 'LEFT', on: eq(col('amazon_profile_id', 'ae'), col('amazon_profile_id', 'p')) }),
      new FromClauseNode(pd, 'pd'),
      { type: 'LEFT', on: eq(col('amazon_profile_id', 'pd'), col('amazon_profile_id', 'p')) },
    ),
  ).select({
    amazonProfileId: col('amazon_profile_id', 'p'),
    name: col('name', 'p'),
    marketplace: col('marketplace', 'p'),
    entity: col('entity', 'p'),
    organization: col('organization', 'p'),
    chats: coalesce(col('chats', 'pd'), 0),
    toolCalls: coalesce(col('calls', 'ae'), 0),
    toolsUsed: coalesce(col('tools_used', 'ae'), 0),
    lastActivity: col('last_activity', 'ae'),
  })
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

export interface AgentProfileStat {
  amazonProfileId: string
  name: string
  marketplace: string
  entity: string
  organization: string
  chats: number
  toolCalls: number
  toolsUsed: number
  lastActivity: string | null
}

export function useDashboardData() {
  const { dateRange } = useFilterContext()
  const ready = ref(false)
  const loading = ref(false)
  const campaignsLoading = ref(false)
  const error = ref<string | null>(null)
  const loadedOss = new Set<string>()
  const campaignsLoadedFor = ref<string | null>(null)
  const computedRefs = new Set<string>()

  const organizations = ref<Organization[]>([])
  const profiles = ref<Profile[]>([])
  const accountProfilesData = ref<Record<string, unknown>[]>([])
  const campaigns = ref<Campaign[]>([])
  const schedules = ref<Schedule[]>([])
  const toolStats = ref<ToolStat[]>([])
  const agentChats = ref<AgentChat[]>([])
  const agentProfileStats = ref<AgentProfileStat[]>([])
  const adsAccounts = ref<AdsAccount[]>([])
  const subAccounts = ref<SubAccount[]>([])
  const launchOutput = ref<LaunchOutput[]>([])

  async function loadOssDatasets(names: string[]): Promise<void> {
    const pending = names.filter(n => !loadedOss.has(n))
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
      await loadDataset(
        name,
        parts.map(p => p.url),
        parts.map(p => `${name}__${p.key.split('/').pop() || 'part.parquet'}`),
      )
      loadedOss.add(name)
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

  async function computeToolStats(): Promise<void> {
    toolStats.value = await runQuery<ToolStat>(toolStatsQuery(dateRange.value.from, dateRange.value.to))
  }

  async function computeAgentChats(): Promise<void> {
    agentChats.value = await runQuery<AgentChat>(agentChatsQuery())
  }

  async function computeAgentProfileStats(): Promise<void> {
    agentProfileStats.value = await runQuery<AgentProfileStat>(agentProfileQuery(dateRange.value.from, dateRange.value.to))
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

  async function computeCampaigns(): Promise<void> {
    const fromDate = dateRange.value.from
    const toDate = dateRange.value.to
    campaigns.value = (await runQuery<Record<string, unknown>>(campaignsQuery(fromDate, toDate))).map(r => ({
      ...(r as unknown as Campaign),
      managedBy: parseJson<Campaign['managedBy']>(r.managedBy),
      affectedBy: parseJson<Campaign['affectedBy']>(r.affectedBy),
    }))
  }

  /**
   * Lazily fetch the (heavy) campaign fact + dim from the backend Arrow endpoint
   * and load them into DuckDB. Called only when the user drills into a profile's
   * campaign table or the profile+action analytics page — never on first load.
   */
  async function loadCampaigns(profileId?: string): Promise<void> {
    const cacheKey = profileId ?? '*'
    if (campaignsLoadedFor.value === cacheKey)
      return
    campaignsLoading.value = true
    try {
      const query = profileId ? `?amazon_profile_id=${encodeURIComponent(profileId)}` : ''
      const [campaignFact, campaignDim] = await Promise.all([
        fetchArrow(`/customer-tracking/campaigns/fact${query}`),
        fetchArrow(`/customer-tracking/campaigns/dim${query}`),
      ])
      await loadArrowDataset('campaigns_fact', campaignFact)
      await loadArrowDataset('campaigns_dim', campaignDim)
      campaignsLoadedFor.value = cacheKey
      await computeCampaigns()
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
    finally {
      campaignsLoading.value = false
    }
  }

  const REFS: Record<string, { datasets: string[], compute: () => Promise<void> }> = {
    organizations: { datasets: ['accounts_l1_dim', 'accounts_l1_fact'], compute: computeOrganizations },
    accountProfiles: { datasets: ['accounts_l2_profiles'], compute: computeAccountProfiles },
    profiles: { datasets: ['profiles', 'ad_performance', 'schedule_events', 'profile_daily'], compute: computeProfiles },
    schedules: { datasets: ['schedules', 'schedule_events'], compute: computeSchedules },
    toolStats: { datasets: ['agent_events'], compute: computeToolStats },
    agentChats: { datasets: ['agent_chats'], compute: computeAgentChats },
    agentProfileStats: { datasets: ['profiles', 'agent_events', 'profile_daily'], compute: computeAgentProfileStats },
    adsAccounts: { datasets: ['accounts_l2_ads_account'], compute: computeAdsAccounts },
    subAccounts: { datasets: ['accounts_l2_sub_accounts'], compute: computeSubAccounts },
    launchOutput: { datasets: ['schedule_events', 'schedules'], compute: computeLaunchOutput },
  }

  const PAGE_REFS: Record<string, string[]> = {
    'accounts': ['organizations'],
    'account-detail': ['organizations', 'accountProfiles', 'adsAccounts', 'subAccounts'],
    'performance': ['profiles'],
    'profile': ['profiles', 'campaigns'],
    'schedules': ['profiles', 'schedules', 'campaigns', 'launchOutput'],
    'agent': ['agentProfileStats', 'toolStats', 'agentChats'],
    'agent-profile': ['agentProfileStats', 'agentChats', 'profiles'],
    'tool-profiles': ['toolStats', 'profiles'],
  }

  async function loadPage(page: string, profileId?: string): Promise<void> {
    const refNames = PAGE_REFS[page] || []
    if (refNames.length === 0)
      return
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
    if (refNames.includes('campaigns') && campaignsLoadedFor.value !== (profileId ?? '*'))
      void loadCampaigns(profileId)
  }

  watch(() => dateRange.value, () => {
    if (!ready.value)
      return
    for (const rn of computedRefs)
      REFS[rn].compute()
    if (campaignsLoadedFor.value !== null)
      computeCampaigns()
  }, { deep: true })

  return { ready, loading, campaignsLoading, error, loadPage, organizations, profiles, accountProfilesData, campaigns, schedules, toolStats, agentChats, agentProfileStats, adsAccounts, subAccounts, launchOutput }
}
