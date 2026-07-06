export type MetricType = 'atomic' | 'derived' | 'custom_sql'
export type MetricStatus = 'draft' | 'active' | 'deprecated'
export type MetricUnit = 'count' | 'currency' | 'ratio' | 'percentage' | 'days' | 'custom'

export interface MetricDefinition {
  key: string
  name: string
  type: MetricType
  category: string
  unit?: MetricUnit
  description?: string
  dependencies: string[]
  expression: Record<string, unknown>
  raw_sql?: string
  compiled_sql?: string
  source_tables: string[]
  default_dimensions: string[]
  status: MetricStatus
  owner?: string
  version: number
  created_at?: string
  updated_at?: string
  metadata?: Record<string, unknown>
}

export interface MetricWindow {
  key: string
  name: string
  lookback_days: number
  exclude_recent_days: number
  date_column: string
  timezone_expression: string
  description?: string
}

export interface MetricApplication {
  id: string
  feature_key: string
  feature_name: string
  route_path?: string
  service_name?: string
  source_table?: string
  metric_keys: string[]
  query_context: Record<string, unknown>
  owner?: string
  updated_at?: string
}

export interface MetricVersion {
  metric_key: string
  version: number
  snapshot: MetricDefinition
  created_at: string
}

export interface MetricListParams {
  search?: string
  type?: MetricType | 'all'
  status?: MetricStatus | 'all'
  category?: string
}

export interface MetricCompileRequest {
  metric: MetricDefinition
  window_key?: string
  window?: MetricWindow
  dimensions?: string[]
  filters?: string[]
}

export interface MetricCompileResponse {
  metric_key: string
  sql: string
  dependencies: string[]
  warnings: string[]
}

export interface MetricSourceTable {
  name: string
  label: string
}

export interface MetricTableColumn {
  column_name: string
  data_type: string
  comment?: string
}

export interface MetricFormulaSuggestionRequest {
  metric_key: string
  name: string
  unit?: MetricUnit
  description?: string
  current_formula?: string
  source_table: string
  dimensions: string[]
  dependencies: string[]
  metric_type: MetricType
  window?: MetricWindow
  filters?: string[]
}

export interface MetricFormulaSuggestionResponse {
  formula: string
  rationale?: string
}

export interface MetricGovernanceExport {
  version: string
  engine: 'clickzetta'
  generated_at: string
  metrics: MetricDefinition[]
  windows: MetricWindow[]
  applications: MetricApplication[]
}
