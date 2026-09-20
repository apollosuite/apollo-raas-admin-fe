<script setup lang="ts">
/* eslint-disable style/max-statements-per-line */
import { LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TitleComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { TrendMetric } from '../performance-analytics'

import { formatMetric } from '../format'
import { MAX_TREND_METRICS, toggleTrendMetric } from '../performance-analytics'
import { chartTokens } from './chart-theme'

/**
 * A daily trend line over one or more metrics.
 *
 * The rows come from the page's own fact export (one row per date), so the chart plots
 * the same numbers the tables show.
 *
 * Metrics are split into one panel per unit - money, counts, rates - and each panel
 * carries its own y-axis. One shared axis cannot show 2 x 10^8 impressions and a 3%
 * ACoS at once: whatever the axis is scaled to, the other series is drawn flat against
 * the baseline and reads as "nothing happened". A panel per unit keeps every series
 * legible, and stacking the panels in a single chart keeps one date lined up across
 * them with one tooltip reporting every metric.
 */
const props = withDefaults(defineProps<{
  title?: string
  /** One row per date, carrying `date` plus the keys named by `metrics`. */
  rows: Record<string, unknown>[]
  metrics: readonly TrendMetric[]
  /** Keys to select on first render. Defaults to the first two metrics. */
  defaultMetrics?: readonly string[]
}>(), { title: '', defaultMetrics: undefined })

use([LineChart, GridComponent, LegendComponent, TooltipComponent, TitleComponent, CanvasRenderer])

const chartEl = ref<HTMLElement>()
let chart: echarts.ECharts | undefined

/** Panels are stacked in this order: the money measure leads, the rates close. */
const PANEL_UNITS = ['currency', 'number', 'percent'] as const
type PanelUnit = (typeof PANEL_UNITS)[number]
const PANEL_LABEL: Record<PanelUnit, string> = { currency: '金额', number: '数量', percent: '比率' }
/** Panel geometry in pixels; the container height follows the panel count. */
const PANEL_HEIGHT = 150
const PANEL_GAP = 22
const TOP = 34
const BOTTOM = 26
const LEFT = 56
const RIGHT = 20

const selectedKeys = ref<string[]>([...props.defaultMetrics ?? props.metrics.slice(0, 2).map(m => m.key)])

function metricFor(key: string): TrendMetric | undefined {
  return props.metrics.find(m => m.key === key)
}

/** Which axis a metric belongs on: anything sharing a unit can share a scale. */
function unitOf(metric: TrendMetric): PanelUnit {
  return metric.percent ? 'percent' : metric.currency ? 'currency' : 'number'
}

interface Panel { unit: PanelUnit, metrics: TrendMetric[] }

/** The panels the current selection needs, in stacking order, each with its metrics. */
function panelGroups(keys: readonly string[]): Panel[] {
  const byUnit = new Map<PanelUnit, TrendMetric[]>()
  for (const key of keys) {
    const metric = metricFor(key)
    if (!metric)
      continue
    const unit = unitOf(metric)
    byUnit.set(unit, [...byUnit.get(unit) ?? [], metric])
  }
  return PANEL_UNITS.filter(unit => byUnit.has(unit)).map(unit => ({ unit, metrics: byUnit.get(unit)! }))
}

/** Pixel height of the plot area, so a panel is never squeezed by its neighbours. */
function chartHeight(panels: Panel[]) {
  return TOP + BOTTOM + panels.length * PANEL_HEIGHT + Math.max(0, panels.length - 1) * PANEL_GAP
}

/** A metric value in its own unit, compact (K/M/B) like every other chart's tooltip. */
function formatValue(key: string, value: unknown): string {
  const metric = metricFor(key)
  const n = Number(value)
  if (!Number.isFinite(n))
    return '—'
  if (metric?.percent)
    return `${n.toFixed(1)}%`
  return formatMetric(n, { currency: metric?.currency })
}

/** The tick label for one panel, in that panel's own unit. */
function formatAxis(unit: PanelUnit, value: number): string {
  if (unit === 'percent')
    return `${value.toFixed(1)}%`
  return formatMetric(value, { currency: unit === 'currency' })
}

/**
 * One metric checkbox. The selection is the only source of truth, so the box is
 * written back from it after every click: at the cap a fast click can land on a box
 * the just-finished render would have disabled, and Vue does not patch a `checked`
 * prop whose bound value did not change.
 */
function toggleMetric(key: string, event: Event) {
  const box = event.target as HTMLInputElement
  selectedKeys.value = toggleTrendMetric(selectedKeys.value, key)
  box.checked = selectedKeys.value.includes(key)
}

function renderChart() {
  if (!chartEl.value)
    return
  // See GroupedBarChart: the canvas is behind a v-if, so a container that was
  // removed and re-added needs a fresh instance.
  if (chart && chart.getDom() !== chartEl.value) {
    chart.dispose()
    chart = undefined
  }
  chart ||= echarts.init(chartEl.value)
  const { palette, muted, border } = chartTokens()
  const dates = props.rows.map(row => String(row.date ?? ''))
  const panels = panelGroups(selectedKeys.value)
  // One flat series list, in panel order, so a series index maps back to its metric.
  const seriesPlan = panels.flatMap((panel, panelIndex) =>
    panel.metrics.map(metric => ({ key: metric.key, metric, panelIndex })),
  )
  const axisStyle = { color: muted, fontSize: 10 }

  // `notMerge` (the second argument): ECharts merges by default, so a series or a
  // panel that is no longer selected would stay in the option and keep being drawn -
  // unchecking the last metric used to leave its curve on screen. Every render builds
  // the complete option, so replacing is the only correct merge.
  chart.setOption({
    color: palette,
    title: { text: props.title, left: 0, top: 0, textStyle: { fontSize: 12, fontWeight: 500, color: muted } },
    legend: { top: 0, right: 0, textStyle: { fontSize: 12, color: muted } },
    // Linked pointers: hovering any panel draws the same date in all of them, which is
    // what makes a spike in one unit readable against the others.
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: border } },
      // Built from the hovered row rather than from `params`, so the tooltip reports
      // every selected metric even though the pointer sits on one panel.
      formatter: (params: any) => {
        const items = Array.isArray(params) ? params : [params]
        if (!items.length)
          return ''
        const row = props.rows[items[0].dataIndex] ?? {}
        const marker = (color: string) => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:4px"></span>`
        // Compact (K/M/B) like every other chart's tooltip: four exact figures
        // ("202,942,562") in one tooltip is a wall of digits nobody reads.
        const lines = seriesPlan.map((s, index) => `${marker(palette[index % palette.length] ?? muted)}${s.metric.label}: ${formatValue(s.key, row[s.key])}`)
        return `<div style="margin-bottom:2px">${items[0].axisValue}</div>${lines.join('<br>')}`
      },
    },
    grid: panels.map((_, index) => ({
      top: TOP + index * (PANEL_HEIGHT + PANEL_GAP),
      height: PANEL_HEIGHT,
      left: LEFT,
      right: RIGHT,
    })),
    xAxis: panels.map((_, index) => ({
      type: 'category' as const,
      gridIndex: index,
      data: dates,
      boundaryGap: false,
      // Only the bottom panel labels the dates; the linked pointer carries the reading up.
      axisLabel: { show: index === panels.length - 1, ...axisStyle },
      axisTick: { show: index === panels.length - 1 },
      axisLine: { lineStyle: { color: border } },
    })),
    yAxis: panels.map((panel, index) => ({
      type: 'value' as const,
      gridIndex: index,
      name: PANEL_LABEL[panel.unit],
      nameLocation: 'end',
      nameGap: 8,
      nameTextStyle: { color: muted, fontSize: 11, fontWeight: 500, align: 'left' },
      axisLabel: { ...axisStyle, formatter: (value: number) => formatAxis(panel.unit, value) },
      splitLine: { lineStyle: { color: border } },
    })),
    series: seriesPlan.map(s => ({
      name: s.metric.label,
      type: 'line' as const,
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 2 },
      xAxisIndex: s.panelIndex,
      yAxisIndex: s.panelIndex,
      data: props.rows.map(row => Number(row[s.key] ?? 0)),
    })),
  }, true)
  // A panel was added or removed: the container must grow with it before the next paint.
  chart.resize()
}

function resize() { chart?.resize() }
onMounted(() => { renderChart(); window.addEventListener('resize', resize) })
// flush: 'post' matters: the canvas sits behind a v-if, so a watcher that runs
// before the re-render would see no element to draw into on the first data load.
watch(() => [props.title, props.rows, props.metrics], renderChart, { deep: true, flush: 'post' })
watch(selectedKeys, renderChart, { deep: true, flush: 'post' })
onBeforeUnmount(() => { window.removeEventListener('resize', resize); chart?.dispose() })
</script>

<template>
  <div class="space-y-2">
    <div v-if="metrics.length > 2" class="flex flex-wrap items-center gap-2 text-xs">
      <label v-for="metric in metrics" :key="metric.key" class="flex cursor-pointer items-center gap-1 rounded border px-2 py-1" :class="selectedKeys.includes(metric.key) ? 'border-primary/60 text-foreground' : 'text-muted-foreground'">
        <input type="checkbox" :checked="selectedKeys.includes(metric.key)" :disabled="!selectedKeys.includes(metric.key) && selectedKeys.length >= MAX_TREND_METRICS" @change="toggleMetric(metric.key, $event)">
        {{ metric.label }}
      </label>
      <span class="self-center text-muted-foreground">最多可选 {{ MAX_TREND_METRICS }} 个指标 · 金额 / 数量 / 比率分栏显示</span>
    </div>
    <div v-if="!rows.length" class="flex h-64 items-center justify-center text-sm text-muted-foreground">
      该区间内没有可按天统计的数据
    </div>
    <div v-else-if="!selectedKeys.length" class="flex h-24 items-center justify-center text-sm text-muted-foreground">
      请至少选择一个指标
    </div>
    <div v-else ref="chartEl" class="w-full" :style="{ height: `${chartHeight(panelGroups(selectedKeys))}px` }" role="img" :aria-label="title" />
  </div>
</template>
