import { createTable, getCoreRowModel, getSortedRowModel } from '@tanstack/vue-table'
import { describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'

import DataTableColumnHeader from '@/components/data-table/column-header.vue'
import { ACCOUNT_COLUMNS, makeColumns } from '@/features/customer-tracking/columns'

function columnOf(id: string) {
  const table = createTable({
    data: [],
    columns: makeColumns(ACCOUNT_COLUMNS, { navigate: () => {} }),
    state: { columnPinning: { left: [], right: [] } },
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
    expect(html).toContain('aria-label="Sort by Organization"')
    expect(html).toContain('title="Organization"')
  })

  it('offers no per-column dropdown (hide / pin were removed)', async () => {
    const html = await render(columnOf('name'), 'Organization')
    for (const gone of ['Pin left', 'Pin right', 'Unpin', 'Hide', 'Clear sorting', 'column options']) {
      expect(html, gone).not.toContain(gone)
    }
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
