<!--
  Hallmark · pre-emit critique: P5 H4 E5 S4 R5 V4
  Hallmark · component: metric-split-cell · genre: modern-minimal · theme: Studio (reused, no new tokens)
  macrostructure: n/a (component scope — no nav / footer / hero)
  states: default · empty · zero · sub-1K exact · thousands · millions · hover-exact (title) · dark
  contrast: pass · tokens: src/assets/index.css (@theme inline) — text-muted-foreground, font-mono, text-xs
  note: tokens.css at the project root carries an earlier Hallmark stamp but is not imported
  anywhere; left untouched. The live token source is src/assets/index.css.

  A three-series metric cell for tables whose numbers split across ad products
  (SP / SB / SD). The label sits above its value so the three series land in three
  fixed grid tracks: every row's SP value starts at the same x, which is what makes
  a column of splits scannable. A single inline line cannot guarantee that.

  Scanning uses formatMetric (K / M); the precise amount and its share of the row
  total stay reachable on hover, so compacting never destroys the number.

  Track sizing matters: the table is `w-full` with auto layout, so a grid whose
  tracks can shrink to zero (minmax(0,1fr) + min-w-0) reports a min-content of ~0
  and the column gets squeezed until the three values collide. minmax(<floor>,
  max-content) gives each track a definite floor the table must honour, and still
  lets an unusually long value widen its own track instead of overlapping.
-->
<script setup lang="ts">
import type { Split } from '../types'

import { formatExact, formatMetric, formatShare } from '../format'

const props = withDefaults(defineProps<{
  /** A three-series split; non-split values are handled by the caller. */
  value?: Partial<Split> | null
  /** Series initials, one per series, rendered above each value. */
  labels?: [string, string, string]
  currency?: boolean
}>(), {
  value: null,
  labels: () => ['SP', 'SB', 'SD'] as [string, string, string],
  currency: false,
})

const SERIES = ['sp', 'sb', 'sd'] as const

const total = computed(() =>
  SERIES.reduce((sum, key) => sum + (Number(props.value?.[key]) || 0), 0),
)

const series = computed(() => SERIES.map((key, index) => {
  const raw = props.value?.[key]
  const label = props.labels[index]
  const amount = Number(raw) || 0
  return {
    key,
    label,
    display: formatMetric(raw, { currency: props.currency }),
    // Hover keeps the exact amount and its share of this row's total.
    tip: `${label} ${formatExact(raw, { currency: props.currency })} · ${formatShare(amount, total.value)} of ${formatExact(total.value, { currency: props.currency })}`,
  }
}))
</script>

<template>
  <div
    class="grid gap-x-4"
    :class="currency ? 'grid-cols-[repeat(3,minmax(4rem,max-content))]' : 'grid-cols-[repeat(3,minmax(3.25rem,max-content))]'"
  >
    <div v-for="s in series" :key="s.key" class="flex flex-col">
      <span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{{ s.label }}</span>
      <span class="whitespace-nowrap font-mono tabular-nums" :title="s.tip">{{ s.display }}</span>
    </div>
  </div>
</template>
