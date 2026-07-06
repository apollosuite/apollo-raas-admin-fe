<script setup lang="ts">
import { Check, Copy, DatabaseZap, Download, FileCode2, GitBranch, Plus, Save, Search, WandSparkles } from 'lucide-vue-next'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import type {
  MetricApplication,
  MetricCompileResponse,
  MetricDefinition,
  MetricListParams,
  MetricStatus,
  MetricType,
  MetricUnit,
} from '@/services/types/metric-governance.type'

import { BasicPage } from '@/components/global-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useMetricGovernanceApi } from '@/services/api/metric-governance.api'

const metricTypes: (MetricType | 'all')[] = ['all', 'atomic', 'derived', 'custom_sql']
const metricStatuses: (MetricStatus | 'all')[] = ['all', 'draft', 'active', 'deprecated']
const unitOptions: MetricUnit[] = ['count', 'currency', 'ratio', 'percentage', 'days', 'custom']
const lookbackDayOptions = ['7', '14', '30']
const excludeRecentDayOptions = ['0', '1', '2']
const defaultTimezoneExpression = 'to_date(convert_timezone(\'Asia/Shanghai\', marketplace_tz, CURRENT_TIMESTAMP()))'

const filters = reactive<MetricListParams>({
  search: '',
  type: 'all',
  status: 'all',
})

const api = useMetricGovernanceApi()
const metricsQuery = api.useGetMetrics(filters)
const applicationsQuery = api.useGetApplications()
const sourceTablesQuery = api.useGetSourceTables()
const compileMutation = api.useCompileMetric()
const suggestFormulaMutation = api.useSuggestFormula()
const saveMetricMutation = api.useSaveMetric()
const saveApplicationMutation = api.useSaveApplication()
const createExportMutation = api.useCreateExport()

const editorOpen = ref(false)
const editorMetricType = ref<MetricType>('derived')
const editorMode = ref<'create' | 'edit'>('create')
const editorDrawerWidth = ref(0)
const copied = ref('')

const builderForm = reactive({
  key: 'conversion_rate',
  name: 'Conversion Rate',
  type: 'derived' as MetricType,
  category: 'amazon_ads',
  unit: 'ratio' as MetricUnit,
  owner: 'ads_analytics',
  status: 'draft' as MetricStatus,
  description: 'Ad orders divided by clicks after aggregation.',
  dependencies: ['ad_orders', 'clicks'] as string[],
  formula: 'ad_orders / NULLIF(clicks, 0)',
  source_table: 'sl.prod_sl_hanna_action_targeting_base_table',
  dimensions: ['amazon_campaign_id'] as string[],
  lookback_days: '14',
  exclude_recent_days: '1',
  filters: 'amazon_profile_id = :amazon_profile_id',
})

const tableColumnsQuery = api.useGetTableColumns(computed(() => builderForm.source_table))

const rawSqlForm = reactive({
  key: 'srm_non_converting_spend',
  name: 'SRM Non-converting Spend',
  description: 'Share of spend from targets with no attributed sales in the selected window.',
  dependencies: 'ad_spend, ad_sales',
  source_tables: 'sl.prod_sl_hanna_action_targeting_base_table',
  dimensions: 'amazon_campaign_id, amazon_adgroup_id, amazon_target_id',
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
  SUM(CASE WHEN ad_sales_14day_ex1 <= 0 THEN ad_spend_14day_ex1 ELSE 0 END) OVER ()
    / NULLIF(SUM(ad_spend_14day_ex1) OVER (), 0) AS added_campaigns_srm_non_converting_spend_14day_ex1
FROM base_metrics`,
})

const applicationForm = reactive({
  id: 'app-keyword-harvester',
  feature_key: 'keyword_harvester',
  feature_name: 'Keyword Harvester',
  route_path: '/raas/dashboard',
  service_name: 'KeywordAnalyticsService',
  source_table: 'sl.prod_sl_hanna_action_targeting_base_table',
  metric_keys: 'clicks, ctr, acos, high_acos_ad_sales_share',
  query_context: JSON.stringify({
    dimensions: ['amazon_campaign_id', 'amazon_target_id'],
    windows: ['14d_ex1'],
    filters: ['amazon_profile_id', 'keyword'],
  }, null, 2),
})

const metrics = computed(() => metricsQuery.data.value || [])
const applications = computed(() => applicationsQuery.data.value || [])
const sourceTables = computed(() => sourceTablesQuery.data.value || [])
const tableColumns = computed(() => tableColumnsQuery.data.value || [])
const atomicMetricOptions = computed(() => metrics.value.filter(metric => metric.type === 'atomic'))
const atomicMetricKeyOptions = computed(() => {
  return tableColumns.value
    .filter(column => column.data_type.toLowerCase() !== 'string')
    .map(column => ({
      value: column.column_name,
      label: toSnakeCase(column.column_name),
      description: column.data_type,
    }))
})
const dimensionColumnOptions = computed(() => {
  return tableColumns.value.filter((column) => {
    const dataType = column.data_type.toLowerCase()
    return dataType === 'string' || dataType === 'boolean'
  })
})
const activeMetrics = computed(() => metrics.value.filter(metric => metric.status === 'active').length)
const derivedMetrics = computed(() => metrics.value.filter(metric => metric.type === 'derived').length)
const customSqlMetrics = computed(() => metrics.value.filter(metric => metric.type === 'custom_sql').length)

const selectedMetricApplications = computed(() => {
  const metricKey = editorMetricType.value === 'custom_sql' ? rawSqlForm.key : builderForm.key
  if (!metricKey)
    return []
  return applications.value.filter(application => application.metric_keys.includes(metricKey))
})

const compileResult = ref<MetricCompileResponse | null>(null)

watch(() => [builderForm.type, builderForm.key, builderForm.lookback_days, builderForm.exclude_recent_days, builderForm.formula, builderForm.dependencies.join(','), builderForm.source_table, builderForm.dimensions.join(','), builderForm.filters], () => {
  compileBuilderMetric()
}, { immediate: true })

watch(editorMetricType, (type) => {
  if (type !== 'custom_sql') {
    builderForm.type = type
    syncBuilderMetricKey()
  }
})

watch(() => [builderForm.type, builderForm.name], () => {
  syncBuilderMetricKey()
})

watch(() => rawSqlForm.name, () => {
  rawSqlForm.key = toSnakeCase(rawSqlForm.name)
})

watch(dimensionColumnOptions, (columns) => {
  const allowedColumns = new Set(columns.map(column => column.column_name))
  builderForm.dimensions = builderForm.dimensions.filter(dimension => allowedColumns.has(dimension))
})

watch(atomicMetricKeyOptions, () => {
  syncBuilderMetricKey()
})

watch(editorOpen, (open) => {
  if (open && !editorDrawerWidth.value)
    editorDrawerWidth.value = Math.round(getViewportWidth() * 0.7)
})

const editorDrawerStyle = computed(() => {
  if (!editorDrawerWidth.value)
    return { width: '70vw', minWidth: '50vw', maxWidth: '96vw' }
  return {
    width: `${editorDrawerWidth.value}px`,
    minWidth: '50vw',
    maxWidth: '96vw',
  }
})

function getViewportWidth() {
  return typeof window === 'undefined' ? 1440 : window.innerWidth
}

function clampDrawerWidth(value: number) {
  const viewportWidth = getViewportWidth()
  return Math.min(Math.max(value, viewportWidth * 0.5), viewportWidth * 0.96)
}

function handleDrawerResize(event: PointerEvent) {
  editorDrawerWidth.value = clampDrawerWidth(getViewportWidth() - event.clientX)
}

function stopDrawerResize() {
  window.removeEventListener('pointermove', handleDrawerResize)
  window.removeEventListener('pointerup', stopDrawerResize)
  document.body.style.removeProperty('cursor')
  document.body.style.removeProperty('user-select')
}

function startDrawerResize(event: PointerEvent) {
  event.preventDefault()
  handleDrawerResize(event)
  document.body.style.cursor = 'ew-resize'
  document.body.style.userSelect = 'none'
  window.addEventListener('pointermove', handleDrawerResize)
  window.addEventListener('pointerup', stopDrawerResize)
}

onBeforeUnmount(() => {
  stopDrawerResize()
})

function csv(value: string) {
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

function metricTypeLabel(type: MetricType | 'all') {
  if (type === 'custom_sql')
    return 'CustomSQL'
  return type
}

function summarizeSelection(values: string[], placeholder: string) {
  if (values.length === 0)
    return placeholder
  if (values.length <= 2)
    return values.join(', ')
  return `${values.length} selected`
}

function toSnakeCase(value: string) {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function syncBuilderMetricKey() {
  if (editorMetricType.value === 'custom_sql')
    return
  if (builderForm.type !== 'atomic') {
    builderForm.key = toSnakeCase(builderForm.name)
    return
  }
  const options = atomicMetricKeyOptions.value
  if (options.length === 0 || options.some(option => option.value === builderForm.key))
    return
  builderForm.key = options[0].value
  if (builderForm.type === 'atomic')
    builderForm.formula = options[0].value
}

function handleStructuredMetricKeyChange(value: unknown) {
  if (!value)
    return
  const key = String(value)
  builderForm.key = key
  builderForm.formula = key
}

function toggleDependency(metricKey: string) {
  if (builderForm.dependencies.includes(metricKey)) {
    builderForm.dependencies = builderForm.dependencies.filter(key => key !== metricKey)
    return
  }
  if (builderForm.dependencies.length >= 2) {
    toast.warning('Structured metrics support up to two dependencies. Switch Metric Type to CustomSQL to define metrics with three or more dependencies.')
    return
  }
  builderForm.dependencies = [...builderForm.dependencies, metricKey]
}

function toggleDimension(columnName: string) {
  if (builderForm.dimensions.includes(columnName)) {
    builderForm.dimensions = builderForm.dimensions.filter(dimension => dimension !== columnName)
    return
  }
  builderForm.dimensions = [...builderForm.dimensions, columnName]
}

function buildMetricFromBuilder(): MetricDefinition {
  const metricKey = builderForm.type === 'atomic' ? builderForm.key.trim() : toSnakeCase(builderForm.name)
  return {
    key: metricKey,
    name: builderForm.name.trim(),
    type: builderForm.type,
    category: builderForm.category.trim(),
    unit: builderForm.unit,
    description: builderForm.description.trim(),
    dependencies: builderForm.dependencies,
    expression: builderForm.type === 'atomic'
      ? { kind: 'column_sum', column: builderForm.formula.trim() || metricKey }
      : { kind: 'formula', formula: builderForm.formula.trim() },
    source_tables: [builderForm.source_table.trim()],
    default_dimensions: builderForm.dimensions,
    status: builderForm.status,
    owner: builderForm.owner.trim(),
    version: 0,
  }
}

function buildWindowFromBuilder() {
  const lookbackDays = Number(builderForm.lookback_days)
  const excludeRecentDays = Number(builderForm.exclude_recent_days)
  return {
    key: `${lookbackDays}d_ex${excludeRecentDays}`,
    name: `Last ${lookbackDays} days, exclude ${excludeRecentDays} day${excludeRecentDays === 1 ? '' : 's'}`,
    lookback_days: lookbackDays,
    exclude_recent_days: excludeRecentDays,
    date_column: 'date',
    timezone_expression: defaultTimezoneExpression,
  }
}

function validateMetric(metric: MetricDefinition) {
  if (!metric.key || !/^[a-z][a-z0-9_]*$/.test(metric.key))
    return 'Metric key must start with a lowercase letter and use snake_case.'
  if (!metric.name)
    return 'Metric name is required.'
  if (!metric.source_tables[0])
    return 'Source table is required.'
  if ((metric.type === 'atomic' || metric.type === 'derived') && metric.dependencies.length > 2)
    return 'Structured metrics support up to two dependencies. Switch Metric Type to CustomSQL for three or more dependencies.'
  if ((metric.type === 'atomic' || metric.type === 'derived') && metric.dependencies.some(key => !atomicMetricOptions.value.some(metric => metric.key === key)))
    return 'Dependencies must be selected from existing atomic metrics.'
  if (metric.type === 'derived' && metric.dependencies.length === 0)
    return 'Derived metrics need at least one dependency.'
  return ''
}

function compileBuilderMetric() {
  const metric = buildMetricFromBuilder()
  const validationError = validateMetric(metric)
  if (validationError) {
    compileResult.value = null
    return
  }
  compileMutation.mutate({
    metric,
    window: buildWindowFromBuilder(),
    dimensions: metric.default_dimensions,
    filters: csv(builderForm.filters),
  }, {
    onSuccess: (result) => {
      compileResult.value = result
    },
  })
}

function suggestFormula() {
  suggestFormulaMutation.mutate({
    metric_key: builderForm.key.trim(),
    name: builderForm.name.trim(),
    unit: builderForm.unit,
    description: builderForm.description.trim(),
    current_formula: builderForm.formula.trim(),
    source_table: builderForm.source_table.trim(),
    dimensions: builderForm.dimensions,
    dependencies: builderForm.dependencies,
    metric_type: builderForm.type,
    window: buildWindowFromBuilder(),
    filters: csv(builderForm.filters),
  }, {
    onSuccess: (result) => {
      builderForm.formula = result.formula
      toast.success(result.rationale || 'AI formula suggestion applied.')
    },
  })
}

function saveBuilderMetric() {
  const metric = buildMetricFromBuilder()
  const validationError = validateMetric(metric)
  if (validationError) {
    toast.error(validationError)
    return
  }
  saveMetricMutation.mutate(metric, {
    onSuccess: () => {
      editorOpen.value = false
      toast.success('Metric saved to local mock governance store.')
    },
  })
}

function saveApplication() {
  let queryContext: Record<string, unknown>
  try {
    queryContext = JSON.parse(applicationForm.query_context)
  }
  catch {
    toast.error('Query context must be valid JSON.')
    return
  }

  const application: MetricApplication = {
    id: applicationForm.id.trim(),
    feature_key: applicationForm.feature_key.trim(),
    feature_name: applicationForm.feature_name.trim(),
    route_path: applicationForm.route_path.trim(),
    service_name: applicationForm.service_name.trim(),
    source_table: applicationForm.source_table.trim(),
    metric_keys: csv(applicationForm.metric_keys),
    query_context: queryContext,
    owner: 'ads_analytics',
  }

  if (!application.feature_key || application.metric_keys.length === 0) {
    toast.error('Feature key and at least one metric are required.')
    return
  }

  saveApplicationMutation.mutate(application, {
    onSuccess: () => toast.success('Application usage saved locally.'),
  })
}

function startCreateMetric() {
  editorMode.value = 'create'
  editorMetricType.value = 'derived'
  Object.assign(builderForm, {
    key: 'conversion_rate',
    name: 'Conversion Rate',
    type: 'derived',
    category: 'amazon_ads',
    unit: 'ratio',
    owner: 'ads_analytics',
    status: 'draft',
    description: 'Ad orders divided by clicks after aggregation.',
    dependencies: ['ad_orders', 'clicks'],
    formula: 'ad_orders / NULLIF(clicks, 0)',
    source_table: 'sl.prod_sl_hanna_action_targeting_base_table',
    dimensions: ['amazon_campaign_id'],
    lookback_days: '14',
    exclude_recent_days: '1',
    filters: 'amazon_profile_id = :amazon_profile_id',
  })
  editorOpen.value = true
}

function editMetric(metric: MetricDefinition) {
  editorMode.value = 'edit'
  editorMetricType.value = metric.type
  if (metric.type === 'custom_sql') {
    Object.assign(rawSqlForm, {
      key: metric.key,
      name: metric.name,
      description: metric.description || '',
      dependencies: metric.dependencies.join(', '),
      source_tables: metric.source_tables.join(', '),
      dimensions: metric.default_dimensions.join(', '),
      raw_sql: metric.raw_sql || '',
    })
  }
  else {
    Object.assign(builderForm, {
      key: metric.key,
      name: metric.name,
      type: metric.type,
      category: metric.category,
      unit: metric.unit || 'ratio',
      owner: metric.owner || 'ads_analytics',
      status: metric.status,
      description: metric.description || '',
      dependencies: metric.dependencies.slice(0, 2),
      formula: typeof metric.expression.formula === 'string' ? metric.expression.formula : String(metric.expression.column || metric.key),
      source_table: metric.source_tables[0] || 'sl.prod_sl_hanna_action_targeting_base_table',
      dimensions: metric.default_dimensions,
      lookback_days: '14',
      exclude_recent_days: '1',
      filters: '',
    })
  }
  editorOpen.value = true
}

async function copyText(id: string, value?: string) {
  if (!value)
    return
  await navigator.clipboard.writeText(value)
  copied.value = id
  toast.success('Copied to clipboard.')
  window.setTimeout(() => {
    if (copied.value === id)
      copied.value = ''
  }, 1400)
}

function downloadJson(payload: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function exportGovernance() {
  createExportMutation.mutate(undefined, {
    onSuccess: (payload) => {
      downloadJson(payload, `metric-governance-${payload.version}.json`)
      toast.success('Metric governance JSON exported.')
    },
  })
}

function badgeVariant(status: MetricStatus) {
  if (status === 'active')
    return 'default'
  if (status === 'deprecated')
    return 'destructive'
  return 'secondary'
}
</script>

<template>
  <BasicPage title="Metric Governance" description="Govern Amazon Ads metric definitions, SQL, windows, and feature usage" sticky>
    <div class="space-y-4">
      <div class="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent class="flex items-center justify-between p-4">
            <div>
              <div class="text-sm text-muted-foreground">
                Metrics
              </div>
              <div class="text-2xl font-semibold">
                {{ metrics.length }}
              </div>
            </div>
            <DatabaseZap class="size-5 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent class="flex items-center justify-between p-4">
            <div>
              <div class="text-sm text-muted-foreground">
                Active
              </div>
              <div class="text-2xl font-semibold">
                {{ activeMetrics }}
              </div>
            </div>
            <Check class="size-5 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent class="flex items-center justify-between p-4">
            <div>
              <div class="text-sm text-muted-foreground">
                Derived
              </div>
              <div class="text-2xl font-semibold">
                {{ derivedMetrics }}
              </div>
            </div>
            <GitBranch class="size-5 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent class="flex items-center justify-between p-4">
            <div>
              <div class="text-sm text-muted-foreground">
                CustomSQL
              </div>
              <div class="text-2xl font-semibold">
                {{ customSqlMetrics }}
              </div>
            </div>
            <FileCode2 class="size-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      <Tabs default-value="library" class="space-y-4">
        <TabsList class="grid w-full grid-cols-2 lg:w-[360px]">
          <TabsTrigger value="library">
            Metric library
          </TabsTrigger>
          <TabsTrigger value="applications">
            Applications
          </TabsTrigger>
        </TabsList>

        <TabsContent value="library" class="space-y-4">
          <Card>
            <CardHeader class="pb-3">
              <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <CardTitle>Metric library</CardTitle>
                <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div class="relative">
                    <Search class="absolute left-2 top-2.5 size-4 text-muted-foreground" />
                    <Input v-model="filters.search" class="w-full pl-8 sm:w-[260px]" placeholder="Search metrics" />
                  </div>
                  <Select v-model="filters.type">
                    <SelectTrigger class="w-full sm:w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="type in metricTypes" :key="type" :value="type">
                        {{ metricTypeLabel(type) }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Select v-model="filters.status">
                    <SelectTrigger class="w-full sm:w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="status in metricStatuses" :key="status" :value="status">
                        {{ status }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" @click="exportGovernance">
                    <Download class="size-4" />
                    Export JSON
                  </Button>
                  <Button size="sm" @click="startCreateMetric">
                    <Plus class="size-4" />
                    New metric
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div class="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Key</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Dependencies</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Version</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow v-for="metric in metrics" :key="metric.key">
                      <TableCell>
                        <button
                          class="text-left font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          type="button"
                          @click="editMetric(metric)"
                        >
                          {{ metric.name }}
                        </button>
                        <div class="font-mono text-xs text-muted-foreground">
                          {{ metric.key }}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {{ metricTypeLabel(metric.type) }}
                        </Badge>
                      </TableCell>
                      <TableCell>{{ metric.unit || '-' }}</TableCell>
                      <TableCell>
                        <div class="max-w-[280px] truncate text-sm">
                          {{ metric.dependencies.length ? metric.dependencies.join(', ') : 'none' }}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge :variant="badgeVariant(metric.status)">
                          {{ metric.status }}
                        </Badge>
                      </TableCell>
                      <TableCell>v{{ metric.version }}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="applications" class="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(520px,1.15fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Register feature usage</CardTitle>
            </CardHeader>
            <CardContent class="space-y-4">
              <div class="grid gap-3 md:grid-cols-2">
                <div class="space-y-2">
                  <Label>Feature key</Label>
                  <Input v-model="applicationForm.feature_key" />
                </div>
                <div class="space-y-2">
                  <Label>Feature name</Label>
                  <Input v-model="applicationForm.feature_name" />
                </div>
              </div>
              <div class="grid gap-3 md:grid-cols-2">
                <div class="space-y-2">
                  <Label>Route path</Label>
                  <Input v-model="applicationForm.route_path" />
                </div>
                <div class="space-y-2">
                  <Label>Service name</Label>
                  <Input v-model="applicationForm.service_name" />
                </div>
              </div>
              <div class="space-y-2">
                <Label>Source table</Label>
                <Input v-model="applicationForm.source_table" class="font-mono text-xs" />
              </div>
              <div class="space-y-2">
                <Label>Metric keys</Label>
                <Input v-model="applicationForm.metric_keys" />
              </div>
              <div class="space-y-2">
                <Label>Query context JSON</Label>
                <Textarea v-model="applicationForm.query_context" class="min-h-[220px] font-mono text-xs" />
              </div>
              <Button :disabled="saveApplicationMutation.isPending.value" @click="saveApplication">
                <Save class="size-4" />
                Save usage
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Tracked applications</CardTitle>
            </CardHeader>
            <CardContent>
              <div class="space-y-3">
                <div v-for="application in applications" :key="application.id" class="rounded-md border p-4">
                  <div class="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div class="font-medium">
                        {{ application.feature_name }}
                      </div>
                      <div class="font-mono text-xs text-muted-foreground">
                        {{ application.feature_key }} · {{ application.route_path || application.service_name }}
                      </div>
                    </div>
                    <Badge variant="outline">
                      {{ application.metric_keys.length }} metrics
                    </Badge>
                  </div>
                  <div class="mt-3 flex flex-wrap gap-1">
                    <Badge v-for="metricKey in application.metric_keys" :key="metricKey" variant="secondary">
                      {{ metricKey }}
                    </Badge>
                  </div>
                  <pre class="mt-3 overflow-auto rounded-md bg-muted/30 p-3 text-xs"><code>{{ JSON.stringify(application.query_context, null, 2) }}</code></pre>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>

    <Sheet v-model:open="editorOpen">
      <SheetContent class="overflow-y-auto px-6 py-5 sm:max-w-none lg:px-8" :style="editorDrawerStyle">
        <button
          aria-label="Resize edit metric drawer"
          class="absolute inset-y-0 left-0 z-20 w-2 cursor-ew-resize border-l border-transparent transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          type="button"
          @pointerdown="startDrawerResize"
        />
        <SheetHeader class="items-start text-left">
          <SheetTitle class="text-2xl font-semibold tracking-normal">
            {{ editorMode === 'create' ? 'New metric' : 'Edit metric' }}
          </SheetTitle>
          <SheetDescription class="text-sm">
            Choose the metric type first, then maintain its governed definition and SQL contract.
          </SheetDescription>
        </SheetHeader>

        <div class="mt-6 space-y-5">
          <div class="grid gap-3 md:grid-cols-[260px_minmax(0,1fr)] md:items-end">
            <div class="min-w-0 space-y-2">
              <Label>Metric type</Label>
              <Select v-model="editorMetricType">
                <SelectTrigger class="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="atomic">
                    atomic
                  </SelectItem>
                  <SelectItem value="derived">
                    derived
                  </SelectItem>
                  <SelectItem value="custom_sql">
                    CustomSQL
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="flex min-h-10 items-center rounded-md border bg-muted/20 px-3 text-sm text-muted-foreground">
              Atomic and derived metrics use structured fields and generate Clickzetta SQL previews. CustomSQL metrics are defined by user-authored SQL.
            </div>
          </div>

          <ResizablePanelGroup v-if="editorMetricType !== 'custom_sql'" direction="horizontal" class="h-[560px] max-h-[60vh] gap-3">
            <ResizablePanel :default-size="62" :min-size="35" class="min-w-0">
              <Card class="flex h-full flex-col overflow-hidden">
                <CardHeader>
                  <CardTitle>Structured metric definition</CardTitle>
                </CardHeader>
                <CardContent class="flex-1 space-y-5 overflow-y-auto">
                  <section class="space-y-3">
                    <div class="text-sm font-medium text-muted-foreground">
                      Basic information
                    </div>
                    <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px_140px]">
                      <div class="min-w-0 space-y-2">
                        <Label>Metric key</Label>
                        <Select v-if="builderForm.type === 'atomic'" :model-value="builderForm.key" @update:model-value="handleStructuredMetricKeyChange">
                          <SelectTrigger class="w-full">
                            <SelectValue placeholder="Select metric key" />
                          </SelectTrigger>
                          <SelectContent>
                            <div v-if="atomicMetricKeyOptions.length === 0" class="px-2 py-1.5 text-sm text-muted-foreground">
                              No non-string columns available.
                            </div>
                            <SelectItem v-for="option in atomicMetricKeyOptions" :key="option.value" :value="option.value">
                              {{ option.label }}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <Input v-else :model-value="builderForm.key" class="font-mono text-xs" readonly />
                      </div>
                      <div class="min-w-0 space-y-2">
                        <Label>Name</Label>
                        <Input v-model="builderForm.name" />
                      </div>
                      <div class="min-w-0 space-y-2">
                        <Label>Status</Label>
                        <Select v-model="builderForm.status">
                          <SelectTrigger class="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="draft">
                              draft
                            </SelectItem>
                            <SelectItem value="active">
                              active
                            </SelectItem>
                            <SelectItem value="deprecated">
                              deprecated
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div class="min-w-0 space-y-2">
                        <Label>Unit</Label>
                        <Select v-model="builderForm.unit">
                          <SelectTrigger class="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem v-for="unit in unitOptions" :key="unit" :value="unit">
                              {{ unit }}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div class="space-y-2">
                      <Label>Description</Label>
                      <Textarea v-model="builderForm.description" class="max-h-40 min-h-20 overflow-y-auto resize-y" />
                    </div>
                  </section>

                  <section class="space-y-3">
                    <div class="text-sm font-medium text-muted-foreground">
                      Data context
                    </div>
                    <div class="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                      <div class="min-w-0 space-y-2">
                        <Label>Source table</Label>
                        <Select v-model="builderForm.source_table">
                          <SelectTrigger class="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem v-for="table in sourceTables" :key="table.name" :value="table.name">
                              {{ table.label }}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div class="min-w-0 space-y-2">
                        <Label>Dimensions</Label>
                        <Popover>
                          <PopoverTrigger as-child>
                            <Button variant="outline" class="w-full justify-start font-normal">
                              <span class="truncate">{{ summarizeSelection(builderForm.dimensions, 'Select dimensions') }}</span>
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent class="w-[340px] p-2" align="start">
                            <div class="max-h-[280px] space-y-1 overflow-auto">
                              <div v-if="tableColumnsQuery.isFetching.value" class="px-2 py-1.5 text-sm text-muted-foreground">
                                Loading columns...
                              </div>
                              <div v-else-if="dimensionColumnOptions.length === 0" class="px-2 py-1.5 text-sm text-muted-foreground">
                                No string or boolean columns available.
                              </div>
                              <button
                                v-for="column in dimensionColumnOptions"
                                :key="column.column_name"
                                class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                                type="button"
                                @click="toggleDimension(column.column_name)"
                              >
                                <Checkbox :model-value="builderForm.dimensions.includes(column.column_name)" />
                                <span class="min-w-0 flex-1 truncate font-mono">{{ column.column_name }}</span>
                                <span class="text-xs text-muted-foreground">{{ column.data_type }}</span>
                              </button>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                    <div class="space-y-2">
                      <Label>Metric-level filters</Label>
                      <Input v-model="builderForm.filters" class="font-mono text-xs" />
                    </div>
                  </section>

                  <section class="space-y-3">
                    <div class="text-sm font-medium text-muted-foreground">
                      Calculation window
                    </div>
                    <div class="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_160px_190px]">
                      <div class="min-w-0 space-y-2">
                        <Label>Dependencies</Label>
                        <Popover>
                          <PopoverTrigger as-child>
                            <Button variant="outline" class="w-full justify-start font-normal">
                              <span class="truncate">{{ summarizeSelection(builderForm.dependencies, 'Select up to 2 atomic metrics') }}</span>
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent class="w-[320px] p-2" align="start">
                            <div class="space-y-1">
                              <button
                                v-for="metric in atomicMetricOptions"
                                :key="metric.key"
                                class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                                type="button"
                                @click="toggleDependency(metric.key)"
                              >
                                <Checkbox :model-value="builderForm.dependencies.includes(metric.key)" />
                                <span class="min-w-0 flex-1 truncate">{{ metric.name }}</span>
                                <span class="font-mono text-xs text-muted-foreground">{{ metric.key }}</span>
                              </button>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div class="min-w-0 space-y-2">
                        <Label>Last days</Label>
                        <Select v-model="builderForm.lookback_days">
                          <SelectTrigger class="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem v-for="days in lookbackDayOptions" :key="days" :value="days">
                              {{ days }} days
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div class="min-w-0 space-y-2">
                        <Label>Exclude recent days</Label>
                        <Select v-model="builderForm.exclude_recent_days">
                          <SelectTrigger class="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem v-for="days in excludeRecentDayOptions" :key="days" :value="days">
                              {{ days }} days
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div class="space-y-2">
                      <div class="flex items-center justify-between gap-2">
                        <Label>Formula</Label>
                        <Button variant="outline" size="sm" :disabled="suggestFormulaMutation.isPending.value" @click="suggestFormula">
                          <WandSparkles class="size-4" />
                          AI Suggestion
                        </Button>
                      </div>
                      <Input v-model="builderForm.formula" class="font-mono" placeholder="ad_spend / NULLIF(ad_sales, 0)" />
                    </div>
                  </section>

                  <Button :disabled="saveMetricMutation.isPending.value" @click="saveBuilderMetric">
                    <Save class="size-4" />
                    Save metric
                  </Button>
                </CardContent>
              </Card>
            </ResizablePanel>

            <ResizableHandle with-handle class="mx-1" />

            <ResizablePanel :default-size="38" :min-size="25" class="min-w-0">
              <Card class="flex h-full flex-col overflow-hidden">
                <CardHeader class="flex flex-row items-center justify-between">
                  <CardTitle>Clickzetta SQL preview</CardTitle>
                  <Button variant="outline" size="sm" :disabled="!compileResult?.sql" @click="copyText('builder-sql', compileResult?.sql)">
                    <Check v-if="copied === 'builder-sql'" class="size-4" />
                    <Copy v-else class="size-4" />
                    Copy
                  </Button>
                </CardHeader>
                <CardContent class="flex-1 overflow-hidden">
                  <pre class="h-full overflow-auto rounded-md border bg-muted/30 p-4 text-xs leading-5"><code>{{ compileResult?.sql || 'Complete the metric form to preview SQL.' }}</code></pre>
                  <div v-if="compileResult?.warnings.length" class="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    {{ compileResult.warnings.join(' ') }}
                  </div>
                </CardContent>
              </Card>
            </ResizablePanel>
          </ResizablePanelGroup>

          <Card v-else>
            <CardHeader>
              <CardTitle>CustomSQL metric definition</CardTitle>
            </CardHeader>
            <CardContent>
              <div class="flex min-h-[320px] flex-col items-center justify-center rounded-md border border-dashed bg-muted/20 p-8 text-center">
                <FileCode2 class="mb-4 size-8 text-muted-foreground" />
                <div class="text-lg font-medium">
                  To-do
                </div>
                <p class="mt-2 max-w-[620px] text-sm text-muted-foreground">
                  CustomSQL editing will move to a SQL-first flow: users submit authored SQL, the backend parses it, and the parsed source tables, dimensions, dependencies, and output columns are returned to populate metric metadata.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Feature usage</CardTitle>
            </CardHeader>
            <CardContent>
              <div v-if="selectedMetricApplications.length" class="grid gap-2 md:grid-cols-2">
                <div v-for="application in selectedMetricApplications" :key="application.id" class="rounded-md border p-3 text-sm">
                  <div class="font-medium">
                    {{ application.feature_name }}
                  </div>
                  <div class="font-mono text-xs text-muted-foreground">
                    {{ application.route_path || application.service_name }}
                  </div>
                </div>
              </div>
              <div v-else class="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                No tracked applications yet.
              </div>
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  </BasicPage>
</template>

<route lang="yml">
meta:
  auth: true
</route>
