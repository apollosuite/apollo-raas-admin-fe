import { createTable, getCoreRowModel, getSortedRowModel } from '@tanstack/vue-table'
import { describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'

import DataTableColumnHeader from '@/components/data-table/column-header.vue'
import { ACCOUNT_COLUMNS, makeColumns } from '@/features/customer-tracking/columns'

function columnOf(id: string, sorting: { id: string, desc: boolean }[] = []) {
  const table = createTable({
    data: [],
    columns: makeColumns(ACCOUNT_COLUMNS, { navigate: () => {} }),
    state: { columnPinning: { left: [], right: [] }, sorting },
    onStateChange: () => {},
    renderFallbackValue: undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
  } as any)
  return table.getColumn(id)!
}

function render(column: any, title: string): Promise<string> {
  return renderToString(createSSRApp(DataTableColumnHeader, { column, title }))
}

describe('dataTableColumnHeader', () => {
  it('renders the title as a sort control', async () => {
    const html = await render(columnOf('name'), 'Organization')
    expect(html).toContain('Organization')
    expect(html).toContain('aria-label="Sort by Organization. Shift-click to sort by several columns"')
    expect(html).toContain('title="Organization"')
  })

  it('offers no per-column dropdown (hide / pin were removed)', async () => {
    const html = await render(columnOf('name'), 'Organization')
    for (const gone of ['Pin left', 'Pin right', 'Unpin', 'Hide', 'Clear sorting', 'column options']) {
      expect(html, gone).not.toContain(gone)
    }
  })

  it('numbers the sort only once a second column joins in', async () => {
    const single = await render(columnOf('name'), 'Organization')
    expect(single).not.toContain('第 1 个排序条件')

    const multi = await renderToString(createSSRApp(DataTableColumnHeader, {
      column: columnOf('name', [{ id: 'name', desc: true }, { id: 'orgId', desc: false }]),
      title: 'Organization',
      sortCount: 2,
    }))
    expect(multi).toContain('第 1 个排序条件')
  })

  it('falls back to a plain label for columns that cannot sort', async () => {
    const table = createTable({
      data: [],
      columns: [{ id: 'plain', accessorFn: () => null, header: 'Plain', enableSorting: false }],
      state: { columnPinning: { left: [], right: [] } },
      onStateChange: () => {},
      renderFallbackValue: undefined,
      getCoreRowModel: getCoreRowModel(),
    } as any)
    const html = await render(table.getColumn('plain')!, 'Plain')
    expect(html).toContain('Plain')
    expect(html).not.toContain('aria-label="Sort by Plain"')
  })
})
