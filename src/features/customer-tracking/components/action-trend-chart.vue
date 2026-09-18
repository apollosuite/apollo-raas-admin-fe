<script setup lang="ts">
import { LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { ActionTrendDay, ActionTrendMetric } from '../performance-analytics'

import { formatMetric } from '../format'
import { chartTokens } from './chart-theme'

/**
 * What one action did, against what its campaigns earned - two axes, one time range.
 *
 * Counts and money carry different units and often different magnitudes (measured: 279
 * campaigns a day against 58,296 targetings), so the left axis measures what the action
 * did and the right axis measures the money of the campaigns it touched. Each axis shows
 * exactly one measure at a time: two counts on one axis can be 209x apart, which draws the
 * smaller one flat along the floor, and a ratio never shares an axis with money for the
 * same reason. The reader switches a measure rather than stacking one on the other.
 */
const props = defineProps<{
  /** Every day of the range, zero-filled, so a quiet day is a zero and not a gap. */
  days: ActionTrendDay[]
  leftMetrics: ActionTrendMetric[]
  rightMetrics: ActionTrendMetric[]
  /** The one measure on the counts axis; the select switches it. */
  left: string
  right: string
  title: string
  caption?: string
  heightClass?: string
}>()

const emit = defineEmits<{
  (e: 'update:left', value: string): void
  (e: 'update:right', value: string): void
}>()

use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const chartEl = ref<HTMLElement>()
let chart: echarts.ECharts | undefined

const metricOf = (metrics: readonly ActionTrendMetric[], key: string) => metrics.find(m => m.key === key)
const axisName = (metric: ActionTrendMetric | undefined) => metric?.label ?? ''

function formatValue(value: number, metric: ActionTrendMetric | undefined): string {
  if (metric?.percent)
    return `${value.toFixed(1)}%`
  if (metric?.currency)
    return formatMetric(value, { currency: true })
  return formatMetric(value, {})
}

function render() {
  if (!chartEl.value || props.days.length === 0)
    return
  // The canvas sits behind a v-if, so a container that was removed and re-added needs a
  // fresh instance rather than one still drawing into the detached element.
  if (chart && chart.getDom() !== chartEl.value) {
    chart.dispose()
    chart = undefined
  }
  chart ||= echarts.init(chartEl.value)
  const { muted, border, foreground, palette } = chartTokens()
  const labels = props.days.map(day => day.date.slice(5))
  const leftMetric = metricOf(props.leftMetrics, props.left)
  const rightMetric = metricOf(props.rightMetrics, props.right)

  // Declared with an explicit shape: the option object is untyped, so leaving this to
  // inference narrows the array to the first element and every push after it fails.
  const series: Record<string, unknown>[] = [
    {
      name: leftMetric ? leftMetric.label : props.left,
      type: 'line' as const,
      yAxisIndex: 0,
      data: props.days.map(day => Number(day[props.left] ?? 0)),
      symbol: 'circle',
      symbolSize: 4,
      lineStyle: { width: 2, color: palette[0] },
      itemStyle: { color: palette[0] },
      z: 3,
    },
  ]
  series.push({
    name: rightMetric ? rightMetric.label : props.right,
    type: 'line' as const,
    yAxisIndex: 1,
    data: props.days.map(day => Number(day[props.right] ?? 0)),
    symbol: 'circle',
    symbolSize: 4,
    lineStyle: { width: 2, color: palette[2] },
    itemStyle: { color: palette[2] },
    z: 3,
  })

  chart.setOption({
    tooltip: {
      trigger: 'axis',
      formatter: (params: any[]) => {
        const day = props.days[params[0]?.dataIndex ?? 0]
        if (!day)
          return ''
        const lines = [`<div style="margin-bottom:2px">${day.date}</div>`]
        for (const metric of [leftMetric, rightMetric]) {
          if (metric)
            lines.push(`${metric.label}：${formatValue(Number(day[metric.key] ?? 0), metric)}`)
        }
        return lines.join('<br>')
      },
    },
    // Bottom centre, never the top right: the right axis names itself there.
    legend: { bottom: 0, left: 'center', textStyle: { color: muted, fontSize: 11 }, itemHeight: 8, itemWidth: 12 },
    grid: { top: 28, left: 62, right: 62, bottom: 56 },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { color: muted, fontSize: 10, interval: labels.length > 20 ? 2 : 0 },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: border } },
    },
    yAxis: [
      {
        type: 'value',
        name: axisName(leftMetric),
        nameTextStyle: { color: muted, fontSize: 11, align: 'right' },
        axisLabel: { color: muted, fontSize: 10, formatter: (v: number) => formatMetric(v, {}) },
        splitLine: { lineStyle: { color: border } },
      },
      {
        type: 'value',
        name: axisName(rightMetric),
        nameTextStyle: { color: muted, fontSize: 11, align: 'left' },
        axisLabel: {
          color: muted,
          fontSize: 10,
          formatter: (v: number) => (rightMetric?.percent ? `${v}%` : formatMetric(v, { currency: rightMetric?.currency })),
        },
        splitLine: { show: false },
      },
    ],
    series,
    textStyle: { color: foreground },
  }, { notMerge: true })
}

function resize() {
  chart?.resize()
}

onMounted(() => {
  render()
  window.addEventListener('resize', resize)
})
// flush: 'post' is load-bearing: the days arrive from queries after mount, so a pre-flush
// watcher would run before the v-if has created the canvas.
watch(() => [props.days, props.left, props.right, props.title], render, { deep: true, flush: 'post' })
onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  chart?.dispose()
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm font-medium">
        {{ title }}
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <UiSelect :model-value="left" @update:model-value="(v: unknown) => emit('update:left', String(v))">
          <UiSelectTrigger class="h-8 w-[190px]">
            <UiSelectValue />
          </UiSelectTrigger>
          <UiSelectContent>
            <UiSelectItem v-for="metric in leftMetrics" :key="metric.key" :value="metric.key">
              {{ metric.label }}
            </UiSelectItem>
          </UiSelectContent>
        </UiSelect>
        <UiSelect :model-value="right" @update:model-value="(v: unknown) => emit('update:right', String(v))">
          <UiSelectTrigger class="h-8 w-[150px]">
            <UiSelectValue />
          </UiSelectTrigger>
          <UiSelectContent>
            <UiSelectItem v-for="metric in rightMetrics" :key="metric.key" :value="metric.key">
              {{ metric.label }}
            </UiSelectItem>
          </UiSelectContent>
        </UiSelect>
      </div>
    </div>
    <div v-if="days.length" ref="chartEl" class="w-full" :class="heightClass ?? 'h-80'" role="img" :aria-label="title" />
    <div v-else class="flex items-center justify-center text-sm text-muted-foreground" :class="heightClass ?? 'h-80'">
      该区间本功能没有数据
    </div>
    <p v-if="caption" class="text-xs text-muted-foreground">
      {{ caption }}
    </p>
  </div>
</template>
