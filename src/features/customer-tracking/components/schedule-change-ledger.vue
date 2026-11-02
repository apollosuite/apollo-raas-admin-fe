<script setup lang="ts">
/**
 * The change log, as a run ledger rather than a feed.
 *
 * A bid schedule can rewrite 5,500 bids in one execution and ~166k in a month; a
 * table of the raw rows is unreadable and a table of *runs* is only 30 rows. So each
 * execution is one line, and the line itself is the chart: a bar scaled to the busiest
 * run, split by direction, with the counts and the median move beside it. Opening a
 * line fetches the evidence for that run only.
 *
 * Two counts travel together on purpose. `logged` is what the run evaluated,
 * `changes` is what it actually moved: a budget run that reads 75 campaigns and
 * lowers 9 of them should say "75 次评估 · 9 项改动", not pretend it ran 75 times or
 * that nothing happened.
 */

import { ChevronDown } from 'lucide-vue-next'
import { computed } from 'vue'

import type { ChangelogChange, ChangelogRun, ScheduleFamily } from '../schedule-detail'

import { changelogTotals, formatCount, formatSignedPct, runBarPercent, runClock, runDay } from '../schedule-detail'
import ScheduleChangeTable from './schedule-change-table.vue'

const props = defineProps<{
  family: ScheduleFamily
  runs: ChangelogRun[]
  selectedRun: string | null
  changes: ChangelogChange[]
  changesLoading: boolean
}>()

const emit = defineEmits<{ (e: 'select', runTime: string): void }>()

const maxChanges = computed(() => Math.max(0, ...props.runs.map(run => run.changes)))
const totals = computed(() => changelogTotals(props.runs))

/** The busiest run is the scale, so a quiet run still reads as quiet. */
function barPercent(run: ChangelogRun): number {
  return runBarPercent(run.changes, maxChanges.value)
}

/** Direction share inside the run's own bar. */
function raisedShare(run: ChangelogRun): number {
  const total = run.raised + run.lowered
  return total > 0 ? run.raised / total * 100 : 0
}

const entityNoun = computed(() => (props.family === 'bid' ? '个 targeting' : '个活动'))

function capped(run: ChangelogRun): boolean {
  // For a placement run the detail rows are campaigns while `changes` counts fields,
  // so the campaign count is the comparable total.
  const total = props.family === 'placement' ? run.entities : run.changes
  return props.changes.length < total
}
</script>

<template>
  <div class="flex flex-col">
    <p class="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm tabular-nums text-muted-foreground">
      <span>执行次数 <span class="font-medium text-foreground">{{ formatCount(totals.runs) }}</span></span>
      <span v-if="totals.unchangedRuns">无改动 <span class="font-medium text-foreground">{{ formatCount(totals.unchangedRuns) }} 次</span></span>
      <span>调整项 <span class="font-medium text-foreground">{{ formatCount(totals.changes) }}</span></span>
      <span>上调 / 下调 <span class="font-medium text-foreground">{{ formatCount(totals.raised) }} / {{ formatCount(totals.lowered) }}</span></span>
      <span v-if="totals.runs">平均每次 <span class="font-medium text-foreground">{{ formatCount(totals.averageChanges) }} 项</span></span>
      <span v-if="totals.busiest">最大一次 <span class="font-medium text-foreground">{{ formatCount(totals.busiest.changes) }} 项</span></span>
    </p>

    <ol class="mt-3 border-t">
      <li v-for="(run, index) in runs" :key="run.runTime" class="border-b">
        <button
          type="button"
          class="relative grid w-full grid-cols-1 items-center gap-x-4 gap-y-2 py-3 text-left transition-colors duration-150 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:bg-muted/60 motion-reduce:transition-none sm:grid-cols-[5rem_minmax(0,1fr)_auto]"
          :aria-expanded="selectedRun === run.runTime"
          :aria-controls="`schedule-run-${index}`"
          @click="emit('select', run.runTime)"
        >
          <span class="flex items-baseline gap-2 sm:flex-col sm:items-start sm:gap-0">
            <span class="font-mono text-xs tabular-nums">{{ runDay(run.runTime) }}</span>
            <span class="font-mono text-xs text-muted-foreground">{{ runClock(run.runTime) }}</span>
          </span>

          <span class="flex min-w-0 flex-col gap-1.5">
            <span class="flex items-center gap-2">
              <span class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <span class="flex h-full overflow-hidden rounded-full" :style="{ width: `${barPercent(run)}%` }">
                  <span class="h-full bg-foreground/70" :style="{ width: `${raisedShare(run)}%` }" />
                  <span class="h-full bg-foreground/30" :style="{ width: `${100 - raisedShare(run)}%` }" />
                </span>
              </span>
              <span class="shrink-0 font-mono text-xs font-medium tabular-nums">{{ formatCount(run.changes) }} 项</span>
            </span>
            <span class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <template v-if="run.changes === 0">
                <span>本次执行未产生实际改动<template v-if="run.logged">（评估 {{ formatCount(run.logged) }} 条）</template></span>
              </template>
              <template v-else>
                <span>上调 {{ formatCount(run.raised) }}</span>
                <span>下调 {{ formatCount(run.lowered) }}</span>
                <span>涉及 {{ formatCount(run.entities) }} {{ entityNoun }}</span>
                <span v-if="family === 'placement'">TOS {{ run.tosChanges }} · ROS {{ run.rosChanges }} · PP {{ run.ppChanges }}</span>
                <span v-else>中位 {{ formatSignedPct(run.medianAbsPct) }}</span>
                <span v-if="run.logged > run.changes">评估 {{ formatCount(run.logged) }} 条</span>
              </template>
            </span>
          </span>

          <!-- On a phone the row is three stacked bands; the caret would sit on a fourth
               line of its own, so it is pulled to the row's top-right instead. -->
          <span class="absolute right-0 top-3 flex items-center gap-1 text-xs text-muted-foreground sm:static sm:justify-end">
            <span class="hidden sm:inline">{{ selectedRun === run.runTime ? '收起' : '明细' }}</span>
            <ChevronDown class="size-4 transition-transform duration-150 motion-reduce:transition-none" :class="selectedRun === run.runTime ? 'rotate-180' : ''" />
          </span>
        </button>

        <div v-if="selectedRun === run.runTime" :id="`schedule-run-${index}`" class="pb-4 sm:pl-20">
          <p v-if="changesLoading" class="py-3 text-xs text-muted-foreground">
            正在读取这次执行的变更…
          </p>
          <template v-else-if="changes.length">
            <p class="mb-2 text-xs text-muted-foreground">
              <!-- A placement run's detail rows are campaigns, while `changes` counts
                   the placement fields inside them; saying "13 项" next to a summary of
                   "20 项" would look like missing data. -->
              <template v-if="family === 'placement'">
                <template v-if="capped(run)">
                  按变动幅度排序，显示前 {{ formatCount(changes.length) }} 个活动（共 {{ formatCount(run.entities) }} 个，{{ formatCount(run.changes) }} 处调整）。
                </template>
                <template v-else>
                  本次执行的全部 {{ formatCount(run.entities) }} 个活动，共 {{ formatCount(run.changes) }} 处调整。
                </template>
              </template>
              <template v-else-if="capped(run)">
                按变动幅度排序，显示前 {{ formatCount(changes.length) }} 项（共 {{ formatCount(run.changes) }} 项）。
              </template>
              <template v-else>
                本次执行的全部 {{ formatCount(changes.length) }} 项变动。
              </template>
            </p>
            <ScheduleChangeTable :family="family" :rows="changes" />
          </template>
          <p v-else class="py-3 text-xs text-muted-foreground">
            本次执行没有产生实际改动<template v-if="run.logged">
              （源表记录了 {{ formatCount(run.logged) }} 条评估）
            </template>。
          </p>
        </div>
      </li>
    </ol>

    <p v-if="runs.length" class="mt-3 text-xs text-muted-foreground">
      条形长度按窗口内单次最大调整量（{{ formatCount(maxChanges) }} 项）等比；颜色深浅只区分上调与下调，不表示好坏。
    </p>
  </div>
</template>
