<script setup lang="ts">
/* eslint-disable style/max-statements-per-line */
import type { ColumnDef } from '@tanstack/vue-table'

import { ChevronRight, Search } from 'lucide-vue-next'
import { computed, h, ref } from 'vue'

import DataTable from '@/components/data-table/data-table.vue'
import { generateVueTable } from '@/components/data-table/use-generate-vue-table'
import CampaignActionsCell from '@/features/customer-tracking/components/campaign-actions-cell.vue'
import ColumnFilterBar from '@/features/customer-tracking/components/column-filter-bar.vue'
import TrackingChart from '@/features/customer-tracking/components/tracking-chart.vue'
import { accounts, actionCn, agentChats, campaigns, launchActions, optActions, profiles, schedules, toolStats } from '@/features/customer-tracking/mock'
import { useColumnFilters } from '@/features/customer-tracking/use-column-filter'

const route = useRoute(); const router = useRouter(); const search = ref(''); const range = ref('30d'); const tab = ref('profiles'); const status = ref('all'); const scheduleFilter = ref('')
const path = computed(() => String((route.params as any).path || 'accounts').split('/').filter(Boolean))
const page = computed(() => path.value[0] === 'accounts' && path.value[1] ? 'account-detail' : path.value[0] === 'performance' && path.value[1] === 'profile' ? 'profile' : path.value[0] === 'performance' && path.value[1] === 'schedules' ? 'schedules' : path.value[0] === 'agent' && path.value[1] === 'profile' ? 'agent-profile' : path.value[0] === 'agent' && path.value[1] === 'tool' ? 'tool-profiles' : path.value[0] || 'accounts')
const account = computed(() => accounts.find(a => a.id === path.value[1]) || accounts[0]); const profile = computed(() => profiles.find(p => p.id === path.value[2]) || profiles[0]); const action = computed(() => page.value === 'schedules' ? decodeURIComponent(path.value[2] || '') : ''); const isLaunchAction = computed(() => launchActions.includes(action.value))
const money = (n: number) => `$${(n / 1000).toFixed(1)}K`; const splitLabel = (s: any) => `SP ${s.sp} · SB ${s.sb} · SD ${s.sd}`; const connLabel = (v: [number, number]) => `${v[0]}/${v[1]}`; const go = (to: string) => router.push(`/customer-tracking/${to}`); const includesSearch = (value: unknown) => JSON.stringify(value).toLowerCase().includes(search.value.toLowerCase())
const filteredAccounts = computed(() => accounts.filter(a => (status.value === 'all' || a.status === status.value) && includesSearch(a))); const filteredProfiles = computed(() => profiles.filter(includesSearch)); const profileCampaigns = computed(() => campaigns.filter(c => c.profileId === profile.value.id && includesSearch(c))); const scopedSchedules = computed(() => schedules.filter(s => (!action.value || s.action === action.value) && (!scheduleFilter.value || s.name === scheduleFilter.value) && includesSearch(s))); const accountProfiles = computed(() => profiles.filter(p => p.accountId === account.value.id && includesSearch(p))); const accountAds = computed(() => Array.from({ length: 3 }, (_, i) => ({ name: `${account.value.name} Ads ${i + 1}`, profiles: account.value.profConn, ams: account.value.ams, spendSplit: account.value.spendSplit, chats: Math.round(account.value.chats / 3), optEvents: Math.round(account.value.optEvents / 3), schedRuns: Math.round(account.value.schedRuns / 3), launched: account.value.launched })).filter(includesSearch)); const accountSubs = computed(() => Array.from({ length: 4 }, (_, i) => ({ name: `operator_${i + 1}`, role: i === 0 ? 'Admin' : 'Member', lastActive: `${i + 1} days ago`, adsAccess: account.value.adsConn, profileAccess: account.value.profConn, chats: Math.round(account.value.chats / 4), optEvents: Math.round(account.value.optEvents / 4), schedRuns: Math.round(account.value.schedRuns / 4), launched: account.value.launched })).filter(includesSearch))
const title = computed(() => ({ 'accounts': 'Hanna Accounts', 'account-detail': account.value.name, 'performance': 'Performance', 'profile': profile.value.name, 'schedules': `${actionCn[action.value] || action.value} · Schedules`, 'agent': 'Agent Analytics', 'agent-profile': `${profile.value.name} · Profile Details`, 'tool-profiles': `Profiles using ${path.value[2] || ''}` } as Record<string, string>)[page.value]); const breadcrumbRoot = computed(() => page.value === 'agent' || page.value.includes('agent') || page.value === 'tool-profiles' ? 'agent' : page.value === 'performance' || page.value === 'profile' || page.value === 'schedules' ? 'performance' : 'accounts')
const accountKpis = computed(() => [['Accounts', filteredAccounts.value.length], ['Healthy', filteredAccounts.value.filter(a => a.status === 'Healthy').length], ['Moderate', filteredAccounts.value.filter(a => a.status === 'Moderate').length], ['At Risk', filteredAccounts.value.filter(a => a.status === 'At Risk').length], ['Churned', filteredAccounts.value.filter(a => a.status === 'Churned').length]])
const performanceKpis = computed(() => [['Schedule Runs', filteredProfiles.value.reduce((n, p) => n + p.schedRuns, 0)], ['Active Schedules', filteredProfiles.value.reduce((n, p) => n + p.activeSched, 0)], ['Optimization Events', filteredProfiles.value.reduce((n, p) => n + p.optEvents, 0)], ['Bids Optimized', filteredProfiles.value.reduce((n, p) => n + p.bids, 0)], ['Budgets Optimized', filteredProfiles.value.reduce((n, p) => n + p.budgets, 0)], ['Placements Optimized', filteredProfiles.value.reduce((n, p) => n + p.placements, 0)], ['Campaigns Launched', filteredProfiles.value.reduce((n, p) => n + p.launched.sp + p.launched.sb + p.launched.sd, 0)], ['Targeting Launched', filteredProfiles.value.reduce((n, p) => n + p.targeting.sp + p.targeting.sb + p.targeting.sd, 0)]])
const profileKpis = computed(() => [['Campaigns', profileCampaigns.value.length], ['Ad Spend', money(profile.value.spend)], ['Ad Sales', money(profile.value.sales)], ['ACoS', `${profile.value.acos.toFixed(1)}%`], ['Ad Orders', profile.value.orders], ['Optimization Events', profile.value.optEvents], ['Bids Optimized', profile.value.bids], ['Budgets Optimized', profile.value.budgets], ['Placements Optimized', profile.value.placements]])
const scheduleKpis = computed(() => isLaunchAction.value ? [['Schedules', scopedSchedules.value.length], ['Campaigns Launched', scopedSchedules.value.reduce((n, s) => n + s.campLaunched, 0)], ['Ad Groups Launched', scopedSchedules.value.reduce((n, s) => n + s.adGroups, 0)], ['Targeting Launched', scopedSchedules.value.reduce((n, s) => n + s.targeting, 0)]] : [['Schedules', scopedSchedules.value.length], ['Managed Campaigns', scopedSchedules.value.reduce((n, s) => n + s.managed, 0)], ['Unmanaged Campaigns', scopedSchedules.value.reduce((n, s) => n + s.unmanaged, 0)], ['Bids Optimized', scopedSchedules.value.reduce((n, s) => n + s.bidsOpt, 0)], ['Alarms', scopedSchedules.value.filter(s => s.alarm).length]])
const analyticsKpis = computed(() => isLaunchAction.value ? [['Campaigns Launched', 18], ['Ad Spend', money(profile.value.spend)], ['Ad Sales', money(profile.value.sales)], ['ACoS', `${profile.value.acos.toFixed(1)}%`], ['Ad Orders', profile.value.orders], ['Impressions', profile.value.impr], ['Clicks', profile.value.clicks], ['CPC', `$${profile.value.cpc.toFixed(2)}`], ['CVR', `${profile.value.cvr.toFixed(1)}%`], ['Ad Groups Launched', 34], ['Targeting Launched', 62]] : [['Bids Optimized', 48], ['Ad Spend', money(profile.value.spend)], ['Ad Sales', money(profile.value.sales)], ['ACoS', `${profile.value.acos.toFixed(1)}%`], ['Ad Orders', profile.value.orders], ['Impressions', profile.value.impr], ['Clicks', profile.value.clicks], ['CPC', `$${profile.value.cpc.toFixed(2)}`], ['CVR', `${profile.value.cvr.toFixed(1)}%`]])
function value(row: any, key: string) {
  const v = row[key]; if (v === undefined || v === null)
    return '—'; if (['spend', 'sales'].includes(key))
    return money(Number(v)); if (['adsConn', 'profConn', 'subConn', 'ams', 'sp', 'profiles', 'adsAccess', 'profileAccess'].includes(key) && Array.isArray(v))
    return connLabel(v as [number, number]); if (['spendSplit', 'launched', 'targeting'].includes(key) && v?.sp !== undefined)
    return splitLabel(v); if (['acos', 'cvr'].includes(key))
    return `${Number(v).toFixed(1)}%`; if (key === 'cpc')
    return `$${Number(v).toFixed(2)}`; if (['adsApi', 'amsApi', 'spApi'].includes(key))
    return v ? 'Connected' : 'Disconnected'; return Array.isArray(v) ? v.join(', ') : String(v)
}
function statusColor(v: unknown) {
  const s = String(v ?? '').toLowerCase()
  if (['healthy', 'success', 'complete', 'active', 'posted', 'connected'].includes(s))
    return 'bg-green-50 text-green-700'
  if (['moderate', 'pending', 'publishing', 'partial', 'paused'].includes(s))
    return 'bg-yellow-50 text-yellow-700'
  if (['at risk', 'error', 'failed', 'churned', 'disconnected'].includes(s))
    return 'bg-red-50 text-red-700'
  return 'bg-blue-50 text-blue-700'
}
const accountColumns = [['name', 'Accounts'], ['plan', 'Plan'], ['joined', 'Joined'], ['lastActive', 'Last Active'], ['renewal', 'Renewal Date'], ['status', 'Status'], ['adsConn', 'Ads Accounts'], ['profConn', 'Profiles'], ['subConn', 'Sub Accounts'], ['ams', 'AMS API'], ['sp', 'SP API'], ['spendSplit', 'Ad Spend (SP/SB/SD)'], ['chats', 'Agent Chats'], ['optEvents', 'Optimization Events'], ['schedRuns', 'Schedule Runs'], ['launched', 'Campaigns Launched (CMG/KH/CG)']]
const adsColumns = [['name', 'Ads Accounts'], ['profiles', 'Profiles'], ['ams', 'AMS API'], ['spendSplit', 'Ad Spend (SP/SB/SD)'], ['chats', 'Agent Chats'], ['optEvents', 'Optimization Events'], ['schedRuns', 'Schedule Runs'], ['launched', 'Campaigns Launched (CMG/KH/CG)']]
const profileColumns = [['name', 'Profile'], ['marketplace', 'Marketplace'], ['entity', 'Entity'], ['account', 'Account'], ['plan', 'Plan Type'], ['joined', 'Joined'], ['lastActive', 'Last Active'], ['renewal', 'Renewal Date'], ['adsApi', 'Ads API'], ['amsApi', 'AMS API'], ['spApi', 'SP API'], ['spendSplit', 'Ad Spend (SP/SB/SD)'], ['sales', 'Ad Sales'], ['acos', 'ACoS'], ['tacos', 'TACoS'], ['orders', 'Ad Orders'], ['impr', 'Impressions'], ['clicks', 'Clicks'], ['cpc', 'CPC'], ['cvr', 'CVR'], ['schedRuns', 'Schedule Runs'], ['activeSched', 'Active Schedules'], ['optEvents', 'Optimization Events'], ['bids', 'Bids Optimized'], ['budgets', 'Budgets Optimized'], ['placements', 'Placements Optimized'], ['launched', 'Campaigns Launched (CMG/KH/CG)'], ['targeting', 'Targeting Launched (CMG/KH/CG)']]
const campaignColumns = [['name', 'Campaigns'], ['adType', 'Ad Type'], ['managedBy', 'Managed By'], ['affectedBy', 'Affected By'], ['launchedBy', 'Launched By'], ['spend', 'Ad Spend'], ['sales', 'Ad Sales'], ['acos', 'ACoS'], ['orders', 'Ad Orders'], ['impr', 'Impressions'], ['clicks', 'Clicks'], ['cpc', 'CPC'], ['cvr', 'CVR'], ['optEvents', 'Optimization Events'], ['bids', 'Bids Optimized'], ['budgets', 'Budgets Optimized'], ['placements', 'Placements Optimized']]
const scheduleColumns = [['name', 'Schedules'], ['status', 'Status'], ['user', 'User'], ['alarm', 'Alarm'], ['created', 'Creation Date'], ['id', 'ID'], ['lastResult', 'Last Run Result']]
const subColumns = [['name', 'Sub Accounts'], ['role', 'Role'], ['lastActive', 'Last Active'], ['adsAccess', 'Ads Account Access'], ['profileAccess', 'Profile Access'], ['chats', 'Agent Chats'], ['optEvents', 'Optimization Events'], ['schedRuns', 'Schedule Runs'], ['launched', 'Campaigns Launched (CMG/KH/CG)']]
const accountProfileColumns = [['name', 'Profiles'], ['marketplace', 'Marketplaces'], ['amsApi', 'AMS API'], ['spendSplit', 'Ad Spend (SP/SB/SD)'], ['chats', 'Agent Chats'], ['optEvents', 'Optimization Events'], ['schedRuns', 'Schedule Runs'], ['launched', 'Campaigns Launched (CMG/KH/CG)']]
const launchScheduleColumns = [['name', 'Schedules'], ['user', 'User'], ['adType', 'Ad Type'], ['created', 'Creation Date'], ['id', 'ID'], ['lastResult', 'Last Run Result'], ['campLaunched', 'Campaigns Launched'], ['adGroups', 'Ad Groups Launched'], ['targeting', 'Targeting Launched']]
const launchCampaignColumns = [['name', 'Campaigns'], ['schedule', 'Schedule'], ['adType', 'Ad Type'], ['adGroups', 'Ad Groups'], ['targeting', 'Targeting'], ['spend', 'Ad Spend'], ['sales', 'Ad Sales'], ['acos', 'ACoS'], ['orders', 'Ad Orders'], ['impr', 'Impressions'], ['clicks', 'Clicks'], ['cpc', 'CPC'], ['cvr', 'CVR']]
const optimizationCampaignColumns = [['name', 'Campaigns'], ['schedule', 'Schedule'], ['adType', 'Ad Type'], ['launchedBy', 'Launch Source'], ['bids', 'Bids Optimized'], ['spend', 'Ad Spend'], ['sales', 'Ad Sales'], ['acos', 'ACoS'], ['orders', 'Ad Orders'], ['impr', 'Impressions'], ['clicks', 'Clicks'], ['cpc', 'CPC'], ['cvr', 'CVR']]
const agentProfileColumns = [['name', 'Profile'], ['marketplace', 'Marketplace'], ['entity', 'Entity'], ['account', 'Account'], ['chats', 'Agent Chats'], ['toolCalls', 'Tool Calls'], ['toolsUsed', 'Tools Used'], ['lastActivity', 'Last Agent Activity']]
const toolColumns = [['tool', 'Tool'], ['profilesUsing', 'Profiles Using Tool'], ['calls', 'Tool Calls'], ['lastCalled', 'Last Called'], ['success', 'Success Rate'], ['errors', 'Errors']]
const profileToolColumns = [['tool', 'Tool'], ['calls', 'Tool Calls'], ['lastCalled', 'Last Called'], ['success', 'Success Rate'], ['errors', 'Errors']]
const chatColumns = [['name', 'Chat Name'], ['date', 'Date'], ['sub', 'Sub Account'], ['first', 'First Message'], ['summary', 'Chat Summary']]
const toolProfileColumns = [['name', 'Profile'], ['marketplace', 'Marketplace'], ['account', 'Account'], ['calls', 'Tool Calls'], ['lastCalled', 'Last Called'], ['success', 'Success Rate'], ['errors', 'Errors']]
const agentProfileRows = computed(() => filteredProfiles.value.map(p => ({ ...p, toolCalls: p.chats * 2, toolsUsed: Math.min(8, 2 + p.chats % 7), lastActivity: `${(p.chats % 7) + 1} days ago` }))); const toolProfileRows = computed(() => profiles.slice(0, 8).map(p => ({ ...p, calls: 12 + p.chats, lastCalled: `${(p.chats % 5) + 1} days ago`, success: 90 + (p.chats % 8), errors: p.chats % 3 }))); const analyticsCampaignRows = computed(() => campaigns.filter(c => c.profileId === profile.value.id).map((c, i) => ({ ...c, schedule: scopedSchedules.value[i % Math.max(scopedSchedules.value.length, 1)]?.name || `${actionCn[action.value] || 'Schedule'} · ${profile.value.name}`, adGroups: c.budgets + 2, targeting: c.placements + 3 })))
const performanceScheduleColumns = [['type', 'Schedule Type'], ['name', 'Schedules'], ['active', 'Active'], ['runs', 'Schedule Runs'], ['bidsOpt', 'Optimization Actions'], ['campLaunched', 'Campaigns Launched']]
const performanceScheduleBase = computed(() => schedules.map(s => ({ id: s.id, type: optActions.includes(s.action) ? 'Optimization' : 'Campaign Launch', name: s.name, action: s.action, active: s.status === 'Active' ? 1 : 0, runs: s.runs, bidsOpt: s.bidsOpt, campLaunched: s.campLaunched })))
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

// ---- TanStack column definitions + pinned table instances ----
function makeColumns(cols: string[][], opts: { href?: (row: any) => string, nameKey?: string, badgeKeys?: string[], boolKeys?: string[] } = {}): ColumnDef<any>[] {
  const nameKey = opts.nameKey ?? 'name'
  const badgeKeys = opts.badgeKeys ?? []
  const boolKeys = opts.boolKeys ?? []
  return cols.map(([key, label]) => {
    if (key === nameKey) {
      const base = { id: key, accessorKey: key, header: label }
      if (opts.href) {
        return { ...base, cell: ({ row }: any) => h('button', { class: 'max-w-[180px] truncate text-left font-medium text-[#15803d] transition-colors hover:underline', onClick: () => router.push(opts.href!(row.original)) }, String(row.original[key] ?? '')) }
      }
      return { ...base, cell: ({ row }: any) => h('span', { class: 'max-w-[180px] truncate font-medium' }, String(row.original[key] ?? '')) }
    }
    if (boolKeys.includes(key)) {
      return { id: key, accessorKey: key, header: label, cell: ({ row }: any) => { const on = !!row.original[key]; return h('span', { class: `inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${on ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-500'}` }, on ? 'On' : 'Off') } }
    }
    if (badgeKeys.includes(key)) {
      return { id: key, accessorKey: key, header: label, cell: ({ row }: any) => { const text = value(row.original, key); return h('span', { class: `inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${statusColor(text)}` }, text) } }
    }
    return { id: key, accessorKey: key, header: label, cell: ({ row }: any) => h('span', { class: 'font-mono tabular-nums' }, value(row.original, key)) }
  })
}
const actionsCol: ColumnDef<any> = { id: 'actions', header: () => 'Actions', cell: () => h(CampaignActionsCell), enableSorting: false, size: 96 }
const accountCols = makeColumns(accountColumns, { href: (a: any) => `/customer-tracking/accounts/${a.id}`, badgeKeys: ['status'] })
const accountAdCols = makeColumns(adsColumns)
const accountProfileCols = makeColumns(accountProfileColumns, { href: (p: any) => `/customer-tracking/performance/profile/${p.id}` })
const accountSubCols = makeColumns(subColumns)
const profileCols = makeColumns(profileColumns, { href: (p: any) => `/customer-tracking/performance/profile/${p.id}`, badgeKeys: ['adsApi', 'amsApi', 'spApi'] })
const perfScheduleCols = makeColumns(performanceScheduleColumns, { href: (s: any) => `/customer-tracking/performance/schedules/${encodeURIComponent(s.action)}` })
const campaignCols = [...makeColumns(campaignColumns), actionsCol]
const scheduleCols = makeColumns(scheduleColumns, { badgeKeys: ['status', 'lastResult'], boolKeys: ['alarm'] })
const launchScheduleCols = makeColumns(launchScheduleColumns, { badgeKeys: ['lastResult'] })
const launchCampaignCols = makeColumns(launchCampaignColumns)
const optimizationCampaignCols = makeColumns(optimizationCampaignColumns)
const agentProfileCols = makeColumns(agentProfileColumns, { href: (p: any) => `/customer-tracking/agent/profile/${p.id}` })
const toolCols = makeColumns(toolColumns, { nameKey: 'tool', href: (t: any) => `/customer-tracking/agent/tool/${encodeURIComponent(t.tool)}/profiles` })
const profileToolCols = makeColumns(profileToolColumns, { nameKey: 'tool' })
const chatCols = makeColumns(chatColumns)
const toolProfileCols = makeColumns(toolProfileColumns)
const accountTable = computed(() => generateVueTable<any>({ columns: accountCols, data: accountRows.value, initialPinning: { left: ['name'], right: [] } }))
const accountAdTable = computed(() => generateVueTable<any>({ columns: accountAdCols, data: accountAdRows.value, initialPinning: { left: ['name'], right: [] } }))
const accountProfileTable = computed(() => generateVueTable<any>({ columns: accountProfileCols, data: accountProfileRows.value, initialPinning: { left: ['name'], right: [] } }))
const accountSubTable = computed(() => generateVueTable<any>({ columns: accountSubCols, data: accountSubRows.value, initialPinning: { left: ['name'], right: [] } }))
const profileTable = computed(() => generateVueTable<any>({ columns: profileCols, data: profileRows.value, initialPinning: { left: ['name'], right: [] } }))
const perfScheduleTable = computed(() => generateVueTable<any>({ columns: perfScheduleCols, data: perfScheduleRows.value, initialPinning: { left: ['name'], right: [] } }))
const campaignTable = computed(() => generateVueTable<any>({ columns: campaignCols, data: campaignRows.value, initialPinning: { left: ['name'], right: ['actions'] } }))
const scheduleTable = computed(() => generateVueTable<any>({ columns: isLaunchAction.value ? launchScheduleCols : scheduleCols, data: scheduleRows.value, initialPinning: { left: ['name'], right: [] } }))
const analyticsTable = computed(() => generateVueTable<any>({ columns: isLaunchAction.value ? launchCampaignCols : optimizationCampaignCols, data: analyticsRows.value, initialPinning: { left: ['name'], right: [] } }))
const agentProfileTable = computed(() => generateVueTable<any>({ columns: agentProfileCols, data: agentProfileFilteredRows.value, initialPinning: { left: ['name'], right: [] } }))
const toolTable = computed(() => generateVueTable<any>({ columns: toolCols, data: toolRows.value, initialPinning: { left: ['tool'], right: [] } }))
const profileToolTable = computed(() => generateVueTable<any>({ columns: profileToolCols, data: profileToolRows.value, initialPinning: { left: ['tool'], right: [] } }))
const chatTable = computed(() => generateVueTable<any>({ columns: chatCols, data: chatRows.value, initialPinning: { left: ['name'], right: [] } }))
const toolProfileTable = computed(() => generateVueTable<any>({ columns: toolProfileCols, data: toolProfileFilteredRows.value, initialPinning: { left: ['name'], right: [] } }))
</script>

<template>
  <div class="w-full space-y-4 text-[#1e293b]">
    <!-- Toolbar -->
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[#e2e8f0] pb-2">
      <div class="flex items-center gap-1 text-sm text-[#64748b]">
        <button class="transition-colors hover:text-[#15803d]" @click="go(breadcrumbRoot)">
          {{ breadcrumbRoot === 'accounts' ? 'Accounts' : breadcrumbRoot === 'performance' ? 'Performance' : 'Agent' }}
        </button>
        <ChevronRight class="size-3.5" />
        <span class="font-serif text-lg font-semibold tracking-tight text-[#1e293b]">{{ title }}</span>
      </div>
      <div class="flex gap-2">
        <label class="flex h-9 items-center gap-1.5 rounded border border-[#e2e8f0] bg-white px-3 text-sm">
          <Search class="size-3.5 text-[#94a3b8]" />
          <input v-model="search" class="w-44 bg-transparent outline-none placeholder:text-[#94a3b8]" placeholder="Search current data…">
        </label>
        <select v-model="range" class="h-9 rounded border border-[#e2e8f0] bg-white px-3 text-sm">
          <option>7d</option>
          <option>30d</option>
          <option>90d</option>
        </select>
      </div>
    </div>

    <!-- Accounts -->
    <template v-if="page === 'accounts'">
      <div class="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
        <div v-for="item in accountKpis" :key="item[0]" class="rounded border border-[#e2e8f0] bg-white px-4 py-3">
          <p class="text-xs font-medium uppercase tracking-wide text-[#64748b]">
            {{ item[0] }}
          </p>
          <p class="mt-1 font-mono text-base font-semibold text-[#1e293b]">
            {{ item[1] }}
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <select v-model="status" class="h-9 rounded border border-[#e2e8f0] bg-white px-3 text-sm">
          <option value="all">
            All statuses
          </option>
          <option>Healthy</option>
          <option>Moderate</option>
          <option>At Risk</option>
          <option>Churned</option>
        </select>
        <span class="font-mono text-sm text-[#64748b]">{{ accountRows.length }} rows</span>
      </div>
      <ColumnFilterBar v-model="accountFilters" :columns="accountColumns" />
      <DataTable :table="accountTable" :columns="accountCols" :data="accountRows" />
    </template>

    <!-- Account detail -->
    <template v-else-if="page === 'account-detail'">
      <div class="flex gap-1 border-b border-[#e2e8f0]">
        <button v-for="t in [{ id: 'ads', label: 'Ads Accounts' }, { id: 'profiles', label: 'Profiles' }, { id: 'subs', label: 'Hanna Sub Accounts' }]" :key="t.id" class="border-b-2 px-3 py-2 text-sm font-medium transition-colors" :class="tab === t.id ? 'border-[#16a34a] text-[#15803d]' : 'border-transparent text-[#64748b] hover:text-[#1e293b]'" @click="tab = t.id">
          {{ t.label }}
        </button>
      </div>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-[#e2e8f0] bg-white px-4 py-3 text-sm">
        <span class="text-[#64748b]">Account</span>
        <span class="font-medium">{{ account.name }}</span>
        <span class="font-mono text-[#64748b]">{{ account.plan }} · {{ account.status }} · Renewal {{ account.renewal }}</span>
      </div>
      <template v-if="tab === 'ads'">
        <ColumnFilterBar v-model="accountAdFilters" :columns="adsColumns" />
        <DataTable :table="accountAdTable" :columns="accountAdCols" :data="accountAdRows" />
      </template>
      <template v-else-if="tab === 'profiles'">
        <ColumnFilterBar v-model="accountProfileFilters" :columns="accountProfileColumns" />
        <DataTable :table="accountProfileTable" :columns="accountProfileCols" :data="accountProfileRows" />
      </template>
      <template v-else>
        <ColumnFilterBar v-model="accountSubFilters" :columns="subColumns" />
        <DataTable :table="accountSubTable" :columns="accountSubCols" :data="accountSubRows" />
      </template>
    </template>

    <!-- Performance -->
    <template v-else-if="page === 'performance'">
      <div class="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
        <div v-for="item in performanceKpis" :key="item[0]" class="rounded border border-[#e2e8f0] bg-white px-4 py-3">
          <p class="text-xs font-medium uppercase tracking-wide text-[#64748b]">
            {{ item[0] }}
          </p>
          <p class="mt-1 font-mono text-base font-semibold text-[#1e293b]">
            {{ item[1] }}
          </p>
        </div>
      </div>
      <div class="rounded border border-[#e2e8f0] bg-white px-4 py-3">
        <TrackingChart :title="`${range} trend · performance metrics`" :seed="1" :available-metrics="['Ad Spend', 'Ad Sales', 'ACoS', 'Ad Orders', 'Impressions', 'Clicks', 'CPC', 'CVR', 'Schedule Runs', 'Optimization Events']" />
      </div>
      <div class="flex gap-1 border-b border-[#e2e8f0]">
        <button v-for="t in ['profiles', 'schedules']" :key="t" class="border-b-2 px-3 py-2 text-sm font-medium transition-colors" :class="tab === t ? 'border-[#16a34a] text-[#15803d]' : 'border-transparent text-[#64748b] hover:text-[#1e293b]'" @click="tab = t">
          {{ t === 'profiles' ? 'Profile Table' : 'Schedules Table' }}
        </button>
      </div>
      <template v-if="tab === 'profiles'">
        <ColumnFilterBar v-model="profileFilters" :columns="profileColumns" />
        <DataTable :table="profileTable" :columns="profileCols" :data="profileRows" />
      </template>
      <template v-else>
        <ColumnFilterBar v-model="perfScheduleFilters" :columns="performanceScheduleColumns" />
        <DataTable :table="perfScheduleTable" :columns="perfScheduleCols" :data="perfScheduleRows" />
      </template>
    </template>

    <!-- Profile -->
    <template v-else-if="page === 'profile'">
      <div class="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-9">
        <div v-for="item in profileKpis" :key="item[0]" class="rounded border border-[#e2e8f0] bg-white px-4 py-3">
          <p class="text-xs font-medium uppercase tracking-wide text-[#64748b]">
            {{ item[0] }}
          </p>
          <p class="mt-1 font-mono text-base font-semibold text-[#1e293b]">
            {{ item[1] }}
          </p>
        </div>
      </div>
      <div class="rounded border border-[#e2e8f0] bg-white px-4 py-3">
        <TrackingChart title="Profile trend · selectable metrics" :seed="profile.spend" :available-metrics="['Ad Spend', 'Ad Sales', 'ACoS', 'Ad Orders', 'Impressions', 'Clicks', 'CPC', 'CVR', 'Optimization Events', 'Bids Optimized', 'Budgets Optimized', 'Placements Optimized']" />
      </div>
      <ColumnFilterBar v-model="campaignFilters" :columns="campaignColumns" />
      <DataTable :table="campaignTable" :columns="campaignCols" :data="campaignRows" />
    </template>

    <!-- Schedules -->
    <template v-else-if="page === 'schedules'">
      <div class="flex gap-1 border-b border-[#e2e8f0]">
        <button v-for="t in ['schedules', 'analytics']" :key="t" class="border-b-2 px-3 py-2 text-sm font-medium transition-colors" :class="tab === t ? 'border-[#16a34a] text-[#15803d]' : 'border-transparent text-[#64748b] hover:text-[#1e293b]'" @click="tab = t">
          {{ t === 'schedules' ? 'Schedules' : 'Analytics' }}
        </button>
      </div>
      <template v-if="tab === 'schedules'">
        <div class="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
          <div v-for="item in scheduleKpis" :key="item[0]" class="rounded border border-[#e2e8f0] bg-white px-4 py-3">
            <p class="text-xs font-medium uppercase tracking-wide text-[#64748b]">
              {{ item[0] }}
            </p>
            <p class="mt-1 font-mono text-base font-semibold text-[#1e293b]">
              {{ item[1] }}
            </p>
          </div>
        </div>
        <ColumnFilterBar v-model="scheduleFilters" :columns="(isLaunchAction ? launchScheduleColumns : scheduleColumns)" />
        <DataTable :table="scheduleTable" :columns="(isLaunchAction ? launchScheduleCols : scheduleCols)" :data="scheduleRows" />
      </template>
      <template v-else>
        <div class="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
          <div v-for="item in analyticsKpis" :key="item[0]" class="rounded border border-[#e2e8f0] bg-white px-4 py-3">
            <p class="text-xs font-medium uppercase tracking-wide text-[#64748b]">
              {{ item[0] }}
            </p>
            <p class="mt-1 font-mono text-base font-semibold text-[#1e293b]">
              {{ item[1] }}
            </p>
          </div>
        </div>
        <div class="rounded border border-[#e2e8f0] bg-white px-4 py-3">
          <TrackingChart :title="`${range} analytics · ${scheduleFilter || actionCn[action] || action}`" :seed="profile.spend + 4" :available-metrics="['Ad Spend', 'Ad Sales', 'ACoS', 'Ad Orders', 'Impressions', 'Clicks', 'CPC', 'CVR', 'Bids Optimized', 'Campaigns Launched']" />
        </div>
        <ColumnFilterBar v-model="analyticsFilters" :columns="(isLaunchAction ? launchCampaignColumns : optimizationCampaignColumns)" />
        <DataTable :table="analyticsTable" :columns="(isLaunchAction ? launchCampaignCols : optimizationCampaignCols)" :data="analyticsRows" />
      </template>
    </template>

    <!-- Agent -->
    <template v-else-if="page === 'agent'">
      <div class="flex gap-1 border-b border-[#e2e8f0]">
        <button v-for="t in ['profiles', 'tools']" :key="t" class="border-b-2 px-3 py-2 text-sm font-medium transition-colors" :class="tab === t ? 'border-[#16a34a] text-[#15803d]' : 'border-transparent text-[#64748b] hover:text-[#1e293b]'" @click="tab = t">
          {{ t === 'profiles' ? 'Profile Stats' : 'Tool Stats' }}
        </button>
      </div>
      <template v-if="tab === 'profiles'">
        <ColumnFilterBar v-model="agentProfileFilters" :columns="agentProfileColumns" />
        <DataTable :table="agentProfileTable" :columns="agentProfileCols" :data="agentProfileFilteredRows" />
      </template>
      <template v-else>
        <ColumnFilterBar v-model="toolFilters" :columns="toolColumns" />
        <DataTable :table="toolTable" :columns="toolCols" :data="toolRows" />
      </template>
    </template>

    <!-- Agent profile -->
    <template v-else-if="page === 'agent-profile'">
      <div class="flex gap-1 border-b border-[#e2e8f0]">
        <button v-for="t in ['tools', 'chats']" :key="t" class="border-b-2 px-3 py-2 text-sm font-medium transition-colors" :class="tab === t ? 'border-[#16a34a] text-[#15803d]' : 'border-transparent text-[#64748b] hover:text-[#1e293b]'" @click="tab = t">
          {{ t === 'tools' ? 'Tool Calls Details' : 'Agent Chats' }}
        </button>
      </div>
      <template v-if="tab === 'tools'">
        <ColumnFilterBar v-model="profileToolFilters" :columns="profileToolColumns" />
        <DataTable :table="profileToolTable" :columns="profileToolCols" :data="profileToolRows" />
      </template>
      <template v-else>
        <ColumnFilterBar v-model="chatFilters" :columns="chatColumns" />
        <DataTable :table="chatTable" :columns="chatCols" :data="chatRows" />
      </template>
    </template>

    <!-- Tool profiles -->
    <template v-else>
      <ColumnFilterBar v-model="toolProfileFilters" :columns="toolProfileColumns" />
      <DataTable :table="toolProfileTable" :columns="toolProfileCols" :data="toolProfileFilteredRows" />
    </template>
  </div>
</template>
