import type { ColumnDef, SortingFn } from '@tanstack/vue-table'

import { h } from 'vue'

import DataTableColumnHeader from '@/components/data-table/column-header.vue'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

import type { AgentOrgProfileStat, AgentOrgToolStat, AgentToolOrgStat, ColumnSpec, ColumnType, Split } from './types'

import MetricSplit from './components/metric-split.vue'
import { formatExact, formatMetric } from './format'
import { LAUNCH_CATEGORY, OPTIMIZATION_CATEGORY } from './types'
import { connectionLabel, dateValue, isBlank, sortValue, splitTotal, tupleMetric } from './values'

/**
 * Every table in the customer-tracking tool declares its columns here, once, as
 * `[key, label, type]`. That single declaration drives cell rendering, sorting
 * semantics and the filter predicates offered per column — the three used to be
 * decided independently, which is how `accessed by key` bugs crept in.
 */

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

const num = (n: unknown) => Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })

function splitLabel(v: Partial<Split> | null | undefined): string {
  return `SP ${num(v?.sp)} · SB ${num(v?.sb)} · SD ${num(v?.sd)}`
}

/** Red text for the states an operator has to act on. */
export function statusBadgeClass(value: unknown): string {
  const s = String(value ?? '').toLowerCase()
  if (['at risk', 'error', 'failed', 'churned', 'disconnected'].includes(s))
    return 'text-destructive'
  return ''
}

/** Date-ish cell text: ISO dates/timestamps are cut to the day. */
function dateCell(v: unknown): string {
  return dateValue(v)
}

/** The plain-text rendering of a cell, used for badges and as the default. */
export function cellDisplay(row: Record<string, any>, spec: ColumnSpec): string {
  const [key, , type] = spec
  const v = row[key]
  if (isBlank(v))
    return '—'
  switch (type) {
    case 'currency':
      return formatMetric(v, { currency: true })
    case 'compact':
      return formatMetric(v, {})
    case 'percent':
      return `${Number(v).toFixed(1)}%`
    case 'ratioTuple':
      return Array.isArray(v) ? `${num(v[0])}/${num(v[1])}` : String(v)
    case 'split':
      return v?.sp !== undefined ? splitLabel(v) : String(v)
    case 'list':
      return Array.isArray(v) ? v.join(', ') : String(v)
    case 'connection':
      return connectionLabel(v)
    case 'boolean':
      return v ? 'On' : 'Off'
    case 'date':
    case 'timestamp':
      return dateCell(v)
    default:
      return Array.isArray(v) ? v.join(', ') : String(v)
  }
}

/** Series labels (and currency) for the three-series split cells. */
const SPLIT_RENDER: Record<string, { labels: [string, string, string], currency?: boolean }> = {
  adSpendSplit: { labels: ['SP', 'SB', 'SD'], currency: true },
  launched: { labels: ['SP', 'SB', 'SD'] },
  targeting: { labels: ['SP', 'SB', 'SD'] },
}

/** Options after defaults are applied — the renderer never sees the optional form. */
interface ResolvedColumnOptions extends ColumnBuildOptions {
  nameKey: string
  badgeKeys: string[]
  previewKeys: string[]
}

/** Per-column cell renderers; the type decides everything. */
function renderCell(spec: ColumnSpec, row: Record<string, any>, opts: ResolvedColumnOptions) {
  const [key, , type] = spec
  const v = row[key]

  if (type === 'split' && v?.sp !== undefined) {
    const split = SPLIT_RENDER[key] ?? { labels: ['SP', 'SB', 'SD'] as [string, string, string] }
    return h(MetricSplit, { value: v, labels: split.labels, currency: split.currency })
  }

  if (isBlank(v))
    return h('span', { class: 'text-muted-foreground' }, '—')

  if (type === 'currency')
    return h('span', { class: 'font-mono tabular-nums', title: formatExact(v, { currency: true }) }, formatMetric(v, { currency: true }))

  // Same idea as currency, without the symbol: the cell shows a reading, the hover shows the
  // number it came from, so nobody has to guess what "5.1M" was.
  if (type === 'compact')
    return h('span', { class: 'font-mono tabular-nums', title: formatExact(v) }, formatMetric(v, {}))

  if (type === 'ratioTuple') {
    const total = tupleMetric(v, 'total')
    const coverage = total ? `${(tupleMetric(v, 'coverage')).toFixed(1)}% connected` : 'no accounts'
    return h('span', { class: 'font-mono tabular-nums', title: `${num(v[0])} of ${num(v[1])} · ${coverage}` }, `${num(v[0])}/${num(v[1])}`)
  }

  if (type === 'boolean' || type === 'connection' || opts.badgeKeys.includes(key)) {
    const text = cellDisplay(row, spec)
    return h(Badge, { variant: 'secondary', class: statusBadgeClass(text) }, () => text)
  }

  if (key === opts.nameKey) {
    // The identity cell wraps instead of truncating. It used to clip itself at a hard-coded
    // 180px even when its column was wider, so an organization name 2px over that limit ended
    // in "..." and a 276px tool name lost a third of itself - and for names like
    // "Campaign Builder Action - 1788418041" truncation eats exactly the part that tells two
    // rows apart. `w-full` makes the column's width the only limit, and what still does not
    // fit on one line wraps instead of disappearing.
    const clazz = 'block w-full whitespace-normal break-words font-medium'
    if (opts.href) {
      return h('button', {
        class: `${clazz} text-left text-primary transition-colors hover:underline`,
        title: String(v),
        onClick: () => opts.navigate(opts.href!(row)),
      }, String(v))
    }
    return h('span', { class: clazz, title: String(v) }, String(v))
  }

  if (opts.previewKeys.includes(key)) {
    const text = String(v)
    // Same composition the marketing pages use for their long JSON previews: a truncated
    // trigger, and a scrollable panel that preserves the text's own line breaks.
    return h(TooltipProvider, { delayDuration: 150 }, () => h(Tooltip, null, () => [
      h(TooltipTrigger, { asChild: true }, () => h('span', {
        class: 'block w-full cursor-default truncate text-left',
      }, text)),
      h(TooltipContent, {
        side: 'top',
        align: 'start',
        class: 'max-h-[420px] max-w-[520px] overflow-auto border bg-background p-3 text-foreground shadow-lg',
      }, () => h('pre', { class: 'whitespace-pre-wrap break-words font-sans text-xs leading-5' }, text)),
    ]))
  }

  return h('span', { class: 'font-mono tabular-nums' }, cellDisplay(row, spec))
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

/**
 * Semantic orders for categorical columns. Alphabetical sorting of a severity
 * column is actively misleading (it buries "At Risk" behind "Churned"), so these
 * are ranked explicitly. A single key can appear in several tables with
 * different domains — `status` is Healthy…Churned on Accounts and Active/Paused
 * on Schedules — so the union is listed and each table simply never sees the
 * other half.
 */
export const SEMANTIC_ORDERS: Record<string, string[]> = {
  // The schedule lifecycle is appended to the account health ladder: a table
  // either shows one domain or the other, so one ranked list serves both.
  status: ['Healthy', 'Moderate', 'At Risk', 'Churned', 'ACTIVE', 'LAUNCHED', 'PARTIALLY_LAUNCHED', 'REVIEW', 'PAUSED', 'FAILED', 'Active', 'Paused', 'Inactive', 'Error', 'Failed', 'Cancelled'],
  // A finished run is good news, so success states lead and FAILED sinks.
  lastRunStatus: ['COMPLETED', 'LAUNCHED', 'PARTIALLY_LAUNCHED', 'EMPTY_RUN', 'SKIPPED', 'PENDING', 'REVIEW', 'NO_HISTORY_RUN', 'FAILED'],
  // '-' means the action type has no alerting at all, so it is its own category
  // rather than an "off" that pretends a choice exists.
  alertEnabled: ['On', 'Off', '-'],
  adsApi: ['Connected', 'Disconnected'],
  amsApi: ['Connected', 'Disconnected'],
  spApi: ['Connected', 'Disconnected'],
}

function rank(value: unknown, order: string[]): number {
  const i = order.indexOf(String(value ?? ''))
  return i === -1 ? order.length : i
}

/** Ranked comparison; unknown values fall back to alphabetical at the end. */
function rankSort(order: string[]): SortingFn<any> {
  return (a, b, id) => {
    const av = rank(a.getValue(id), order)
    const bv = rank(b.getValue(id), order)
    if (av !== bv)
      return av - bv
    return String(a.getValue(id) ?? '').localeCompare(String(b.getValue(id) ?? ''))
  }
}

interface SortConfig {
  enableSorting?: boolean
  sortDescFirst?: boolean
  sortingFn?: ColumnDef<any>['sortingFn']
  sortUndefined?: ColumnDef<any>['sortUndefined']
}

function sortConfigFor(type: ColumnType, key: string): SortConfig {
  switch (type) {
    // Array-backed: comparing them is meaningless, so the affordance is removed
    // rather than given a comparator nobody can predict.
    case 'ratioTuple':
    case 'list':
      return { enableSorting: false }
    case 'number':
    case 'compact':
    case 'currency':
    case 'percent':
    case 'split':
      return { sortingFn: 'basic', sortDescFirst: true, sortUndefined: 'last' }
    case 'date':
    case 'timestamp':
      return { sortingFn: 'datetime', sortDescFirst: false, sortUndefined: 'last' }
    case 'connection':
    case 'enum': {
      const order = SEMANTIC_ORDERS[key]
      return { sortingFn: order ? rankSort(order) : 'alphanumeric', sortUndefined: 'last' }
    }
    default:
      return { sortingFn: 'alphanumeric', sortUndefined: 'last' }
  }
}

// ---------------------------------------------------------------------------
// Widths
// ---------------------------------------------------------------------------

interface WidthRange {
  size: number
  minSize: number
  maxSize: number
}

/**
 * Default, minimum and maximum width per column type.
 *
 * Widths are explicit rather than content-derived on purpose. The table used to
 * lay itself out from whatever rows happened to be rendered, so re-sorting
 * swapped the rows on the page and every column shifted sideways. Resizing is
 * bounded so a column can be dragged neither to nothing nor to an absurd width.
 */
const WIDTH_BY_TYPE: Record<ColumnType, WidthRange> = {
  text: { size: 180, minSize: 96, maxSize: 480 },
  enum: { size: 150, minSize: 88, maxSize: 360 },
  connection: { size: 132, minSize: 104, maxSize: 300 },
  boolean: { size: 96, minSize: 72, maxSize: 200 },
  number: { size: 124, minSize: 88, maxSize: 320 },
  // A compact reading is at most five glyphs ("39.1M"), so it needs the least room of the
  // number family - but it sorts and filters as a number, so it keeps a number's bounds.
  compact: { size: 112, minSize: 84, maxSize: 320 },
  currency: { size: 132, minSize: 96, maxSize: 320 },
  percent: { size: 108, minSize: 84, maxSize: 280 },
  date: { size: 132, minSize: 104, maxSize: 300 },
  timestamp: { size: 168, minSize: 120, maxSize: 360 },
  // Matches the three-series cell's own 224px layout so it is never clipped.
  split: { size: 224, minSize: 176, maxSize: 420 },
  ratioTuple: { size: 124, minSize: 96, maxSize: 260 },
  list: { size: 200, minSize: 120, maxSize: 480 },
}

/**
 * The identity column - the first column of every table here - is the one a reader scans,
 * and its values are the longest strings on the page (a tool name measured 276px, an
 * organization name 210px). It gets its own width instead of the 180px a text column
 * defaults to, and a generous max so it can be dragged to show a name in full.
 */
const IDENTITY_WIDTH: WidthRange = { size: 320, minSize: 140, maxSize: 720 }

/** Non-identity columns that need more room than their type implies. */
const WIDTH_BY_KEY: Record<string, WidthRange> = {
  name: { size: 200, minSize: 120, maxSize: 520 },
  action: { size: 220, minSize: 140, maxSize: 520 },
  tool: { size: 168, minSize: 110, maxSize: 420 },
  summary: { size: 320, minSize: 160, maxSize: 720 },
  first: { size: 280, minSize: 140, maxSize: 640 },
}

export function widthFor(key: string, type: ColumnType, identity = false): WidthRange {
  if (identity)
    return IDENTITY_WIDTH
  return WIDTH_BY_KEY[key] ?? WIDTH_BY_TYPE[type]
}

// ---------------------------------------------------------------------------
// Column building
// ---------------------------------------------------------------------------

export interface ColumnBuildOptions {
  /** Turns the identity cell into a link. */
  href?: (row: any) => string
  nameKey?: string
  badgeKeys?: string[]
  /**
   * Columns whose cell shows a truncated line and reveals the full text on hover.
   *
   * For prose that is wider than any sane column - a conversation's first message and its
   * summary. The preview keeps the author's line breaks (`whitespace-pre-wrap`) instead of
   * flattening them into one run-on line.
   */
  previewKeys?: string[]
  /** Router push, injected so this module stays free of router plumbing. */
  navigate: (to: string) => void
}

export function makeColumns(specs: readonly ColumnSpec[], opts: ColumnBuildOptions): ColumnDef<any>[] {
  const options: ResolvedColumnOptions = { nameKey: 'name', badgeKeys: [], previewKeys: [], ...opts }
  return specs.map((spec) => {
    const [key, label, type] = spec
    // Every column gets an explicit accessorFn so nulls normalise to undefined
    // for nulls-last sorting, and a split sorts by its total rather than by object.
    const accessorFn = type === 'split'
      ? (row: any) => (row?.[key]?.sp === undefined ? undefined : splitTotal(row[key]))
      : (row: any) => sortValue(row?.[key])

    const width = widthFor(key, type, key === options.nameKey)

    return {
      id: key,
      accessorFn,
      // The header needs the whole sorting state, not just this column's, to number a
      // multi-column sort.
      header: ({ column, table }: any) => h(DataTableColumnHeader, {
        column,
        title: label,
        sortCount: table.getState().sorting.length,
      }),
      cell: ({ row }: any) => renderCell(spec, row.original, options),
      size: width.size,
      minSize: width.minSize,
      maxSize: width.maxSize,
      ...sortConfigFor(type, key),
    } as ColumnDef<any>
  })
}

// ---------------------------------------------------------------------------
// Column sets
// ---------------------------------------------------------------------------

export const ACCOUNT_COLUMNS: readonly ColumnSpec[] = [
  ['name', 'Organization', 'text'],
  ['plan', 'Plan', 'text'],
  ['joined', 'Joined', 'date'],
  ['lastActive', 'Last Active', 'timestamp'],
  ['renewal', 'Renewal Date', 'date'],
  ['status', 'Status', 'enum'],
  ['adsConn', 'Ads Accounts', 'ratioTuple'],
  ['profConn', 'Profiles', 'ratioTuple'],
  ['subConn', 'Sub Accounts', 'ratioTuple'],
  ['ams', 'AMS API', 'ratioTuple'],
  ['sp', 'SP API', 'ratioTuple'],
  ['adSpendSplit', 'Ad Spend (SP/SB/SD)', 'split'],
  ['chats', 'Agent Chats', 'number'],
  ['optimizationEvents', 'Optimization Events', 'number'],
  ['scheduleRuns', 'Schedule Runs', 'number'],
  ['launched', 'Campaigns Launched (CMG/KH/CG)', 'split'],
]

export const ADS_COLUMNS: readonly ColumnSpec[] = [
  ['name', 'Ads Accounts', 'text'],
  ['profiles', 'Profiles', 'ratioTuple'],
  ['ams', 'AMS API', 'ratioTuple'],
  ['adSpendSplit', 'Ad Spend (SP/SB/SD)', 'split'],
  ['chats', 'Agent Chats', 'number'],
  ['optimizationEvents', 'Optimization Events', 'number'],
  ['scheduleRuns', 'Schedule Runs', 'number'],
  ['launched', 'Campaigns Launched (CMG/KH/CG)', 'split'],
]

export const PROFILE_COLUMNS: readonly ColumnSpec[] = [
  ['name', 'Profile', 'text'],
  ['marketplace', 'Marketplace', 'enum'],
  ['entity', 'Entity', 'text'],
  ['organization', 'Organization', 'text'],
  ['plan', 'Plan Type', 'text'],
  ['connectedAt', 'Connected at', 'timestamp'],
  ['adsApi', 'Ads API', 'connection'],
  ['amsApi', 'AMS API', 'connection'],
  ['spApi', 'SP API', 'connection'],
  ['adSpendSplit', 'Ad Spend (SP/SB/SD)', 'split'],
  ['adSales', 'Ad Sales', 'currency'],
  ['acos', 'ACoS', 'percent'],
  ['tacos', 'TACoS', 'percent'],
  ['adOrders', 'Ad Orders', 'number'],
  ['impressions', 'Impressions', 'compact'],
  ['clicks', 'Clicks', 'compact'],
  ['cpc', 'CPC', 'currency'],
  ['cvr', 'CVR', 'percent'],
  ['scheduleRuns', 'Schedule Runs', 'number'],
  ['activeSchedules', 'Active Schedules', 'number'],
  ['optimizationEvents', 'Optimization Events', 'number'],
  ['bidsOptimized', 'Bids Optimized', 'number'],
  ['budgetsOptimized', 'Budgets Optimized', 'number'],
  ['placementsOptimized', 'Placements Optimized', 'number'],
  ['launched', 'Campaigns Launched (CMG/KH/CG)', 'split'],
  ['targeting', 'Targeting Launched (CMG/KH/CG)', 'split'],
]

export const CAMPAIGN_COLUMNS: readonly ColumnSpec[] = [
  ['name', 'Campaigns', 'text'],
  ['adType', 'Ad Type', 'enum'],
  ['managedBy', 'Managed By', 'list'],
  ['affectedBy', 'Affected By', 'list'],
  ['launchedBy', 'Launched By', 'text'],
  ['adSpend', 'Ad Spend', 'currency'],
  ['adSales', 'Ad Sales', 'currency'],
  ['acos', 'ACoS', 'percent'],
  ['adOrders', 'Ad Orders', 'number'],
  ['impressions', 'Impressions', 'compact'],
  ['clicks', 'Clicks', 'compact'],
  ['cpc', 'CPC', 'currency'],
  ['cvr', 'CVR', 'percent'],
  ['optimizationEvents', 'Optimization Events', 'number'],
  ['bidsOptimized', 'Bids Optimized', 'number'],
  ['budgetsOptimized', 'Budgets Optimized', 'number'],
  ['placementsOptimized', 'Placements Optimized', 'number'],
]

export const SCHEDULE_COLUMNS: readonly ColumnSpec[] = [
  ['name', 'Schedules', 'text'],
  ['status', 'Status', 'enum'],
  ['user', 'User', 'text'],
  ['alarm', 'Alarm', 'boolean'],
  ['created', 'Creation Date', 'date'],
  ['id', 'ID', 'text'],
  ['lastResult', 'Last Run Result', 'enum'],
]

export const SUB_ACCOUNT_COLUMNS: readonly ColumnSpec[] = [
  ['name', 'Sub Accounts', 'text'],
  ['role', 'Role', 'enum'],
  ['lastActive', 'Last Active', 'timestamp'],
  ['adsAccess', 'Ads Account Access', 'ratioTuple'],
  ['profileAccess', 'Profile Access', 'ratioTuple'],
  ['chats', 'Agent Chats', 'number'],
  ['optimizationEvents', 'Optimization Events', 'number'],
  ['scheduleRuns', 'Schedule Runs', 'number'],
  ['launched', 'Campaigns Launched (CMG/KH/CG)', 'split'],
]

export const ACCOUNT_PROFILE_COLUMNS: readonly ColumnSpec[] = [
  ['name', 'Profiles', 'text'],
  ['marketplace', 'Marketplaces', 'enum'],
  ['amsApi', 'AMS API', 'connection'],
  ['adSpendSplit', 'Ad Spend (SP/SB/SD)', 'split'],
  ['chats', 'Agent Chats', 'number'],
  ['optimizationEvents', 'Optimization Events', 'number'],
  ['scheduleRuns', 'Schedule Runs', 'number'],
  ['launched', 'Campaigns Launched (CMG/KH/CG)', 'split'],
]

export const LAUNCH_SCHEDULE_COLUMNS: readonly ColumnSpec[] = [
  ['name', 'Schedules', 'text'],
  ['user', 'User', 'text'],
  ['adType', 'Ad Type', 'enum'],
  ['created', 'Creation Date', 'date'],
  ['id', 'ID', 'text'],
  ['lastResult', 'Last Run Result', 'enum'],
  ['campaignsLaunched', 'Campaigns Launched', 'number'],
  ['adGroups', 'Ad Groups Launched', 'number'],
  ['targeting', 'Targeting Launched', 'number'],
]

export const LAUNCH_CAMPAIGN_COLUMNS: readonly ColumnSpec[] = [
  ['name', 'Campaigns', 'text'],
  ['schedule', 'Schedule', 'text'],
  ['adType', 'Ad Type', 'enum'],
  ['adGroups', 'Ad Groups', 'number'],
  ['targeting', 'Targeting', 'number'],
  ['adSpend', 'Ad Spend', 'currency'],
  ['adSales', 'Ad Sales', 'currency'],
  ['acos', 'ACoS', 'percent'],
  ['adOrders', 'Ad Orders', 'number'],
  ['impressions', 'Impressions', 'compact'],
  ['clicks', 'Clicks', 'compact'],
  ['cpc', 'CPC', 'currency'],
  ['cvr', 'CVR', 'percent'],
]

export const OPTIMIZATION_CAMPAIGN_COLUMNS: readonly ColumnSpec[] = [
  ['name', 'Campaigns', 'text'],
  ['schedule', 'Schedule', 'text'],
  ['adType', 'Ad Type', 'enum'],
  ['launchedBy', 'Launch Source', 'text'],
  ['bidsOptimized', 'Bids Optimized', 'number'],
  ['adSpend', 'Ad Spend', 'currency'],
  ['adSales', 'Ad Sales', 'currency'],
  ['acos', 'ACoS', 'percent'],
  ['adOrders', 'Ad Orders', 'number'],
  ['impressions', 'Impressions', 'compact'],
  ['clicks', 'Clicks', 'compact'],
  ['cpc', 'CPC', 'currency'],
  ['cvr', 'CVR', 'percent'],
]

/**
 * A column set whose keys are checked against the row type it renders.
 *
 * A column listed here but missing from the query's SELECT renders as an empty cell and
 * nothing anywhere complains - the Agent tool page shipped a Marketplace column that way.
 * Typing the key as `keyof Row` turns that into a compile error instead.
 */
function columnsFor<Row>(specs: readonly (readonly [keyof Row & string, string, ColumnType])[]): readonly ColumnSpec[] {
  return specs as readonly ColumnSpec[]
}

/**
 * Agent Analytics L1: one row per (organization, profile).
 *
 * Organization leads and is the frozen, clickable identity - the drill-down is the
 * organization, not the profile - while a row whose profile is empty (the org's own
 * activity, chats and calls never attached to an Amazon profile) still belongs to that
 * organization and stays in the list rather than being dropped.
 */
export const AGENT_ORG_PROFILE_COLUMNS = columnsFor<AgentOrgProfileStat>([
  ['organization', 'Organization', 'text'],
  ['name', 'Profile', 'text'],
  ['marketplace', 'Marketplace', 'enum'],
  ['entity', 'Entity', 'text'],
  ['chats', 'Agent Chats', 'number'],
  ['toolCalls', 'Tool Calls', 'number'],
  ['toolsUsed', 'Tools Used', 'number'],
  ['lastActivity', 'Last Agent Activity', 'timestamp'],
])

/**
 * Agent Analytics L1, Tool Stats: one row per tool over the range.
 *
 * Breadth (how many organizations called it) and depth (calls per organization, and how
 * many days a pair stayed active) sit next to the raw total on purpose: a tool everyone
 * tries once and abandons and a tool three organizations use daily have similar or even
 * inverted totals, and only the pair tells them apart.
 */
export const TOOL_COLUMNS: readonly ColumnSpec[] = [
  ['tool', 'Tool', 'text'],
  ['orgsUsing', 'Orgs Using', 'number'],
  ['profilesUsing', 'Profiles Using Tool', 'number'],
  ['calls', 'Tool Calls', 'number'],
  ['callsPerOrg', 'Calls / Org', 'number'],
  ['medianActiveDays', 'Median Active Days', 'number'],
  ['lastCalled', 'Last Called', 'timestamp'],
  ['success', 'Success Rate', 'percent'],
  ['errors', 'Errors', 'number'],
]

/**
 * Agent Analytics L2 (organization details): one tool per sub account and profile.
 *
 * The same tool is listed once per sub account x profile that used it: inside one
 * organization that split is what tells a reviewer who is using what.
 */
export const AGENT_ORG_TOOL_COLUMNS = columnsFor<AgentOrgToolStat>([
  ['tool', 'Tool', 'text'],
  ['subAccount', 'Sub Account', 'text'],
  ['name', 'Profile', 'text'],
  ['calls', 'Tool Calls', 'number'],
  ['lastCalled', 'Last Called', 'timestamp'],
  ['success', 'Success Rate', 'percent'],
  ['errors', 'Errors', 'number'],
])

export const CHAT_COLUMNS: readonly ColumnSpec[] = [
  ['name', 'Chat Name', 'text'],
  ['date', 'Date', 'date'],
  ['sub', 'Sub Account', 'text'],
  ['first', 'First Message', 'text'],
  ['summary', 'Chat Summary', 'text'],
]

/**
 * Agent Analytics L2 (one tool): which organizations use it, per profile.
 *
 * Organization leads because the question here is "who depends on this tool", and the
 * same profile name can exist under several organizations.
 */
export const AGENT_TOOL_ORG_COLUMNS = columnsFor<AgentToolOrgStat>([
  ['organization', 'Organization', 'text'],
  ['name', 'Profile', 'text'],
  ['marketplace', 'Marketplace', 'enum'],
  ['calls', 'Tool Calls', 'number'],
  ['lastCalled', 'Last Called', 'timestamp'],
  ['success', 'Success Rate', 'percent'],
  ['errors', 'Errors', 'number'],
])

/**
 * Performance L1 "Schedules Table": one row per action type, rolled up over the
 * selected range by performance-analytics.scheduleRollup.
 */
export const PERFORMANCE_SCHEDULE_COLUMNS: readonly ColumnSpec[] = [
  ['action', 'Action Type', 'text'],
  ['type', 'Action Category', 'enum'],
  ['schedules', 'Schedules', 'number'],
  ['active', 'Active', 'number'],
  ['failed', 'Failed', 'number'],
  ['runs', 'Schedule Runs', 'number'],
  ['optimizationEvents', 'Optimization Events', 'number'],
  ['launched', 'Campaigns Launched (SP/SB/SD)', 'split'],
  ['adGroups', 'Ad Groups Created (SP/SB/SD)', 'split'],
  ['targeting', 'Targetings Created (SP/SB/SD)', 'split'],
]

/**
 * Performance L2 schedule table: one row per schedule of the drilled action, from
 * performance_l2_schedules_{dim,fact}.
 *
 * This replaces the old schedule+action grain table and also absorbs the separate
 * campaign-grain "Analytics" table that used to sit in a second tab: the campaign
 * grain now lives on the schedule's own page as server-side aggregates, so the
 * table stays at one row per schedule.
 */
/** Identity, lifecycle and effort: true of every schedule whatever it does. */
const PERF_SCHEDULE_BASE_COLUMNS: readonly ColumnSpec[] = [
  ['scheduleName', 'Schedule', 'text'],
  ['subAccount', 'Sub Account', 'text'],
  ['status', 'Status', 'enum'],
  ['createdDate', 'Created', 'date'],
  ['lastRunStatus', 'Last Run Result', 'enum'],
  ['lastRunTime', 'Last Run Time', 'timestamp'],
  ['scheduleRuns', 'Schedule Runs', 'number'],
]

/**
 * What an *optimisation* schedule does: it changes bids, budgets and placements.
 * It never creates campaigns, so it has no created-entity columns at all.
 */
const PERF_SCHEDULE_OPTIMIZATION_COLUMNS: readonly ColumnSpec[] = [
  ['optimizationEvents', 'Optimization Events', 'number'],
  ['bidsOptimized', 'Bids Optimized', 'number'],
  ['budgetsOptimized', 'Budgets Optimized', 'number'],
  ['placementsOptimized', 'Placements Optimized', 'number'],
]

/**
 * What a *campaign launch* schedule does: it creates campaigns, ad groups and
 * targetings. Those actions have no bid/budget/placement optimisation and no
 * alerting at all, so both families of columns are absent - not zero, absent.
 */
const PERF_SCHEDULE_LAUNCH_COLUMNS: readonly ColumnSpec[] = [
  ['launched', 'Campaigns Launched (SP/SB/SD)', 'split'],
  ['adGroups', 'Ad Groups Created (SP/SB/SD)', 'split'],
  ['targeting', 'Targetings Created (SP/SB/SD)', 'split'],
]

/** The action categories live with the shared vocabulary; re-exported for the tables. */
export { LAUNCH_CATEGORY, OPTIMIZATION_CATEGORY }

/**
 * The schedule table's columns for one action category.
 *
 * The two categories measure disjoint things, so a single fixed column set used to
 * show four always-zero optimisation columns on a launch page and three always-zero
 * creation columns on an optimisation page. An unrecognised category keeps every
 * column: hiding data because the vocabulary changed would be worse than a zero.
 */
export function perfScheduleColumns(actionCategory?: string): readonly ColumnSpec[] {
  if (actionCategory === OPTIMIZATION_CATEGORY) {
    // Alerting exists for optimisation actions only.
    return [...PERF_SCHEDULE_BASE_COLUMNS, ['alertEnabled', 'Alert', 'enum'], ...PERF_SCHEDULE_OPTIMIZATION_COLUMNS]
  }
  if (actionCategory === LAUNCH_CATEGORY)
    return [...PERF_SCHEDULE_BASE_COLUMNS, ...PERF_SCHEDULE_LAUNCH_COLUMNS]
  return [
    ...PERF_SCHEDULE_BASE_COLUMNS,
    ['alertEnabled', 'Alert', 'enum'],
    ...PERF_SCHEDULE_OPTIMIZATION_COLUMNS,
    ...PERF_SCHEDULE_LAUNCH_COLUMNS,
  ]
}

/** Every column either category can show, for filters and tests. */
export const PERF_SCHEDULE_COLUMNS: readonly ColumnSpec[] = perfScheduleColumns()

/**
 * Performance L1 profile table. Sourced from the page/level OSS export
 * (performance_l1_profiles_dim joined to ..._fact), not the legacy profiles dim,
 * so it carries org_name and active_schedules from the dim and the fact metrics
 * to its right.
 */
export const PERF_PROFILE_COLUMNS: readonly ColumnSpec[] = [
  ['name', 'Profile', 'text'],
  ['organization', 'Organization', 'text'],
  ['marketplace', 'Marketplace', 'enum'],
  ['entity', 'Entity', 'text'],
  ['plan', 'Plan Type', 'text'],
  ['connectedAt', 'Connected at', 'timestamp'],
  ['adsApi', 'Ads API', 'connection'],
  ['amsApi', 'AMS API', 'connection'],
  ['spApi', 'SP API', 'connection'],
  ['activeSchedules', 'Active Schedules', 'number'],
  ['adSpendSplit', 'Ad Spend (SP/SB/SD)', 'split'],
  ['adSales', 'Ad Sales', 'currency'],
  ['acos', 'ACoS', 'percent'],
  ['tacos', 'TACoS', 'percent'],
  ['adOrders', 'Ad Orders', 'number'],
  ['impressions', 'Impressions', 'compact'],
  ['clicks', 'Clicks', 'compact'],
  ['cpc', 'CPC', 'currency'],
  ['cvr', 'CVR', 'percent'],
  ['scheduleRuns', 'Schedule Runs', 'number'],
  ['optimizationEvents', 'Optimization Events', 'number'],
  ['bidsOptimized', 'Bids Optimized', 'number'],
  ['budgetsOptimized', 'Budgets Optimized', 'number'],
  ['placementsOptimized', 'Placements Optimized', 'number'],
  ['launched', 'Campaigns Launched (SP/SB/SD)', 'split'],
  ['targeting', 'Targetings Created (SP/SB/SD)', 'split'],
]

/** Inserted into the schedule table when it is not scoped to one profile. */
export const PROFILE_COLUMN: ColumnSpec = ['profile', 'Profile', 'text']

// ---------------------------------------------------------------------------
// Default ordering
// ---------------------------------------------------------------------------

/**
 * A dashboard table should open on the question it exists to answer, not on the
 * order DuckDB happened to return. Metrics open descending ("who is biggest?"),
 * logs open newest-first.
 */
export const DEFAULT_SORTS: Record<string, { id: string, desc: boolean }[]> = {
  'accounts': [{ id: 'adSpendSplit', desc: true }],
  'account-ads': [{ id: 'adSpendSplit', desc: true }],
  'account-profiles': [{ id: 'adSpendSplit', desc: true }],
  'account-subs': [{ id: 'optimizationEvents', desc: true }],
  'profiles': [{ id: 'adSpendSplit', desc: true }],
  'performance-profiles': [{ id: 'adSpendSplit', desc: true }],
  'performance-schedules': [{ id: 'runs', desc: true }],
  'perf-schedules': [{ id: 'scheduleRuns', desc: true }],
  'campaigns': [{ id: 'adSpend', desc: true }],
  'schedules': [{ id: 'created', desc: true }],
  'agent-org-profiles': [{ id: 'toolCalls', desc: true }],
  'tools': [{ id: 'calls', desc: true }],
  'agent-org-tool-rank': [{ id: 'calls', desc: true }],
  'agent-org-tools': [{ id: 'calls', desc: true }],
  'chats': [{ id: 'date', desc: true }],
  'agent-tool-orgs': [{ id: 'calls', desc: true }],
}
