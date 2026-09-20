import type { ColumnDef } from '@tanstack/vue-table'

import { createTable, getCoreRowModel, getSortedRowModel } from '@tanstack/vue-table'
import { describe, expect, it } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'

import type { ColumnSpec, ColumnType } from '../types'

import {
  ACCOUNT_COLUMNS,
  ACCOUNT_PROFILE_COLUMNS,
  ADS_COLUMNS,
  AGENT_ORG_PROFILE_COLUMNS,
  AGENT_ORG_TOOL_COLUMNS,
  AGENT_TOOL_ORG_COLUMNS,
  CAMPAIGN_COLUMNS,
  cellDisplay,
  CHAT_COLUMNS,
  DEFAULT_SORTS,
  LAUNCH_CAMPAIGN_COLUMNS,
  LAUNCH_SCHEDULE_COLUMNS,
  makeColumns,
  OPTIMIZATION_CAMPAIGN_COLUMNS,
  PERF_PROFILE_COLUMNS,
  PERF_SCHEDULE_COLUMNS,
  PERFORMANCE_SCHEDULE_COLUMNS,
  perfScheduleColumns,
  PROFILE_COLUMNS,
  SCHEDULE_COLUMNS,
  SUB_ACCOUNT_COLUMNS,
  TOOL_COLUMNS,
} from '../columns'
import { connectionLabel, dateValue, needles, sortValue, splitSeries, splitTotal, tupleMetric } from '../values'

const ALL_SETS: [string, readonly ColumnSpec[]][] = [
  ['ACCOUNT_COLUMNS', ACCOUNT_COLUMNS],
  ['ADS_COLUMNS', ADS_COLUMNS],
  ['PROFILE_COLUMNS', PROFILE_COLUMNS],
  ['CAMPAIGN_COLUMNS', CAMPAIGN_COLUMNS],
  ['SCHEDULE_COLUMNS', SCHEDULE_COLUMNS],
  ['SUB_ACCOUNT_COLUMNS', SUB_ACCOUNT_COLUMNS],
  ['ACCOUNT_PROFILE_COLUMNS', ACCOUNT_PROFILE_COLUMNS],
  ['LAUNCH_SCHEDULE_COLUMNS', LAUNCH_SCHEDULE_COLUMNS],
  ['LAUNCH_CAMPAIGN_COLUMNS', LAUNCH_CAMPAIGN_COLUMNS],
  ['OPTIMIZATION_CAMPAIGN_COLUMNS', OPTIMIZATION_CAMPAIGN_COLUMNS],
  ['AGENT_ORG_PROFILE_COLUMNS', AGENT_ORG_PROFILE_COLUMNS],
  ['TOOL_COLUMNS', TOOL_COLUMNS],
  ['AGENT_ORG_TOOL_COLUMNS', AGENT_ORG_TOOL_COLUMNS],
  ['CHAT_COLUMNS', CHAT_COLUMNS],
  ['AGENT_TOOL_ORG_COLUMNS', AGENT_TOOL_ORG_COLUMNS],
  ['PERFORMANCE_SCHEDULE_COLUMNS', PERFORMANCE_SCHEDULE_COLUMNS],
  ['PERF_PROFILE_COLUMNS', PERF_PROFILE_COLUMNS],
  ['PERF_SCHEDULE_COLUMNS', PERF_SCHEDULE_COLUMNS],
]

const VALID_TYPES: ColumnType[] = [
  'text',
  'enum',
  'connection',
  'boolean',
  'number',
  'compact',
  'currency',
  'percent',
  'date',
  'timestamp',
  'split',
  'ratioTuple',
  'list',
]

const build = (specs: readonly ColumnSpec[]) => makeColumns(specs, { navigate: () => {} })

/**
 * Which cell renderer a column hands back, without rendering it.
 *
 * Enough to tell a plain span from the hover-preview wrapper, and it avoids mounting the
 * tooltip's portal just to assert one is there.
 */
function cellVNode(specs: readonly ColumnSpec[], id: string, value: unknown, options: { previewKeys?: string[] } = {}) {
  const column = makeColumns(specs, { navigate: () => {}, ...options }).find(c => c.id === id) as ColumnDef<any>
  return (column.cell as any)({ row: { original: { [id]: value } } })
}

function cellType(specs: readonly ColumnSpec[], id: string, value: unknown, options: { previewKeys?: string[] } = {}) {
  return cellVNode(specs, id, value, options)?.type
}
const colOf = (specs: readonly ColumnSpec[], id: string) => build(specs).find(c => c.id === id) as ColumnDef<any>

const COLUMN_SIZING_INFO = {
  startOffset: null,
  startSize: null,
  deltaOffset: null,
  deltaPercentage: null,
  isResizingColumn: false,
  columnSizingStart: [],
}

/**
 * A table configured the way generateVueTable configures resizing.
 *
 * createTable is uncontrolled: without onStateChange every setState is dropped,
 * so the resize handler would silently do nothing.
 */
function sizedTable(columns: ColumnDef<any>[]) {
  const state: any = {
    columnPinning: { left: [], right: [] },
    columnSizing: {},
    columnSizingInfo: { ...COLUMN_SIZING_INFO },
  }
  return createTable({
    data: [],
    columns,
    state,
    onStateChange: (updater: any) => {
      Object.assign(state, typeof updater === 'function' ? updater(state) : updater)
    },
    renderFallbackValue: undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    defaultColumn: { size: 150, minSize: 72, maxSize: 640 },
  } as any)
}

/** Runs the real TanStack sorted row model, so the comparators are exercised for real. */
function sortIds(data: any[], columns: ColumnDef<any>[], sorting: { id: string, desc: boolean }[]): string[] {
  // createTable wants the fully-resolved option shape, which useVueTable normally supplies.
  const table = createTable({
    data,
    columns,
    state: { sorting, columnSizing: {} },
    onStateChange: () => {},
    renderFallbackValue: undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  } as any)
  return table.getSortedRowModel().rows.map((r: any) => r.original.id)
}

describe('column specs', () => {
  it('declares a valid type for every column of every table', () => {
    for (const [name, specs] of ALL_SETS) {
      expect(specs.length, name).toBeGreaterThan(0)
      for (const [key, label, type] of specs) {
        expect(key, name).toBeTruthy()
        expect(label, name).toBeTruthy()
        expect(VALID_TYPES, `${name}.${key}`).toContain(type)
      }
    }
  })

  it('hides the metric family the action category cannot produce', () => {
    const keys = (category?: string) => perfScheduleColumns(category).map(spec => spec[0])
    const optimization = keys('Optimization')
    const launch = keys('Campaign Launch')

    // An optimisation schedule never creates campaigns or targetings.
    expect(optimization).toContain('bidsOptimized')
    expect(optimization).not.toContain('launched')
    expect(optimization).not.toContain('adGroups')
    expect(optimization).not.toContain('targeting')

    // A launch schedule has no bids, budgets or placements to optimise, and no
    // alerting either.
    expect(launch).toContain('launched')
    expect(launch).toContain('adGroups')
    expect(launch).toContain('targeting')
    expect(launch).not.toContain('optimizationEvents')
    expect(launch).not.toContain('bidsOptimized')
    expect(launch).not.toContain('alertEnabled')

    // Identity and effort are common to both.
    for (const key of ['scheduleName', 'subAccount', 'status', 'createdDate', 'lastRunStatus', 'lastRunTime', 'scheduleRuns']) {
      expect(optimization, key).toContain(key)
      expect(launch, key).toContain(key)
    }
  })

  it('keeps every column when the category is unknown', () => {
    // Hiding data because the vocabulary changed would be worse than a zero column.
    const keys = perfScheduleColumns('something new').map(spec => spec[0])
    expect(keys).toEqual(PERF_SCHEDULE_COLUMNS.map(spec => spec[0]))
    expect(keys).toContain('bidsOptimized')
    expect(keys).toContain('launched')
  })

  it('default sorts only reference columns that exist', () => {
    const known = new Set(ALL_SETS.flatMap(([, specs]) => specs.map(s => s[0])))
    for (const [table, sorting] of Object.entries(DEFAULT_SORTS)) {
      for (const entry of sorting)
        expect(known, table).toContain(entry.id)
    }
  })
})

describe('sort configuration', () => {
  it('marks array-backed columns unsortable rather than giving them a meaningless comparator', () => {
    expect(colOf(ACCOUNT_COLUMNS, 'adsConn').enableSorting).toBe(false)
    expect(colOf(CAMPAIGN_COLUMNS, 'managedBy').enableSorting).toBe(false)
    expect(colOf(SUB_ACCOUNT_COLUMNS, 'profileAccess').enableSorting).toBe(false)
  })

  it('puts nulls last on every sortable column', () => {
    for (const [name, specs] of ALL_SETS) {
      for (const [key, , type] of specs) {
        if (type === 'ratioTuple' || type === 'list')
          continue
        expect(colOf(specs, key).sortUndefined, `${name}.${key}`).toBe('last')
      }
    }
  })

  it('opens metrics descending and dates ascending', () => {
    expect(colOf(ACCOUNT_COLUMNS, 'chats').sortDescFirst).toBe(true)
    expect(colOf(PROFILE_COLUMNS, 'adSales').sortDescFirst).toBe(true)
    expect(colOf(PROFILE_COLUMNS, 'acos').sortDescFirst).toBe(true)
    expect(colOf(ACCOUNT_COLUMNS, 'adSpendSplit').sortDescFirst).toBe(true)
    expect(colOf(ACCOUNT_COLUMNS, 'joined').sortDescFirst).toBe(false)
    expect(colOf(SCHEDULE_COLUMNS, 'created').sortDescFirst).toBe(false)
  })

  it('exposes sorting only where the value has an order', () => {
    const columns = build(ACCOUNT_COLUMNS)
    const table = createTable({
      data: [],
      columns,
      state: {},
      onStateChange: () => {},
      renderFallbackValue: undefined,
      getCoreRowModel: getCoreRowModel(),
      getSortedRowModel: getSortedRowModel(),
    } as any)
    expect(table.getColumn('chats')!.getCanSort()).toBe(true)
    expect(table.getColumn('adsConn')!.getCanSort()).toBe(false)
  })
})

describe('sorting behaviour', () => {
  it('sorts a split by its total, not by the object', () => {
    const data = [
      { id: 'small', adSpendSplit: { sp: 10, sb: 0, sd: 0 } },
      { id: 'big', adSpendSplit: { sp: 900, sb: 100, sd: 1 } },
      { id: 'mid', adSpendSplit: { sp: 100, sb: 50, sd: 1 } },
    ]
    expect(sortIds(data, build(ACCOUNT_COLUMNS), [{ id: 'adSpendSplit', desc: true }])).toEqual(['big', 'mid', 'small'])
    expect(sortIds(data, build(ACCOUNT_COLUMNS), [{ id: 'adSpendSplit', desc: false }])).toEqual(['small', 'mid', 'big'])
  })

  it('keeps empty values last in BOTH directions', () => {
    const data = [{ id: 'a', chats: 3 }, { id: 'none', chats: null }, { id: 'b', chats: 1 }]
    expect(sortIds(data, build(ACCOUNT_COLUMNS), [{ id: 'chats', desc: false }])).toEqual(['b', 'a', 'none'])
    expect(sortIds(data, build(ACCOUNT_COLUMNS), [{ id: 'chats', desc: true }])).toEqual(['a', 'b', 'none'])
  })

  it('orders a severity column semantically, not alphabetically', () => {
    const data = ['Churned', 'Healthy', 'Moderate', 'At Risk'].map((status, i) => ({ id: String(i), status }))
    // Alphabetically this would be At Risk, Churned, Healthy, Moderate.
    expect(sortIds(data, build(ACCOUNT_COLUMNS), [{ id: 'status', desc: false }]))
      .toEqual(['1', '2', '3', '0'])
  })

  it('orders Connected before Disconnected', () => {
    const data = [{ id: 'off', adsApi: 'Disconnected' }, { id: 'on', adsApi: 'Connected' }]
    expect(sortIds(data, build(PROFILE_COLUMNS), [{ id: 'adsApi', desc: false }])).toEqual(['on', 'off'])
  })

  it('sorts dates chronologically', () => {
    const data = [{ id: 'later', joined: '2026-05-01' }, { id: 'earlier', joined: '2026-01-01' }]
    expect(sortIds(data, build(ACCOUNT_COLUMNS), [{ id: 'joined', desc: false }])).toEqual(['earlier', 'later'])
  })
})

describe('column widths', () => {
  it('declares a default width inside its own bounds for every column', () => {
    for (const [name, specs] of ALL_SETS) {
      for (const [key] of specs) {
        const column = colOf(specs, key)
        const label = `${name}.${key}`
        expect(column.size, label).toBeGreaterThan(0)
        expect(column.minSize, label).toBeLessThanOrEqual(column.size!)
        expect(column.maxSize, label).toBeGreaterThanOrEqual(column.size!)
      }
    }
  })

  it('sizes the identity column for a whole name, not a clipped one', () => {
    // Every table here leads with its identity column (name / organization / tool / action),
    // and the page passes that key as nameKey. It used to render in a hard-coded 180px box
    // that clipped organization names by 2px and a 276px tool name by a third.
    for (const [name, specs] of ALL_SETS) {
      const columns = makeColumns(specs, { navigate: () => {}, nameKey: specs[0][0] })
      expect(columns[0].size, name).toBeGreaterThanOrEqual(320)
      expect(columns[0].maxSize, name).toBeGreaterThanOrEqual(720)
    }
  })

  it('widens only the identity column, leaving the others on their type default', () => {
    const withoutIdentity = makeColumns(TOOL_COLUMNS, { navigate: () => {} })
    expect(withoutIdentity[0].size).toBe(168) // the tool column's own rule, untouched
    const withIdentity = makeColumns(TOOL_COLUMNS, { navigate: () => {}, nameKey: 'tool' })
    expect(withIdentity[0].size).toBe(320)
    expect(withIdentity[1].size).toBe(124) // Orgs Using stays a number column
  })

  it('never truncates the identity cell', () => {
    const vnode = cellVNode(CHAT_COLUMNS, 'name', '宁波豪雅进出口集团有限公司')
    expect(vnode.props.class).not.toContain('truncate')
    expect(vnode.props.class).toContain('whitespace-normal')
    // The full value stays reachable on hover even when a name is longer than its column.
    expect(vnode.props.title).toBe('宁波豪雅进出口集团有限公司')
  })

  it('keeps every bound finite, so a column can never be dragged away entirely', () => {
    for (const [name, specs] of ALL_SETS) {
      for (const [key] of specs) {
        const column = colOf(specs, key)
        const label = `${name}.${key}`
        expect(Number.isFinite(column.minSize), label).toBe(true)
        expect(Number.isFinite(column.maxSize), label).toBe(true)
        expect(column.minSize, label).toBeGreaterThanOrEqual(72)
        expect(column.maxSize, label).toBeLessThanOrEqual(1000)
      }
    }
  })

  it('gives composite cells enough room not to be clipped', () => {
    // MetricSplit lays itself out at 224px; the column must not be narrower.
    expect(colOf(ACCOUNT_COLUMNS, 'adSpendSplit').size).toBe(224)
    expect(colOf(ACCOUNT_COLUMNS, 'adSpendSplit').minSize).toBeGreaterThanOrEqual(176)
    expect(colOf(SUB_ACCOUNT_COLUMNS, 'profileAccess').minSize).toBeGreaterThanOrEqual(96)
    expect(colOf(CAMPAIGN_COLUMNS, 'managedBy').minSize).toBeGreaterThanOrEqual(120)
  })

  it('makes every data column resizable', () => {
    const table = sizedTable(build(ACCOUNT_COLUMNS))
    for (const column of table.getAllColumns())
      expect(column.getCanResize(), column.id).toBe(true)
  })

  it('reports the summed column width as the table width', () => {
    const table = sizedTable(build(ACCOUNT_COLUMNS))
    const summed = table.getAllColumns().reduce((total, column) => total + column.getSize(), 0)
    expect(table.getTotalSize()).toBe(summed)
  })
})

describe('column resizing', () => {
  /** Drives the real TanStack resize handler against jsdom mouse events. */
  function drag(id: string, by: number): number {
    const table = sizedTable(build(ACCOUNT_COLUMNS))
    const header = table.getHeaderGroups()[0].headers.find(h => h.column.id === id)!
    const startX = 300
    const endX = startX + by
    header.getResizeHandler()(new MouseEvent('mousedown', { clientX: startX, bubbles: true }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: endX, bubbles: true }))
    // mouseup must carry the final clientX: the handler applies an 'end' update from it.
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: endX, bubbles: true }))
    return table.getColumn(id)!.getSize()
  }

  it('applies the dragged delta', () => {
    const base = colOf(ACCOUNT_COLUMNS, 'name').size!
    expect(drag('name', 60)).toBe(base + 60)
    expect(drag('name', -60)).toBe(base - 60)
  })

  it('clamps to the column maximum however far it is dragged', () => {
    expect(drag('name', 10_000)).toBe(colOf(ACCOUNT_COLUMNS, 'name').maxSize)
  })

  it('clamps to the column minimum however far it is dragged', () => {
    expect(drag('name', -10_000)).toBe(colOf(ACCOUNT_COLUMNS, 'name').minSize)
  })
})

describe('cellDisplay', () => {
  const spec = (type: ColumnType, key = 'v'): ColumnSpec => [key, key, type]

  it('renders currency compactly and percentages with one decimal', () => {
    expect(cellDisplay({ v: 259_569.18 }, spec('currency'))).toBe('$259.6K')
    expect(cellDisplay({ v: 883.2 }, spec('currency'))).toBe('$883.2')
    expect(cellDisplay({ v: 12.34 }, spec('percent'))).toBe('12.3%')
  })

  it('renders a ratio tuple as enabled/total and a split as its three series', () => {
    expect(cellDisplay({ v: [3, 5] }, spec('ratioTuple'))).toBe('3/5')
    expect(cellDisplay({ v: { sp: 1, sb: 2, sd: 3 } }, spec('split'))).toBe('SP 1 · SB 2 · SD 3')
  })

  it('compacts a large count but leaves a readable one alone', () => {
    // Impressions and clicks are the columns where raw digits are noise.
    expect(cellDisplay({ v: 5132479 }, spec('compact'))).toBe('5.1M')
    expect(cellDisplay({ v: 39123456 }, spec('compact'))).toBe('39.1M')
    expect(cellDisplay({ v: 4342 }, spec('compact'))).toBe('4.3K')
    // Short counts stay exact rather than becoming "0.4K".
    expect(cellDisplay({ v: 942 }, spec('compact'))).toBe('942')
    expect(cellDisplay({ v: 0 }, spec('compact'))).toBe('0')
  })

  it('types impressions and clicks as compact in every table that has them', () => {
    for (const [name, specs] of ALL_SETS) {
      for (const [key, , type] of specs) {
        if (key === 'impressions' || key === 'clicks')
          expect(type, `${name}.${key}`).toBe('compact')
      }
    }
  })

  it('renders missing values as an em dash, never as zero', () => {
    for (const type of VALID_TYPES)
      expect(cellDisplay({ v: null }, spec(type)), type).toBe('—')
    expect(cellDisplay({ v: 0 }, spec('number'))).toBe('0')
  })

  it('cuts timestamps to the day', () => {
    expect(cellDisplay({ v: '2026-09-03 18:49:50.423384+00' }, spec('timestamp'))).toBe('2026-09-03')
  })
})

describe('value helpers', () => {
  it('totals a split and selects one series', () => {
    const v = { sp: 10, sb: 5, sd: 1 }
    expect(splitTotal(v)).toBe(16)
    expect(splitSeries(v)).toBe(16)
    expect(splitSeries(v, 'sb')).toBe(5)
    expect(splitTotal(null)).toBe(0)
  })

  it('derives total, enabled and coverage from a ratio tuple', () => {
    expect(tupleMetric([3, 5])).toBe(5)
    expect(tupleMetric([3, 5], 'enabled')).toBe(3)
    expect(tupleMetric([3, 5], 'coverage')).toBe(60)
    expect(tupleMetric([0, 0], 'coverage')).toBe(0)
    expect(tupleMetric(undefined)).toBe(0)
  })

  it('normalises blanks to undefined so they can sort last', () => {
    expect(sortValue(null)).toBeUndefined()
    expect(sortValue(undefined)).toBeUndefined()
    expect(sortValue('')).toBeUndefined()
    expect(sortValue(0)).toBe(0)
    expect(sortValue(false)).toBe(false)
  })

  it('labels a connection from either a boolean or a string', () => {
    expect(connectionLabel(true)).toBe('Connected')
    expect(connectionLabel(false)).toBe('Disconnected')
    expect(connectionLabel('Connected')).toBe('Connected')
  })

  it('cuts a date value to its day', () => {
    expect(dateValue('2026-09-03T18:49:50Z')).toBe('2026-09-03')
    expect(dateValue(null)).toBe('')
  })

  it('splits list-filter input into normalised needles', () => {
    expect(needles(['Bid, Budget'])).toEqual(['bid', 'budget'])
    expect(needles([' a ', '', 'b'])).toEqual(['a', 'b'])
  })
})
describe('hover preview', () => {
  const long = '第一条消息\n第二行\n第三行'

  it('wraps the conversation text columns in a tooltip', () => {
    expect(cellType(CHAT_COLUMNS, 'first', long, { previewKeys: ['first', 'summary'] })).toBe(TooltipProvider)
    expect(cellType(CHAT_COLUMNS, 'summary', long, { previewKeys: ['first', 'summary'] })).toBe(TooltipProvider)
  })

  it('leaves the other chat columns as plain cells', () => {
    // The preview is opted in per column, so a sub account or a date stays a plain cell.
    expect(cellType(CHAT_COLUMNS, 'sub', 'Account 1', { previewKeys: ['first', 'summary'] })).toBe('span')
  })

  it('previews nothing when the table does not ask for it', () => {
    expect(cellType(CHAT_COLUMNS, 'first', long)).toBe('span')
  })

  it('renders an empty conversation cell as a blank marker instead of a tooltip', () => {
    expect(cellType(CHAT_COLUMNS, 'summary', null, { previewKeys: ['summary'] })).toBe('span')
  })
})
