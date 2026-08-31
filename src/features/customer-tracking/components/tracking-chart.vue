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
    color: ['#3b82f6', '#2563eb', '#64748b', '#94a3b8'],
    title: { text: props.title, left: 0, top: 0, textStyle: { fontSize: 12, fontWeight: 500, color: '#64748b' } },
    tooltip: { trigger: 'axis' },
    legend: { top: 0, right: 0, textStyle: { fontSize: 12 } },
    grid: { top: 34, left: 42, right: 16, bottom: 24 },
    xAxis: { type: 'category', data: labels, boundaryGap: false, axisLabel: { color: '#94a3b8', fontSize: 10 } },
    yAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: '#e2e8f0' } } },
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
