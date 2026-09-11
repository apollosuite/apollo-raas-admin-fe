<script setup lang="ts">
import { BarChart, FunnelChart, PieChart } from 'echarts/charts'
import { GraphicComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  title: string
  data: { name: string, value: number }[]
  type?: 'pie' | 'bar' | 'funnel'
}>()

use([PieChart, BarChart, FunnelChart, GraphicComponent, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

const chartEl = ref<HTMLElement>()
let chart: echarts.ECharts | undefined
const total = computed(() => props.data.reduce((n, d) => n + d.value, 0))

function cssVarColor(name: string) {
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

function fmt(v: number) {
  return v >= 1000 ? `${Math.round(v / 1000)}K` : String(v)
}

function render() {
  if (!chartEl.value)
    return
  chart ||= echarts.init(chartEl.value)
  const palette = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'].map(cssVarColor)
  const muted = cssVarColor('--muted-foreground')
  const foreground = cssVarColor('--foreground')
  const background = cssVarColor('--background')

  let option: any

  if (props.type === 'funnel') {
    option = {
      color: palette,
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const i = p.dataIndex
          const value = p.value
          const prev = i > 0 ? props.data[i - 1].value : null
          const pct = prev !== null ? ` (${((value / prev) * 100).toFixed(1)}% of prior)` : ''
          return `${p.name}: ${fmt(value)}${pct}`
        },
      },
      series: [{
        name: props.title,
        type: 'funnel',
        left: '8%',
        width: '62%',
        top: 4,
        bottom: 4,
        minSize: '4%',
        maxSize: '100%',
        sort: 'descending',
        gap: 4,
        label: { show: true, position: 'right', formatter: (p: any) => `${p.name}: ${fmt(p.value)}`, color: foreground, fontSize: 11 },
        itemStyle: { borderColor: background, borderWidth: 2 },
        data: props.data,
      }],
    }
  }
  else if (props.type === 'bar') {
    option = {
      color: palette,
      tooltip: { trigger: 'axis', valueFormatter: (v: number) => fmt(v) },
      grid: { top: 12, left: 48, right: 16, bottom: 30 },
      xAxis: { type: 'category', data: props.data.map(d => d.name), axisLabel: { color: muted, fontSize: 11 } },
      yAxis: { type: 'value', axisLabel: { color: muted, fontSize: 10, formatter: (v: number) => fmt(v) }, splitLine: { lineStyle: { color: cssVarColor('--border') } } },
      series: [{
        name: props.title,
        type: 'bar',
        colorBy: 'data',
        barWidth: '46%',
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        data: props.data.map(d => d.value),
      }],
    }
  }
  else {
    option = {
      color: palette,
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, left: 'center', itemWidth: 10, itemHeight: 10, textStyle: { color: muted, fontSize: 11 } },
      series: [{
        name: props.title,
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '42%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: background, borderWidth: 2 },
        label: { show: false },
        labelLine: { show: false },
        emphasis: { label: { show: true, fontSize: 12, fontWeight: 'bold', color: foreground } },
        data: props.data,
      }],
      graphic: [{
        type: 'text',
        left: 'center',
        top: '36%',
        style: { text: String(total.value), textAlign: 'center', fill: foreground, fontSize: 20, fontWeight: 600 },
      }],
    }
  }

  chart.setOption(option)
}

function resize() {
  chart?.resize()
}
onMounted(() => {
  render()
  window.addEventListener('resize', resize)
})
watch(() => [props.title, props.data, props.type], render, { deep: true })
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
    <div ref="chartEl" class="h-44 w-full" role="img" :aria-label="title" />
  </div>
</template>
