<script setup lang="ts">
/* eslint-disable style/max-statements-per-line, ts/no-use-before-define */ // no-use-before-define: chart computeds lazily reference the useColumnFilters outputs (defined below); will be reordered on DuckDB migration
import type { ColumnDef } from '@tanstack/vue-table'

import { Search } from 'lucide-vue-next'
import { computed, h, ref } from 'vue'

import DataTable from '@/components/data-table/data-table.vue'
import { generateVueTable } from '@/components/data-table/use-generate-vue-table'
import { BasicPage } from '@/components/global-layout'
import { Badge } from '@/components/ui/badge'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import CampaignActionsCell from '@/features/customer-tracking/components/campaign-actions-cell.vue'
import ColumnFilterBar from '@/features/customer-tracking/components/column-filter-bar.vue'
import DateRangePicker from '@/features/customer-tracking/components/date-range-picker.vue'
import KpiChart from '@/features/customer-tracking/components/kpi-chart.vue'
import MetricSplit from '@/features/customer-tracking/components/metric-split.vue'
import TrackingChart from '@/features/customer-tracking/components/tracking-chart.vue'
import { useFilterContext } from '@/features/customer-tracking/filter-context'
import { formatExact, formatMetric } from '@/features/customer-tracking/format'
import { actionCn, launchActions, optActions } from '@/features/customer-tracking/mock'
import { useColumnFilters } from '@/features/customer-tracking/use-column-filter'
import { useDashboardData } from '@/features/customer-tracking/use-dashboard-data'

const route = useRoute(); const router = useRouter(); const search = ref(''); const status = ref('all')
const { dateRange } = useFilterContext(); const dateRangeLabel = computed(() => `${dateRange.value.from} ~ ${dateRange.value.to}`)
const { organizations, profiles, accountProfilesData, campaigns, schedules, toolStats, agentChats, agentProfileStats, adsAccounts, subAccounts, launchOutput, ready, error, loadPage, campaignsLoading } = useDashboardData()
const path = computed(() => String((route.params as any).path || 'accounts').split('/').filter(Boolean))
const page = computed(() => path.value[0] === 'accounts' && path.value[1] ? 'account-detail' : path.value[0] === 'performance' && path.value[1] === 'profile' && path.value[3] === 'schedules' ? 'schedules' : path.value[0] === 'performance' && path.value[1] === 'profile' ? 'profile' : path.value[0] === 'performance' && path.value[1] === 'schedules' ? 'schedules' : path.value[0] === 'agent' && path.value[1] === 'profile' ? 'agent-profile' : path.value[0] === 'agent' && path.value[1] === 'tool' ? 'tool-profiles' : path.value[0] || 'accounts')
const campaignProfileId = computed(() => page.value === 'profile' || (page.value === 'schedules' && path.value[1] === 'profile') ? path.value[2] : undefined)
// The catch-all page component is reused across routes, so free-text search must not survive
// navigation — otherwise a term typed on L1 silently empties the L2 tables.
watch(path, () => { search.value = ''; loadPage(page.value, campaignProfileId.value) }, { immediate: true })
const account = computed(() => organizations.value.find(a => String(a.orgId) === String(path.value[1])) || organizations.value[0]); const profile = computed(() => profiles.value.find(p => p.amazonProfileId === path.value[2]) || profiles.value[0]); const action = computed(() => page.value === 'schedules' ? decodeURIComponent(path.value[path.value[1] === 'profile' ? 4 : 2] || '') : ''); const isLaunchAction = computed(() => launchActions.includes(action.value)); const scopedProfileId = computed(() => page.value !== 'schedules' ? null : path.value[1] === 'profile' ? path.value[2] : null)
const num = (n: unknown) => Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 }); const splitLabel = (s: any) => `SP ${num(s?.sp)} · SB ${num(s?.sb)} · SD ${num(s?.sd)}`; const connLabel = (v: [number, number]) => `${v[0]}/${v[1]}`; const includesSearch = (value: unknown) => JSON.stringify(value).toLowerCase().includes(search.value.toLowerCase())
const filteredAccounts = computed(() => organizations.value.filter(a => (status.value === 'all' || a.status === status.value) && includesSearch(a))); const filteredProfiles = computed(() => profiles.value.filter(includesSearch)); const profileCampaigns = computed(() => campaigns.value.filter(c => c.amazonProfileId === profile.value?.amazonProfileId && includesSearch(c))); const scopedSchedules = computed(() => schedules.value.filter(s => (!action.value || s.action === action.value) && (!scopedProfileId.value || s.amazonProfileId === scopedProfileId.value) && includesSearch(s)).map(s => ({ ...s, profile: profiles.value.find(p => p.amazonProfileId === s.amazonProfileId)?.name || '' }))) // L2 tabs are scoped by the org id in the URL, so they never depend on the
// account lookup resolving (an unresolved/empty lookup must not blank the tabs).
const orgIdParam = computed(() => String(path.value[1] ?? '')); const accountProfiles = computed(() => accountProfilesData.value.filter(p => String(p.orgId) === orgIdParam.value && includesSearch(p))); const accountAds = computed(() => adsAccounts.value.filter(a => String(a.orgId) === orgIdParam.value && includesSearch(a))); const accountSubs = computed(() => subAccounts.value.filter(s => String(s.orgId) === orgIdParam.value && includesSearch(s)))
const title = computed(() => {
  if (!ready.value)
    return 'Loading…'
  switch (page.value) {
    case 'account-detail': return account.value?.name ?? 'Accounts'
    case 'performance': return 'Performance'
    case 'profile': return profile.value?.name ?? 'Performance'
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
    add(profile.value.name)
  }
  else if (page.value === 'schedules') {
    add('Performance', '/customer-tracking/performance')
    if (scopedProfileId.value)
      add(profile.value.name, `/customer-tracking/performance/profile/${profile.value.amazonProfileId}`)
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

// L1 — Performance: semantic donut mixes + headline counts
const performanceOptimizationEvents = computed(() => profileRows.value.reduce((n, p) => n + p.optimizationEvents, 0))
const performanceScheduleRuns = computed(() => profileRows.value.reduce((n, p) => n + p.scheduleRuns, 0))
const performanceActiveSchedules = computed(() => profileRows.value.reduce((n, p) => n + p.activeSchedules, 0))
const performanceOptMix = computed(() => [
  { name: 'Bids', value: profileRows.value.reduce((n, p) => n + p.bidsOptimized, 0) },
  { name: 'Budgets', value: profileRows.value.reduce((n, p) => n + p.budgetsOptimized, 0) },
  { name: 'Placements', value: profileRows.value.reduce((n, p) => n + p.placementsOptimized, 0) },
])
const performanceLaunchMix = computed(() => [
  { name: 'SP', value: profileRows.value.reduce((n, p) => n + p.launched.sp, 0) },
  { name: 'SB', value: profileRows.value.reduce((n, p) => n + p.launched.sb, 0) },
  { name: 'SD', value: profileRows.value.reduce((n, p) => n + p.launched.sd, 0) },
])
const performanceTargetingMix = computed(() => [
  { name: 'SP', value: profileRows.value.reduce((n, p) => n + p.targeting.sp, 0) },
  { name: 'SB', value: profileRows.value.reduce((n, p) => n + p.targeting.sb, 0) },
  { name: 'SD', value: profileRows.value.reduce((n, p) => n + p.targeting.sd, 0) },
])
// L2 — Profile
const profileCampaignMix = computed(() => {
  const counts: Record<string, number> = {}
  for (const c of campaignRows.value)
    counts[c.adType] = (counts[c.adType] ?? 0) + 1
  return Object.entries(counts).map(([name, value]) => ({ name, value }))
})
const profileOptMix = computed(() => [
  { name: 'Bids', value: profile.value.bidsOptimized },
  { name: 'Budgets', value: profile.value.budgetsOptimized },
  { name: 'Placements', value: profile.value.placementsOptimized },
])
// L3 — Schedules
const scheduleLaunchMix = computed(() => [
  { name: 'Campaigns', value: scheduleRows.value.reduce((n, s) => n + s.campaignsLaunched, 0) },
  { name: 'Ad Groups', value: scheduleRows.value.reduce((n, s) => n + s.adGroups, 0) },
  { name: 'Targeting', value: scheduleRows.value.reduce((n, s) => n + s.targeting, 0) },
])
const scheduleCoverageMix = computed(() => [
  { name: 'Managed', value: scheduleRows.value.reduce((n, s) => n + s.managed, 0) },
  { name: 'Unmanaged', value: scheduleRows.value.reduce((n, s) => n + s.unmanaged, 0) },
])
const scheduleProfileMix = computed(() => {
  const counts: Record<string, number> = {}
  for (const s of scheduleRows.value) {
    const k = s.profile || 'Unknown'
    counts[k] = (counts[k] ?? 0) + 1
  }
  const rows = Object.entries(counts).map(([name, value]) => ({ name, value })).filter(d => d.value > 0).sort((a, b) => b.value - a.value)
  const TOP = 20
  if (rows.length <= TOP)
    return rows
  return [...rows.slice(0, TOP), { name: 'Others', value: rows.slice(TOP).reduce((n, d) => n + d.value, 0) }]
})
const scheduleSubAccountMix = computed(() => { const counts: Record<string, number> = {}; for (const s of scheduleRows.value) { const k = s.user || 'Unknown'; counts[k] = (counts[k] ?? 0) + 1 }; return Object.entries(counts).map(([name, value]) => ({ name, value })) })
// L3 — Analytics (aggregated over the analytics campaign table's filtered rows → cross-filtering)
const scopedProfileIds = computed(() => new Set(scopedSchedules.value.map(s => s.amazonProfileId)))
const analyticsTotals = computed(() => analyticsRows.value.reduce((t, c) => { t.adSpend += c.adSpend; t.adSales += c.adSales; t.impressions += c.impressions; t.clicks += c.clicks; t.adOrders += c.adOrders; t.bidsOptimized += c.bidsOptimized; t.adGroups += c.adGroups; t.targeting += c.targeting; return t }, { adSpend: 0, adSales: 0, impressions: 0, clicks: 0, adOrders: 0, bidsOptimized: 0, adGroups: 0, targeting: 0 }))
const analyticsFunnelData = computed(() => [
  { name: 'Impressions', value: analyticsTotals.value.impressions },
  { name: 'Clicks', value: analyticsTotals.value.clicks },
  { name: 'Ad Orders', value: analyticsTotals.value.adOrders },
])
const analyticsSpendSalesData = computed(() => [
  { name: 'Ad Spend', value: analyticsTotals.value.adSpend },
  { name: 'Ad Sales', value: analyticsTotals.value.adSales },
])
const analyticsAcos = computed(() => analyticsTotals.value.adSales ? analyticsTotals.value.adSpend / analyticsTotals.value.adSales * 100 : 0)
const analyticsCpc = computed(() => analyticsTotals.value.clicks ? analyticsTotals.value.adSpend / analyticsTotals.value.clicks : 0)
const analyticsCvr = computed(() => analyticsTotals.value.clicks ? analyticsTotals.value.adOrders / analyticsTotals.value.clicks * 100 : 0)
const analyticsCampaignsLaunched = computed(() => analyticsRows.value.length)
function value(row: any, key: string) {
  const v = row[key]; if (v === undefined || v === null)
    return '—'; if (['adSpend', 'adSales'].includes(key))
    return formatExact(Number(v), { currency: true }); if (['adsConn', 'profConn', 'subConn', 'ams', 'sp', 'profiles', 'adsAccess', 'profileAccess'].includes(key) && Array.isArray(v))
    return connLabel(v as [number, number]); if (['adSpendSplit', 'launched', 'targeting'].includes(key) && v?.sp !== undefined)
    return splitLabel(v); if (['acos', 'cvr'].includes(key))
    return `${Number(v).toFixed(1)}%`; if (key === 'cpc')
    return `$${Number(v).toFixed(2)}`; if (['adsApi', 'amsApi', 'spApi'].includes(key))
    return v ? 'Connected' : 'Disconnected'; if (['joined', 'renewal', 'lastActive', 'connectedAt'].includes(key))
    return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10); return Array.isArray(v) ? v.join(', ') : String(v)
}
function statusBadgeClass(v: unknown) {
  const s = String(v ?? '').toLowerCase()
  if (['at risk', 'error', 'failed', 'churned', 'disconnected'].includes(s))
    return 'text-destructive'
  return ''
}
const accountColumns = [['name', 'Organization'], ['plan', 'Plan'], ['joined', 'Joined'], ['lastActive', 'Last Active'], ['renewal', 'Renewal Date'], ['status', 'Status'], ['adsConn', 'Ads Accounts'], ['profConn', 'Profiles'], ['subConn', 'Sub Accounts'], ['ams', 'AMS API'], ['sp', 'SP API'], ['adSpendSplit', 'Ad Spend (SP/SB/SD)'], ['chats', 'Agent Chats'], ['optimizationEvents', 'Optimization Events'], ['scheduleRuns', 'Schedule Runs'], ['launched', 'Campaigns Launched (CMG/KH/CG)']]
const adsColumns = [['name', 'Ads Accounts'], ['profiles', 'Profiles'], ['ams', 'AMS API'], ['adSpendSplit', 'Ad Spend (SP/SB/SD)'], ['chats', 'Agent Chats'], ['optimizationEvents', 'Optimization Events'], ['scheduleRuns', 'Schedule Runs'], ['launched', 'Campaigns Launched (CMG/KH/CG)']]
const profileColumns = [['name', 'Profile'], ['marketplace', 'Marketplace'], ['entity', 'Entity'], ['organization', 'Organization'], ['plan', 'Plan Type'], ['connectedAt', 'Connected at'], ['adsApi', 'Ads API'], ['amsApi', 'AMS API'], ['spApi', 'SP API'], ['adSpendSplit', 'Ad Spend (SP/SB/SD)'], ['adSales', 'Ad Sales'], ['acos', 'ACoS'], ['tacos', 'TACoS'], ['adOrders', 'Ad Orders'], ['impressions', 'Impressions'], ['clicks', 'Clicks'], ['cpc', 'CPC'], ['cvr', 'CVR'], ['scheduleRuns', 'Schedule Runs'], ['activeSchedules', 'Active Schedules'], ['optimizationEvents', 'Optimization Events'], ['bidsOptimized', 'Bids Optimized'], ['budgetsOptimized', 'Budgets Optimized'], ['placementsOptimized', 'Placements Optimized'], ['launched', 'Campaigns Launched (CMG/KH/CG)'], ['targeting', 'Targeting Launched (CMG/KH/CG)']]
const campaignColumns = [['name', 'Campaigns'], ['adType', 'Ad Type'], ['managedBy', 'Managed By'], ['affectedBy', 'Affected By'], ['launchedBy', 'Launched By'], ['adSpend', 'Ad Spend'], ['adSales', 'Ad Sales'], ['acos', 'ACoS'], ['adOrders', 'Ad Orders'], ['impressions', 'Impressions'], ['clicks', 'Clicks'], ['cpc', 'CPC'], ['cvr', 'CVR'], ['optimizationEvents', 'Optimization Events'], ['bidsOptimized', 'Bids Optimized'], ['budgetsOptimized', 'Budgets Optimized'], ['placementsOptimized', 'Placements Optimized']]
const scheduleColumns = [['name', 'Schedules'], ['status', 'Status'], ['user', 'User'], ['alarm', 'Alarm'], ['created', 'Creation Date'], ['id', 'ID'], ['lastResult', 'Last Run Result']]
const subColumns = [['name', 'Sub Accounts'], ['role', 'Role'], ['lastActive', 'Last Active'], ['adsAccess', 'Ads Account Access'], ['profileAccess', 'Profile Access'], ['chats', 'Agent Chats'], ['optimizationEvents', 'Optimization Events'], ['scheduleRuns', 'Schedule Runs'], ['launched', 'Campaigns Launched (CMG/KH/CG)']]
const accountProfileColumns = [['name', 'Profiles'], ['marketplace', 'Marketplaces'], ['amsApi', 'AMS API'], ['adSpendSplit', 'Ad Spend (SP/SB/SD)'], ['chats', 'Agent Chats'], ['optimizationEvents', 'Optimization Events'], ['scheduleRuns', 'Schedule Runs'], ['launched', 'Campaigns Launched (CMG/KH/CG)']]
const launchScheduleColumns = [['name', 'Schedules'], ['user', 'User'], ['adType', 'Ad Type'], ['created', 'Creation Date'], ['id', 'ID'], ['lastResult', 'Last Run Result'], ['campaignsLaunched', 'Campaigns Launched'], ['adGroups', 'Ad Groups Launched'], ['targeting', 'Targeting Launched']]
const launchCampaignColumns = [['name', 'Campaigns'], ['schedule', 'Schedule'], ['adType', 'Ad Type'], ['adGroups', 'Ad Groups'], ['targeting', 'Targeting'], ['adSpend', 'Ad Spend'], ['adSales', 'Ad Sales'], ['acos', 'ACoS'], ['adOrders', 'Ad Orders'], ['impressions', 'Impressions'], ['clicks', 'Clicks'], ['cpc', 'CPC'], ['cvr', 'CVR']]
const optimizationCampaignColumns = [['name', 'Campaigns'], ['schedule', 'Schedule'], ['adType', 'Ad Type'], ['launchedBy', 'Launch Source'], ['bidsOptimized', 'Bids Optimized'], ['adSpend', 'Ad Spend'], ['adSales', 'Ad Sales'], ['acos', 'ACoS'], ['adOrders', 'Ad Orders'], ['impressions', 'Impressions'], ['clicks', 'Clicks'], ['cpc', 'CPC'], ['cvr', 'CVR']]
const agentProfileColumns = [['name', 'Profile'], ['marketplace', 'Marketplace'], ['entity', 'Entity'], ['organization', 'Organization'], ['chats', 'Agent Chats'], ['toolCalls', 'Tool Calls'], ['toolsUsed', 'Tools Used'], ['lastActivity', 'Last Agent Activity']]
const toolColumns = [['tool', 'Tool'], ['profilesUsing', 'Profiles Using Tool'], ['calls', 'Tool Calls'], ['lastCalled', 'Last Called'], ['success', 'Success Rate'], ['errors', 'Errors']]
const profileToolColumns = [['tool', 'Tool'], ['calls', 'Tool Calls'], ['lastCalled', 'Last Called'], ['success', 'Success Rate'], ['errors', 'Errors']]
const chatColumns = [['name', 'Chat Name'], ['date', 'Date'], ['sub', 'Sub Account'], ['first', 'First Message'], ['summary', 'Chat Summary']]
const toolProfileColumns = [['name', 'Profile'], ['marketplace', 'Marketplace'], ['organization', 'Organization'], ['calls', 'Tool Calls'], ['lastCalled', 'Last Called'], ['success', 'Success Rate'], ['errors', 'Errors']]
const agentProfileRows = agentProfileStats; const toolProfileRows = computed(() => profiles.value.slice(0, 8).map(p => ({ ...p, calls: 12 + p.chats, lastCalled: `${(p.chats % 5) + 1} days ago`, success: 90 + (p.chats % 8), errors: p.chats % 3 }))); const analyticsCampaignRows = computed(() => campaigns.value.filter(c => scopedProfileIds.value.has(c.amazonProfileId)).map((c) => { const lo = launchOutput.value.find(x => x.amazonProfileId === c.amazonProfileId && x.action === c.launchedBy); return { ...c, schedule: actionCn[c.launchedBy] || c.launchedBy, adGroups: lo?.adGroups ?? 0, targeting: lo?.targeting ?? 0 } }))
const performanceScheduleColumns = [['action', 'Action Type'], ['type', 'Action Category'], ['active', 'Active'], ['runs', 'Schedule Runs'], ['bidsOptimized', 'Optimization Actions'], ['campaignsLaunched', 'Campaigns Launched']]
const performanceScheduleBase = computed(() => {
  const groups: Record<string, any> = {}
  for (const s of schedules.value) {
    const g = groups[s.action] || (groups[s.action] = { action: s.action, type: optActions.includes(s.action) ? 'Optimization' : 'Campaign Launch', active: 0, runs: 0, bidsOptimized: 0, campaignsLaunched: 0 })
    g.active += s.status === 'Active' ? 1 : 0
    g.runs += s.runs
    g.bidsOptimized += s.bidsOptimized
    g.campaignsLaunched += s.campaignsLaunched
  }
  return Object.values(groups)
})
const { filters: accountFilters, filtered: accountRows } = useColumnFilters(filteredAccounts)
const { filters: accountAdFilters, filtered: accountAdRows } = useColumnFilters(accountAds)
const { filters: accountProfileFilters, filtered: accountProfileRows } = useColumnFilters(accountProfiles)
const { filters: accountSubFilters, filtered: accountSubRows } = useColumnFilters(accountSubs)
const { filters: profileFilters, filtered: profileRows } = useColumnFilters(filteredProfiles)
const { filters: perfScheduleFilters, filtered: perfScheduleRows } = useColumnFilters(performanceScheduleBase)
const { filters: campaignFilters, filtered: campaignRows } = useColumnFilters(profileCampaigns)
const { filters: scheduleFilters, filtered: scheduleRows } = useColumnFilters(scopedSchedules)
const { filters: analyticsFilters, filtered: analyticsRows } = useColumnFilters(analyticsCampaignRows)
const { filters: agentProfileFilters, filtered: agentProfileFilteredRows } = useColumnFilters(agentProfileRows)
const { filters: toolFilters, filtered: toolRows } = useColumnFilters(toolStats)
const { filters: profileToolFilters, filtered: profileToolRows } = useColumnFilters(toolStats)
const { filters: chatFilters, filtered: chatRows } = useColumnFilters(agentChats)
const { filters: toolProfileFilters, filtered: toolProfileFilteredRows } = useColumnFilters(toolProfileRows)

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
// Three-series split columns render as a MetricSplit cell instead of one run-on
// string; currency columns scan compact (K/M) and keep the exact amount on hover.
const MONEY_KEYS = new Set(['adSpend', 'adSales'])
const SPLIT_COLUMNS: Record<string, { labels: [string, string, string], currency?: boolean }> = {
  adSpendSplit: { labels: ['SP', 'SB', 'SD'], currency: true },
  launched: { labels: ['SP', 'SB', 'SD'] },
}

function makeColumns(cols: string[][], opts: { href?: (row: any) => string, nameKey?: string, badgeKeys?: string[], boolKeys?: string[] } = {}): ColumnDef<any>[] {
  const nameKey = opts.nameKey ?? 'name'
  const badgeKeys = opts.badgeKeys ?? []
  const boolKeys = opts.boolKeys ?? []
  return cols.map(([key, label]) => {
    if (key === nameKey) {
      const base = { id: key, accessorKey: key, header: label }
      if (opts.href) {
        return { ...base, cell: ({ row }: any) => h('button', { class: 'max-w-[180px] truncate text-left font-medium text-primary transition-colors hover:underline', onClick: () => router.push(opts.href!(row.original)) }, String(row.original[key] ?? '')) }
      }
      return { ...base, cell: ({ row }: any) => h('span', { class: 'max-w-[180px] truncate font-medium' }, String(row.original[key] ?? '')) }
    }
    if (boolKeys.includes(key)) {
      return { id: key, accessorKey: key, header: label, cell: ({ row }: any) => { const on = !!row.original[key]; return h(Badge, { variant: 'secondary' }, () => (on ? 'On' : 'Off')) } }
    }
    if (badgeKeys.includes(key)) {
      return { id: key, accessorKey: key, header: label, cell: ({ row }: any) => { const text = value(row.original, key); return h(Badge, { variant: 'secondary', class: statusBadgeClass(text) }, () => text) } }
    }
    const split = SPLIT_COLUMNS[key]
    if (split) {
      return { id: key, accessorKey: key, header: label, cell: ({ row }: any) => (row.original[key]?.sp !== undefined ? h(MetricSplit, { value: row.original[key], labels: split.labels, currency: split.currency }) : h('span', { class: 'text-muted-foreground' }, value(row.original, key))) }
    }
    if (MONEY_KEYS.has(key)) {
      return { id: key, accessorKey: key, header: label, cell: ({ row }: any) => h('span', { class: 'font-mono tabular-nums', title: formatExact(row.original[key], { currency: true }) }, formatMetric(row.original[key], { currency: true })) }
    }
    return { id: key, accessorKey: key, header: label, cell: ({ row }: any) => h('span', { class: 'font-mono tabular-nums' }, value(row.original, key)) }
  })
}
const actionsCol: ColumnDef<any> = { id: 'actions', header: () => 'Actions', cell: ({ row }: any) => h(CampaignActionsCell, { campaign: row.original }), enableSorting: false, size: 96 }
const accountCols = makeColumns(accountColumns, { href: (a: any) => `/customer-tracking/accounts/${a.orgId}`, badgeKeys: ['status'] })
const accountAdCols = makeColumns(adsColumns)
const accountProfileCols = makeColumns(accountProfileColumns, { href: (p: any) => `/customer-tracking/performance/profile/${p.amazonProfileId}` })
const accountSubCols = makeColumns(subColumns)
const profileCols = makeColumns(profileColumns, { href: (p: any) => `/customer-tracking/performance/profile/${p.amazonProfileId}`, badgeKeys: ['adsApi', 'amsApi', 'spApi'] })
const perfScheduleCols = makeColumns(performanceScheduleColumns, { nameKey: 'action', href: (s: any) => `/customer-tracking/performance/schedules/${encodeURIComponent(s.action)}` })
const campaignCols = [...makeColumns(campaignColumns), actionsCol]
const activeScheduleColumns = computed(() => {
  const base = isLaunchAction.value ? launchScheduleColumns : scheduleColumns; if (scopedProfileId.value)
    return base; return [base[0], ['profile', 'Profile'], ...base.slice(1)]
})
const activeScheduleCols = computed(() => makeColumns(activeScheduleColumns.value, isLaunchAction.value ? { badgeKeys: ['lastResult'] } : { badgeKeys: ['status', 'lastResult'], boolKeys: ['alarm'] }))
const launchCampaignCols = makeColumns(launchCampaignColumns)
const optimizationCampaignCols = makeColumns(optimizationCampaignColumns)
const agentProfileCols = makeColumns(agentProfileColumns, { href: (p: any) => `/customer-tracking/agent/profile/${p.amazonProfileId}` })
const toolCols = makeColumns(toolColumns, { nameKey: 'tool', href: (t: any) => `/customer-tracking/agent/tool/${encodeURIComponent(t.tool)}/profiles` })
const profileToolCols = makeColumns(profileToolColumns, { nameKey: 'tool' })
const chatCols = makeColumns(chatColumns)
const toolProfileCols = makeColumns(toolProfileColumns)
const accountTable = computed(() => generateVueTable<any>({ columns: accountCols, data: accountRows.value, initialPinning: { left: ['name'], right: [] } }))
const accountAdTable = computed(() => generateVueTable<any>({ columns: accountAdCols, data: accountAdRows.value, initialPinning: { left: ['name'], right: [] } }))
const accountProfileTable = computed(() => generateVueTable<any>({ columns: accountProfileCols, data: accountProfileRows.value, initialPinning: { left: ['name'], right: [] } }))
const accountSubTable = computed(() => generateVueTable<any>({ columns: accountSubCols, data: accountSubRows.value, initialPinning: { left: ['name'], right: [] } }))
const profileTable = computed(() => generateVueTable<any>({ columns: profileCols, data: profileRows.value, initialPinning: { left: ['name'], right: [] } }))
const perfScheduleTable = computed(() => generateVueTable<any>({ columns: perfScheduleCols, data: perfScheduleRows.value, initialPinning: { left: ['action'], right: [] } }))
const campaignTable = computed(() => generateVueTable<any>({ columns: campaignCols, data: campaignRows.value, initialPinning: { left: ['name'], right: ['actions'] } }))
const scheduleTable = computed(() => generateVueTable<any>({ columns: activeScheduleCols.value, data: scheduleRows.value, initialPinning: { left: ['name'], right: [] } }))
const analyticsTable = computed(() => generateVueTable<any>({ columns: isLaunchAction.value ? launchCampaignCols : optimizationCampaignCols, data: analyticsRows.value, initialPinning: { left: ['name'], right: [] } }))
const agentProfileTable = computed(() => generateVueTable<any>({ columns: agentProfileCols, data: agentProfileFilteredRows.value, initialPinning: { left: ['name'], right: [] } }))
const toolTable = computed(() => generateVueTable<any>({ columns: toolCols, data: toolRows.value, initialPinning: { left: ['tool'], right: [] } }))
const profileToolTable = computed(() => generateVueTable<any>({ columns: profileToolCols, data: profileToolRows.value, initialPinning: { left: ['tool'], right: [] } }))
const chatTable = computed(() => generateVueTable<any>({ columns: chatCols, data: chatRows.value, initialPinning: { left: ['name'], right: [] } }))
const toolProfileTable = computed(() => generateVueTable<any>({ columns: toolProfileCols, data: toolProfileFilteredRows.value, initialPinning: { left: ['name'], right: [] } }))
</script>

<template>
  <BasicPage :title="title">
    <template #actions>
      <div class="relative">
        <Search class="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
        <Input v-model="search" class="h-9 w-48 pl-8 md:w-64" placeholder="Search…" />
      </div>
      <DateRangePicker v-model="dateRange" />
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
            <ColumnFilterBar v-model="accountFilters" :columns="accountColumns" />
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
                <ColumnFilterBar v-model="accountAdFilters" :columns="adsColumns" />
                <DataTable :table="accountAdTable" :columns="accountAdCols" :data="accountAdRows" />
              </TabsContent>
              <TabsContent value="profiles" class="flex flex-col gap-4">
                <ColumnFilterBar v-model="accountProfileFilters" :columns="accountProfileColumns" />
                <DataTable :table="accountProfileTable" :columns="accountProfileCols" :data="accountProfileRows" />
              </TabsContent>
              <TabsContent value="subs" class="flex flex-col gap-4">
                <ColumnFilterBar v-model="accountSubFilters" :columns="subColumns" />
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
              <KpiChart title="Optimization Mix" :data="performanceOptMix" />
            </CardContent>
          </Card>
          <Card>
            <CardContent class="p-4">
              <KpiChart title="Campaigns Launched" :data="performanceLaunchMix" />
            </CardContent>
          </Card>
          <Card>
            <CardContent class="p-4">
              <KpiChart title="Targeting Launched" :data="performanceTargetingMix" />
            </CardContent>
          </Card>
        </div>
        <div class="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <span>Optimization Events <span class="font-medium text-foreground">{{ performanceOptimizationEvents }}</span></span>
          <span>Schedule Runs <span class="font-medium text-foreground">{{ performanceScheduleRuns }}</span></span>
          <span>Active Schedules <span class="font-medium text-foreground">{{ performanceActiveSchedules }}</span></span>
        </div>
        <Card>
          <CardContent class="pt-6">
            <TrackingChart :title="`${dateRangeLabel} trend · performance metrics`" :seed="1" :available-metrics="['Ad Spend', 'Ad Sales', 'ACoS', 'Ad Orders', 'Impressions', 'Clicks', 'CPC', 'CVR', 'Schedule Runs', 'Optimization Events']" />
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
                <ColumnFilterBar v-model="profileFilters" :columns="profileColumns" />
                <DataTable :table="profileTable" :columns="profileCols" :data="profileRows" />
              </TabsContent>
              <TabsContent value="schedules" class="flex flex-col gap-4">
                <ColumnFilterBar v-model="perfScheduleFilters" :columns="performanceScheduleColumns" />
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
              <KpiChart title="Campaigns by Type" :data="profileCampaignMix" />
            </CardContent>
          </Card>
          <Card>
            <CardContent class="p-4">
              <KpiChart title="Optimization Mix" :data="profileOptMix" />
            </CardContent>
          </Card>
        </div>
        <div class="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <span>Optimization Events <span class="font-medium text-foreground">{{ profile.optimizationEvents }}</span></span>
          <span>Ad Spend <span class="font-medium text-foreground">{{ formatMetric(profile.adSpend, { currency: true }) }}</span></span>
          <span>Ad Sales <span class="font-medium text-foreground">{{ formatMetric(profile.adSales, { currency: true }) }}</span></span>
          <span>ACoS <span class="font-medium text-foreground">{{ profile.acos.toFixed(1) }}%</span></span>
          <span>Ad Orders <span class="font-medium text-foreground">{{ profile.adOrders }}</span></span>
        </div>
        <Card>
          <CardContent class="pt-6">
            <TrackingChart title="Profile trend · selectable metrics" :seed="profile.adSpend" :available-metrics="['Ad Spend', 'Ad Sales', 'ACoS', 'Ad Orders', 'Impressions', 'Clicks', 'CPC', 'CVR', 'Optimization Events', 'Bids Optimized', 'Budgets Optimized', 'Placements Optimized']" />
          </CardContent>
        </Card>
        <Card>
          <CardContent class="flex flex-col gap-4">
            <div v-if="campaignsLoading" class="py-2 text-sm text-muted-foreground">
              Loading campaign data…
            </div>
            <ColumnFilterBar v-model="campaignFilters" :columns="campaignColumns" />
            <DataTable :table="campaignTable" :columns="campaignCols" :data="campaignRows" />
          </CardContent>
        </Card>
      </template>

      <!-- Schedules -->
      <template v-else-if="page === 'schedules'">
        <Card>
          <CardContent class="flex flex-col gap-4">
            <Tabs :default-value="tabDefaults[page]">
              <TabsList>
                <TabsTrigger value="schedules">
                  Schedules
                </TabsTrigger>
                <TabsTrigger value="analytics">
                  Analytics
                </TabsTrigger>
              </TabsList>
              <TabsContent value="schedules" class="flex flex-col gap-4">
                <div class="grid gap-3 md:grid-cols-2">
                  <Card>
                    <CardContent class="p-4">
                      <KpiChart v-if="isLaunchAction" title="Launch Output" :data="scheduleLaunchMix" />
                      <KpiChart v-else title="Campaign Coverage" :data="scheduleCoverageMix" />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent class="p-4">
                      <KpiChart :title="scopedProfileId ? 'Schedules by Sub Account' : 'Schedules by Profile'" :data="scopedProfileId ? scheduleSubAccountMix : scheduleProfileMix" />
                    </CardContent>
                  </Card>
                </div>
                <ColumnFilterBar v-model="scheduleFilters" :columns="activeScheduleColumns" />
                <DataTable :table="scheduleTable" :columns="activeScheduleCols" :data="scheduleRows" />
              </TabsContent>
              <TabsContent value="analytics" class="flex flex-col gap-4">
                <div class="grid gap-3 md:grid-cols-2">
                  <Card>
                    <CardContent class="p-4">
                      <KpiChart type="funnel" title="Acquisition Funnel" :data="analyticsFunnelData" />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent class="p-4">
                      <KpiChart type="bar" title="Spend vs Sales" :data="analyticsSpendSalesData" />
                    </CardContent>
                  </Card>
                </div>
                <div class="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
                  <span>ACoS <span class="font-medium text-foreground">{{ analyticsAcos.toFixed(1) }}%</span></span>
                  <span>CPC <span class="font-medium text-foreground">${{ analyticsCpc.toFixed(2) }}</span></span>
                  <span>CVR <span class="font-medium text-foreground">{{ analyticsCvr.toFixed(1) }}%</span></span>
                  <template v-if="!isLaunchAction">
                    <span>Bids Optimized <span class="font-medium text-foreground">{{ analyticsTotals.bidsOptimized }}</span></span>
                  </template>
                  <template v-else>
                    <span>Campaigns Launched <span class="font-medium text-foreground">{{ analyticsCampaignsLaunched }}</span></span>
                    <span>Ad Groups Launched <span class="font-medium text-foreground">{{ analyticsTotals.adGroups }}</span></span>
                    <span>Targeting Launched <span class="font-medium text-foreground">{{ analyticsTotals.targeting }}</span></span>
                  </template>
                </div>
                <Card>
                  <CardContent class="pt-6">
                    <TrackingChart :title="`${dateRangeLabel} analytics · ${actionCn[action] || action}`" :seed="analyticsTotals.adSpend + 4" :available-metrics="['Ad Spend', 'Ad Sales', 'ACoS', 'Ad Orders', 'Impressions', 'Clicks', 'CPC', 'CVR', 'Bids Optimized', 'Campaigns Launched']" />
                  </CardContent>
                </Card>
                <div v-if="campaignsLoading" class="py-2 text-sm text-muted-foreground">
                  Loading campaign data…
                </div>
                <ColumnFilterBar v-model="analyticsFilters" :columns="(isLaunchAction ? launchCampaignColumns : optimizationCampaignColumns)" />
                <DataTable :table="analyticsTable" :columns="(isLaunchAction ? launchCampaignCols : optimizationCampaignCols)" :data="analyticsRows" />
              </TabsContent>
            </Tabs>
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
                <ColumnFilterBar v-model="agentProfileFilters" :columns="agentProfileColumns" />
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
                <ColumnFilterBar v-model="toolFilters" :columns="toolColumns" />
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
                <ColumnFilterBar v-model="profileToolFilters" :columns="profileToolColumns" />
                <DataTable :table="profileToolTable" :columns="profileToolCols" :data="profileToolRows" />
              </TabsContent>
              <TabsContent value="chats" class="flex flex-col gap-4">
                <ColumnFilterBar v-model="chatFilters" :columns="chatColumns" />
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
            <ColumnFilterBar v-model="toolProfileFilters" :columns="toolProfileColumns" />
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
