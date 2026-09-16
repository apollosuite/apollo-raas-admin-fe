<script setup lang="ts" generic="T">
import type { Column } from '@tanstack/vue-table'

import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-vue-next'
import { computed } from 'vue'

/**
 * Sortable column header.
 *
 * Clicking the label cycles asc -> desc -> unsorted (TanStack's own
 * getNextSortingOrder), which is the interaction people expect from a data grid.
 *
 * There is deliberately no per-column dropdown any more: hiding and pinning were
 * not user-facing concerns here, and the pinning the tables actually rely on is
 * fixed up front through initialPinning. Width is dragged from the column's right
 * edge instead - see the resize handle rendered by data-table.vue.
 */
const props = defineProps<{
  column: Column<T, any>
  title: string
}>()

const sorted = computed(() => props.column.getIsSorted())
</script>

<template>
  <button
    v-if="column.getCanSort()"
    type="button"
    class="-ml-2 flex h-8 w-[calc(100%+1rem)] min-w-0 items-center gap-1 rounded-md px-2 text-left text-sm font-medium transition-colors hover:bg-accent"
    :class="sorted ? 'text-foreground' : ''"
    :title="title"
    :aria-label="`Sort by ${title}`"
    @click="column.toggleSorting(undefined, false)"
  >
    <span class="truncate">{{ title }}</span>
    <ArrowUpIcon v-if="sorted === 'asc'" class="size-3.5 shrink-0" />
    <ArrowDownIcon v-else-if="sorted === 'desc'" class="size-3.5 shrink-0" />
    <ChevronsUpDownIcon v-else class="size-3.5 shrink-0 opacity-40" />
  </button>
  <span v-else class="flex h-8 min-w-0 items-center font-medium" :title="title">
    <span class="truncate">{{ title }}</span>
  </span>
</template>
