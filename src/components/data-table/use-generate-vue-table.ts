import type { ColumnFiltersState, ColumnPinningState, ColumnSizingState, PaginationState, SortingState, TableOptionsWithReactiveData, VisibilityState } from '@tanstack/vue-table'

import { getCoreRowModel, getFacetedRowModel, getFacetedUniqueValues, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useVueTable } from '@tanstack/vue-table'
import { toValue } from 'vue'

import { DEFAULT_PAGE_SIZE } from '@/constants/pagination'
import { valueUpdater } from '@/lib/utils'

import type { DataTableProps } from './types'

export function generateVueTable<T>(props: DataTableProps<T>) {
  const sorting = ref<SortingState>(props.initialSorting ?? [])
  const columnFilters = ref<ColumnFiltersState>([])
  const columnVisibility = ref<VisibilityState>({})
  const columnPinning = ref<ColumnPinningState>(props.initialPinning ?? { left: [], right: [] })
  // Per-table column widths, seeded from each column's own `size`. Because the
  // table instance is created once (see the data-prop docs), a dragged width
  // survives filtering, sorting and page changes.
  const columnSizing = ref<ColumnSizingState>({})
  const rowSelection = ref({})
  const pagination = ref<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  })

  const useServerPagination = !!props.serverPagination

  const pageIndex = computed(() => {
    if (useServerPagination && props.serverPagination) {
      return props.serverPagination.page - 1
    }
    return 0
  })

  const pageSize = computed(() => {
    if (useServerPagination && props.serverPagination) {
      return props.serverPagination.pageSize
    }
    return DEFAULT_PAGE_SIZE
  })

  const pageCount = computed(() => {
    if (useServerPagination && props.serverPagination) {
      return Math.ceil(props.serverPagination.total / props.serverPagination.pageSize)
    }
    return -1
  })

  const tableConfig: TableOptionsWithReactiveData<T> = {
    get data() { return toValue(props.data) },
    get columns() { return props.columns },
    // Shift-click stacks up to three sort columns; the fourth replaces the oldest, so
    // the ordering stays something a person can reason about.
    enableMultiSort: true,
    maxMultiSortColCount: 3,
    state: {
      get sorting() { return sorting.value },
      get columnFilters() { return columnFilters.value },
      get columnVisibility() { return columnVisibility.value },
      get columnPinning() { return columnPinning.value },
      get columnSizing() { return columnSizing.value },
      get rowSelection() { return rowSelection.value },
      get pagination() {
        if (useServerPagination) {
          return {
            pageIndex: pageIndex.value,
            pageSize: pageSize.value,
          }
        }
        return pagination.value
      },
    },
    enableRowSelection: true,
    onSortingChange: updaterOrValue => valueUpdater(updaterOrValue, sorting),
    onColumnFiltersChange: updaterOrValue => valueUpdater(updaterOrValue, columnFilters),
    onColumnVisibilityChange: updaterOrValue => valueUpdater(updaterOrValue, columnVisibility),
    onColumnPinningChange: updaterOrValue => valueUpdater(updaterOrValue, columnPinning),
    onColumnSizingChange: updaterOrValue => valueUpdater(updaterOrValue, columnSizing),
    onRowSelectionChange: updaterOrValue => valueUpdater(updaterOrValue, rowSelection),
    onPaginationChange: updaterOrValue => valueUpdater(updaterOrValue, pagination),
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    // Bounds for columns that do not declare their own (e.g. the actions column).
    defaultColumn: { size: 150, minSize: 72, maxSize: 640 },
  }

  if (useServerPagination) {
    tableConfig.pageCount = pageCount.value
    tableConfig.manualPagination = true
  }
  else {
    tableConfig.getPaginationRowModel = getPaginationRowModel()
  }

  const table = useVueTable<T>(tableConfig)

  return table
}
