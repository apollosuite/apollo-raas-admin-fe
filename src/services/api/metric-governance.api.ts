import type { MaybeRefOrGetter } from 'vue'

import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { toValue } from 'vue'

import type {
  MetricApplication,
  MetricCompileRequest,
  MetricCompileResponse,
  MetricDefinition,
  MetricFormulaSuggestionRequest,
  MetricFormulaSuggestionResponse,
  MetricGovernanceExport,
  MetricListParams,
  MetricSourceTable,
  MetricTableColumn,
  MetricWindow,
} from '../types/metric-governance.type'

const now = '2026-07-03T00:00:00.000Z'

const mockWindows: MetricWindow[] = [
  {
    key: '7d_ex1',
    name: 'Last 7 days, exclude 1 day',
    lookback_days: 7,
    exclude_recent_days: 1,
    date_column: 'date',
    timezone_expression: 'to_date(convert_timezone(\'Asia/Shanghai\', marketplace_tz, CURRENT_TIMESTAMP()))',
    description: 'Common stabilized short-window ad metric.',
  },
  {
    key: '14d_ex1',
    name: 'Last 14 days, exclude 1 day',
    lookback_days: 14,
    exclude_recent_days: 1,
    date_column: 'date',
    timezone_expression: 'to_date(convert_timezone(\'Asia/Shanghai\', marketplace_tz, CURRENT_TIMESTAMP()))',
    description: 'Default optimization window for campaign and targeting metrics.',
  },
  {
    key: '30d_ex0',
    name: 'Last 30 days',
    lookback_days: 30,
    exclude_recent_days: 0,
    date_column: 'date',
    timezone_expression: 'to_date(convert_timezone(\'Asia/Shanghai\', marketplace_tz, CURRENT_TIMESTAMP()))',
    description: 'Longer trend window including today.',
  },
]

const mockMetrics: MetricDefinition[] = [
  {
    key: 'impressions',
    name: 'Impressions',
    type: 'atomic',
    category: 'amazon_ads',
    unit: 'count',
    description: 'Ad impressions from Amazon Ads daily fact tables.',
    dependencies: [],
    expression: { kind: 'column_sum', column: 'impressions' },
    source_tables: ['sl.prod_sl_hanna_action_targeting_base_table'],
    default_dimensions: ['amazon_campaign_id', 'amazon_adgroup_id', 'amazon_target_id'],
    status: 'active',
    owner: 'ads_analytics',
    version: 1,
    updated_at: now,
  },
  {
    key: 'clicks',
    name: 'Clicks',
    type: 'atomic',
    category: 'amazon_ads',
    unit: 'count',
    description: 'Ad clicks from Amazon Ads daily fact tables.',
    dependencies: [],
    expression: { kind: 'column_sum', column: 'clicks' },
    source_tables: ['sl.prod_sl_hanna_action_targeting_base_table'],
    default_dimensions: ['amazon_campaign_id', 'amazon_adgroup_id', 'amazon_target_id'],
    status: 'active',
    owner: 'ads_analytics',
    version: 1,
    updated_at: now,
  },
  {
    key: 'ad_orders',
    name: 'Ad Orders',
    type: 'atomic',
    category: 'amazon_ads',
    unit: 'count',
    description: 'Attributed ad orders.',
    dependencies: [],
    expression: { kind: 'column_sum', column: 'ad_orders' },
    source_tables: ['sl.prod_sl_hanna_action_targeting_base_table'],
    default_dimensions: ['amazon_campaign_id', 'amazon_adgroup_id', 'amazon_target_id'],
    status: 'active',
    owner: 'ads_analytics',
    version: 1,
    updated_at: now,
  },
  {
    key: 'ad_sales',
    name: 'Ad Sales',
    type: 'atomic',
    category: 'amazon_ads',
    unit: 'currency',
    description: 'Attributed ad sales.',
    dependencies: [],
    expression: { kind: 'column_sum', column: 'ad_sales' },
    source_tables: ['sl.prod_sl_hanna_action_targeting_base_table'],
    default_dimensions: ['amazon_campaign_id', 'amazon_adgroup_id', 'amazon_target_id'],
    status: 'active',
    owner: 'ads_analytics',
    version: 1,
    updated_at: now,
  },
  {
    key: 'ad_spend',
    name: 'Ad Spend',
    type: 'atomic',
    category: 'amazon_ads',
    unit: 'currency',
    description: 'Amazon Ads spend.',
    dependencies: [],
    expression: { kind: 'column_sum', column: 'ad_spend' },
    source_tables: ['sl.prod_sl_hanna_action_targeting_base_table'],
    default_dimensions: ['amazon_campaign_id', 'amazon_adgroup_id', 'amazon_target_id'],
    status: 'active',
    owner: 'ads_analytics',
    version: 1,
    updated_at: now,
  },
  {
    key: 'acos',
    name: 'ACOS',
    type: 'derived',
    category: 'amazon_ads',
    unit: 'ratio',
    description: 'Ad spend divided by ad sales after both inputs are aggregated.',
    dependencies: ['ad_spend', 'ad_sales'],
    expression: { kind: 'formula', formula: 'ad_spend / NULLIF(ad_sales, 0)' },
    source_tables: ['sl.prod_sl_hanna_action_targeting_base_table'],
    default_dimensions: ['amazon_campaign_id'],
    status: 'active',
    owner: 'ads_analytics',
    version: 3,
    updated_at: now,
  },
  {
    key: 'ctr',
    name: 'CTR',
    type: 'derived',
    category: 'amazon_ads',
    unit: 'ratio',
    description: 'Clicks divided by impressions after aggregation.',
    dependencies: ['clicks', 'impressions'],
    expression: { kind: 'formula', formula: 'clicks / NULLIF(impressions, 0)' },
    source_tables: ['sl.prod_sl_hanna_action_targeting_base_table'],
    default_dimensions: ['amazon_campaign_id'],
    status: 'active',
    owner: 'ads_analytics',
    version: 2,
    updated_at: now,
  },
  {
    key: 'cpc',
    name: 'CPC',
    type: 'derived',
    category: 'amazon_ads',
    unit: 'currency',
    description: 'Ad spend divided by clicks after aggregation.',
    dependencies: ['ad_spend', 'clicks'],
    expression: { kind: 'formula', formula: 'ad_spend / NULLIF(clicks, 0)' },
    source_tables: ['sl.prod_sl_hanna_action_targeting_base_table'],
    default_dimensions: ['amazon_campaign_id'],
    status: 'active',
    owner: 'ads_analytics',
    version: 2,
    updated_at: now,
  },
  {
    key: 'high_acos_ad_sales_share',
    name: 'High ACOS Ad Sales Share',
    type: 'custom_sql',
    category: 'amazon_ads',
    unit: 'ratio',
    description: 'Cumulative ad sales share after ordering targets by ACOS descending.',
    dependencies: ['ad_spend', 'ad_sales', 'acos'],
    expression: { kind: 'raw_sql_cte', output_column: 'high_acos_ad_sales_share_14day_ex1' },
    raw_sql: `WITH base_metrics AS (
  SELECT
    amazon_campaign_id,
    amazon_adgroup_id,
    amazon_target_id,
    SUM(ad_spend) FILTER (WHERE date BETWEEN <window_start> AND <window_end>) AS ad_spend_14day_ex1,
    SUM(ad_sales) FILTER (WHERE date BETWEEN <window_start> AND <window_end>) AS ad_sales_14day_ex1
  FROM sl.prod_sl_hanna_action_targeting_base_table
  GROUP BY amazon_campaign_id, amazon_adgroup_id, amazon_target_id
)
SELECT
  amazon_campaign_id,
  SUM(ad_sales_14day_ex1) OVER (
    ORDER BY (ad_spend_14day_ex1 / NULLIF(ad_sales_14day_ex1, 0)) DESC
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) / NULLIF((SELECT SUM(ad_sales_14day_ex1) FROM base_metrics), 0) AS high_acos_ad_sales_share_14day_ex1
FROM base_metrics`,
    source_tables: ['sl.prod_sl_hanna_action_targeting_base_table'],
    default_dimensions: ['amazon_campaign_id', 'amazon_adgroup_id', 'amazon_target_id'],
    status: 'draft',
    owner: 'ads_analytics',
    version: 1,
    updated_at: now,
  },
]

const mockApplications: MetricApplication[] = [
  {
    id: 'app-campaign-optimizer',
    feature_key: 'campaign_optimizer',
    feature_name: 'Campaign Optimizer',
    route_path: '/raas/dashboard',
    service_name: 'ProductProgressService',
    source_table: 'sl.prod_sl_hanna_action_targeting_base_table',
    metric_keys: ['acos', 'cpc', 'clicks', 'high_acos_ad_sales_share'],
    query_context: {
      dimensions: ['amazon_campaign_id'],
      windows: ['14d_ex1'],
      filters: ['amazon_profile_id', 'amazon_campaign_id'],
    },
    owner: 'ads_analytics',
    updated_at: now,
  },
]

const mockSourceTables: MetricSourceTable[] = [
  {
    name: 'sl.prod_sl_hanna_action_targeting_base_table',
    label: 'Targeting daily base table',
  },
  {
    name: 'sl.prod_sl_hanna_action_campaign_base_table',
    label: 'Campaign daily base table',
  },
  {
    name: 'sl.prod_sl_hanna_action_adgroup_base_table',
    label: 'Ad group daily base table',
  },
]

const mockTableColumns: Record<string, MetricTableColumn[]> = {
  'sl.prod_sl_hanna_action_targeting_base_table': [
    { column_name: 'date', data_type: 'date' },
    { column_name: 'marketplace_tz', data_type: 'string' },
    { column_name: 'amazon_profile_id', data_type: 'string' },
    { column_name: 'amazon_campaign_id', data_type: 'string' },
    { column_name: 'amazon_adgroup_id', data_type: 'string' },
    { column_name: 'amazon_target_id', data_type: 'string' },
    { column_name: 'keyword', data_type: 'string' },
    { column_name: 'enabled', data_type: 'boolean' },
    { column_name: 'impressions', data_type: 'bigint' },
    { column_name: 'clicks', data_type: 'bigint' },
    { column_name: 'ad_orders', data_type: 'bigint' },
    { column_name: 'ad_sales', data_type: 'double' },
    { column_name: 'ad_spend', data_type: 'double' },
  ],
  'sl.prod_sl_hanna_action_campaign_base_table': [
    { column_name: 'date', data_type: 'date' },
    { column_name: 'marketplace_tz', data_type: 'string' },
    { column_name: 'amazon_profile_id', data_type: 'string' },
    { column_name: 'amazon_campaign_id', data_type: 'string' },
    { column_name: 'campaign_name', data_type: 'string' },
    { column_name: 'campaign_type', data_type: 'string' },
    { column_name: 'enabled', data_type: 'boolean' },
    { column_name: 'impressions', data_type: 'bigint' },
    { column_name: 'clicks', data_type: 'bigint' },
    { column_name: 'ad_orders', data_type: 'bigint' },
    { column_name: 'ad_sales', data_type: 'double' },
    { column_name: 'ad_spend', data_type: 'double' },
  ],
  'sl.prod_sl_hanna_action_adgroup_base_table': [
    { column_name: 'date', data_type: 'date' },
    { column_name: 'marketplace_tz', data_type: 'string' },
    { column_name: 'amazon_profile_id', data_type: 'string' },
    { column_name: 'amazon_campaign_id', data_type: 'string' },
    { column_name: 'amazon_adgroup_id', data_type: 'string' },
    { column_name: 'adgroup_name', data_type: 'string' },
    { column_name: 'enabled', data_type: 'boolean' },
    { column_name: 'impressions', data_type: 'bigint' },
    { column_name: 'clicks', data_type: 'bigint' },
    { column_name: 'ad_orders', data_type: 'bigint' },
    { column_name: 'ad_sales', data_type: 'double' },
    { column_name: 'ad_spend', data_type: 'double' },
  ],
}

const metrics = [...mockMetrics]
const windows = [...mockWindows]
const applications = [...mockApplications]
let latestExport: MetricGovernanceExport | null = null

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function datePredicate(window?: MetricWindow) {
  if (!window)
    return '1=1'

  const anchor = window.timezone_expression
  const startOffset = window.exclude_recent_days + window.lookback_days - 1
  const endOffset = window.exclude_recent_days
  return `${window.date_column} BETWEEN (${anchor} - INTERVAL ${startOffset} DAYS) AND (${anchor} - INTERVAL ${endOffset} DAYS)`
}

function compileSql(request: MetricCompileRequest): MetricCompileResponse {
  const metric = request.metric
  const window = request.window || windows.find(item => item.key === request.window_key) || windows[0]
  const dimensions = request.dimensions?.length ? request.dimensions : metric.default_dimensions
  const sourceTable = metric.source_tables[0] || 'sl.prod_sl_hanna_action_targeting_base_table'
  const predicate = [datePredicate(window), ...(request.filters || [])].filter(Boolean).join(' AND ')
  const groupBy = dimensions.length ? `\n  GROUP BY ${dimensions.join(', ')}` : ''
  const selectDimensions = dimensions.length ? `${dimensions.join(', ')},\n    ` : ''

  if (metric.type === 'custom_sql') {
    return {
      metric_key: metric.key,
      sql: metric.raw_sql || '-- Raw SQL is not configured for this CustomSQL metric.',
      dependencies: metric.dependencies,
      warnings: ['CustomSQL metrics are stored as governed raw SQL in phase 1.'],
    }
  }

  if (metric.type === 'atomic') {
    const column = String(metric.expression.column || metric.expression.formula || metric.key)
    return {
      metric_key: metric.key,
      sql: `SELECT
  ${selectDimensions}SUM(${column}) FILTER (WHERE ${predicate}) AS ${metric.key}_${window.key}
FROM ${sourceTable}${groupBy};`,
      dependencies: [],
      warnings: [],
    }
  }

  const dependencySelects = metric.dependencies
    .map((dependency) => {
      const dependencyMetric = metrics.find(item => item.key === dependency)
      const column = String(dependencyMetric?.expression.column || dependency)
      return `    SUM(${column}) FILTER (WHERE ${predicate}) AS ${dependency}`
    })
    .join(',\n')
  const formula = String(metric.expression.formula || '')

  return {
    metric_key: metric.key,
    sql: `WITH base_metrics AS (
  SELECT
${dimensions.length ? `    ${dimensions.join(', ')},\n` : ''}${dependencySelects}
  FROM ${sourceTable}${groupBy}
)
SELECT
  ${selectDimensions}${formula} AS ${metric.key}_${window.key}
FROM base_metrics;`,
    dependencies: metric.dependencies,
    warnings: formula.includes('NULLIF') ? [] : ['Formula does not include NULLIF; verify divide-by-zero behavior.'],
  }
}

export function useMetricGovernanceApi() {
  const queryClient = useQueryClient()

  const useGetMetrics = (params: MaybeRefOrGetter<MetricListParams> = {}) => {
    return useQuery({
      queryKey: ['metricGovernance', 'metrics', params],
      queryFn: async () => {
        const resolved = toValue(params)
        const search = resolved.search?.trim().toLowerCase()
        let rows = metrics
        if (search) {
          rows = rows.filter(metric =>
            metric.key.toLowerCase().includes(search)
            || metric.name.toLowerCase().includes(search)
            || metric.description?.toLowerCase().includes(search),
          )
        }
        if (resolved.type && resolved.type !== 'all')
          rows = rows.filter(metric => metric.type === resolved.type)
        if (resolved.status && resolved.status !== 'all')
          rows = rows.filter(metric => metric.status === resolved.status)
        if (resolved.category)
          rows = rows.filter(metric => metric.category === resolved.category)
        return clone(rows)
      },
      staleTime: 1000 * 60 * 5,
    })
  }

  const useGetWindows = () => {
    return useQuery({
      queryKey: ['metricGovernance', 'windows'],
      queryFn: async () => clone(windows),
      staleTime: 1000 * 60 * 10,
    })
  }

  const useGetApplications = () => {
    return useQuery({
      queryKey: ['metricGovernance', 'applications'],
      queryFn: async () => clone(applications),
      staleTime: 1000 * 60 * 5,
    })
  }

  const useGetSourceTables = () => {
    return useQuery({
      queryKey: ['metricGovernance', 'sourceTables'],
      queryFn: async () => clone(mockSourceTables),
      staleTime: 1000 * 60 * 10,
    })
  }

  const useGetTableColumns = (sourceTable: MaybeRefOrGetter<string>) => {
    return useQuery({
      queryKey: ['metricGovernance', 'tableColumns', sourceTable],
      queryFn: async () => clone(mockTableColumns[toValue(sourceTable)] || []),
      staleTime: 1000 * 60 * 10,
    })
  }

  const useCompileMetric = () => {
    return useMutation({
      mutationFn: async (payload: MetricCompileRequest) => compileSql(payload),
    })
  }

  const useSuggestFormula = () => {
    return useMutation<MetricFormulaSuggestionResponse, Error, MetricFormulaSuggestionRequest>({
      mutationFn: async (payload) => {
        const [firstDependency, secondDependency] = payload.dependencies
        if (payload.metric_type === 'atomic') {
          return {
            formula: payload.metric_key,
            rationale: 'Atomic metrics usually map directly to a source numeric column.',
          }
        }
        if (firstDependency && secondDependency) {
          return {
            formula: `${firstDependency} / NULLIF(${secondDependency}, 0)`,
            rationale: 'Suggested as a post-aggregation ratio with divide-by-zero protection.',
          }
        }
        return {
          formula: payload.metric_key,
          rationale: 'Not enough dependencies were selected, so the metric key is used as a starting point.',
        }
      },
    })
  }

  const useSaveMetric = () => {
    return useMutation({
      mutationFn: async (payload: MetricDefinition) => {
        const existingIndex = metrics.findIndex(metric => metric.key === payload.key)
        const nextMetric = {
          ...payload,
          version: existingIndex >= 0 ? metrics[existingIndex].version + 1 : 1,
          updated_at: new Date().toISOString(),
        }
        if (existingIndex >= 0)
          metrics.splice(existingIndex, 1, nextMetric)
        else
          metrics.unshift(nextMetric)
        return clone(nextMetric)
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['metricGovernance'] })
      },
    })
  }

  const useSaveApplication = () => {
    return useMutation({
      mutationFn: async (payload: MetricApplication) => {
        const existingIndex = applications.findIndex(application => application.id === payload.id)
        const nextApplication = { ...payload, updated_at: new Date().toISOString() }
        if (existingIndex >= 0)
          applications.splice(existingIndex, 1, nextApplication)
        else
          applications.unshift(nextApplication)
        return clone(nextApplication)
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['metricGovernance', 'applications'] })
      },
    })
  }

  const useCreateExport = () => {
    return useMutation({
      mutationFn: async () => {
        latestExport = {
          version: new Date().toISOString().slice(0, 10),
          engine: 'clickzetta',
          generated_at: new Date().toISOString(),
          metrics: clone(metrics),
          windows: clone(windows),
          applications: clone(applications),
        }
        return clone(latestExport)
      },
    })
  }

  const useGetLatestExport = () => {
    return useQuery({
      queryKey: ['metricGovernance', 'exports', 'latest'],
      queryFn: async () => clone(latestExport),
      staleTime: 1000 * 60 * 5,
    })
  }

  return {
    useGetMetrics,
    useGetWindows,
    useGetApplications,
    useGetSourceTables,
    useGetTableColumns,
    useCompileMetric,
    useSuggestFormula,
    useSaveMetric,
    useSaveApplication,
    useCreateExport,
    useGetLatestExport,
  }
}
