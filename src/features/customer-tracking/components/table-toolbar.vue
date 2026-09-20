<script setup lang="ts">
import type { DateRange } from '../filter-context'
import type { ColumnFilter, ColumnSpec } from '../types'

import ColumnFilterBar from './column-filter-bar.vue'
import DateRangePicker from './date-range-picker.vue'

/**
 * The row that sits directly above a table: filters on the left, the page's date
 * range on the right.
 *
 * The date range used to live in the page header, which meant scrolling to the
 * top to change it and back down to read the result. It is the table's data
 * window, so it belongs next to the table. Only tables that pass `range` render
 * it, and since every page here shows one table at a time, at most one picker is
 * ever visible.
 */
defineProps<{
  columns: readonly ColumnSpec[]
  filters: ColumnFilter[]
  /** Unfiltered rows, used to derive the enum option lists. */
  rows?: any[]
  /** Present on the page's primary table: renders the date range control. */
  range?: DateRange
}>()

const emit = defineEmits<{
  (e: 'update:filters', value: ColumnFilter[]): void
  (e: 'update:range', value: DateRange): void
}>()
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-2">
    <div class="flex flex-wrap items-center gap-2">
      <slot />
      <ColumnFilterBar
        :columns="columns"
        :model-value="filters"
        :rows="rows"
        @update:model-value="(v: ColumnFilter[]) => emit('update:filters', v)"
      />
    </div>
    <DateRangePicker
      v-if="range"
      :model-value="range"
      @update:model-value="(v: DateRange) => emit('update:range', v)"
    />
  </div>
</template>
