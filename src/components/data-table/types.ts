import type { ColumnDef, ColumnPinningState, SortingState } from '@tanstack/vue-table'
import type { MaybeRefOrGetter } from 'vue'

export interface FacetedFilterOption {
  label: string
  value: string
  icon?: Component
}

export interface ServerPagination {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

export interface DataTableProps<T> {
  loading?: boolean
  columns: ColumnDef<T, any>[]
  /**
   * Rows to render. Accepts a ref/getter as well as a plain array so a table can
   * be created once and keep its sorting / visibility / pinning state while the
   * rows change — recreating the table on every filter keystroke would reset it.
   */
  data: MaybeRefOrGetter<T[]>
  serverPagination?: ServerPagination
  /** Initial left/right pinned column ids. */
  initialPinning?: ColumnPinningState
  /** Initial sort, so a table opens on the question it exists to answer. */
  initialSorting?: SortingState
}
