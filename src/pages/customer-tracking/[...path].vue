<script setup lang="ts">
/* eslint-disable style/max-statements-per-line, ts/no-use-before-define */ // no-use-before-define: chart computeds lazily reference the useColumnFilters outputs (defined below); will be reordered on DuckDB migration
import type { ColumnDef } from '@tanstack/vue-table'

import { watchDebounced } from '@vueuse/core'
import { Search } from 'lucide-vue-next'
import { computed, h, ref } from 'vue'

import type { ActivityCounterKey, CompositionMetric } from '@/features/customer-tracking/performance-analytics'

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
  ACCOUNT_COLUMNS,
  ACCOUNT_PROFILE_COLUMNS,
  ADS_COLUMNS,
  AGENT_PROFILE_COLUMNS,
  CAMPAIGN_COLUMNS,
  CHAT_COLUMNS,
  DEFAULT_SORTS,
  makeColumns,
  PERF_PROFILE_COLUMNS,
  PERFORMANCE_SCHEDULE_COLUMNS,
  perfScheduleColumns,
  PROFILE_COLUMN,
  PROFILE_TOOL_COLUMNS,
  SUB_ACCOUNT_COLUMNS,
  TOOL_COLUMNS,
  TOOL_PROFILE_COLUMNS,
} from '@/features/customer-tracking/columns'
import CampaignActionsCell from '@/features/customer-tracking/components/campaign-actions-cell.vue'
import GroupedBarChart from '@/features/customer-tracking/components/grouped-bar-chart.vue'
import KpiChart from '@/features/customer-tracking/components/kpi-chart.vue'
import TableToolbar from '@/features/customer-tracking/components/table-toolbar.vue'
import TrackingChart from '@/features/customer-tracking/components/tracking-chart.vue'
import { useFilterContext } from '@/features/customer-tracking/filter-context'
import { formatMetric } from '@/features/customer-tracking/format'
import { actionCn } from '@/features/customer-tracking/mock'
import {
  activityCounters,
  adProductLabel,
  COMPOSITION_METRICS,
  compositionSeries,
  compositionShare,
  DAILY_TREND_METRICS,
  dailySeries,
  DEFAULT_TREND_METRICS,
  efficiencyByAdProduct,
  firstTouchSummary,
  SCHEDULE_ACTION_METRIC_LABEL,
  scheduleActionMix,
  scheduleRollup,
  scheduleStatusBreakdown,
  segmentVocabulary,
} from '@/features/customer-tracking/performance-analytics'
import { LAUNCH_CATEGORY } from '@/features/customer-tracking/types'
import { useColumnFilters } from '@/features/customer-tracking/use-column-filter'
import { FIRST_TOUCH_WINDOW_DAYS, useDashboardData } from '@/features/customer-tracking/use-dashboard-data'

const route = useRoute(); const router = useRouter(); const search = ref(''); const status = ref('all')
const { dateRange } = useFilterContext(); const dateRangeLabel = computed(() => `${dateRange.value.from} ~ ${dateRange.value.to}`)
const { organizations, profiles, accountProfilesData, campaigns, toolStats, agentChats, agentProfileStats, adsAccounts, subAccounts, ready, error, loadPage, loadCampaigns, campaignsLoading, analyticsLoading, loadScheduleAnalytics, performanceProfiles, performanceSchedules, performanceDailyRows, perfAttribution, perfFirstTouch } = useDashboardData()
const path = computed(() => String((route.params as any).path || 'accounts').split('/').filter(Boolean))
const page = computed(() => path.value[0] === 'accounts' && path.value[1] ? 'account-detail' : path.value[0] === 'performance' && path.value[1] === 'profile' && path.value[3] === 'schedules' ? 'schedules' : path.value[0] === 'performance' && path.value[1] === 'profile' ? 'profile' : path.value[0] === 'performance' && path.value[1] === 'schedules' ? 'schedules' : path.value[0] === 'agent' && path.value[1] === 'profile' ? 'agent-profile' : path.value[0] === 'agent' && path.value[1] === 'tool' ? 'tool-profiles' : path.value[0] || 'accounts')
const campaignProfileId = computed(() => page.value === 'profile' || (page.value === 'schedules' && path.value[1] === 'profile') ? path.value[2] : undefined)
// The catch-all page component is reused across routes, so free-text search must not survive
// navigation — otherwise a term typed on L1 silently empties the L2 tables.
watch(path, () => { search.value = ''; loadPage(page.value, campaignProfileId.value) }, { immediate: true })
const account = computed(() => organizations.value.find(a => String(a.orgId) === String(path.value[1])) || organizations.value[0]); const profile = computed(() => profiles.value.find(p => p.amazonProfileId === path.value[2]) || profiles.value[0]); const action = computed(() => page.value === 'schedules' ? decodeURIComponent(path.value[path.value[1] === 'profile' ? 4 : 2] || '') : ''); const scopedProfileId = computed(() => page.value !== 'schedules' ? null : path.value[1] === 'profile' ? path.value[2] : null)
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
    case 'agent-profile': return `${profile.value?.name ?? ''} · Profile Details`
    case 'tool-profiles': return `Profiles using ${path.value[2] || ''}`
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
  else if (page.value === 'agent-profile') {
    add('Agent Analytics', '/customer-tracking/agent')
    add(profile.value.name)
  }
  else if (page.value === 'tool-profiles') {
    add('Agent Analytics', '/customer-tracking/agent')
    add(`Profiles using ${path.value[2] || ''}`)
  }
  else {
    add(page.value === 'agent' ? 'Agent Analytics' : page.value === 'performance' ? 'Performance' : 'Accounts')
  }
  return items
})
const tabDefaults: Record<string, string> = { 'account-detail': 'profiles', 'performance': 'profiles', 'schedules': 'schedules', 'agent': 'profiles', 'agent-profile': 'tools' }

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
const scheduleStatusMix = computed(() => scheduleStatusBreakdown(perfScheduleTableRows.value))
const scheduleActivity = computed(() => activityCounters(perfScheduleTableRows.value, perfActionCategory.value))
// The chart takes {name, value}; the headline row looks counters up by their stable
// key so translating a label can never empty it.
const scheduleActivityChart = computed(() => scheduleActivity.value.map(a => ({ name: a.label, value: a.value })))
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
const compositionMetric = ref<CompositionMetric>('ad_spend')
const compositionData = computed(() => compositionSeries(perfAttribution.value, compositionMetric.value, scheduleSegments.value))
const composition = computed(() => compositionShare(perfAttribution.value, compositionMetric.value))
const compositionMetricLabel = computed(() => COMPOSITION_METRICS.find(m => m.key === compositionMetric.value)?.label ?? '广告花费')
const compositionFormat = computed(() => isCurrencyForComposition.value ? 'currency' as const : 'number' as const)
const isCurrencyForComposition = computed(() => compositionMetric.value === 'ad_spend' || compositionMetric.value === 'ad_sales')
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
const agentProfileRows = computed(() => agentProfileStats.value.filter(includesSearch))
const toolRowsSource = computed(() => toolStats.value.filter(includesSearch))
const chatRowsSource = computed(() => agentChats.value.filter(includesSearch))
const toolProfileRows = computed(() => profiles.value.filter(includesSearch).slice(0, 8).map(p => ({ ...p, calls: 12 + p.chats, lastCalled: `${(p.chats % 5) + 1} days ago`, success: 90 + (p.chats % 8), errors: p.chats % 3 })))
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
const agentProfileColumns = AGENT_PROFILE_COLUMNS
const toolColumns = TOOL_COLUMNS
const profileToolColumns = PROFILE_TOOL_COLUMNS
const chatColumns = CHAT_COLUMNS
const toolProfileColumns = TOOL_PROFILE_COLUMNS

const { filters: accountFilters, filtered: accountRows } = useColumnFilters(filteredAccounts, accountColumns)
const { filters: accountAdFilters, filtered: accountAdRows } = useColumnFilters(accountAds, accountAdColumns)
const { filters: accountProfileFilters, filtered: accountProfileRows } = useColumnFilters(accountProfiles, accountProfileColumns)
const { filters: accountSubFilters, filtered: accountSubRows } = useColumnFilters(accountSubs, accountSubColumns)
const { filters: perfProfileFilters, filtered: perfProfileTableRows } = useColumnFilters(filteredPerformanceProfiles, perfProfileColumns)
const { filters: perfScheduleFilters, filtered: perfScheduleRows } = useColumnFilters(performanceScheduleBase, actionRollupColumns)
const { filters: campaignFilters, filtered: campaignRows } = useColumnFilters(profileCampaigns, campaignColumns)
const { filters: agentProfileFilters, filtered: agentProfileFilteredRows } = useColumnFilters(agentProfileRows, agentProfileColumns)
const { filters: toolFilters, filtered: toolRows } = useColumnFilters(toolRowsSource, toolColumns)
const { filters: profileToolFilters, filtered: profileToolRows } = useColumnFilters(toolRowsSource, profileToolColumns)
const { filters: chatFilters, filtered: chatRows } = useColumnFilters(chatRowsSource, chatColumns)
const { filters: toolProfileFilters, filtered: toolProfileFilteredRows } = useColumnFilters(toolProfileRows, toolProfileColumns)

// ---- Distribution pie data (Accounts + Agent) ----
const accountsStatusPie = computed(() => {
  const statuses = ['Healthy', 'Moderate', 'At Risk', 'Churned']
  return statuses.map(s => ({ name: s, value: accountRows.value.filter(a => a.status === s).length }))
})
const agentProfileToolCallsPie = computed(() => {
  const rows = agentProfileFilteredRows.value.map(p => ({ name: p.name, value: p.toolCalls })).filter(d => d.value > 0).sort((a, b) => b.value - a.value)
  const TOP = 8
  if (rows.length <= TOP)
    return rows
  return [...rows.slice(0, TOP), { name: 'Others', value: rows.slice(TOP).reduce((n, d) => n + d.value, 0) }]
})
const agentTotalToolCalls = computed(() => agentProfileFilteredRows.value.reduce((n, p) => n + p.toolCalls, 0))
const agentProfileChatsPie = computed(() => {
  const rows = agentProfileFilteredRows.value.map(p => ({ name: p.name, value: p.chats })).filter(d => d.value > 0).sort((a, b) => b.value - a.value)
  const TOP = 8
  if (rows.length <= TOP)
    return rows
  return [...rows.slice(0, TOP), { name: 'Others', value: rows.slice(TOP).reduce((n, d) => n + d.value, 0) }]
})
const agentTotalChats = computed(() => agentProfileFilteredRows.value.reduce((n, p) => n + p.chats, 0))
const toolCallsByToolPie = computed(() => toolRows.value.map(t => ({ name: t.tool, value: t.calls })).filter(d => d.value > 0))
const toolTotalCalls = computed(() => toolRows.value.reduce((n, t) => n + t.calls, 0))
const toolTotalErrors = computed(() => toolRows.value.reduce((n, t) => n + t.errors, 0))

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
// Debounced because a filter is typed character by character, and every change is a
// ~20M-row aggregate on the lakehouse.
watchDebounced([page, action, campaignProfileId, scheduleScopeIds], () => {
  if (page.value === 'schedules' && action.value)
    void loadScheduleAnalytics(action.value, campaignProfileId.value, scheduleScopeIds.value)
}, { immediate: true, debounce: 400, maxWait: 2000 })
const activePerfScheduleCols = computed(() => makeColumns(activePerfScheduleColumns.value, { nameKey: 'scheduleName', badgeKeys: ['status', 'lastRunStatus'], navigate }))
const agentProfileCols = makeColumns(agentProfileColumns, { href: (p: any) => `/customer-tracking/agent/profile/${p.amazonProfileId}`, navigate })
const toolCols = makeColumns(toolColumns, { nameKey: 'tool', href: (t: any) => `/customer-tracking/agent/tool/${encodeURIComponent(t.tool)}/profiles`, navigate })
const profileToolCols = makeColumns(profileToolColumns, { nameKey: 'tool', navigate })
const chatCols = makeColumns(chatColumns, { navigate })
const toolProfileCols = makeColumns(toolProfileColumns, { navigate })

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
const agentProfileTable = generateVueTable<any>({ columns: agentProfileCols, data: () => agentProfileFilteredRows.value, initialPinning: { left: ['name'], right: [] }, initialSorting: DEFAULT_SORTS['agent-profiles'] })
const toolTable = generateVueTable<any>({ columns: toolCols, data: () => toolRows.value, initialPinning: { left: ['tool'], right: [] }, initialSorting: DEFAULT_SORTS.tools })
const profileToolTable = generateVueTable<any>({ columns: profileToolCols, data: () => profileToolRows.value, initialPinning: { left: ['tool'], right: [] }, initialSorting: DEFAULT_SORTS['profile-tools'] })
const chatTable = generateVueTable<any>({ columns: chatCols, data: () => chatRows.value, initialPinning: { left: ['name'], right: [] }, initialSorting: DEFAULT_SORTS.chats })
const toolProfileTable = generateVueTable<any>({ columns: toolProfileCols, data: () => toolProfileFilteredRows.value, initialPinning: { left: ['name'], right: [] }, initialSorting: DEFAULT_SORTS['tool-profiles'] })
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
        <Card>
          <CardContent class="p-4">
            <KpiChart title="Organizations by Status" :data="accountsStatusPie" />
          </CardContent>
        </Card>
        <div class="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <span>Total Organizations <span class="font-medium text-foreground">{{ accountRows.length }}</span></span>
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
        <div class="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <span>Profiles <span class="font-medium text-foreground">{{ performanceProfilesCount }}</span></span>
          <span>Ad Spend <span class="font-medium text-foreground">{{ formatMetric(performanceSpend, { currency: true }) }}</span></span>
          <span>Ad Sales <span class="font-medium text-foreground">{{ formatMetric(performanceSales, { currency: true }) }}</span></span>
          <span>ACoS <span class="font-medium text-foreground">{{ performanceAcos.toFixed(1) }}%</span></span>
          <span>Optimization Events <span class="font-medium text-foreground">{{ performanceOptimizationEvents }}</span></span>
          <span>Schedule Runs <span class="font-medium text-foreground">{{ performanceScheduleRuns }}</span></span>
          <span>Active Schedules <span class="font-medium text-foreground">{{ performanceActiveSchedules }}</span></span>
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
        <div class="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <!-- Look counters up by their stable key, never by their display label: the
               labels are translatable and a stale string silently returns 0. The list
               itself is category-driven, so a launch page does not report an
               optimisation event count of zero. -->
          <span v-for="counter in headlineCounters" :key="counter.key">{{ counter.label }} <span class="font-medium text-foreground">{{ activityValue(counter.key) }}</span></span>
        </div>

        <div class="grid gap-3 lg:grid-cols-3">
          <!-- Chart 1: how much of the account this action's campaigns account for. -->
          <Card>
            <CardContent class="flex flex-col gap-3 p-4">
              <KpiChart :title="`账号构成 · ${compositionMetricLabel}`" :data="compositionData" :format="compositionFormat" />
              <Select v-model="compositionMetric">
                <SelectTrigger class="h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="metric in COMPOSITION_METRICS" :key="metric.key" :value="metric.key">
                    {{ metric.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p class="text-xs text-muted-foreground">
                账号{{ compositionMetricLabel }}中，{{ composition.share.toFixed(1) }}% {{ scheduleSegments.sharePhrase }}
                （{{ formatMetric(composition.part, { currency: isCurrencyForComposition }) }} / {{ formatMetric(composition.total, { currency: isCurrencyForComposition }) }}）。
              </p>
            </CardContent>
          </Card>
          <!-- Chart 2: what the schedules actually did over the range. -->
          <Card>
            <CardContent class="p-4">
              <KpiChart type="hbar" height-class="h-64" title="软件执行量" :data="scheduleActivityChart" />
            </CardContent>
          </Card>
          <Card>
            <CardContent class="p-4">
              <KpiChart title="调度状态" :data="scheduleStatusMix" />
            </CardContent>
          </Card>
        </div>

        <!-- Stretch, not `items-start`: the two cards are the same kind of panel and
             must end on the same line. Their charts already share a height, so the
             slack lands as extra space above the trailing note of the shorter card.
             A launch action has no first-touch card at all (it never touches an
             existing campaign), so the ACoS chart takes the whole row instead of
             sitting beside an empty column. -->
        <div class="grid gap-3" :class="{ 'lg:grid-cols-2': !isLaunchAction }">
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
          <Card v-if="!isLaunchAction">
            <CardContent class="flex h-full flex-col gap-4 p-4">
              <div class="grid gap-4 md:grid-cols-2">
                <GroupedBarChart
                  height-class="h-72"
                  :title="`首次触达前后 · ${firstTouch.windowDays} 天窗口`"
                  :categories="firstTouchVolume.categories"
                  :series="firstTouchVolume.series"
                  format="currency"
                />
                <GroupedBarChart
                  height-class="h-72"
                  title="触达前后比率"
                  :categories="firstTouchRates.categories"
                  :series="firstTouchRates.series"
                  format="percent"
                />
              </div>
              <div class="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
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

      <!-- Agent -->
      <template v-else-if="page === 'agent'">
        <Card>
          <CardContent class="flex flex-col gap-4">
            <Tabs :default-value="tabDefaults[page]">
              <TabsList>
                <TabsTrigger value="profiles">
                  Profile Stats
                </TabsTrigger>
                <TabsTrigger value="tools">
                  Tool Stats
                </TabsTrigger>
              </TabsList>
              <TabsContent value="profiles" class="flex flex-col gap-4">
                <div class="grid gap-3 lg:grid-cols-2">
                  <Card>
                    <CardContent class="p-4">
                      <KpiChart title="Tool Calls by Profile" :data="agentProfileToolCallsPie" />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent class="p-4">
                      <KpiChart title="Chats by Profile" :data="agentProfileChatsPie" />
                    </CardContent>
                  </Card>
                </div>
                <div class="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
                  <span>Profiles <span class="font-medium text-foreground">{{ agentProfileFilteredRows.length }}</span></span>
                  <span>Total Tool Calls <span class="font-medium text-foreground">{{ agentTotalToolCalls }}</span></span>
                  <span>Total Chats <span class="font-medium text-foreground">{{ agentTotalChats }}</span></span>
                </div>
                <TableToolbar v-model:filters="agentProfileFilters" v-model:range="dateRange" :columns="agentProfileColumns" :rows="agentProfileRows" />
                <DataTable :table="agentProfileTable" :columns="agentProfileCols" :data="agentProfileFilteredRows" />
              </TabsContent>
              <TabsContent value="tools" class="flex flex-col gap-4">
                <div class="grid gap-3 lg:grid-cols-2">
                  <Card>
                    <CardContent class="p-4">
                      <KpiChart title="Tool Calls by Tool" :data="toolCallsByToolPie" />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent class="flex h-full flex-col justify-center gap-2 p-4">
                      <p class="text-sm font-medium text-muted-foreground">
                        Tool Summary
                      </p>
                      <div class="flex flex-col gap-1 text-sm text-muted-foreground">
                        <span>Tools <span class="font-medium text-foreground">{{ toolRows.length }}</span></span>
                        <span>Total Calls <span class="font-medium text-foreground">{{ toolTotalCalls }}</span></span>
                        <span>Errors <span class="font-medium text-foreground">{{ toolTotalErrors }}</span></span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                <TableToolbar v-model:filters="toolFilters" v-model:range="dateRange" :columns="toolColumns" :rows="toolRowsSource" />
                <DataTable :table="toolTable" :columns="toolCols" :data="toolRows" />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </template>

      <!-- Agent profile -->
      <template v-else-if="page === 'agent-profile'">
        <Card>
          <CardContent class="flex flex-col gap-4">
            <Tabs :default-value="tabDefaults[page]">
              <TabsList>
                <TabsTrigger value="tools">
                  Tool Calls Details
                </TabsTrigger>
                <TabsTrigger value="chats">
                  Agent Chats
                </TabsTrigger>
              </TabsList>
              <TabsContent value="tools" class="flex flex-col gap-4">
                <TableToolbar v-model:filters="profileToolFilters" v-model:range="dateRange" :columns="profileToolColumns" :rows="toolRowsSource" />
                <DataTable :table="profileToolTable" :columns="profileToolCols" :data="profileToolRows" />
              </TabsContent>
              <TabsContent value="chats" class="flex flex-col gap-4">
                <TableToolbar v-model:filters="chatFilters" v-model:range="dateRange" :columns="chatColumns" :rows="chatRowsSource" />
                <DataTable :table="chatTable" :columns="chatCols" :data="chatRows" />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </template>

      <!-- Tool profiles -->
      <template v-else>
        <Card>
          <CardContent class="flex flex-col gap-4">
            <TableToolbar v-model:filters="toolProfileFilters" v-model:range="dateRange" :columns="toolProfileColumns" :rows="toolProfileRows" />
            <DataTable :table="toolProfileTable" :columns="toolProfileCols" :data="toolProfileFilteredRows" />
          </CardContent>
        </Card>
      </template>
    </div>
    <div v-else class="py-8 text-sm text-muted-foreground">
      Loading data…
    </div>
  </BasicPage>
</template>
