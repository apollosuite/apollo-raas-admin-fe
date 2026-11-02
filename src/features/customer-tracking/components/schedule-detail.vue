<script setup lang="ts">
/*
 * Hallmark · macrostructure: Stat-Led · genre: modern-minimal · theme: app-system
 * accent: ink (no page accent; the app's neutral shadcn tokens win) · enrichment: none
 * nav: app shell · footer: app shell
 * pre-emit critique: P5 H4 E4 S5 R4 V5
 * slop test: see the final report — 57/58 (gate 1 is the app's locked system font)
 * contrast: pass (40–41) · mobile: pass at 375 / 414 / 768 (320 = app-shell overflow)
 */
/**
 * Performance L3: one schedule's campaigns and its change history.
 *
 * The page is deliberately *stat-led*: the first thing on it is what the schedule's
 * campaigns actually spent over the 30 complete days, with the sentence that says
 * what that bought. Everything under it qualifies that figure - the daily trend, the
 * campaign / targeting tables, and finally the run ledger for what the schedule
 * changed to get there.
 *
 * Two windows are printed, not implied: performance ends two days ago (the stats
 * tables lag) while the change log runs through today. A page that silently showed
 * "last 30 days" for both would either invent two days of performance or hide the
 * most recent - and most interesting - execution.
 */

import dayjs from 'dayjs'
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'

import DataTable from '@/components/data-table/data-table.vue'
import { generateVueTable } from '@/components/data-table/use-generate-vue-table'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import type { TrendMetric } from '../performance-analytics'

import { DEFAULT_SORTS, makeColumns, SCHEDULE_TARGETING_COLUMNS, scheduleCampaignColumns } from '../columns'
import { formatExact, formatMetric } from '../format'
import {
  runDays as buildRunDays,
  campaignTotals,
  coverage,
  dailyPoints,
  formatCount,
  hasChangelog,
  hasTargeting,
  scheduleFamily,
  scheduleWindows,
  withRates,
} from '../schedule-detail'
import { useColumnFilters } from '../use-column-filter'
import { useScheduleDetail } from '../use-schedule-detail'
import ScheduleChangeLedger from './schedule-change-ledger.vue'
import TableToolbar from './table-toolbar.vue'
import TrackingChart from './tracking-chart.vue'

const props = defineProps<{
  actionType: string
  actionId: string
}>()

const router = useRouter()
function navigate(to: string) {
  void router.push(to)
}

// A snapshot of "today": the page is a report about one window, and a tab left open
// across midnight should keep showing the window whose numbers it already loaded
// rather than silently relabelling them.
const today = dayjs().format('YYYY-MM-DD')
const windows = scheduleWindows(today)

const { campaigns, targetings, daily, changelogRuns, changes, selectedRun, loading, changesLoading, error, load, selectRun } = useScheduleDetail()

watch(
  [() => props.actionType, () => props.actionId],
  () => {
    void load(props.actionType, props.actionId, windows)
  },
  { immediate: true },
)

const family = computed(() => scheduleFamily(props.actionType) ?? 'launch')
const supportsTargeting = computed(() => hasTargeting(props.actionType))
const supportsChangelog = computed(() => hasChangelog(props.actionType))

const totals = computed(() => campaignTotals(campaigns.value))
const cover = computed(() => coverage(daily.value, windows.performance))
const trendRows = computed(() => dailyPoints(daily.value, windows.performance) as unknown as Record<string, unknown>[])
/**
 * The days this schedule ran, for the trend's run strip.
 *
 * Only the families with a change log have runs to mark; a launch schedule creates
 * campaigns and never executes against them, so its chart stays a plain trend. The runs
 * are keyed to the change-log window, which starts on the performance window's first day
 * and runs through today - `runDays` drops the days past the chart's end.
 */
const chartRunDays = computed(() => (supportsChangelog.value ? buildRunDays(changelogRuns.value, windows.performance) : []))

const TREND_METRICS: readonly TrendMetric[] = [
  { key: 'adSpend', label: '广告花费', currency: true },
  { key: 'adSales', label: '广告销售额', currency: true },
  { key: 'acos', label: 'ACoS', percent: true },
  { key: 'adOrders', label: '广告订单' },
  { key: 'clicks', label: '点击量' },
]
const TREND_DEFAULT = ['adSpend', 'adSales']

const perfWindowLabel = `${windows.performance.from} → ${windows.performance.to}`
const changeWindowLabel = `${windows.changelog.from} → ${today}`

const money = (value: number | null | undefined) => formatMetric(value ?? null, { currency: true })
const count = (value: number | null | undefined) => formatMetric(value ?? null, {})
const pct = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${value.toFixed(1)}%`)

/** Whose campaigns these are depends on what the schedule does. */
const subject = computed(() => (family.value === 'launch' ? '由该计划创建的' : '受该计划管理的'))

const campaignColumns = scheduleCampaignColumns(supportsTargeting.value)
const campaignRowsSource = computed(() => campaigns.value.map(withRates))
const { filters: campaignFilters, filtered: campaignRows } = useColumnFilters(campaignRowsSource, campaignColumns)
const campaignCols = makeColumns(campaignColumns, { nameKey: 'campaignName', badgeKeys: ['state'], navigate })
const campaignTable = generateVueTable<any>({
  columns: campaignCols,
  data: () => campaignRows.value,
  initialPinning: { left: ['campaignName'], right: [] },
  initialSorting: DEFAULT_SORTS['schedule-campaigns'],
})

const targetingRowsSource = computed(() => targetings.value.map(withRates))
const { filters: targetingFilters, filtered: targetingRows } = useColumnFilters(targetingRowsSource, SCHEDULE_TARGETING_COLUMNS)
const targetingCols = makeColumns(SCHEDULE_TARGETING_COLUMNS, { nameKey: 'targetExpression', badgeKeys: ['matchType'], navigate })
const targetingTable = generateVueTable<any>({
  columns: targetingCols,
  data: () => targetingRows.value,
  initialPinning: { left: ['targetExpression'], right: [] },
  initialSorting: DEFAULT_SORTS['schedule-targetings'],
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <p v-if="loading" class="py-2 text-sm text-muted-foreground">
      正在读取这个计划的广告表现与变更记录…
    </p>

    <div v-if="error" class="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      {{ error }}
    </div>

    <template v-if="!loading">
      <!-- Stat-led: the spend is the page's anchor, and the qualifier says what it bought. -->
      <section class="flex flex-col gap-5">
        <div class="flex flex-wrap items-end gap-x-10 gap-y-4">
          <div class="flex flex-col gap-1">
            <p class="text-xs text-muted-foreground">
              广告花费 · {{ perfWindowLabel }}
            </p>
            <p class="font-mono text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl" :title="formatExact(totals.adSpend, { currency: true })">
              {{ money(totals.adSpend) }}
            </p>
          </div>
          <p class="max-w-[46ch] pb-1 text-sm leading-6 text-muted-foreground">
            过去 30 个完整日，{{ subject }}<span class="font-medium text-foreground">{{ formatCount(totals.campaigns) }} 个广告活动</span><template v-if="supportsTargeting && totals.targets">
              、<span class="font-medium text-foreground">{{ formatCount(totals.targets) }} 个 targeting</span>
            </template>的合计花费；同期带来 <span class="font-medium text-foreground">{{ money(totals.adSales) }}</span> 广告销售额，ACoS <span class="font-medium text-foreground">{{ pct(totals.acos) }}</span>。
          </p>
        </div>

        <dl class="grid grid-cols-2 gap-y-4 border-t pt-4 sm:grid-cols-4 sm:divide-x sm:divide-border">
          <div class="sm:pr-6">
            <dt class="text-xs text-muted-foreground">
              广告销售额
            </dt>
            <dd class="mt-1 font-mono text-lg tabular-nums" :title="formatExact(totals.adSales, { currency: true })">
              {{ money(totals.adSales) }}
            </dd>
            <p class="mt-0.5 text-xs text-muted-foreground">
              ACoS {{ pct(totals.acos) }} · 花费 / 销售额
            </p>
          </div>
          <div class="sm:px-6">
            <dt class="text-xs text-muted-foreground">
              广告订单
            </dt>
            <dd class="mt-1 font-mono text-lg tabular-nums">
              {{ count(totals.adOrders) }}
            </dd>
            <p class="mt-0.5 text-xs text-muted-foreground">
              CVR {{ pct(totals.cvr) }} · 订单 / 点击
            </p>
          </div>
          <div class="sm:px-6">
            <dt class="text-xs text-muted-foreground">
              点击量
            </dt>
            <dd class="mt-1 font-mono text-lg tabular-nums">
              {{ count(totals.clicks) }}
            </dd>
            <p class="mt-0.5 text-xs text-muted-foreground">
              CPC {{ money(totals.cpc) }} · 花费 / 点击
            </p>
          </div>
          <div class="sm:pl-6">
            <dt class="text-xs text-muted-foreground">
              曝光量
            </dt>
            <dd class="mt-1 font-mono text-lg tabular-nums">
              {{ count(totals.impressions) }}
            </dd>
            <p class="mt-0.5 text-xs text-muted-foreground">
              点击率 {{ totals.impressions > 0 ? pct(totals.clicks / totals.impressions * 100) : '—' }}
            </p>
          </div>
        </dl>

        <p class="text-xs text-muted-foreground">
          数据覆盖 {{ cover.first || '—' }} → {{ cover.last || '—' }}<template v-if="cover.endsEarly">
            ；窗口末日 {{ windows.performance.to }} 暂无源数据
          </template>。
        </p>
      </section>

      <Card>
        <CardContent class="flex flex-col gap-2 p-4">
          <TrackingChart
            title="按天表现"
            :rows="trendRows"
            :metrics="TREND_METRICS"
            :default-metrics="TREND_DEFAULT"
            :run-days="chartRunDays"
          />
          <p v-if="chartRunDays.length" class="text-xs text-muted-foreground">
            底部色带是该计划在窗口内的执行日：色带越高表示当天累计调整项越多，细线表示当天执行了但没有实际改动；没有色带的日期表示当天未执行。
          </p>
        </CardContent>
      </Card>

      <p v-if="!campaigns.length" class="text-sm text-muted-foreground">
        过去 30 个完整日没有该计划{{ family === 'launch' ? '创建' : '管理' }}的广告活动表现数据。
      </p>

      <Card v-else>
        <CardContent class="flex flex-col gap-4">
          <Tabs v-if="supportsTargeting" default-value="campaigns">
            <TabsList>
              <TabsTrigger value="campaigns">
                广告活动 {{ formatCount(totals.campaigns) }}
              </TabsTrigger>
              <TabsTrigger value="targetings">
                Targetings {{ formatCount(targetings.length) }}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="campaigns" class="flex flex-col gap-4 pt-3">
              <TableToolbar v-model:filters="campaignFilters" :columns="campaignColumns" :rows="campaignRowsSource" />
              <DataTable :table="campaignTable" :columns="campaignCols" :data="campaignRows" />
            </TabsContent>
            <TabsContent value="targetings" class="flex flex-col gap-4 pt-3">
              <TableToolbar v-model:filters="targetingFilters" :columns="SCHEDULE_TARGETING_COLUMNS" :rows="targetingRowsSource" />
              <DataTable :table="targetingTable" :columns="targetingCols" :data="targetingRows" />
            </TabsContent>
          </Tabs>
          <template v-else>
            <TableToolbar v-model:filters="campaignFilters" :columns="campaignColumns" :rows="campaignRowsSource" />
            <DataTable :table="campaignTable" :columns="campaignCols" :data="campaignRows" />
          </template>
        </CardContent>
      </Card>

      <!-- The change log is a document, not a dashboard panel: a heading, its window,
           and the run ledger. No card around it, so it reads as the page's conclusion. -->
      <section v-if="supportsChangelog" class="flex flex-col gap-3 border-t pt-6">
        <div class="flex flex-col gap-1">
          <h2 class="text-base font-medium">
            变更历史
          </h2>
          <p class="text-xs text-muted-foreground">
            {{ changeWindowLabel }} · 每次执行一行
          </p>
        </div>
        <ScheduleChangeLedger
          v-if="changelogRuns.length"
          :family="family"
          :runs="changelogRuns"
          :selected-run="selectedRun"
          :changes="changes"
          :changes-loading="changesLoading"
          @select="selectRun"
        />
        <p v-else class="text-sm text-muted-foreground">
          该计划在这个窗口内没有执行记录，或执行没有写入变更日志。
        </p>
      </section>

      <p v-else class="border-t pt-4 text-xs text-muted-foreground">
        {{ actionType }} 计划只创建广告活动，不产生竞价 / 预算 / 版位调整记录。
      </p>
    </template>
  </div>
</template>
