<script setup lang="ts">
/**
 * The evidence behind one schedule run.
 *
 * Deliberately a plain table rather than the page's generic DataTable: what a reader
 * needs here is the *transition* (old → new), and the generic column system renders
 * one value per cell. The table is capped by the server and sorted by absolute move,
 * so the rows at the top are the ones worth reading.
 */

import { computed } from 'vue'

import type { ChangelogChange, PlacementMove, ScheduleFamily } from '../schedule-detail'

import { formatExact } from '../format'
import { adProductLabel } from '../performance-analytics'
import { changeDelta, formatSignedPct } from '../schedule-detail'

const props = defineProps<{
  family: ScheduleFamily
  rows: ChangelogChange[]
}>()

/** A bid-adjustment value is a percentage in Amazon's own units. */
function adjustment(value: number | null): string {
  if (value === null)
    return '—'
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`
}

function value(value: number | null | undefined, currency = true): string {
  return formatExact(value ?? null, { currency })
}

const isPlacement = computed(() => props.family === 'placement')

function moveLabel(row: ChangelogChange): string {
  const delta = changeDelta(row)
  if (!delta)
    return '—'
  // A percentage needs an old value to be a percentage of; when the base was zero,
  // the absolute move is the only honest reading.
  if (delta.pct === null)
    return `${delta.delta > 0 ? '+' : ''}${formatExact(delta.delta, { currency: true })}`
  return formatSignedPct(delta.pct)
}

/** Unchanged placements stay muted so the changed ones read as the row's content. */
function placementCellClass(move: PlacementMove): string {
  return move.changed ? 'font-medium text-foreground' : 'text-muted-foreground'
}
</script>

<template>
  <div class="max-h-96 overflow-auto rounded border">
    <table class="w-full border-collapse text-xs tabular-nums">
      <thead class="sticky top-0 z-10 bg-background">
        <tr class="border-b text-left text-muted-foreground">
          <template v-if="family === 'bid'">
            <th class="px-3 py-2 font-medium">
              Targeting
            </th>
            <th class="px-3 py-2 font-medium">
              Match
            </th>
            <th class="px-3 py-2 text-right font-medium">
              Bid
            </th>
            <th class="px-3 py-2 text-right font-medium">
              Move
            </th>
          </template>
          <template v-else-if="family === 'budget'">
            <th class="px-3 py-2 font-medium">
              Campaign
            </th>
            <th class="px-3 py-2 text-right font-medium">
              Budget
            </th>
            <th class="px-3 py-2 text-right font-medium">
              Move
            </th>
          </template>
          <template v-else>
            <th class="px-3 py-2 font-medium">
              Campaign
            </th>
            <th class="px-3 py-2 text-right font-medium">
              TOS
            </th>
            <th class="px-3 py-2 text-right font-medium">
              ROS
            </th>
            <th class="px-3 py-2 text-right font-medium">
              PP
            </th>
          </template>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, index) in rows" :key="`${row.targetId ?? row.campaignId ?? index}-${index}`" class="border-b border-border/60 last:border-0">
          <template v-if="family === 'bid'">
            <td class="max-w-80 px-3 py-2">
              <span class="block truncate font-medium" :title="row.targetExpression ?? ''">{{ row.targetExpression || row.targetId }}</span>
              <span class="block truncate text-xs text-muted-foreground">{{ adProductLabel(row.sponsoredAdsType) }} · {{ row.targetType }}</span>
            </td>
            <td class="whitespace-nowrap px-3 py-2 text-muted-foreground">
              {{ row.matchType }}
            </td>
            <td class="whitespace-nowrap px-3 py-2 text-right font-mono">
              <span class="text-muted-foreground">{{ value(row.oldValue) }}</span>
              <span class="mx-1 text-muted-foreground">→</span>
              <span class="font-medium">{{ value(row.newValue) }}</span>
            </td>
            <td class="whitespace-nowrap px-3 py-2 text-right font-mono font-medium">
              {{ moveLabel(row) }}
            </td>
          </template>

          <template v-else-if="family === 'budget'">
            <td class="max-w-96 px-3 py-2">
              <span class="block truncate" :title="row.campaignName ?? ''">{{ row.campaignName || row.campaignId }}</span>
            </td>
            <td class="whitespace-nowrap px-3 py-2 text-right font-mono">
              <span class="text-muted-foreground">{{ value(row.oldValue) }}</span>
              <span class="mx-1 text-muted-foreground">→</span>
              <span class="font-medium">{{ value(row.newValue) }}</span>
            </td>
            <td class="whitespace-nowrap px-3 py-2 text-right font-mono font-medium">
              {{ moveLabel(row) }}
            </td>
          </template>

          <template v-else>
            <td class="max-w-96 px-3 py-2">
              <span class="block truncate" :title="row.campaignName ?? ''">{{ row.campaignName || row.campaignId }}</span>
            </td>
            <td
              v-for="move in row.placements"
              :key="move.key"
              class="whitespace-nowrap px-3 py-2 text-right font-mono"
              :class="placementCellClass(move)"
            >
              <template v-if="move.changed">
                <span class="text-muted-foreground">{{ adjustment(move.old) }}</span>
                <span class="mx-1 text-muted-foreground">→</span>{{ adjustment(move.new) }}
              </template>
              <template v-else>
                —
              </template>
            </td>
          </template>
        </tr>
      </tbody>
    </table>
    <p v-if="isPlacement" class="border-t px-3 py-2 text-xs text-muted-foreground">
      「—」表示该次执行没有设置这个版位的出价调整，而不是把它改成了 0。
    </p>
  </div>
</template>
