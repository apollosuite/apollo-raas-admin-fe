<script setup lang="ts">
import { CustomChart } from 'echarts/charts'
import { LegendComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { StatusRadialSlice } from '../account-analytics'

import { RADIAL_HOLE, RADIAL_MAX } from '../account-analytics'
import { formatMetric } from '../format'
import { chartTokens } from './chart-theme'

/**
 * The status rose: one shape carrying two variables.
 *
 * Angular width is the share of accounts in a health state, the outer radius is the share
 * of the managed ad spend sitting there. A plain donut can only show one of the two, and
 * the gap between them is the point - a state with few accounts but heavy spend bulges out
 * past its neighbours, which is what "where is the risk in the book" looks like.
 *
 * Drawn as a custom series rather than a pie because ECharts' pie cannot vary a slice's
 * radius per data item. Geometry is computed in pixels from the canvas size, so no polar
 * coordinate system is needed and the same code renders at any container size.
 *
 * The reading the slices are a share of sits above the chart, not in its hole: text squeezed
 * into the hole has to negotiate its size with the ring's inner edge, and a longer figure or
 * label simply collides with the sectors. Above the chart it is ordinary text - no clipping,
 * any length, and the number never moves when a slice grows.
 */
const props = defineProps<{
  slices: StatusRadialSlice[]
  /** The reading the slices are shares of, e.g. the managed ad spend. */
  total?: string
  totalLabel?: string
  title: string
  caption?: string
  heightClass?: string
}>()

use([CustomChart, TooltipComponent, LegendComponent, CanvasRenderer])

const chartEl = ref<HTMLElement>()
let chart: echarts.ECharts | undefined

/** The drawn centre, slightly above the middle so the bottom legend has room. */
const CENTER_Y_RATIO = 0.46
/** How much of the shorter canvas side the furthest slice may use. */
const MAX_RADIUS_RATIO = 0.62

function render() {
  if (!chartEl.value || props.slices.length === 0)
    return
  if (chart && chart.getDom() !== chartEl.value) {
    chart.dispose()
    chart = undefined
  }
  chart ||= echarts.init(chartEl.value)
  const { muted, border, palette } = chartTokens()

  const drawSlice = (_params: unknown, api: any) => {
    const width = api.getWidth()
    const height = api.getHeight()
    const cx = width / 2
    const cy = height * CENTER_Y_RATIO
    const unit = Math.min(width, height * 1.35) / 2 * (MAX_RADIUS_RATIO / RADIAL_MAX)
    const [startAngle, endAngle, outerRadius] = [api.value(0), api.value(1), api.value(2)]
    return {
      type: 'sector',
      shape: {
        cx,
        cy,
        r0: RADIAL_HOLE * unit,
        r: (outerRadius as number) * unit,
        startAngle,
        endAngle,
        clockwise: true,
      },
      style: {
        fill: api.visual('color'),
        stroke: border,
        lineWidth: 1,
      },
    }
  }

  chart.setOption({
    tooltip: {
      trigger: 'item',
      formatter: (p: any) => p.data?.tip ?? '',
    },
    legend: {
      bottom: 0,
      left: 'center',
      icon: 'circle',
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { color: muted, fontSize: 11 },
    },
    series: props.slices.map((slice, index) => ({
      name: slice.status,
      type: 'custom',
      // Load-bearing: a `custom` series defaults to cartesian2d and then looks for an x axis
      // it does not have, throwing `xAxis "0" not found` during setOption - which took every
      // other canvas on the page down with it. The geometry below is computed in pixels from
      // the canvas size, so no coordinate system is wanted at all.
      coordinateSystem: 'none',
      renderItem: drawSlice,
      itemStyle: { color: palette[index % palette.length] },
      data: [{
        value: [slice.startAngle, slice.endAngle, slice.outerRadius],
        tip: `${slice.status}：${slice.orgs.toLocaleString('en-US')} 个账号（${(slice.orgShare * 100).toFixed(1)}%），广告花费 ${formatMetric(slice.spend, { currency: true })}（${(slice.spendShare * 100).toFixed(1)}%）`,
      }],
    })),
  }, { notMerge: true })
}

function resize() {
  chart?.resize()
}

onMounted(() => {
  render()
  window.addEventListener('resize', resize)
})
// flush: 'post' - the canvas sits behind a v-if, so the container must exist first.
watch(() => [props.slices, props.title], render, { deep: true, flush: 'post' })
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
    <!-- The reading the slices are shares of. Label and figure sit next to each other, so the
         pair is read in one fixation instead of across the width of the card. -->
    <p v-if="total" class="flex items-baseline gap-2">
      <span class="text-xs text-muted-foreground">{{ totalLabel }}</span>
      <span class="text-xl font-semibold tabular-nums">{{ total }}</span>
    </p>
    <div v-if="slices.length" ref="chartEl" class="w-full" :class="heightClass ?? 'h-72'" role="img" :aria-label="title" />
    <div v-else class="flex items-center justify-center text-sm text-muted-foreground" :class="heightClass ?? 'h-72'">
      该区间内没有在管账号
    </div>
    <p v-if="caption" class="text-xs text-muted-foreground">
      {{ caption }}
    </p>
  </div>
</template>
