<script setup lang="ts" generic="T">
import type { Column, Table as VueTable } from '@tanstack/vue-table'
import type { CSSProperties } from 'vue'

import { FlexRender } from '@tanstack/vue-table'
import { computed } from 'vue'

import DataTableLoading from '@/components/data-table/table-loading.vue'
import DataTablePagination from '@/components/data-table/table-pagination.vue'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

import type { DataTableProps } from './types'

import NoResultFound from '../no-result-found.vue'

const props = defineProps<DataTableProps<T> & {
  table: VueTable<T>
}>()

/**
 * Per-cell sizing.
 *
 * The explicit width is what lets `table-layout: fixed` honour the column's
 * configured size instead of re-deriving it from the rendered content — which is
 * exactly what used to make every column jump sideways when the sort changed.
 */
function getCommonPinningStyles(column: Column<T>): CSSProperties {
  const isPinned = column.getIsPinned()
  return {
    left: isPinned === 'left' ? `${column.getStart('left')}px` : undefined,
    right: isPinned === 'right' ? `${column.getAfter('right')}px` : undefined,
    position: isPinned ? 'sticky' : 'relative',
    width: `${column.getSize()}px`,
    zIndex: isPinned ? 1 : 0,
  }
}

/** Sum of the current column widths: the table scrolls rather than squeezing below it. */
const tableWidth = computed(() => `${props.table.getTotalSize()}px`)
</script>

<template>
  <div class="space-y-4">
    <slot name="toolbar" />

    <div class="rounded-md border">
      <!--
        Table.vue applies the class prop to the <table> itself (and lets :style fall
        through to the scroll container, so the custom property inherits). The
        selectors must therefore target the table directly - a [&>table]: variant
        would ask for a table inside a table and never match, which silently left
        the layout content-driven and made resizing look like a no-op.
      -->
      <Table
        :style="{ '--dt-table-width': tableWidth }"
        class="w-(--dt-table-width) table-fixed min-w-full"
      >
        <TableHeader>
          <TableRow v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
            <TableHead
              v-for="header in headerGroup.headers"
              :key="header.id"
              :style="getCommonPinningStyles(header.column)"
              :class="cn('group/head relative overflow-hidden', header.column.getIsPinned() ? 'bg-background' : undefined)"
            >
              <FlexRender v-if="!header.isPlaceholder" :render="header.column.columnDef.header" :props="header.getContext()" />
              <!-- Drag the right edge to resize; min/max come from the column definition. -->
              <div
                v-if="header.column.getCanResize()"
                class="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize touch-none select-none select-none bg-transparent transition-colors"
                :class="header.column.getIsResizing() ? 'bg-primary' : 'hover:bg-primary/40'"
                role="separator"
                aria-orientation="vertical"
                :aria-label="`Resize column ${header.column.id}`"
                @mousedown="header.getResizeHandler()($event)"
                @touchstart="header.getResizeHandler()($event)"
              />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody v-if="!loading">
          <template v-if="table.getRowModel().rows?.length">
            <TableRow
              v-for="row in table.getRowModel().rows"
              :key="row.id"
              :data-state="row.getIsSelected() && 'selected'"
            >
              <TableCell
                v-for="cell in row.getVisibleCells()"
                :key="cell.id"
                :style="getCommonPinningStyles(cell.column)"
                :class="cn('overflow-hidden', cell.column.getIsPinned() ? 'bg-background' : undefined)"
              >
                <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
              </TableCell>
            </TableRow>
          </template>

          <TableRow v-else>
            <TableCell
              :colspan="columns.length"
              class="h-24 text-center"
            >
              <NoResultFound />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <DataTableLoading v-if="loading" />
    </div>

    <DataTablePagination v-if="!loading" :table="table" :server-pagination="serverPagination" />
  </div>
</template>
