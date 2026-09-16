<script setup lang="ts">
import { BarChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { formatExact, formatMetric } from '../format'
import { chartTokens } from './chart-theme'

/**
 * A grouped bar chart: one bar per series per category.
 *
 * The comparisons that drive the Performance page - our campaigns vs the account
 * baseline, before vs after a first touch - are two series of one unit each, so
 * they share this component instead of growing a third copy of the ECharts setup.
 * A category label may carry a newline, which is how a campaign count is printed
 * under the label instead of hiding in a tooltip.
 */
const props = defineProps<{
  title: string
  categories: string[]
  /** A `null` value draws a gap: the metric is undefined for that category, not zero. */
  series: { name: string, values: (number | null)[] }[]
  format?: 'number' | 'currency' | 'percent'
  /** Rendered under the chart: the window or the caveat the numbers depend on. */
  caption?: string
  /**
   * Body height class. A chart that shares a row with a taller card needs the same
   * height, or the shorter one leaves a column of empty space under its bars.
   */
  heightClass?: string
}>()

use([BarChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

const chartEl = ref<HTMLElement>()
let chart: echarts.ECharts | undefined

function unit(value: number | null | undefined, exact: boolean): string {
  if (value === null || value === undefined)
    return '—'
  const n = Number(value)
  if (props.format === 'percent')
    return `${n.toFixed(1)}%`
  return exact ? formatExact(n, { currency: props.format === 'currency' }) : formatMetric(n, { currency: props.format === 'currency' })
}

function render() {
  if (!chartEl.value || props.categories.length === 0 || props.series.length === 0)
    return
  // The canvas sits behind a v-if, so the container changes identity whenever the
  // chart goes empty and comes back (a new action, a new date range). Reusing the
  // cached instance would keep drawing into the detached element.
  if (chart && chart.getDom() !== chartEl.value) {
    chart.dispose()
    chart = undefined
  }
  chart ||= echarts.init(chartEl.value)
  const { palette, muted, border, background } = chartTokens()

  chart.setOption({
    color: palette,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: unknown) => unit(v as number | null, true) },
    legend: { bottom: 0, left: 'center', itemWidth: 10, itemHeight: 10, textStyle: { color: muted, fontSize: 11 } },
    // ECharts 6 replaced `containLabel` with the outer-bounds pair below; using
    // the old option logs a console warning and silently drops the behaviour.
    grid: { top: 16, left: 8, right: 8, bottom: 34, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    xAxis: {
      type: 'category',
      data: props.categories,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: border } },
      axisLabel: { color: muted, fontSize: 11, lineHeight: 14, interval: 0 },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: muted, fontSize: 10, formatter: (v: number) => unit(v, false) },
      splitLine: { lineStyle: { color: border } },
    },
    series: props.series.map(series => ({
      name: series.name,
      type: 'bar',
      barMaxWidth: 36,
      itemStyle: { borderRadius: [3, 3, 0, 0], borderColor: background, borderWidth: 1 },
      data: series.values,
    })),
  })
}

function resize() {
  chart?.resize()
}

onMounted(() => {
  render()
  window.addEventListener('resize', resize)
})
// flush: 'post' is load-bearing: the categories arrive after mount (they come from
// a server aggregate), so a pre-flush watcher would run before the v-if has created
// the canvas and the chart would silently never appear.
watch(() => [props.categories, props.series, props.format], render, { deep: true, flush: 'post' })
onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  chart?.dispose()
})
</script>

<template>
  <div class="flex flex-col gap-1">
    <p class="text-sm font-medium">
      {{ title }}
    </p>
    <div v-if="categories.length && series.length" ref="chartEl" class="w-full" :class="heightClass ?? 'h-44'" role="img" :aria-label="title" />
    <div v-else class="flex items-center justify-center text-sm text-muted-foreground" :class="heightClass ?? 'h-44'">
      该区间内没有广告活动
    </div>
    <p v-if="caption" class="text-xs text-muted-foreground">
      {{ caption }}
    </p>
  </div>
</template>
