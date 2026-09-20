<script setup lang="ts" generic="T">
import type { Column } from '@tanstack/vue-table'

import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-vue-next'
import { computed } from 'vue'

/**
 * Sortable column header.
 *
 * Clicking the label cycles asc -> desc -> unsorted (TanStack's own
 * getNextSortingOrder), which is the interaction people expect from a data grid.
 * Shift-clicking adds the column to the sort instead of replacing it, up to three
 * columns, and the header then shows its priority so the order is never a guess.
 *
 * There is deliberately no per-column dropdown any more: hiding and pinning were
 * not user-facing concerns here, and the pinning the tables actually rely on is
 * fixed up front through initialPinning. Width is dragged from the column's right
 * edge instead - see the resize handle rendered by data-table.vue.
 */
const props = defineProps<{
  column: Column<T, any>
  title: string
  /** How many columns are sorted right now, so a single sort shows no number. */
  sortCount?: number
}>()

const sorted = computed(() => props.column.getIsSorted())
/** 1-based position in the sort, shown only once a second column joins in. */
const sortIndex = computed(() => props.column.getSortIndex())
const multiSorted = computed(() => (props.sortCount ?? 1) > 1)
// TanStack's handler does the cycling and treats shift as "add to the sort", which is
// what this used to fake by always passing multi=false.
const toggleSorting = computed(() => props.column.getToggleSortingHandler())
</script>

<template>
  <button
    v-if="column.getCanSort()"
    type="button"
    class="-ml-2 flex h-8 w-[calc(100%+1rem)] min-w-0 items-center gap-1 rounded-md px-2 text-left text-sm font-medium transition-colors hover:bg-accent"
    :class="sorted ? 'text-foreground' : ''"
    :aria-label="multiSorted ? `Sort by ${title}, priority ${sortIndex + 1}` : `Sort by ${title}. Shift-click to sort by several columns`"
    :title="title"
    @click="toggleSorting?.($event)"
  >
    <span class="truncate">{{ title }}</span>
    <span
      v-if="multiSorted && sortIndex >= 0"
      class="shrink-0 rounded bg-muted px-1 text-[10px] leading-4 text-muted-foreground"
      :title="`第 ${sortIndex + 1} 个排序条件`"
    >{{ sortIndex + 1 }}</span>
    <ArrowUpIcon v-if="sorted === 'asc'" class="size-3.5 shrink-0" />
    <ArrowDownIcon v-else-if="sorted === 'desc'" class="size-3.5 shrink-0" />
    <ChevronsUpDownIcon v-else class="size-3.5 shrink-0 opacity-40" />
  </button>
  <span v-else class="flex h-8 min-w-0 items-center font-medium" :title="title">
    <span class="truncate">{{ title }}</span>
  </span>
</template>
