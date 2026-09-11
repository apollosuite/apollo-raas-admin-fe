<script setup lang="ts">
/* eslint-disable style/max-statements-per-line */
import { LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TitleComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{ title?: string, seed?: number, availableMetrics?: string[] }>(), { title: '趋势', seed: 1, availableMetrics: () => ['Spend', 'Sales'] })

use([LineChart, GridComponent, LegendComponent, TooltipComponent, TitleComponent, CanvasRenderer])

const chartEl = ref<HTMLElement>()
let chart: echarts.ECharts | undefined
const selectedMetrics = ref<string[]>(props.availableMetrics.slice(0, 2))

function toggleMetric(metric: string) {
  if (selectedMetrics.value.includes(metric)) {
    if (selectedMetrics.value.length > 1)
      selectedMetrics.value = selectedMetrics.value.filter(item => item !== metric)
  }
  else if (selectedMetrics.value.length < 4) {
    selectedMetrics.value = [...selectedMetrics.value, metric]
  }
  renderChart()
}

function renderChart() {
  if (!chartEl.value)
    return
  chart ||= echarts.init(chartEl.value)
  const cssVarColor = (name: string) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const ctx = canvas.getContext('2d')
      if (!ctx)
        return value
      ctx.fillStyle = value
      ctx.fillRect(0, 0, 1, 1)
      const d = ctx.getImageData(0, 0, 1, 1).data
      return `rgb(${d[0]}, ${d[1]}, ${d[2]})`
    }
    catch {
      return value
    }
  }
  const palette = ['--chart-1', '--chart-2', '--chart-3', '--chart-4'].map(cssVarColor)
  const muted = cssVarColor('--muted-foreground')
  const border = cssVarColor('--border')
  const labels = Array.from({ length: 30 }, (_, i) => `${i + 1}`)
  const series = selectedMetrics.value.map((metric, metricIndex) => ({
    name: metric,
    type: 'line' as const,
    smooth: true,
    showSymbol: false,
    data: labels.map((_, i) => Math.round(500 + metricIndex * 250 + ((i * (17 + metricIndex * 7) + props.seed * (31 + metricIndex * 11)) % (260 + metricIndex * 90)))),
    lineStyle: { width: 2 },
  }))
  chart.setOption({
    color: palette,
    title: { text: props.title, left: 0, top: 0, textStyle: { fontSize: 12, fontWeight: 500, color: muted } },
    tooltip: { trigger: 'axis' },
    legend: { top: 0, right: 0, textStyle: { fontSize: 12 } },
    grid: { top: 34, left: 42, right: 16, bottom: 24 },
    xAxis: { type: 'category', data: labels, boundaryGap: false, axisLabel: { color: muted, fontSize: 10 } },
    yAxis: { type: 'value', axisLabel: { color: muted, fontSize: 10 }, splitLine: { lineStyle: { color: border } } },
    series,
  })
}

function resize() { chart?.resize() }
onMounted(() => { renderChart(); window.addEventListener('resize', resize) })
watch(() => [props.title, props.seed, props.availableMetrics], () => {
  selectedMetrics.value = selectedMetrics.value.filter(metric => props.availableMetrics.includes(metric)).slice(0, 4)
  if (!selectedMetrics.value.length)
    selectedMetrics.value = props.availableMetrics.slice(0, 2)
  renderChart()
})
onBeforeUnmount(() => { window.removeEventListener('resize', resize); chart?.dispose() })
</script>

<template>
  <div class="space-y-2">
    <div v-if="availableMetrics.length > 2" class="flex flex-wrap gap-2 text-xs">
      <label v-for="metric in availableMetrics" :key="metric" class="flex items-center gap-1 rounded border px-2 py-1">
        <input type="checkbox" :checked="selectedMetrics.includes(metric)" :disabled="!selectedMetrics.includes(metric) && selectedMetrics.length >= 4" @change="toggleMetric(metric)">
        {{ metric }}
      </label>
      <span class="self-center text-muted-foreground">Select up to 4 metrics</span>
    </div>
    <div ref="chartEl" class="h-64 w-full" role="img" :aria-label="title" />
  </div>
</template>
