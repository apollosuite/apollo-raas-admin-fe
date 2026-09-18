<script setup lang="ts">
import { ScatterChart } from 'echarts/charts'
import { DataZoomComponent, GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { formatExact, formatMetric } from '../format'
import { chartTokens } from './chart-theme'

/**
 * A scatter of two measures, one point per entity.
 *
 * The Agent page's distributions have no head to name - the biggest organization holds
 * 4% of the calls - so a share-of-total chart says nothing. What a reviewer needs is the
 * shape of the population and the points that sit outside it, and only a scatter shows
 * both at once: the diagonal is normal usage, the points far off it are the finding.
 */
const props = defineProps<{
  title: string
  xLabel: string
  yLabel: string
  /** One point per entity; `size` and `color` let one chart carry four measures. */
  points: { name: string, x: number, y: number, size?: number, color?: string, detail?: string }[]
  /** Reference values drawn across the plot, e.g. the population's p95 for the y axis. */
  referenceLines?: { axis: 'x' | 'y', value: number, label: string }[]
  logX?: boolean
  logY?: boolean
  /** Rendered under the chart: what the axes mean and where the tail went. */
  caption?: string
  heightClass?: string
}>()

use([ScatterChart, GridComponent, TooltipComponent, MarkLineComponent, DataZoomComponent, CanvasRenderer])

const chartEl = ref<HTMLElement>()
let chart: echarts.ECharts | undefined

/** A point's dot size, floored so a 1-call entity is still visible and clickable. */
function symbolSize(value: number | undefined): number {
  return Math.max(7, Math.min(30, Math.sqrt(value ?? 0) * 1.6))
}

function num(value: number): string {
  return formatMetric(value, {})
}

/**
 * Whether the reader has zoomed in.
 *
 * Only used to offer a way back: ECharts' inside zoomer does not promise a double-click
 * reset, and a plot that can be zoomed with no visible way to undo it is a trap. The
 * button appears once there is something to undo.
 */
const zoomed = ref(false)

function resetZoom() {
  chart?.dispatchAction({
    type: 'dataZoom',
    // Percentages, so the reset works whether the axis is linear or logarithmic.
    start: 0,
    end: 100,
  })
  zoomed.value = false
}

function render() {
  if (!chartEl.value || props.points.length === 0)
    return
  // The canvas sits behind a v-if, so a container that was removed and re-added needs a
  // fresh instance rather than one still drawing into the detached element.
  if (chart && chart.getDom() !== chartEl.value) {
    chart.dispose()
    chart = undefined
  }
  chart ||= echarts.init(chartEl.value)
  // Re-registered on every render is harmless (setOption rebuilds the option but not the
  // handler list), and it keeps the state tied to the instance that is actually mounted.
  chart.off('datazoom')
  chart.on('datazoom', () => {
    zoomed.value = true
  })
  const { muted, border, palette } = chartTokens()

  chart.setOption({
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        const point = params.data
        const lines = [
          `<div style="margin-bottom:2px">${point.name}</div>`,
          `${props.xLabel}: ${num(point.value[0])}`,
          `${props.yLabel}: ${formatExact(point.value[1], {})}`,
        ]
        if (point.detail)
          lines.push(`<span style="color:#888">${point.detail}</span>`)
        return lines.join('<br>')
      },
    },
    grid: { top: 24, left: 62, right: 20, bottom: 46 },
    xAxis: {
      type: props.logX ? 'log' : 'value',
      min: props.logX ? 1 : 0,
      name: props.xLabel,
      nameLocation: 'middle',
      nameGap: 28,
      nameTextStyle: { color: muted, fontSize: 11 },
      axisLabel: { color: muted, fontSize: 10, formatter: (v: number) => num(v) },
      splitLine: { lineStyle: { color: border } },
    },
    yAxis: {
      type: props.logY ? 'log' : 'value',
      min: props.logY ? 1 : 0,
      name: props.yLabel,
      nameLocation: 'end',
      nameGap: 10,
      nameTextStyle: { color: muted, fontSize: 11, align: 'left' },
      axisLabel: { color: muted, fontSize: 10, formatter: (v: number) => num(v) },
      splitLine: { lineStyle: { color: border } },
    },
    series: [{
      type: 'scatter',
      // Size is the entity's volume and colour its quality, so the four channels are:
      // position, size, colour - plus the tooltip for the exact numbers.
      symbolSize: (_value: number[], params: any) => symbolSize(params.data.size),
      data: props.points.map((point, index) => ({
        name: point.name,
        value: [point.x, point.y],
        size: point.size ?? 0,
        detail: point.detail,
        itemStyle: { color: point.color ?? palette[index % palette.length], opacity: 0.85 },
      })),
      emphasis: { itemStyle: { opacity: 1, borderColor: border, borderWidth: 1 } },
      markLine: props.referenceLines?.length
        ? {
            silent: true,
            symbol: 'none',
            lineStyle: { type: 'dashed', color: muted, width: 1 },
            label: { color: muted, fontSize: 10, formatter: (p: any) => p.name },
            data: props.referenceLines.map(line => line.axis === 'y'
              ? { yAxis: line.value, name: line.label }
              : { xAxis: line.value, name: line.label }),
          }
        : undefined,
    }],
    // Wheel to zoom, drag to pan, double-click to reset. Both scatter charts pack hundreds
    // of entities into a few pixels near the origin, and a point that cannot be separated
    // from its neighbours is a point nobody can read. `inside` on both axes keeps the gesture
    // on the plot itself; there is no slider, because the range is already printed on the axes.
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        filterMode: 'none',
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnMouseWheel: false,
      },
      {
        type: 'inside',
        yAxisIndex: 0,
        filterMode: 'none',
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnMouseWheel: false,
      },
    ],
  })
}

function resize() {
  chart?.resize()
}

onMounted(() => {
  render()
  window.addEventListener('resize', resize)
})
// flush: 'post' is load-bearing: the points arrive from a query after mount, so a
// pre-flush watcher would run before the v-if has created the canvas.
watch(() => [props.points, props.title, props.logX, props.logY], render, { deep: true, flush: 'post' })
onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  chart?.dispose()
})
</script>

<template>
  <div class="flex flex-col gap-1">
    <div class="flex items-center gap-2">
      <p class="text-sm font-medium">
        {{ title }}
      </p>
      <button
        v-if="zoomed"
        type="button"
        class="rounded border px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        @click="resetZoom"
      >
        重置视图
      </button>
    </div>
    <div v-if="points.length" ref="chartEl" class="w-full" :class="heightClass ?? 'h-72'" role="img" :aria-label="title" />
    <div v-else class="flex items-center justify-center text-sm text-muted-foreground" :class="heightClass ?? 'h-72'">
      该区间内没有可比较的数据
    </div>
    <p v-if="caption" class="text-xs text-muted-foreground">
      {{ caption }}
    </p>
    <p v-if="points.length" class="text-xs text-muted-foreground/80">
      滚轮缩放 · 拖拽平移
    </p>
  </div>
</template>
