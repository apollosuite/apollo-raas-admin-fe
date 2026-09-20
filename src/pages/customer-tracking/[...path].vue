<script setup lang="ts">
/* eslint-disable style/max-statements-per-line, ts/no-use-before-define */ // no-use-before-define: chart computeds lazily reference the useColumnFilters outputs (defined below); will be reordered on DuckDB migration
import type { ColumnDef } from '@tanstack/vue-table'

import { watchDebounced } from '@vueuse/core'
import { Search } from 'lucide-vue-next'
import { computed, h, ref } from 'vue'

import type { ActivityCounterKey } from '@/features/customer-tracking/performance-analytics'

import DataTable from '@/components/data-table/data-table.vue'
import { generateVueTable } from '@/components/data-table/use-generate-vue-table'
import { BasicPage } from '@/components/global-layout'
import { Badge } from '@/components/ui/badge'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  managedBook,
  scaleSummary,
  statusBreakdown,
  statusRadialCaption,
  statusRadialSlices,
  topBySpend,
} from '@/features/customer-tracking/account-analytics'
import {
  fillTrendDays,
  medianOf,
  rankWithTail,
  repeatBuckets,
  rollupBy,
  toolAdoption,
  trendSummary,
  usageBuckets,
  usageIntensity,
} from '@/features/customer-tracking/agent-analytics'
import {
  ACCOUNT_COLUMNS,
  ACCOUNT_PROFILE_COLUMNS,
  ADS_COLUMNS,
  AGENT_ORG_PROFILE_COLUMNS,
  AGENT_ORG_TOOL_COLUMNS,
  AGENT_TOOL_ORG_COLUMNS,
  CAMPAIGN_COLUMNS,
  CHAT_COLUMNS,
  DEFAULT_SORTS,
  makeColumns,
  PERF_PROFILE_COLUMNS,
  PERFORMANCE_SCHEDULE_COLUMNS,
  perfScheduleColumns,
  PROFILE_COLUMN,
  SUB_ACCOUNT_COLUMNS,
  TOOL_COLUMNS,
} from '@/features/customer-tracking/columns'
import ActionTrendChart from '@/features/customer-tracking/components/action-trend-chart.vue'
import CampaignActionsCell from '@/features/customer-tracking/components/campaign-actions-cell.vue'
import { chartTokens } from '@/features/customer-tracking/components/chart-theme'
import GroupedBarChart from '@/features/customer-tracking/components/grouped-bar-chart.vue'
import KpiChart from '@/features/customer-tracking/components/kpi-chart.vue'
import ScatterChart from '@/features/customer-tracking/components/scatter-chart.vue'
import StatTile from '@/features/customer-tracking/components/stat-tile.vue'
import StatusRadialChart from '@/features/customer-tracking/components/status-radial-chart.vue'
import TableToolbar from '@/features/customer-tracking/components/table-toolbar.vue'
import TrackingChart from '@/features/customer-tracking/components/tracking-chart.vue'
import TrendChart from '@/features/customer-tracking/components/trend-chart.vue'
import { useFilterContext } from '@/features/customer-tracking/filter-context'
import { formatMetric } from '@/features/customer-tracking/format'
import { actionCn } from '@/features/customer-tracking/mock'
import {
  ACTION_TREND_RIGHT_METRICS,
  actionTrendLeftMetrics,
  activityCounters,
  adProductLabel,
  actionTrendDays as buildActionTrendDays,
  DAILY_TREND_METRICS,
  dailySeries,
  DEFAULT_ACTION_TREND_RIGHT,
  DEFAULT_TREND_METRICS,
  efficiencyByAdProduct,
  firstTouchSummary,
  SCHEDULE_ACTION_METRIC_LABEL,
  scheduleActionMix,
  scheduleRollup,
  segmentVocabulary,
  seriesPeak,
  seriesTotal,
} from '@/features/customer-tracking/performance-analytics'
import { LAUNCH_CATEGORY } from '@/features/customer-tracking/types'
import { useColumnFilters } from '@/features/customer-tracking/use-column-filter'
import { FIRST_TOUCH_WINDOW_DAYS, useDashboardData } from '@/features/customer-tracking/use-dashboard-data'

const route = useRoute(); const router = useRouter(); const search = ref(''); const status = ref('all')
const { dateRange } = useFilterContext(); const dateRangeLabel = computed(() => `${dateRange.value.from} ~ ${dateRange.value.to}`)
const { organizations, accountProfilesData, campaigns, toolStats, agentOrgProfiles, agentUsageRows, agentToolPairs, agentAllOrgs, agentOrgTools, agentToolOrgs, agentToolTrend, agentOrgChats, adsAccounts, subAccounts, ready, error, loadPage, loadCampaigns, campaignsLoading, analyticsLoading, loadScheduleAnalytics, loadAgentChats, agentChatsLoading, performanceProfiles, performanceSchedules, performanceDailyRows, actionActivityRows, actionTrendMoneyRows, perfAttribution, perfFirstTouch } = useDashboardData()
const path = computed(() => String((route.params as any).path || 'accounts').split('/').filter(Boolean))
const page = computed(() => path.value[0] === 'accounts' && path.value[1] ? 'account-detail' : path.value[0] === 'performance' && path.value[1] === 'profile' && path.value[3] === 'schedules' ? 'schedules' : path.value[0] === 'performance' && path.value[1] === 'profile' ? 'profile' : path.value[0] === 'performance' && path.value[1] === 'schedules' ? 'schedules' : path.value[0] === 'agent' && path.value[1] === 'org' ? 'agent-org' : path.value[0] === 'agent' && path.value[1] === 'tool' ? 'agent-tool-orgs' : path.value[0] || 'accounts')
/**
 * The route scope of the two Agent L2 pages: the organization id, or the tool name.
 * Both are read by the hook's scoped queries, so the page never renders one scope's
 * numbers under another scope's heading.
 */
const agentRoute = computed(() => page.value === 'agent-org'
  ? { orgId: path.value[2] }
  : page.value === 'agent-tool-orgs'
    ? { tool: path.value[2] }
    : undefined)
const campaignProfileId = computed(() => page.value === 'profile' || (page.value === 'schedules' && path.value[1] === 'profile') ? path.value[2] : undefined)
// The catch-all page component is reused across routes, so free-text search must not survive
// navigation — otherwise a term typed on L1 silently empties the L2 tables.
watch(path, () => { search.value = ''; loadPage(page.value, campaignProfileId.value, agentRoute.value) }, { immediate: true })
const account = computed(() => organizations.value.find(a => String(a.orgId) === String(path.value[1])) || organizations.value[0]); const action = computed(() => page.value === 'schedules' ? decodeURIComponent(path.value[path.value[1] === 'profile' ? 4 : 2] || '') : ''); const scopedProfileId = computed(() => page.value !== 'schedules' ? null : path.value[1] === 'profile' ? path.value[2] : null)
/**
 * Identity for the Performance L2 profile page, from the page-level export.
 *
 * Deliberately no fallback to the first row: an id the export does not know (the
 * accounts export carries ~123 profiles with no ad activity in the window) must
 * show empty measurements rather than another profile's numbers. The export has
 * one row per (profile, org), and those differ only by organization, never by
 * measurement, so the first match is the whole measurement.
 */
const perfProfile = computed(() => performanceProfiles.value.find(p => p.amazonProfileId === path.value[2]))
const includesSearch = (value: unknown) => JSON.stringify(value).toLowerCase().includes(search.value.toLowerCase())
// The campaign Arrow was fetched for the profile in the URL, so the URL - not a
// lookup that can fail - decides which rows belong to this page.
const filteredAccounts = computed(() => organizations.value.filter(a => (status.value === 'all' || a.status === status.value) && includesSearch(a))); const profileCampaigns = computed(() => campaigns.value.filter(c => c.amazonProfileId === path.value[2] && includesSearch(c))); const filteredPerformanceProfiles = computed(() => performanceProfiles.value.filter(includesSearch))
/**
 * The schedules of the drilled action: one row per schedule, scoped to the profile
 * when the URL carries one. Free-text search stays client-side.
 */
const scopedPerfSchedules = computed(() => performanceSchedules.value.filter(s => (!action.value || s.actionType === action.value) && (!scopedProfileId.value || s.amazonProfileId === scopedProfileId.value) && includesSearch(s)))
const perfScheduleRowsSource = computed(() => scopedPerfSchedules.value.map(s => ({ ...s, profile: s.profileName })))
// The chart aggregates are keyed by action + profile scope + the filtered schedule
// set, and are far too large for DuckDB-Wasm, so they are pulled from the backend
// instead of loadPage. The watcher lives further down, next to the value it needs
// (the filtered schedule ids); see scheduleScopeIds.
// L2 tabs are scoped by the org id in the URL, so they never depend on the
// account lookup resolving (an unresolved/empty lookup must not blank the tabs).
const orgIdParam = computed(() => String(path.value[1] ?? '')); const accountProfiles = computed(() => accountProfilesData.value.filter(p => String(p.orgId) === orgIdParam.value && includesSearch(p))); const accountAds = computed(() => adsAccounts.value.filter(a => String(a.orgId) === orgIdParam.value && includesSearch(a))); const accountSubs = computed(() => subAccounts.value.filter(s => String(s.orgId) === orgIdParam.value && includesSearch(s)))
const title = computed(() => {
  if (!ready.value)
    return 'Loading…'
  switch (page.value) {
    case 'account-detail': return account.value?.name ?? 'Accounts'
    case 'performance': return 'Performance'
    case 'profile': return perfProfile.value?.name ?? path.value[2] ?? 'Performance'
    case 'schedules': return `${actionCn[action.value] || action.value} · Schedules`
    case 'agent': return 'Agent Analytics'
    case 'agent-org': return `${agentOrgName.value || path.value[2] || ''} · Org Details`
    case 'agent-tool-orgs': return `Orgs using ${agentToolName.value}`
    default: return 'Hanna Accounts'
  }
})
const breadcrumbs = computed(() => {
  if (!ready.value)
    return []
  const items: { label: string, to?: string }[] = []
  const add = (label: string, to?: string) => items.push(to ? { label, to } : { label })
  if (page.value === 'account-detail') {
    add('Accounts', '/customer-tracking/accounts')
    add(account.value.name)
  }
  else if (page.value === 'profile') {
    add('Performance', '/customer-tracking/performance')
    add(perfProfile.value?.name ?? path.value[2])
  }
  else if (page.value === 'schedules') {
    add('Performance', '/customer-tracking/performance')
    if (scopedProfileId.value)
      add(perfProfile.value?.name ?? scopedProfileId.value, `/customer-tracking/performance/profile/${scopedProfileId.value}`)
    add(`${actionCn[action.value] || action.value} Schedules`)
  }
  else if (page.value === 'agent-org') {
    add('Agent Analytics', '/customer-tracking/agent')
    add(agentOrgName.value || path.value[2] || '')
  }
  else if (page.value === 'agent-tool-orgs') {
    add('Agent Analytics', '/customer-tracking/agent')
    add(`Orgs using ${agentToolName.value}`)
  }
  else {
    add(page.value === 'agent' ? 'Agent Analytics' : page.value === 'performance' ? 'Performance' : 'Accounts')
  }
  return items
})
const tabDefaults: Record<string, string> = { 'account-detail': 'profiles', 'performance': 'profiles', 'schedules': 'schedules', 'agent': 'org', 'agent-org': 'tools' }

// L1 — Performance. Every number and chart here is computed from the *filtered*
// profile rows, so a filter on the table above feeds straight into the charts:
// one grain (profile x org), one source of truth, no second query.
const sumProfiles = (pick: (p: (typeof performanceProfiles.value)[number]) => number) => perfProfileTableRows.value.reduce((n, p) => n + pick(p), 0)
const performanceOptimizationEvents = computed(() => sumProfiles(p => p.optimizationEvents))
const performanceScheduleRuns = computed(() => sumProfiles(p => p.scheduleRuns))
const performanceActiveSchedules = computed(() => sumProfiles(p => p.activeSchedules))
const performanceSpend = computed(() => sumProfiles(p => p.adSpendSplit.sp + p.adSpendSplit.sb + p.adSpendSplit.sd))
const performanceSales = computed(() => sumProfiles(p => p.adSales))
const performanceAcos = computed(() => performanceSales.value ? performanceSpend.value / performanceSales.value * 100 : 0)
const performanceProfilesCount = computed(() => new Set(perfProfileTableRows.value.map(p => p.amazonProfileId)).size)
/** The profiles the L1 tables and charts are currently looking at. */
const keptProfileIds = computed(() => new Set(perfProfileTableRows.value.map(p => p.amazonProfileId)))
/**
 * The three action-type pies read the schedule dim, not the profile table, because
 * runs and created entities are recorded per schedule. They still follow the profile
 * table: keeping profiles keeps their schedules, so the pies answer "of the profiles I
 * can see, which action did the work".
 */
const performanceScheduleRows = computed(() => {
  const kept = keptProfileIds.value
  return performanceSchedules.value.filter(s => kept.has(String(s.amazonProfileId ?? '')))
})
const performanceRunMix = computed(() => scheduleActionMix(performanceScheduleRows.value, 'scheduleRuns'))
const performanceCampaignMix = computed(() => scheduleActionMix(performanceScheduleRows.value, 'campaignsCreated'))
const performanceTargetingMix = computed(() => scheduleActionMix(performanceScheduleRows.value, 'targetingsCreated'))
/**
 * The L1 trend, re-aggregated per day from the rows of the profiles the table kept.
 *
 * The fact export is (profile, date) grain, so filtering profiles is a filter on the
 * trend as well; the sum is taken over whatever survived the table.
 */
const performanceDailyChart = computed(() => dailySeries(performanceDailyRows.value.filter(row => keptProfileIds.value.has(String(row.amazonProfileId ?? '')))))
// L2 — Profile
/** The profile's own daily series: this page's fact rows are already scoped to it. */
const profileDailyChart = computed(() => dailySeries(performanceDailyRows.value))
const profileCampaignMix = computed(() => {
  // Grouped by the app's SP/SB/SD abbreviations, not the lakehouse' full product
  // names, so the legend matches every other table and chart on the page.
  const counts: Record<string, number> = {}
  for (const c of campaignRows.value) {
    const key = adProductLabel(c.adType)
    counts[key] = (counts[key] ?? 0) + 1
  }
  return Object.entries(counts).map(([name, value]) => ({ name, value }))
})
/** Force a refetch of the campaign aggregate, bypassing the loaded-key guard. */
function reloadCampaigns() {
  void loadCampaigns(campaignProfileId.value, true)
}
const profileSpend = computed(() => {
  const split = perfProfile.value?.adSpendSplit
  return split ? split.sp + split.sb + split.sd : 0
})
// Campaign grain, like the table it sits above: summing the filtered rows means the
// donut answers "of the campaigns I can see, what did we optimise?".
const profileOptMix = computed(() => [
  { name: '竞价', value: campaignRows.value.reduce((n, c) => n + c.bidsOptimized, 0) },
  { name: '预算', value: campaignRows.value.reduce((n, c) => n + c.budgetsOptimized, 0) },
  { name: '版位', value: campaignRows.value.reduce((n, c) => n + c.placementsOptimized, 0) },
])
// L2 — Schedules. Two questions share this page: what our schedules did over the
// range (client-side, from the schedule rows already in DuckDB) and whether it
// moved the account (server aggregates, pulled per action + scope).
// Both charts read the *filtered* schedule rows: same grain as the table below them,
// so a filter on Status or Sub Account redraws them.
/**
 * The drilled action's category. It decides which half of the metrics the whole page
 * shows: an optimisation schedule changes bids/budgets/placements on campaigns that
 * already exist, a launch schedule creates campaigns, ad groups and targetings, and
 * neither family is meaningful on the other's page. The table columns, the activity
 * chart and the segment names all read it.
 */
const perfActionCategory = computed(() => performanceSchedules.value.find(s => s.actionType === action.value)?.actionCategory ?? '')
const isLaunchAction = computed(() => perfActionCategory.value === LAUNCH_CATEGORY)
/**
 * What this page calls the three attribution segments: an optimisation page manages
 * campaigns, a launch page creates them. Same rows, different question.
 */
const scheduleSegments = computed(() => segmentVocabulary(perfActionCategory.value))
const scheduleActivity = computed(() => activityCounters(perfScheduleTableRows.value, perfActionCategory.value))
const activityValue = (key: ActivityCounterKey) => scheduleActivity.value.find(a => a.key === key)?.value ?? 0
/**
 * The headline counters, in the page's own words, keeping only the ones this action
 * category can produce - the same rule the chart and the table columns follow.
 */
const ACTIVITY_HEADLINE: readonly { key: ActivityCounterKey, label: string }[] = [
  { key: 'schedules', label: 'Schedules' },
  { key: 'scheduleRuns', label: 'Schedule Runs' },
  { key: 'optimizationEvents', label: 'Optimization Events' },
  { key: 'campaignsCreated', label: 'Campaigns Created' },
  { key: 'adGroupsCreated', label: 'Ad Groups Created' },
  { key: 'targetingsCreated', label: 'Targetings Created' },
]
const headlineCounters = computed(() => ACTIVITY_HEADLINE.filter(c => scheduleActivity.value.some(a => a.key === c.key)))
// Chart 3 is deliberately a fair fight: ACoS of the action's own campaigns against
// the untouched baseline, per ad product. On this data our segment is *not* cheaper,
// which is exactly why the value story rests on the within-campaign comparison below.
const efficiency = computed(() => efficiencyByAdProduct(perfAttribution.value, scheduleSegments.value))
const firstTouch = computed(() => firstTouchSummary(perfFirstTouch.value, FIRST_TOUCH_WINDOW_DAYS))
const firstTouchVolume = computed(() => ({
  categories: ['广告花费 / 活动·天', '广告销售额 / 活动·天'],
  series: [
    { name: `触达前（${firstTouch.value.windowDays} 天）`, values: [firstTouch.value.before.spendPerCampaignDay, firstTouch.value.before.salesPerCampaignDay] },
    { name: `触达后（${firstTouch.value.windowDays} 天）`, values: [firstTouch.value.after.spendPerCampaignDay, firstTouch.value.after.salesPerCampaignDay] },
  ],
}))
const firstTouchRates = computed(() => ({
  categories: ['ACoS', 'CVR'],
  series: [
    { name: '触达前', values: [firstTouch.value.before.acos, firstTouch.value.before.cvr] },
    { name: '触达后', values: [firstTouch.value.after.acos, firstTouch.value.after.cvr] },
  ],
}))
// The Agent page's tables respect the page search too: without this the search box
// was inert here (and so were the charts that read these rows).
const agentOrgProfileRows = computed(() => agentOrgProfiles.value.filter(includesSearch))
/**
 * The tool table's rows: the aggregate per tool, carrying its adoption numbers so
 * breadth, depth and retention can be read in the same row as the total.
 */
const toolRowsSource = computed(() => {
  const adoption = new Map(toolAdoptionRows.value.map(entry => [entry.tool, entry]))
  return toolStats.value.map((tool) => {
    const extra = adoption.get(tool.tool)
    return {
      ...tool,
      orgsUsing: extra?.orgs ?? tool.orgsUsing,
      callsPerOrg: extra ? Math.round(extra.callsPerOrg * 10) / 10 : 0,
      medianActiveDays: extra ? Math.round(extra.medianActiveDays * 10) / 10 : 0,
    }
  }).filter(includesSearch)
})
const orgToolRowsSource = computed(() => agentOrgTools.value.filter(includesSearch))
const toolOrgRowsSource = computed(() => agentToolOrgs.value.filter(includesSearch))
const chatRowsSource = computed(() => agentOrgChats.value.filter(includesSearch))
/** The organization the page is about: its name comes from the rows, the id from the URL. */
const agentOrgName = computed(() => agentOrgProfiles.value.find(r => String(r.orgId) === String(path.value[2]))?.organization ?? '')
const agentToolName = computed(() => decodeURIComponent(path.value[2] ?? ''))
const performanceScheduleBase = computed(() => scheduleRollup(performanceSchedules.value))
// ---------------------------------------------------------------------------
// One column set per table.
//
// The filter list, the column definitions and the toolbar all read the same symbol,
// so a table can never offer a filter for a column it does not show. (The schedule
// detail table used to filter against a fixed 15-column set while displaying a
// 9-column one, which left rows hidden by a filter the toolbar could not even name.)
// ---------------------------------------------------------------------------
const accountColumns = ACCOUNT_COLUMNS
const accountAdColumns = ADS_COLUMNS
const accountProfileColumns = ACCOUNT_PROFILE_COLUMNS
const accountSubColumns = SUB_ACCOUNT_COLUMNS
const perfProfileColumns = PERF_PROFILE_COLUMNS
const actionRollupColumns = PERFORMANCE_SCHEDULE_COLUMNS
const campaignColumns = CAMPAIGN_COLUMNS
const agentOrgProfileColumns = AGENT_ORG_PROFILE_COLUMNS
const toolColumns = TOOL_COLUMNS
const orgToolColumns = AGENT_ORG_TOOL_COLUMNS
const chatColumns = CHAT_COLUMNS
const toolOrgColumns = AGENT_TOOL_ORG_COLUMNS

const { filters: accountFilters, filtered: accountRows } = useColumnFilters(filteredAccounts, accountColumns)
const { filters: accountAdFilters, filtered: accountAdRows } = useColumnFilters(accountAds, accountAdColumns)
const { filters: accountProfileFilters, filtered: accountProfileRows } = useColumnFilters(accountProfiles, accountProfileColumns)
const { filters: accountSubFilters, filtered: accountSubRows } = useColumnFilters(accountSubs, accountSubColumns)
const { filters: perfProfileFilters, filtered: perfProfileTableRows } = useColumnFilters(filteredPerformanceProfiles, perfProfileColumns)
const { filters: perfScheduleFilters, filtered: perfScheduleRows } = useColumnFilters(performanceScheduleBase, actionRollupColumns)
const { filters: campaignFilters, filtered: campaignRows } = useColumnFilters(profileCampaigns, campaignColumns)
const { filters: agentOrgProfileFilters, filtered: agentOrgProfileFilteredRows } = useColumnFilters(agentOrgProfileRows, agentOrgProfileColumns)
const { filters: toolFilters, filtered: toolRows } = useColumnFilters(toolRowsSource, toolColumns)
const { filters: orgToolFilters, filtered: orgToolRows } = useColumnFilters(orgToolRowsSource, orgToolColumns)
const { filters: chatFilters, filtered: chatRows } = useColumnFilters(chatRowsSource, chatColumns)
const { filters: toolOrgFilters, filtered: toolOrgRows } = useColumnFilters(toolOrgRowsSource, toolOrgColumns)

// ---- Accounts: the paying book, in money ----
//
// The page is read by people whose revenue is the ad spend flowing through it, so every
// number here is about that spend over the range and about the accounts behind it. All of
// it derives from `accountRows`, the rows the table is actually showing, so a table filter
// redraws the strip and both charts - no separate query, no stale picture.
const accountBook = computed(() => managedBook(accountRows.value))
const accountStatusRows = computed(() => statusBreakdown(accountBook.value.managed))
const accountStatusRadial = computed(() => statusRadialSlices(accountStatusRows.value))
const accountRadialCaption = computed(() => statusRadialCaption(accountStatusRows.value))
const accountScale = computed(() => scaleSummary(accountBook.value.managed))
const accountAtRisk = computed(() => topBySpend(accountBook.value.managed, 'At Risk', 10))
const accountAtRiskSpend = computed(() => accountStatusRows.value.find(r => r.status === 'At Risk')?.spend ?? 0)
const accountAtRiskCount = computed(() => accountStatusRows.value.find(r => r.status === 'At Risk')?.orgs ?? 0)
/** Risk as a share of what we manage, which is the form the audience reads it in. */
const accountAtRiskShare = computed(() => {
  const { spend } = accountScale.value
  return spend > 0 ? accountAtRiskSpend.value / spend * 100 : 0
})
/** The denominator behind "在管广告主": every account in the export, before the paying filter. */
const accountTotalOrgs = computed(() => accountRows.value.length)
const accountAtRiskCaption = computed(() => {
  const { spend } = accountScale.value
  const atRisk = accountAtRiskSpend.value
  const share = spend > 0 ? atRisk / spend * 100 : 0
  return `At Risk 账号合计 ${formatMetric(atRisk, { currency: true })}，占在管花费 ${share.toFixed(1)}%。`
})
/** What the health numbers deliberately leave out, said out loud rather than hidden. */
const accountExcludedCaption = computed(() => {
  const { trial, noSpend } = accountBook.value.excluded
  return `口径：仅统计非试用版且有广告花费的账号——另有 ${trial.toLocaleString('en-US')} 个试用版账号、${noSpend} 个非试用版但区间内无花费的账号未计入。`
})
// Agent Analytics L1.
//
// These distributions have no head to name: over a month the biggest organization holds
// 4.3% of the tool calls and the top ten hold 33%, and the tools are used by ~54
// organizations each. A share-of-total ring therefore draws two thirds of itself as
// "Others" and answers nothing. The charts here show the *shape* of the population and
// the points outside it instead, and every tail is stated in words rather than hidden.
/** The rows rolled up per organization, which is what the two org pies show. */
const agentOrgRollup = computed(() => {
  const byOrg = new Map<string, { orgId: string, organization: string, toolCalls: number, chats: number }>()
  for (const row of agentOrgProfileFilteredRows.value) {
    const cell = byOrg.get(row.orgId) ?? { orgId: row.orgId, organization: row.organization, toolCalls: 0, chats: 0 }
    cell.toolCalls += row.toolCalls
    cell.chats += row.chats
    byOrg.set(row.orgId, cell)
  }
  return [...byOrg.values()]
})
const AGENT_TOP = 12
/** Orgs per usage band: the shape a share chart cannot show. */
const agentOrgUsageHistogram = computed(() => usageBuckets(agentOrgRollup.value.map(r => r.toolCalls)))
/** Adoption: organizations active in the range over organizations that ever onboarded. */
const agentAdoption = computed(() => ({
  active: agentOrgRollup.value.length,
  total: agentAllOrgs.value,
  rate: agentAllOrgs.value > 0 ? agentOrgRollup.value.length / agentAllOrgs.value * 100 : 0,
}))
/**
 * Calls against active days, per profile. The diagonal is normal usage; the points
 * above it are heavy use squeezed into few days, which is what "abnormal" means here.
 * Colouring by the per-day rate (not the total) is what makes the outlier visible - a
 * big total over many days is simply a busy profile.
 */
const agentIntensity = computed(() => usageIntensity(agentUsageRows.value.map(r => ({
  orgId: r.orgId,
  organization: r.organization,
  profile: r.profile || '未绑定 Profile',
  calls: r.calls,
  activeDays: r.activeDays,
}))))
const agentIntensityPoints = computed(() => {
  const { points, p95 } = agentIntensity.value
  const { palette } = chartTokens()
  return points.map(p => ({
    name: `${p.organization} · ${p.profile}`,
    x: p.activeDays,
    y: p.calls,
    size: p.calls,
    color: p.callsPerDay >= p95 ? palette[4] : palette[0],
    detail: `每活跃天 ${p.callsPerDay.toFixed(1)} 次`,
  }))
})
/**
 * The histogram's own tail sentence, so the reader knows what the bars cover.
 *
 * No ranked org bar here on purpose: the table below is already the ranking, and drawing
 * it twice would only move the same numbers next to the same numbers.
 */
const agentOrgUsageCaption = computed(() => {
  const bands = agentOrgUsageHistogram.value
  const middle = bands[3].value + bands[4].value
  return `按组织统计（共 ${agentAdoption.value.active} 个组织）：${middle} 个组织落在 21–500 次，中位水平即在此区间；没有任何组织超过整体用量的 5%。`
})
const agentTotalToolCalls = computed(() => agentOrgProfileFilteredRows.value.reduce((n, p) => n + p.toolCalls, 0))
const agentTotalChats = computed(() => agentOrgProfileFilteredRows.value.reduce((n, p) => n + p.chats, 0))
// L2 organization details
const orgToolCount = computed(() => new Set(orgToolRows.value.map(r => r.tool)).size)
const orgTotalCalls = computed(() => orgToolRows.value.reduce((n, r) => n + r.calls, 0))
const orgTotalErrors = computed(() => orgToolRows.value.reduce((n, r) => n + r.errors, 0))
/**
 * The same distributions as the L1 tabs, ranked: a bar reads a magnitude, a ring cannot.
 *
 * Both charts aggregate first. The table below is one row per (tool, sub account,
 * profile), so charting its rows directly drew one bar per *combination* - the same sub
 * account repeated for every tool it used - and its "top 12" was a top 12 of
 * combinations rather than of sub accounts.
 */
const orgSubAccountRollup = computed(() => rollupBy(orgToolRows.value, r => r.subAccount, r => r.subAccount || '—', r => r.calls))
/**
 * Long account names differ near the end, and the axis truncates the end away.
 *
 * "…youxiangsi" and "…xianggongsi" are different accounts that both render as
 * "xiamenlongwuchun…", which reads as a duplicated bar. Keeping the tail instead of the
 * head is what makes the label an identity. Full names stay in the tooltip.
 */
function shortProfileName(name: string, max = 18): string {
  return name.length > max ? `…${name.slice(-(max - 1))}` : name
}

/**
 * Profiles are rolled up by what the label can show: marketplace plus the name's tail.
 *
 * The export's profile name is the account's name, so one organization can hold several
 * profiles that share it; the marketplace-led short label is the identity a person can
 * act on. The table below keeps the exact grain.
 */
const orgProfileRollup = computed(() => rollupBy(
  orgToolRows.value,
  r => `${r.marketplace ?? ''}|${r.name ?? ''}`,
  r => (r.marketplace ? `${r.marketplace} · ${shortProfileName(r.name || '—')}` : shortProfileName(r.name || '—')),
  r => r.calls,
))
const orgSubAccountRank = computed(() => rankWithTail(orgSubAccountRollup.value, r => r.value, r => r.name, AGENT_TOP))
const orgProfileRank = computed(() => rankWithTail(orgProfileRollup.value, r => r.value, r => r.name, AGENT_TOP))
const orgSubAccountBars = computed(() => withTailRow(orgSubAccountRank.value))
const orgProfileBars = computed(() => withTailRow(orgProfileRank.value))
const orgSubAccountCaption = computed(() => rankCaption('子账号', orgSubAccountRank.value))
const orgProfileCaption = computed(() => rankCaption('Profile', orgProfileRank.value))
// L2 one tool, by organization
const toolOrgRollup = computed(() => {
  const byOrg = new Map<string, { orgId: string, organization: string, calls: number }>()
  for (const row of toolOrgRows.value) {
    const cell = byOrg.get(row.orgId) ?? { orgId: row.orgId, organization: row.organization, calls: 0 }
    cell.calls += row.calls
    byOrg.set(row.orgId, cell)
  }
  return [...byOrg.values()]
})
const toolTotalCallsByOrg = computed(() => toolOrgRollup.value.reduce((n, r) => n + r.calls, 0))
const orgUsingToolTotal = computed(() => toolOrgRollup.value.length)
/**
 * The tool's daily usage, with the days it was never called filled in as zeros.
 *
 * The export only carries days with rows, so a quiet Sunday used to arrive as no bar at
 * all - which reads as missing data rather than as nobody using the tool.
 */
const toolTrendDays = computed(() => fillTrendDays(agentToolTrend.value, dateRange.value.from, dateRange.value.to))
const toolTrendSummary = computed(() => trendSummary(toolTrendDays.value))
/** What the trend says, in a sentence, so the chart does not have to be read off by eye. */
const toolTrendCaption = computed(() => {
  const { peakCalls, peakDate, daysWithUse, quietDays, maxOrgs } = toolTrendSummary.value
  if (daysWithUse === 0)
    return '该区间内这个工具没有被调用。'
  return `区间内 ${daysWithUse} 天有调用、${quietDays} 天为零；峰值 ${peakCalls} 次（${peakDate}），单日最多 ${maxOrgs} 个组织在用。柱为调用量（左轴），实线为活跃组织数、虚线为活跃 Profile 数（右轴）。`
})
/**
 * The adoption matrix: breadth (organizations that called it) against depth (calls per
 * organization), sized by volume and coloured by failure rate. This is the chart that
 * separates "everyone tried it once" from "a few teams live in it".
 */
const toolAdoptionRows = computed(() => toolAdoption(agentToolPairs.value))
const toolAdoptionMedians = computed(() => ({
  orgs: medianOf(toolAdoptionRows.value.map(r => r.orgs)),
  callsPerOrg: medianOf(toolAdoptionRows.value.map(r => r.callsPerOrg)),
}))
const toolAdoptionPoints = computed(() => {
  const { palette } = chartTokens()
  const success = new Map(toolRows.value.map(t => [t.tool, t.success]))
  return toolAdoptionRows.value
    .filter(row => row.calls > 0)
    .map((row) => {
      const rate = 100 - (success.get(row.tool) ?? 100)
      return {
        name: row.tool,
        x: row.orgs,
        y: row.callsPerOrg,
        size: row.calls,
        color: rate > 15 ? palette[4] : rate > 5 ? palette[3] : palette[0],
        detail: `失败率 ${rate.toFixed(1)}% · 回访中位 ${row.medianActiveDays} 天`,
      }
    })
})
/** The one-and-done split: the closest thing to "do users like it" the export carries. */
const toolRepeatBuckets = computed(() => repeatBuckets(agentToolPairs.value))
const toolRepeatCaption = computed(() => {
  const buckets = toolRepeatBuckets.value
  const total = buckets.reduce((n, b) => n + b.value, 0) || 1
  const share = (value: number) => (value / total * 100).toFixed(0)
  return `按「工具 × 组织」共 ${total.toLocaleString('en-US')} 组计：${share(buckets[0].value)}% 只用过 1 天，${share(buckets[2].value)}% 用了 5 天以上。`
})
const toolAdoptionCaption = computed(() => {
  const { orgs, callsPerOrg } = toolAdoptionMedians.value
  const many = toolAdoptionRows.value.filter(r => r.orgs >= orgs && r.callsPerOrg >= callsPerOrg).length
  return `虚线为总体中位（使用组织 ${orgs} 个 · 每组织 ${callsPerOrg.toFixed(1)} 次）。右上象限 ${many} 个工具既被广泛使用、又被重复使用；气泡越大总调用越多，颜色越暖失败率越高。`
})
/** A ranked bar with its tail named as a row, so nothing is hidden behind "Others". */
function withTailRow(rank: { slices: { name: string, value: number }[], tailCount: number, tailValue: number }) {
  return rank.tailCount > 0 ? [...rank.slices, { name: `其余 ${rank.tailCount} 个`, value: rank.tailValue }] : rank.slices
}
function rankCaption(unit: string, rank: { tailCount: number, topShare: number }) {
  return rank.tailCount > 0
    ? `Top ${AGENT_TOP} 占 ${rank.topShare.toFixed(1)}%，另有 ${rank.tailCount} 个${unit}（合计一行列出）。`
    : `${AGENT_TOP} 个以内全部列出。`
}
const toolTotalCalls = computed(() => toolRows.value.reduce((n, t) => n + t.calls, 0))
const toolTotalErrors = computed(() => toolRows.value.reduce((n, t) => n + t.errors, 0))

/**
 * The Agent organization page opens on the tools tab, and the conversation export is
 * ~67MB: it is fetched when its own tab is opened instead of with the page.
 */
function onAgentOrgTab(tab: string | number) {
  if (String(tab) === 'chats')
    void loadAgentChats()
}
// ---- TanStack column definitions + pinned table instances ----
// One declaration per column (see columns.ts) drives cell rendering, sorting and
// the filter predicates. Tables are created ONCE with a reactive row getter:
// building them inside a `computed` recreated the table on every filter keystroke,
// which silently threw away the user's sort, column visibility and pinning.
// Actions are a fixed-width control column: neither sortable nor resizable.
const actionsCol: ColumnDef<any> = { id: 'actions', header: () => 'Actions', cell: ({ row }: any) => h(CampaignActionsCell, { campaign: row.original }), enableSorting: false, enableResizing: false, size: 96, minSize: 96, maxSize: 96 }

const navigate = (to: string) => router.push(to)

const accountCols = makeColumns(accountColumns, { href: (a: any) => `/customer-tracking/accounts/${a.orgId}`, badgeKeys: ['status'], navigate })
const accountAdCols = makeColumns(accountAdColumns, { navigate })
const accountProfileCols = makeColumns(accountProfileColumns, { href: (p: any) => `/customer-tracking/performance/profile/${p.amazonProfileId}`, navigate })
const accountSubCols = makeColumns(accountSubColumns, { navigate })
const perfProfileCols = makeColumns(perfProfileColumns, { href: (p: any) => `/customer-tracking/performance/profile/${p.amazonProfileId}`, badgeKeys: ['adsApi', 'amsApi', 'spApi'], navigate })
const perfScheduleCols = makeColumns(actionRollupColumns, { nameKey: 'action', href: (s: any) => `/customer-tracking/performance/schedules/${encodeURIComponent(s.action)}`, navigate })
const campaignCols = [...makeColumns(campaignColumns, { navigate }), actionsCol]
// The schedule table gains a Profile column only when it spans profiles; a
// profile-scoped URL repeats the same name on every row.
const activePerfScheduleColumns = computed(() => {
  const base = perfScheduleColumns(perfActionCategory.value)
  return scopedProfileId.value ? base : [base[0], PROFILE_COLUMN, ...base.slice(1)]
})
// Declared after the column set on purpose: the filter list is reconciled against it
// whenever the table swaps columns (a different action category).
const { filters: perfScheduleRowFilters, filtered: perfScheduleTableRows } = useColumnFilters(perfScheduleRowsSource, activePerfScheduleColumns)
/**
 * The schedules the table is currently showing, as an id list to push down.
 *
 * `undefined` means "nothing is filtered": the charts then ask for the whole action,
 * which is both cheaper and identical to what an unfiltered table shows. An empty
 * array is the opposite answer - the filter kept no schedule - and must reach the
 * server as such, so the charts come back empty instead of falling back to the
 * whole account. Every filter that changes the rows (column filters and the page
 * search alike) flows through the same filtered list.
 */
const scheduleScopeIds = computed(() => {
  const kept = perfScheduleTableRows.value
  if (kept.length === scopedPerfSchedules.value.length)
    return undefined
  return kept.map(s => s.scheduleId).sort()
})

/**
 * What this action did day by day, and what its campaigns earned.
 *
 * Cross-filtered by construction: the rows carry the schedule id, so the chart keeps the
 * schedules the table is showing and re-aggregates in the browser. A table filter redraws
 * it with no extra request, which is why the money series is not pre-aggregated per day by
 * the back end.
 *
 * Declared *after* `scheduleScopeIds` on purpose: the selection watcher below runs
 * immediately, so a computed that reads the filtered schedule ids from above its
 * declaration would touch them before initialization.
 */
// String, on both sides of the comparison: DuckDB hands int64 schedule ids back as numbers
// while the dim's own rows reach the page through a different projection, and a Set of
// numbers answers "no" to every string lookup - the chart would simply come back empty.
const actionScheduleIds = computed(() => new Set(scopedPerfSchedules.value.map(s => String(s.scheduleId))))
const actionTrendPointDays = computed(() => {
  const allowed = scheduleScopeIds.value === undefined ? undefined : new Set(scheduleScopeIds.value.map(String))
  const keep = (row: { scheduleId?: string }) => {
    const id = String(row.scheduleId ?? '')
    return actionScheduleIds.value.has(id) && (!allowed || allowed.has(id))
  }
  return buildActionTrendDays(
    actionActivityRows.value.filter(keep),
    actionTrendMoneyRows.value.filter(keep),
    dateRange.value.from,
    dateRange.value.to,
  )
})
const trendLeftMetrics = computed(() => actionTrendLeftMetrics(perfActionCategory.value, actionTrendPointDays.value))
const trendRightMetrics = computed(() => [...ACTION_TREND_RIGHT_METRICS])
const trendLeft = ref('')
const trendRight = ref<string>(DEFAULT_ACTION_TREND_RIGHT)
// A measure can disappear (another action's page, a re-filtered range), so the selection is
// reconciled against what is actually plottable - never left pointing at a metric that has
// no line behind it.
// `flush: 'post'` is load-bearing. An immediate watcher runs *during* setup, so reading a
// computed chain that reaches a ref declared further down the script threw
// "Cannot access 'scheduleScopeIds' before initialization" - and would again the next time
// someone reorders these blocks. Post-flush runs after setup has finished, so the
// selection is reconciled without depending on declaration order.
watch(trendLeftMetrics, (metrics) => {
  if (!metrics.some(m => m.key === trendLeft.value))
    trendLeft.value = metrics[0]?.key ?? ''
}, { immediate: true, flush: 'post' })
const trendLabels = computed(() => Object.fromEntries(trendLeftMetrics.value.map(m => [m.key, m.label])))
/** The readings, so the shape does not have to be eyeballed off the canvas. */
const trendCaption = computed(() => {
  const days = actionTrendPointDays.value
  if (!days.length || !trendLeft.value)
    return ''
  const parts: string[] = []
  // One measure per axis: the left select switches which count is drawn, so the caption
  // reports that one rather than stacking two of them.
  const key = trendLeft.value
  const peak = seriesPeak(days, key)
  if (peak.value > 0)
    parts.push(`${trendLabels.value[key] ?? key} 合计 ${Math.round(seriesTotal(days, key)).toLocaleString('en-US')}，峰值 ${Math.round(peak.value).toLocaleString('en-US')}（${peak.date}）`)
  const right = ACTION_TREND_RIGHT_METRICS.find(m => m.key === trendRight.value)
  if (right) {
    if (right.percent) {
      const spend = seriesTotal(days, 'adSpend')
      const sales = seriesTotal(days, 'adSales')
      parts.push(`区间 ACoS ${sales > 0 ? (spend / sales * 100).toFixed(1) : '0.0'}%`)
    }
    else {
      parts.push(`${right.label} 合计 ${formatMetric(seriesTotal(days, trendRight.value), { currency: true })}`)
    }
  }
  return `${parts.join('；')}。左轴为动作量，右轴为${right?.label ?? ''}。`
})

// Debounced because a filter is typed character by character, and every change is a
// ~20M-row aggregate on the lakehouse.
watchDebounced([page, action, campaignProfileId, scheduleScopeIds], () => {
  if (page.value === 'schedules' && action.value)
    void loadScheduleAnalytics(action.value, campaignProfileId.value, scheduleScopeIds.value)
}, { immediate: true, debounce: 400, maxWait: 2000 })
const activePerfScheduleCols = computed(() => makeColumns(activePerfScheduleColumns.value, { nameKey: 'scheduleName', badgeKeys: ['status', 'lastRunStatus'], navigate }))
// The frozen identity of the Agent tables is the organization: it is what the L2 page
// is about, and it is the link that opens it.
const agentOrgProfileCols = makeColumns(agentOrgProfileColumns, { nameKey: 'organization', href: (r: any) => `/customer-tracking/agent/org/${r.orgId}`, navigate })
const toolCols = makeColumns(toolColumns, { nameKey: 'tool', href: (t: any) => `/customer-tracking/agent/tool/${encodeURIComponent(t.tool)}/orgs`, navigate })
const orgToolCols = makeColumns(orgToolColumns, { nameKey: 'tool', navigate })
// The first message and the summary are prose: they never fit a column, so the cell shows
// one truncated line and the full text (line breaks included) opens on hover.
const chatCols = makeColumns(chatColumns, { navigate, previewKeys: ['first', 'summary'] })
const toolOrgCols = makeColumns(toolOrgColumns, { nameKey: 'organization', href: (r: any) => `/customer-tracking/agent/org/${r.orgId}`, navigate })

const accountTable = generateVueTable<any>({ columns: accountCols, data: () => accountRows.value, initialPinning: { left: ['name'], right: [] }, initialSorting: DEFAULT_SORTS.accounts })
const accountAdTable = generateVueTable<any>({ columns: accountAdCols, data: () => accountAdRows.value, initialPinning: { left: ['name'], right: [] }, initialSorting: DEFAULT_SORTS['account-ads'] })
const accountProfileTable = generateVueTable<any>({ columns: accountProfileCols, data: () => accountProfileRows.value, initialPinning: { left: ['name'], right: [] }, initialSorting: DEFAULT_SORTS['account-profiles'] })
const accountSubTable = generateVueTable<any>({ columns: accountSubCols, data: () => accountSubRows.value, initialPinning: { left: ['name'], right: [] }, initialSorting: DEFAULT_SORTS['account-subs'] })
const perfProfileTable = generateVueTable<any>({ columns: perfProfileCols, data: () => perfProfileTableRows.value, initialPinning: { left: ['name'], right: [] }, initialSorting: DEFAULT_SORTS['performance-profiles'] })
const perfScheduleTable = generateVueTable<any>({ columns: perfScheduleCols, data: () => perfScheduleRows.value, initialPinning: { left: ['action'], right: [] }, initialSorting: DEFAULT_SORTS['performance-schedules'] })
const campaignTable = generateVueTable<any>({ columns: campaignCols, data: () => campaignRows.value, initialPinning: { left: ['name'], right: ['actions'] }, initialSorting: DEFAULT_SORTS.campaigns })
// The schedule table swaps its whole column set with the route scope, so it stays
// computed — but it depends on route state only, never on the filtered rows.
const perfScheduleRowTable = computed(() => generateVueTable<any>({ columns: activePerfScheduleCols.value, data: () => perfScheduleTableRows.value, initialPinning: { left: ['scheduleName'], right: [] }, initialSorting: DEFAULT_SORTS['perf-schedules'] }))
const agentOrgProfileTable = generateVueTable<any>({ columns: agentOrgProfileCols, data: () => agentOrgProfileFilteredRows.value, initialPinning: { left: ['organization'], right: [] }, initialSorting: DEFAULT_SORTS['agent-org-profiles'] })
const toolTable = generateVueTable<any>({ columns: toolCols, data: () => toolRows.value, initialPinning: { left: ['tool'], right: [] }, initialSorting: DEFAULT_SORTS.tools })
const orgToolTable = generateVueTable<any>({ columns: orgToolCols, data: () => orgToolRows.value, initialPinning: { left: ['tool'], right: [] }, initialSorting: DEFAULT_SORTS['agent-org-tools'] })
const chatTable = generateVueTable<any>({ columns: chatCols, data: () => chatRows.value, initialPinning: { left: ['name'], right: [] }, initialSorting: DEFAULT_SORTS.chats })
const toolOrgTable = generateVueTable<any>({ columns: toolOrgCols, data: () => toolOrgRows.value, initialPinning: { left: ['organization'], right: [] }, initialSorting: DEFAULT_SORTS['agent-tool-orgs'] })
</script>

<template>
  <BasicPage :title="title">
    <template #actions>
      <div class="relative">
        <Search class="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
        <Input v-model="search" class="h-9 w-48 pl-8 md:w-64" placeholder="Search…" />
      </div>
    </template>

    <Breadcrumb class="mb-4">
      <BreadcrumbList>
        <template v-for="(item, index) in breadcrumbs" :key="index">
          <BreadcrumbItem>
            <BreadcrumbLink v-if="item.to" as-child>
              <router-link :to="item.to">
                {{ item.label }}
              </router-link>
            </BreadcrumbLink>
            <BreadcrumbPage v-else>
              {{ item.label }}
            </BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator v-if="index < breadcrumbs.length - 1" />
        </template>
      </BreadcrumbList>
    </Breadcrumb>

    <div v-if="ready && (error || (page === 'account-detail' && accountProfiles.length + accountAds.length + accountSubs.length === 0))" class="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
      <div v-if="error" class="text-destructive">
        Query failed — {{ error }}
      </div>
      <div v-else class="text-muted-foreground">
        No L2 rows for org {{ orgIdParam }} · loaded: profiles {{ accountProfilesData.length }}, ads {{ adsAccounts.length }}, subs {{ subAccounts.length }}
      </div>
    </div>

    <div v-if="ready" class="flex flex-col gap-4">
      <!-- Accounts -->
      <template v-if="page === 'accounts'">
        <!-- Row 1: the scale of what we run on Amazon's behalf, as figures rather than as
             shapes - "how big is the book and where is the risk in it" is answered faster by
             a number. Money first and the risk exposure beside it, because those are the two
             figures this audience is measured on; the machinery that produces them follows. -->
        <!-- Four equal cards. An earlier pass made the risk tile twice as wide to give the row
             a focal point; with the same amount of content in each card that read as a layout
             accident rather than emphasis, so the weight comes from the red figure and its
             caption instead of from the box. On a phone the grid is 2-up - four full-width
             cards put the charts below the fold. -->
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="在管广告主"
            :value="accountScale.advertisers.toLocaleString('en-US')"
            :sub="`全部 ${accountTotalOrgs.toLocaleString('en-US')} 个账号中的付费在管部分`"
          />
          <StatTile
            label="在管广告花费"
            :value="formatMetric(accountScale.spend, { currency: true })"
            :sub="`SP ${formatMetric(accountScale.spendByProduct.sp, { currency: true })} · SB ${formatMetric(accountScale.spendByProduct.sb, { currency: true })} · SD ${formatMetric(accountScale.spendByProduct.sd, { currency: true })}`"
          />
          <StatTile
            label="At Risk 风险敞口"
            :value="formatMetric(accountAtRiskSpend, { currency: true })"
            :sub="`占在管花费 ${accountAtRiskShare.toFixed(1)}%，涉及 ${accountAtRiskCount} 个账号`"
            tone="destructive"
          />
          <StatTile
            label="Top 10 广告主集中度"
            :value="`${accountScale.top10Share.toFixed(1)}%`"
            sub="前 10 家占在管广告花费，越高越依赖少数客户"
          />
        </div>
        <!-- The machinery behind the money, as a headline line rather than as cards: seven
             short label/number pairs stretched across two cards left most of their area empty
             whatever the spacing did. On one line they read in a single pass, and the eye
             never travels further than the next pair. -->
        <div class="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t pt-3 text-sm tabular-nums text-muted-foreground">
          <span>启用 Profile <span class="font-medium text-foreground">{{ accountScale.profilesEnabled.toLocaleString('en-US') }}</span></span>
          <span>Ads 账号 <span class="font-medium text-foreground">{{ accountScale.adsAccountsEnabled.toLocaleString('en-US') }}</span></span>
          <span>子账号 <span class="font-medium text-foreground">{{ accountScale.subAccountsEnabled.toLocaleString('en-US') }}</span></span>
          <span>优化事件 <span class="font-medium text-foreground">{{ accountScale.optimizationEvents.toLocaleString('en-US') }}</span></span>
          <span>调度运行 <span class="font-medium text-foreground">{{ accountScale.scheduleRuns.toLocaleString('en-US') }}</span></span>
          <span>Agent 会话 <span class="font-medium text-foreground">{{ accountScale.chats.toLocaleString('en-US') }}</span></span>
          <span>新建活动 <span class="font-medium text-foreground">{{ accountScale.campaignsLaunched.toLocaleString('en-US') }}</span></span>
        </div>
        <!-- The disclosure stays visible but stops being a third grey paragraph: one clause
             on the page, the full wording on hover. -->
        <p class="text-xs text-muted-foreground" :title="accountExcludedCaption">
          口径：仅统计非试用版且有广告花费的账号。
        </p>

        <!-- Row 2: health, as one shape that carries both variables - the share of accounts a
             state holds and the share of the money sitting in it - beside the names holding
             the at-risk part of that money. -->
        <div class="grid gap-3 lg:grid-cols-2">
          <Card>
            <CardContent class="p-4">
              <StatusRadialChart
                height-class="h-72"
                title="账号状态 · 数量与花费"
                :slices="accountStatusRadial"
                :total="formatMetric(accountScale.spend, { currency: true })"
                total-label="在管广告花费"
                :caption="accountRadialCaption"
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent class="p-4">
              <KpiChart
                type="hbar"
                height-class="h-64"
                title="At Risk 账号 · 花费 Top 10"
                :data="accountAtRisk"
                format="currency"
              />
              <p class="mt-2 text-xs text-muted-foreground">
                {{ accountAtRiskCaption }}
              </p>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardContent class="flex flex-col gap-4">
            <div class="flex flex-wrap items-center gap-2">
              <Select v-model="status">
                <SelectTrigger class="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    All statuses
                  </SelectItem>
                  <SelectItem value="Healthy">
                    Healthy
                  </SelectItem>
                  <SelectItem value="Moderate">
                    Moderate
                  </SelectItem>
                  <SelectItem value="At Risk">
                    At Risk
                  </SelectItem>
                  <SelectItem value="Churned">
                    Churned
                  </SelectItem>
                </SelectContent>
              </Select>
              <span class="text-sm text-muted-foreground">{{ accountRows.length }} rows</span>
            </div>
            <TableToolbar v-model:filters="accountFilters" v-model:range="dateRange" :columns="accountColumns" :rows="filteredAccounts" />
            <DataTable :table="accountTable" :columns="accountCols" :data="accountRows" />
          </CardContent>
        </Card>
      </template>

      <!-- Account detail -->
      <template v-else-if="page === 'account-detail'">
        <Card>
          <CardContent class="flex flex-col gap-4">
            <Tabs :default-value="tabDefaults[page]">
              <TabsList>
                <TabsTrigger value="ads">
                  Ads Accounts
                </TabsTrigger>
                <TabsTrigger value="profiles">
                  Profiles
                </TabsTrigger>
                <TabsTrigger value="subs">
                  Hanna Sub Accounts
                </TabsTrigger>
              </TabsList>
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted/50 px-4 py-3 text-sm">
                <span class="text-muted-foreground">Organization</span>
                <span class="font-medium">{{ account?.name ?? `Org ${orgIdParam}` }}</span>
                <Badge variant="secondary">
                  {{ account?.status ?? 'unknown' }}
                </Badge>
                <span class="font-mono text-muted-foreground">{{ account?.plan }} · Renewal {{ account?.renewal }}</span>
              </div>
              <TabsContent value="ads" class="flex flex-col gap-4">
                <TableToolbar v-model:filters="accountAdFilters" v-model:range="dateRange" :columns="accountAdColumns" :rows="accountAds" />
                <DataTable :table="accountAdTable" :columns="accountAdCols" :data="accountAdRows" />
              </TabsContent>
              <TabsContent value="profiles" class="flex flex-col gap-4">
                <TableToolbar v-model:filters="accountProfileFilters" v-model:range="dateRange" :columns="accountProfileColumns" :rows="accountProfiles" />
                <DataTable :table="accountProfileTable" :columns="accountProfileCols" :data="accountProfileRows" />
              </TabsContent>
              <TabsContent value="subs" class="flex flex-col gap-4">
                <TableToolbar v-model:filters="accountSubFilters" v-model:range="dateRange" :columns="accountSubColumns" :rows="accountSubs" />
                <DataTable :table="accountSubTable" :columns="accountSubCols" :data="accountSubRows" />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </template>

      <!-- Performance -->
      <template v-else-if="page === 'performance'">
        <div class="grid gap-3 md:grid-cols-3">
          <Card>
            <CardContent class="p-4">
              <KpiChart :title="SCHEDULE_ACTION_METRIC_LABEL.scheduleRuns" :data="performanceRunMix" />
            </CardContent>
          </Card>
          <Card>
            <CardContent class="p-4">
              <KpiChart :title="SCHEDULE_ACTION_METRIC_LABEL.campaignsCreated" :data="performanceCampaignMix" />
            </CardContent>
          </Card>
          <Card>
            <CardContent class="p-4">
              <KpiChart :title="SCHEDULE_ACTION_METRIC_LABEL.targetingsCreated" :data="performanceTargetingMix" />
            </CardContent>
          </Card>
        </div>
        <div class="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm tabular-nums text-muted-foreground">
          <span>Profiles <span class="font-medium text-foreground">{{ performanceProfilesCount.toLocaleString('en-US') }}</span></span>
          <span>Ad Spend <span class="font-medium text-foreground">{{ formatMetric(performanceSpend, { currency: true }) }}</span></span>
          <span>Ad Sales <span class="font-medium text-foreground">{{ formatMetric(performanceSales, { currency: true }) }}</span></span>
          <span>ACoS <span class="font-medium text-foreground">{{ performanceAcos.toFixed(1) }}%</span></span>
          <span>Optimization Events <span class="font-medium text-foreground">{{ performanceOptimizationEvents.toLocaleString('en-US') }}</span></span>
          <span>Schedule Runs <span class="font-medium text-foreground">{{ performanceScheduleRuns.toLocaleString('en-US') }}</span></span>
          <span>Active Schedules <span class="font-medium text-foreground">{{ performanceActiveSchedules.toLocaleString('en-US') }}</span></span>
        </div>
        <Card>
          <CardContent class="pt-6">
            <TrackingChart :title="`${dateRangeLabel} · 逐日表现`" :rows="performanceDailyChart" :metrics="DAILY_TREND_METRICS" :default-metrics="DEFAULT_TREND_METRICS" />
          </CardContent>
        </Card>
        <Card>
          <CardContent class="flex flex-col gap-4">
            <Tabs :default-value="tabDefaults[page]">
              <TabsList>
                <TabsTrigger value="profiles">
                  Profile Table
                </TabsTrigger>
                <TabsTrigger value="schedules">
                  Schedules Table
                </TabsTrigger>
              </TabsList>
              <TabsContent value="profiles" class="flex flex-col gap-4">
                <TableToolbar v-model:filters="perfProfileFilters" v-model:range="dateRange" :columns="perfProfileColumns" :rows="filteredPerformanceProfiles" />
                <DataTable :table="perfProfileTable" :columns="perfProfileCols" :data="perfProfileTableRows" />
              </TabsContent>
              <TabsContent value="schedules" class="flex flex-col gap-4">
                <TableToolbar v-model:filters="perfScheduleFilters" v-model:range="dateRange" :columns="actionRollupColumns" :rows="performanceScheduleBase" />
                <DataTable :table="perfScheduleTable" :columns="perfScheduleCols" :data="perfScheduleRows" />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </template>

      <!-- Profile -->
      <template v-else-if="page === 'profile'">
        <div class="grid gap-3 md:grid-cols-2">
          <Card>
            <CardContent class="p-4">
              <KpiChart title="按广告类型的活动数" :data="profileCampaignMix" />
            </CardContent>
          </Card>
          <Card>
            <CardContent class="p-4">
              <KpiChart title="优化动作构成" :data="profileOptMix" />
            </CardContent>
          </Card>
        </div>
        <div class="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <span>{{ perfProfile?.organization ?? '—' }}</span>
          <span>{{ perfProfile?.marketplace ?? '—' }} · {{ perfProfile?.entity ?? '—' }}</span>
          <span>Connected <span class="font-medium text-foreground">{{ perfProfile?.connectedAt ?? '—' }}</span></span>
          <span>Active Schedules <span class="font-medium text-foreground">{{ perfProfile?.activeSchedules ?? 0 }}</span></span>
          <span>Optimization Events <span class="font-medium text-foreground">{{ perfProfile?.optimizationEvents ?? 0 }}</span></span>
          <span>Ad Spend <span class="font-medium text-foreground">{{ formatMetric(profileSpend, { currency: true }) }}</span></span>
          <span>Ad Sales <span class="font-medium text-foreground">{{ formatMetric(perfProfile?.adSales, { currency: true }) }}</span></span>
          <span>ACoS <span class="font-medium text-foreground">{{ (perfProfile?.acos ?? 0).toFixed(1) }}%</span></span>
          <span>Ad Orders <span class="font-medium text-foreground">{{ perfProfile?.adOrders ?? 0 }}</span></span>
        </div>
        <Card>
          <CardContent class="pt-6">
            <TrackingChart title="逐日走势 · 可切换指标" :rows="profileDailyChart" :metrics="DAILY_TREND_METRICS" :default-metrics="DEFAULT_TREND_METRICS" />
            <p class="text-xs text-muted-foreground">
              该折线是「天 × profile」粒度的走势，下方表格是「campaign × 区间」汇总，两者粒度不同，因此不会互相筛选。
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="flex flex-col gap-4">
            <div v-if="campaignsLoading" class="py-2 text-sm text-muted-foreground">
              Loading campaign data…
            </div>
            <!-- The two empty cases are different answers and must not share a message:
                 no campaigns at all (reload, the aggregate may have been missed) versus
                 a filter that hides them all (the data is right there). -->
            <div v-else-if="!profileCampaigns.length" class="flex items-center gap-3 py-2 text-sm text-muted-foreground">
              <span>No campaigns for this profile in the selected range.</span>
              <Button variant="outline" size="sm" @click="reloadCampaigns">
                Reload
              </Button>
            </div>
            <div v-else-if="!campaignRows.length" class="py-2 text-sm text-muted-foreground">
              Every campaign is hidden by the current filters.
            </div>
            <TableToolbar v-model:filters="campaignFilters" v-model:range="dateRange" :columns="campaignColumns" :rows="profileCampaigns" />
            <DataTable :table="campaignTable" :columns="campaignCols" :data="campaignRows" />
          </CardContent>
        </Card>
      </template>

      <!-- Schedules (L2) - the action's own schedules plus the account-level answer
           to "did it help?". The old Analytics tab is gone: its campaign grain now
           arrives as server aggregates instead of a browser-side table. -->
      <template v-else-if="page === 'schedules'">
        <div v-if="analyticsLoading" class="py-2 text-sm text-muted-foreground">
          Loading campaign analytics…
        </div>
        <div class="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm tabular-nums text-muted-foreground">
          <!-- Look counters up by their stable key, never by their display label: the
               labels are translatable and a stale string silently returns 0. The list
               itself is category-driven, so a launch page does not report an
               optimisation event count of zero. -->
          <span v-for="counter in headlineCounters" :key="counter.key">{{ counter.label }} <span class="font-medium text-foreground">{{ activityValue(counter.key).toLocaleString('en-US') }}</span></span>
        </div>

        <!-- The action's own trend: what it did, and what those campaigns earned. One card
             for both categories; only the measures it offers differ. -->
        <Card>
          <CardContent class="p-4">
            <ActionTrendChart
              v-model:left="trendLeft"
              v-model:right="trendRight"
              :days="actionTrendPointDays"
              :left-metrics="trendLeftMetrics"
              :right-metrics="trendRightMetrics"
              :title="`${actionCn[action] || action} 的动作量与产出趋势`"
              :caption="trendCaption"
            />
          </CardContent>
        </Card>

        <!-- Only an optimisation action keeps this row. A launch action has no first touch
             to measure and, since its charts became the single trend above, nothing left
             here either - so the whole row is absent rather than half empty. -->
        <!-- Unequal by design: the ACoS comparison is the row main reading and takes the
             wider track, while the two first-touch charts stack inside the narrower one. Side
             by side inside a half-width card they were drawn about 380px wide and their
             category labels were unreadable; stacked, each gets the full track. -->
        <div v-if="!isLaunchAction" class="grid gap-3 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <!-- Chart 3: the honest cross-section. Our segment is not the cheapest
               per dollar of sales, and the campaign counts travel with the bars. -->
          <Card>
            <CardContent class="flex h-full flex-col gap-3 p-4">
              <GroupedBarChart
                height-class="h-72"
                title="各广告类型的 ACoS"
                :categories="efficiency.categories"
                :series="efficiency.series"
                format="percent"
                :caption="`ACoS = 广告花费 ÷ 广告销售额，越低越好。横轴下方是本段与${scheduleSegments.untouchedShort}段的广告活动数，两侧样本量差别很大，读数时需一并考虑。`"
              />
              <p class="mt-auto text-xs text-muted-foreground">
                分段以「广告活动」为单位、在整个区间上判定：只要该活动任意一天带有本功能的归因，即归入「{{ scheduleSegments.thisAction }}」，
                因此每个活动只会出现在一侧，不会被重复计数。
              </p>
            </CardContent>
          </Card>
          <!-- Chart 4: the same campaign against itself around our first touch.
               The two comparisons sit side by side so the card does not outgrow the
               card beside it and leave a column of empty space.

               A campaign-launch action has no first touch to measure: it creates a
               campaign, it never manages one, so "before and after we touched it" is
               not a question this page can answer. The card is absent rather than
               empty, and the back end is not asked for the aggregate either. -->
          <Card>
            <CardContent class="flex h-full flex-col gap-4 p-4">
              <div class="flex flex-col gap-4">
                <GroupedBarChart
                  height-class="h-44"
                  :title="`首次触达前后 · ${firstTouch.windowDays} 天窗口`"
                  :categories="firstTouchVolume.categories"
                  :series="firstTouchVolume.series"
                  format="currency"
                />
                <GroupedBarChart
                  height-class="h-44"
                  title="触达前后比率"
                  :categories="firstTouchRates.categories"
                  :series="firstTouchRates.series"
                  format="percent"
                />
              </div>
              <div class="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm tabular-nums text-muted-foreground">
                <span>被触达活动数 <span class="font-medium text-foreground">{{ firstTouch.campaigns.toLocaleString('en-US') }}</span></span>
                <span>活动·天数 <span class="font-medium text-foreground">{{ firstTouch.before.campaignDays.toLocaleString('en-US') }} → {{ firstTouch.after.campaignDays.toLocaleString('en-US') }}</span></span>
                <span>每活动·天广告订单 <span class="font-medium text-foreground">{{ firstTouch.before.ordersPerCampaignDay.toFixed(2) }} → {{ firstTouch.after.ordersPerCampaignDay.toFixed(2) }}</span></span>
              </div>
              <p class="text-xs text-muted-foreground">
                「活动·天」（campaign-day）指某个广告活动在窗口内有数据的一天，40 个活动 × 7 天最多 280 个活动·天，
                它是上方每根柱子的分母：总额 ÷ 活动·天数 = 平均每个活动每天的数值。之所以这样归一，是因为触达前窗口总是完整的，
                而触达后窗口对「区间末尾才被触达」的活动会被截断，只有按天平均后两侧才可比。
                「每活动·天广告订单」即该窗口内平均每个活动每天产生的广告订单数。
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent class="flex flex-col gap-4">
            <TableToolbar v-model:filters="perfScheduleRowFilters" v-model:range="dateRange" :columns="activePerfScheduleColumns" :rows="perfScheduleRowsSource" />
            <DataTable :table="perfScheduleRowTable" :columns="activePerfScheduleCols" :data="perfScheduleTableRows" />
          </CardContent>
        </Card>
      </template>

      <!-- Agent Analytics L1: the org+profile roll-up, and the tool-level view. -->
      <template v-else-if="page === 'agent'">
        <Card>
          <CardContent class="flex flex-col gap-4">
            <Tabs :default-value="tabDefaults[page]">
              <TabsList>
                <TabsTrigger value="org">
                  Org+Profile Stats
                </TabsTrigger>
                <TabsTrigger value="tools">
                  Tool Stats
                </TabsTrigger>
              </TabsList>
              <TabsContent value="org" class="flex flex-col gap-4">
                <!-- Distribution, not share: the biggest organization holds 4% of the
                     calls, so a ring would draw two thirds of itself as "Others". -->
                <!-- No inner cards: this tab already lives inside the page card, and a card
                     in a card is containment with no meaning. The bands are separated by
                     hairlines instead, which also buys the charts the padding back. -->
                <div class="grid gap-6 lg:grid-cols-2">
                  <div class="flex flex-col">
                    <KpiChart type="bar" height-class="h-72" title="组织使用量分布" :data="agentOrgUsageHistogram" />
                    <p class="mt-2 text-xs text-muted-foreground">
                      {{ agentOrgUsageCaption }}
                    </p>
                  </div>
                  <div class="flex flex-col">
                    <ScatterChart
                      height-class="h-72"
                      title="使用强度：活跃天数 × 调用量"
                      x-label="活跃天数"
                      y-label="调用量"
                      :points="agentIntensityPoints"
                      :reference-lines="[{ axis: 'y', value: agentIntensity.p95, label: `每活跃天 p95 = ${agentIntensity.p95.toFixed(1)} 次` }]"
                      :caption="`每个点为 Org+Profile（${agentIntensity.points.length} 个）。对角线之上＝把用量压在少数几天里，就是需要关注的异常；红色点表示每活跃天调用量已达总体 p95 以上。`"
                    />
                  </div>
                </div>
                <div class="flex flex-wrap items-center gap-x-6 gap-y-1 border-t pt-4 text-sm tabular-nums text-muted-foreground">
                  <span>Organizations <span class="font-medium text-foreground">{{ agentAdoption.active.toLocaleString('en-US') }}</span></span>
                  <span>采纳率 <span class="font-medium text-foreground">{{ agentAdoption.rate.toFixed(1) }}%</span> <span class="text-xs">（{{ agentAdoption.active }} / {{ agentAdoption.total }} 个已接入组织）</span></span>
                  <span>Org+Profile Rows <span class="font-medium text-foreground">{{ agentOrgProfileFilteredRows.length }}</span></span>
                  <span>Total Tool Calls <span class="font-medium text-foreground">{{ agentTotalToolCalls }}</span></span>
                  <span>Total Chats <span class="font-medium text-foreground">{{ agentTotalChats }}</span></span>
                </div>
                <TableToolbar v-model:filters="agentOrgProfileFilters" v-model:range="dateRange" :columns="agentOrgProfileColumns" :rows="agentOrgProfileRows" />
                <DataTable :table="agentOrgProfileTable" :columns="agentOrgProfileCols" :data="agentOrgProfileFilteredRows" />
              </TabsContent>
              <TabsContent value="tools" class="flex flex-col gap-4">
                <!-- The two questions the tool tab exists for: is it used widely, and
                     do the people who use it come back? -->
                <div class="grid gap-3 lg:grid-cols-2">
                  <div class="flex flex-col">
                    <ScatterChart
                      height-class="h-72"
                      title="工具采纳矩阵：广度 × 深度"
                      x-label="使用组织数"
                      y-label="每组织调用次数"
                      :points="toolAdoptionPoints"
                      :reference-lines="[
                        { axis: 'x', value: toolAdoptionMedians.orgs, label: '中位广度' },
                        { axis: 'y', value: toolAdoptionMedians.callsPerOrg, label: '中位深度' },
                      ]"
                      :caption="toolAdoptionCaption"
                    />
                  </div>
                  <div class="flex flex-col">
                    <KpiChart type="bar" height-class="h-72" title="工具回访分布" :data="toolRepeatBuckets" />
                    <p class="mt-2 text-xs text-muted-foreground">
                      {{ toolRepeatCaption }}
                    </p>
                  </div>
                </div>
                <!-- The counts the Tool Summary card used to hold: kept, because a
                     tool list without its totals cannot be read against anything. -->
                <div class="flex flex-wrap items-center gap-x-6 gap-y-1 border-t pt-4 text-sm tabular-nums text-muted-foreground">
                  <span>Tools <span class="font-medium text-foreground">{{ toolRows.length.toLocaleString('en-US') }}</span></span>
                  <span>Total Calls <span class="font-medium text-foreground">{{ toolTotalCalls.toLocaleString('en-US') }}</span></span>
                  <span>Errors <span class="font-medium text-foreground">{{ toolTotalErrors.toLocaleString('en-US') }}</span></span>
                </div>
                <TableToolbar v-model:filters="toolFilters" v-model:range="dateRange" :columns="toolColumns" :rows="toolRowsSource" />
                <DataTable :table="toolTable" :columns="toolCols" :data="toolRows" />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </template>

      <!-- Agent organization details -->
      <template v-else-if="page === 'agent-org'">
        <Card>
          <CardContent class="flex flex-col gap-4">
            <Tabs :default-value="tabDefaults[page]" @update:model-value="onAgentOrgTab">
              <TabsList>
                <TabsTrigger value="tools">
                  Tool Calls Details
                </TabsTrigger>
                <TabsTrigger value="chats">
                  Agent Chats
                </TabsTrigger>
              </TabsList>
              <TabsContent value="tools" class="flex flex-col gap-4">
                <!-- Ranked bars, not rings: with 530 profiles the tail is most of the
                     population, so the tail is named as a row instead of hidden. -->
                <div class="grid gap-3 lg:grid-cols-2">
                  <Card>
                    <CardContent class="p-4">
                      <KpiChart type="hbar" height-class="h-72" :title="`子账号调用量（Top ${AGENT_TOP}）`" :data="orgSubAccountBars" />
                      <p class="mt-2 text-xs text-muted-foreground">
                        {{ orgSubAccountCaption }}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent class="p-4">
                      <KpiChart type="hbar" height-class="h-72" :title="`Profile 调用量（Top ${AGENT_TOP}）`" :data="orgProfileBars" />
                      <p class="mt-2 text-xs text-muted-foreground">
                        {{ orgProfileCaption }}
                      </p>
                    </CardContent>
                  </Card>
                </div>
                <div class="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
                  <span>Tools <span class="font-medium text-foreground">{{ orgToolCount }}</span></span>
                  <span>Total Calls <span class="font-medium text-foreground">{{ orgTotalCalls }}</span></span>
                  <span>Errors <span class="font-medium text-foreground">{{ orgTotalErrors }}</span></span>
                </div>
                <TableToolbar v-model:filters="orgToolFilters" v-model:range="dateRange" :columns="orgToolColumns" :rows="orgToolRowsSource" />
                <DataTable :table="orgToolTable" :columns="orgToolCols" :data="orgToolRows" />
              </TabsContent>
              <TabsContent value="chats" class="flex flex-col gap-4">
                <div v-if="agentChatsLoading" class="py-2 text-sm text-muted-foreground">
                  Loading conversations…
                </div>
                <TableToolbar v-model:filters="chatFilters" v-model:range="dateRange" :columns="chatColumns" :rows="chatRowsSource" />
                <DataTable :table="chatTable" :columns="chatCols" :data="chatRows" />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </template>

      <!-- One tool across every organization: is it being used more or less, and by more
           organizations or the same ones? -->
      <template v-else>
        <Card>
          <CardContent class="flex flex-col gap-4">
            <TrendChart
              height-class="h-80"
              :title="`${agentToolName} 的使用趋势`"
              :days="toolTrendDays"
              :caption="toolTrendCaption"
            />
            <div class="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
              <span>Organizations <span class="font-medium text-foreground">{{ orgUsingToolTotal }}</span></span>
              <span>Total Calls <span class="font-medium text-foreground">{{ toolTotalCallsByOrg }}</span></span>
            </div>
            <TableToolbar v-model:filters="toolOrgFilters" v-model:range="dateRange" :columns="toolOrgColumns" :rows="toolOrgRowsSource" />
            <DataTable :table="toolOrgTable" :columns="toolOrgCols" :data="toolOrgRows" />
          </CardContent>
        </Card>
      </template>
    </div>
    <div v-else class="py-8 text-sm text-muted-foreground">
      Loading data…
    </div>
  </BasicPage>
</template>
