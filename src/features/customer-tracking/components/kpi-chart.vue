<script setup lang="ts">
import { BarChart, FunnelChart, PieChart } from 'echarts/charts'
import { GraphicComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { formatMetric } from '../format'
import { chartTokens, fitFontSize, textWidthPerPoint } from './chart-theme'

const props = defineProps<{
  title: string
  data: { name: string, value: number }[]
  type?: 'pie' | 'bar' | 'funnel' | 'hbar'
  /**
   * Body height class. A horizontal bar chart needs one row per category, so the
   * caller decides how much room the labels get; the default suits a donut.
   */
  heightClass?: string
  /**
   * How to read the values. Every number the chart prints goes through this, so a
   * hover over an impression count reads "190.2M" instead of "190,158,197".
   */
  format?: 'number' | 'currency' | 'percent'
}>()

/** Kept in one place so the measuring font matches the drawn font. */
const CENTER_FONT_FAMILY = 'ui-sans-serif, system-ui, sans-serif'
const CENTER_FONT_SIZE = 20
const CENTER_FONT_WEIGHT = 600
/**
 * Where the text's visual centre sits inside the element box, as a fraction of the
 * font size: measured on the rendered canvas (the box top is not the text centre,
 * and zrender's line box is not 1.2em). Centring on the hole means subtracting it.
 */
const CENTER_TEXT_CENTRE_RATIO = 0.35

/**
 * Compact K/M/B for every value the chart shows. Counts of impressions or orders
 * are the whole point of these charts, and their exact form is unreadable in a
 * tooltip; anything below 1,000 stays exact because there is nothing to shorten.
 */
function formatValue(value: unknown): string {
  const n = Number(value)
  if (!Number.isFinite(n))
    return '—'
  if (props.format === 'percent')
    return `${n.toFixed(1)}%`
  return formatMetric(n, { currency: props.format === 'currency' })
}

use([PieChart, BarChart, FunnelChart, GraphicComponent, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

const chartEl = ref<HTMLElement>()
let chart: echarts.ECharts | undefined
/**
 * The slices the legend has switched off.
 *
 * ECharts hides a deselected slice on its own, but the centre label is a graphic
 * element it knows nothing about: the total used to keep reporting all three segments
 * while only two were on screen. Tracking the selection here is what lets the label
 * follow the ring.
 */
const hidden = ref<Set<string>>(new Set())
const total = computed(() => props.data.reduce((n, d) => n + (hidden.value.has(d.name) ? 0 : d.value), 0))
/** Is the legend handler already attached to this chart instance? */
let legendBound = false

/**
 * The centre label: the total of the slices still on screen, sized to fit the hole.
 *
 * The hole is 42% of the smaller side wide (radius percentages are relative to half of
 * it), so the label has to be sized to that circle rather than to a fixed 20px - a long
 * total like "$193.6M" used to run under the ring.
 */
function centreGraphic() {
  const { foreground } = chartTokens()
  const instance = chart
  if (!instance)
    return { id: 'centre-total', type: 'text' as const, style: { text: '' } }
  const hole = Math.min(instance.getWidth(), instance.getHeight()) * 0.42
  const label = formatValue(total.value)
  // Leave ~18% of the hole as breathing room: the ring's inner stroke eats a couple
  // of pixels and a viewer's font (Edge/Segoe vs the bundled Chromium) is a little
  // wider than the measure, so sizing to the hole exactly still looked cramped.
  const fontSize = fitFontSize(
    textWidthPerPoint(label, CENTER_FONT_SIZE, CENTER_FONT_FAMILY, CENTER_FONT_WEIGHT),
    hole * 0.82,
  )
  return {
    id: 'centre-total',
    type: 'text' as const,
    left: 'center',
    // A graphic element's `y` is its box top, not the text centre, so centring on the
    // hole means subtracting the measured offset. (`top: '42%'` alone put the label
    // below the middle of the ring; a 1.2em line box put it above.)
    y: instance.getHeight() * 0.42 - fontSize * CENTER_TEXT_CENTRE_RATIO,
    // Graphic elements are painted below the series by default, so the ring used to
    // cover the middle of the total. `z` orders it above the pie inside the same
    // layer; `zlevel` would work too but gives every chart an extra canvas layer,
    // which doubles the canvas count on a page full of donuts.
    z: 10,
    style: {
      text: label,
      textAlign: 'center',
      fill: foreground,
      fontSize,
      fontWeight: CENTER_FONT_WEIGHT,
      fontFamily: CENTER_FONT_FAMILY,
    },
  }
}

/**
 * The canvas is an image to a screen reader and the ring's numbers live inside it, so
 * the donut's label carries the total the centre prints - which is also what makes the
 * legend toggle observable from outside. The other shapes keep the plain title: a bar
 * chart's categories are not a total of anything.
 */
const ariaLabel = computed(() => props.type ? props.title : `${props.title} · 合计 ${formatValue(total.value)}`)

function render() {
  if (!chartEl.value)
    return
  chart ||= echarts.init(chartEl.value)
  const { palette, muted, foreground, background, border } = chartTokens()
  // One handler for the life of this instance: `render` runs on every data change and
  // a handler registered inside it would stack up.
  if (!legendBound) {
    legendBound = true
    chart.on('legendselectchanged', (params: any) => {
      hidden.value = new Set(Object.entries(params.selected ?? {}).filter(([, on]) => !on).map(([name]) => name))
      // Only the label changes: the ring is already correct, and re-issuing the whole
      // option from here would fight the legend's own state.
      chart?.setOption({ graphic: [centreGraphic()] })
    })
  }

  let option: any
  let donut = false

  if (props.type === 'funnel') {
    option = {
      color: palette,
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const i = p.dataIndex
          const value = p.value
          const prev = i > 0 ? props.data[i - 1].value : null
          const pct = prev !== null ? ` （占上一环节 ${((value / prev) * 100).toFixed(1)}%）` : ''
          return `${p.name}：${formatValue(value)}${pct}`
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
        label: { show: true, position: 'right', formatter: (p: any) => `${p.name}：${formatValue(p.value)}`, color: foreground, fontSize: 11 },
        itemStyle: { borderColor: background, borderWidth: 2 },
        data: props.data,
      }],
    }
  }
  else if (props.type === 'hbar') {
    // Long counter names ("Placements Optimized") sit on the category axis instead
    // of being rotated into illegibility under a narrow column.
    option = {
      color: palette,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => formatValue(v) },
      grid: { top: 8, left: 8, right: 44, bottom: 8, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
      xAxis: {
        type: 'value',
        axisLabel: { color: muted, fontSize: 10, formatter: (v: number) => formatValue(v) },
        splitLine: { lineStyle: { color: border } },
      },
      yAxis: {
        type: 'category',
        data: props.data.map(d => d.name),
        inverse: true,
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { color: muted, fontSize: 10, width: 128, overflow: 'truncate' },
      },
      series: [{
        name: props.title,
        type: 'bar',
        colorBy: 'data',
        barMaxWidth: 14,
        itemStyle: { borderRadius: [0, 3, 3, 0] },
        // Label and axis ticks use the same compact K/M/B scale here: the counters
        // span schedules (tens) to targetings (hundreds of thousands).
        label: { show: true, position: 'right', formatter: (p: any) => formatValue(p.value), color: foreground, fontSize: 10 },
        data: props.data.map(d => d.value),
      }],
    }
  }
  else if (props.type === 'bar') {
    option = {
      color: palette,
      tooltip: { trigger: 'axis', valueFormatter: (v: number) => formatValue(v) },
      grid: { top: 12, left: 48, right: 16, bottom: 30 },
      xAxis: { type: 'category', data: props.data.map(d => d.name), axisLabel: { color: muted, fontSize: 11 } },
      yAxis: { type: 'value', axisLabel: { color: muted, fontSize: 10, formatter: (v: number) => formatValue(v) }, splitLine: { lineStyle: { color: border } } },
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
    donut = true
    option = {
      color: palette,
      tooltip: { trigger: 'item', formatter: (p: any) => `${p.name}：${formatValue(p.value)}（${p.percent}%）` },
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
      graphic: [centreGraphic()],
    }
  }

  chart.setOption(option)
  if (!donut)
    return
  // The legend owns the selection. Reading it back after every render keeps the centre
  // total equal to what the ring actually shows, including when ECharts reset the
  // selection with this option; the label is then drawn from that same state.
  const legend = (chart.getOption() as { legend?: { selected?: Record<string, boolean> }[] } | undefined)?.legend?.[0]
  if (legend?.selected)
    hidden.value = new Set(Object.entries(legend.selected).filter(([, on]) => !on).map(([name]) => name))
  chart.setOption({ graphic: [centreGraphic()] })
}

function resize() {
  if (!chart)
    return
  chart.resize()
  // The centre label is sized from the box, so a resize has to re-measure it.
  render()
}
onMounted(() => {
  render()
  window.addEventListener('resize', resize)
})
watch(() => [props.title, props.data, props.type, props.format], render, { deep: true })
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
    <div ref="chartEl" class="w-full" :class="heightClass ?? 'h-44'" role="img" :aria-label="ariaLabel" />
  </div>
</template>
