<script setup lang="ts">
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { formatExact, formatMetric } from '../format'
import { chartTokens } from './chart-theme'

/**
 * Volume and breadth on one time axis.
 *
 * The tool page used to show a 100% daily stack of organizations, which answered "who
 * held what share of today" - a question nobody has, and one whose normalization made a
 * 137-call peak look identical to a 1-call Sunday. What a reader needs is whether a tool
 * is being used more or less, and whether that is more organizations joining in or the
 * same ones calling harder. That is a call count (bars, left axis) against the number of
 * active organizations and profiles (lines, right axis).
 */
const props = defineProps<{
  /** Every day of the range, zero-filled - a missing day is a real zero, not a gap. */
  days: { date: string, calls: number, orgs: number, profiles: number }[]
  title: string
  caption?: string
  heightClass?: string
}>()

use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, CanvasRenderer])

const chartEl = ref<HTMLElement>()
let chart: echarts.ECharts | undefined

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

  chart.setOption({
    tooltip: {
      trigger: 'axis',
      formatter: (params: any[]) => {
        const day = props.days[params[0]?.dataIndex ?? 0]
        if (!day)
          return ''
        return [
          `<div style="margin-bottom:2px">${day.date}</div>`,
          `调用量：${formatExact(day.calls, {})}`,
          `活跃组织：${day.orgs}`,
          `活跃 Profile：${day.profiles}`,
        ].join('<br>')
      },
    },
    // The legend sits at the bottom on purpose: this chart names both of its axes at the
    // top of the plot (调用量 left, 活跃数 right), and a top-right legend printed itself
    // straight over the right axis name and its labels.
    legend: {
      bottom: 0,
      left: 'center',
      textStyle: { color: muted, fontSize: 11 },
      itemHeight: 8,
      itemWidth: 12,
    },
    grid: { top: 28, left: 54, right: 46, bottom: 56 },
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
        name: '调用量',
        nameTextStyle: { color: muted, fontSize: 11, align: 'right' },
        axisLabel: { color: muted, fontSize: 10, formatter: (v: number) => formatMetric(v, {}) },
        splitLine: { lineStyle: { color: border } },
      },
      {
        type: 'value',
        name: '活跃数',
        nameTextStyle: { color: muted, fontSize: 11, align: 'left' },
        axisLabel: { color: muted, fontSize: 10 },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '调用量',
        type: 'bar',
        data: props.days.map(day => day.calls),
        itemStyle: { color: palette[0], borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 22,
      },
      {
        name: '活跃组织',
        type: 'line',
        yAxisIndex: 1,
        data: props.days.map(day => day.orgs),
        smooth: false,
        symbolSize: 5,
        lineStyle: { width: 2, color: palette[1] },
        itemStyle: { color: palette[1] },
      },
      {
        name: '活跃 Profile',
        type: 'line',
        yAxisIndex: 1,
        data: props.days.map(day => day.profiles),
        smooth: false,
        symbol: 'none',
        lineStyle: { width: 2, type: 'dashed', color: palette[2] },
        itemStyle: { color: palette[2] },
      },
    ],
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
// flush: 'post' is load-bearing: the days arrive from a query after mount, so a
// pre-flush watcher would run before the v-if has created the canvas.
watch(() => [props.days, props.title], render, { deep: true, flush: 'post' })
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
    <div v-if="days.length" ref="chartEl" class="w-full" :class="heightClass ?? 'h-72'" role="img" :aria-label="title" />
    <div v-else class="flex items-center justify-center text-sm text-muted-foreground" :class="heightClass ?? 'h-72'">
      该区间内这个工具没有被调用
    </div>
    <p v-if="caption" class="text-xs text-muted-foreground">
      {{ caption }}
    </p>
  </div>
</template>
