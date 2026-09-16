import type { AsyncDuckDB } from '@duckdb/duckdb-wasm'
import type { Coordinator } from '@uwdata/mosaic-core'
import type { Query } from '@uwdata/mosaic-sql'

import * as duckdb from '@duckdb/duckdb-wasm'
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import duckdbWasmEh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import duckdbWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import { coordinator, wasmConnector } from '@uwdata/mosaic-core'

if (typeof window !== 'undefined') {
  // DuckDB-Wasm emits a non-fatal OPFS rejection when storage access is denied
  // (e.g. under cross-origin isolation without a user gesture). Suppress it.
  window.addEventListener('unhandledrejection', (event) => {
    const reason: unknown = event.reason
    if (reason instanceof Error && reason.message.includes('Access to storage is not allowed from this context'))
      event.preventDefault()
  })
}

let dbPromise: Promise<AsyncDuckDB> | null = null
let connectorPromise: Promise<ReturnType<typeof wasmConnector>> | null = null

/**
 * Tables already built inside the shared DuckDB instance, keyed by table name.
 *
 * This lives at module scope on purpose. DuckDB is a singleton, so "is this
 * dataset loaded" is a property of the database, not of whichever component
 * asked for it first. Keeping it per-component meant a remount — a route change
 * back to a page, or a dev-server hot update — re-downloaded and re-registered
 * the same virtual files. Re-registering a file name that an in-flight query is
 * still reading truncates it, and DuckDB reports that as
 * "No magic bytes found at end of file".
 */
const loadedTables = new Map<string, string[]>()

/** Loads currently in progress, so concurrent callers share one download. */
const inFlightTables = new Map<string, Promise<void>>()

/** Has this dataset already been built into a queryable table? */
export function isDatasetLoaded(name: string): boolean {
  return loadedTables.has(name)
}

/**
 * Instantiate DuckDB-Wasm from locally-bundled assets (no jsDelivr CDN) so the
 * browser never depends on an external CDN that may be unreliable in-region.
 */
async function createLocalDuckDB(): Promise<AsyncDuckDB> {
  const bundles: duckdb.DuckDBBundles = {
    mvp: { mainModule: duckdbWasm, mainWorker: mvpWorker },
    eh: { mainModule: duckdbWasmEh, mainWorker: ehWorker },
  }
  const bundle = await duckdb.selectBundle(bundles)
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING)
  const worker = new Worker(bundle.mainWorker!)
  const db = new duckdb.AsyncDuckDB(logger, worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
  await db.open({ query: { castBigIntToDouble: true, castDecimalToDouble: true } })
  return db
}

/** DuckDB-Wasm instance singleton (locally-bundled wasm assets). */
export async function getDuckDb(): Promise<AsyncDuckDB> {
  if (!dbPromise)
    dbPromise = createLocalDuckDB()
  return dbPromise
}

/** DuckDB-WASM connector singleton (shared with the Mosaic coordinator). */
async function getConnector(): Promise<ReturnType<typeof wasmConnector>> {
  if (!connectorPromise) {
    connectorPromise = (async () => {
      const db = await getDuckDb()
      const connector = wasmConnector({ duckdb: db })
      coordinator().databaseConnector(connector)
      return connector
    })()
  }
  return connectorPromise
}

/** Mosaic coordinator singleton backed by DuckDB-Wasm. */
export async function getCoordinator(): Promise<Coordinator> {
  await getConnector()
  return coordinator()
}

/** One part of a multi-file dataset export. */
export interface DatasetPart {
  /** Presigned GET URL. */
  url: string
  /** Object basename, e.g. `part00001.parquet`. */
  filename: string
}

/** A Parquet file begins and ends with the magic bytes `PAR1`. */
export function assertParquetPayload(bytes: Uint8Array, name: string, part: string, contentType: string | null): void {
  const magic = (offset: number) =>
    String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3])
  const wellFormed = bytes.length >= 8 && magic(0) === 'PAR1' && magic(bytes.length - 4) === 'PAR1'
  if (!wellFormed) {
    // Without this check the failure surfaces much later as an opaque DuckDB
    // "no magic bytes" error with no hint about what was actually downloaded.
    throw new Error(
      `Dataset "${name}" part ${part} is not Parquet: ${bytes.length} bytes, `
      + `content-type ${contentType ?? 'unknown'}. The presigned URL returned an error page or an empty body.`,
    )
  }
}

/**
 * Download a (presigned) Parquet URL with the browser `fetch` (plain GET) and
 * register the bytes locally before loading them into a DuckDB table. This
 * sidesteps duckdb-wasm httpfs's HEAD probe, which breaks on method-scoped OSS
 * presigned URLs.
 *
 * Concurrent calls for the same table share one download, and each load registers
 * its parts under generation-unique virtual file names so it can never truncate a
 * file a previous query is still reading. The previous generation's files are
 * dropped once the replacement table is built.
 */
export function loadDataset(name: string, parts: DatasetPart[]): Promise<void> {
  const running = inFlightTables.get(name)
  if (running)
    return running

  const run = (async () => {
    const db = await getDuckDb()
    const previous = loadedTables.get(name) ?? []
    const generation = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
    const files: string[] = []

    for (const part of parts) {
      const resp = await fetch(part.url)
      if (!resp.ok)
        throw new Error(`Failed to fetch dataset "${name}" (${part.filename}): HTTP ${resp.status}`)
      const bytes = new Uint8Array(await resp.arrayBuffer())
      assertParquetPayload(bytes, name, part.filename, resp.headers.get('content-type'))
      const file = `${name}__${part.filename}__${generation}`
      await db.registerFileBuffer(file, bytes)
      files.push(file)
    }

    const list = files.map(f => `'${f.replace(/'/g, '\'\'')}'`).join(', ')
    const mc = await getCoordinator()
    await mc.exec(`CREATE OR REPLACE TABLE "${name}" AS SELECT * FROM read_parquet([${list}])`)
    loadedTables.set(name, files)

    for (const stale of previous) {
      // The old files are no longer referenced by any table; free them.
      await db.dropFile(stale).catch(() => {})
    }
  })()

  inFlightTables.set(name, run)
  // Always clear the in-flight marker so a failure can be retried.
  void run.catch(() => {}).finally(() => inFlightTables.delete(name))
  return run
}

/**
 * Arrow IPC streams start with a continuation marker (`0xFFFFFFFF`) followed by the
 * metadata length; the marker is optional in the spec, which is why a bare length is
 * accepted too. Anything else — an empty body, an HTML/JSON error page relayed with
 * HTTP 200 — would otherwise be handed to DuckDB, which fails late or, worse,
 * registers an empty relation that renders as a silently empty table.
 */
export function assertArrowPayload(bytes: Uint8Array, name: string): void {
  const plausibleLength = (offset: number) => {
    const length = (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
    return length > 0 && length < bytes.length
  }
  const hasMarker = bytes.length >= 8 && bytes[0] === 0xFF && bytes[1] === 0xFF && bytes[2] === 0xFF && bytes[3] === 0xFF
  const hasBareLength = bytes.length >= 4 && plausibleLength(0)
  if (!(hasMarker && plausibleLength(4)) && !hasBareLength) {
    const head = new TextDecoder().decode(bytes.slice(0, 24)).replace(/[^\x20-\x7E]/g, '.')
    throw new Error(
      `Arrow aggregate "${name}" is not an Arrow IPC stream: ${bytes.length} bytes, starts with "${head}". `
      + 'The endpoint returned an error page or an empty body.',
    )
  }
}

/** Relations already ingested from Arrow IPC, so callers can verify rather than assume. */
const arrowTables = new Set<string>()

/**
 * Arrow relations by last use, stalest first, so the ones nothing has read recently
 * can be freed once the budget is exceeded.
 *
 * Callers name a relation after the scope it holds (a profile, a date range, a
 * schedule filter), which is what makes an ingest always a first ingest and never a
 * rewrite of a live relation. The cost is one table per scope visited, so they are
 * recycled.
 */
const arrowOrder: string[] = []
const ARROW_TABLE_BUDGET = 12

/** Mark a relation as the most recently used one, so eviction takes the stalest. */
function touchArrowRelation(name: string): void {
  const index = arrowOrder.indexOf(name)
  if (index !== -1)
    arrowOrder.splice(index, 1)
  arrowOrder.push(name)
}

async function freeArrowRelation(name: string): Promise<void> {
  if (!arrowTables.has(name))
    return
  arrowTables.delete(name)
  const index = arrowOrder.indexOf(name)
  if (index !== -1)
    arrowOrder.splice(index, 1)
  const connector = await getConnector()
  const conn = await connector.getConnection()
  // Ask the catalog rather than guessing, so DuckDB logs nothing on the attempt that
  // does not match the relation's kind.
  try {
    const existing = await conn.query(
      `SELECT table_type FROM information_schema.tables WHERE table_name = '${name.replace(/'/g, '\'\'')}'`,
    )
    for (const row of existing.toArray() as { table_type?: unknown }[]) {
      const kind = String(row.table_type ?? '').toUpperCase().includes('VIEW') ? 'VIEW' : 'TABLE'
      await conn.query(`DROP ${kind} IF EXISTS "${name}"`)
    }
  }
  catch {
    await conn.query(`DROP TABLE IF EXISTS "${name}"`).catch(() => {})
  }
}

/** Has this Arrow relation been built inside the current DuckDB instance? */
export function isArrowTableLoaded(name: string): boolean {
  if (arrowTables.has(name))
    touchArrowRelation(name)
  return arrowTables.has(name)
}

/**
 * Ingest calls are chained per relation name.
 *
 * Two overlapping ingests of one name would race inside the DuckDB worker; the chain
 * makes the last requested payload the final state, which is what its caller awaits.
 * Recycling (below) also waits for an in-flight ingest before dropping its relation.
 */
const arrowQueue = new Map<string, Promise<void>>()

/**
 * Ingest a backend-provided Arrow IPC stream as a queryable DuckDB relation.
 *
 * The backend aggregates the ~20M-row campaign view and ships Arrow; this is the
 * only way that data reaches the browser.
 *
 * Takes ownership of `bytes`: the buffer is transferred to the DuckDB worker, so
 * the caller must not read it afterwards (a detached view reports length 0, which
 * looks exactly like a failed download).
 */
export function loadArrowDataset(name: string, bytes: Uint8Array): Promise<void> {
  assertArrowPayload(bytes, name)
  const previous = arrowQueue.get(name) ?? Promise.resolve()
  const next = previous
    .catch(() => {})
    .then(async () => {
      const connector = await getConnector()
      const conn = await connector.getConnection()
      // The caller names the table after the scope it holds (see the schedule page's
      // loader), so an ingest into an existing relation is not part of the contract:
      // each scope is ingested once, and re-entries reuse the table via
      // `isArrowTableLoaded` instead of rewriting it.
      await conn.insertArrowFromIPCStream(bytes, { name })
      arrowTables.add(name)
      arrowOrder.push(name)
      while (arrowOrder.length > ARROW_TABLE_BUDGET) {
        const oldest = arrowOrder[0]
        if (oldest === name)
          break
        // Never drop a relation a concurrent load is still building.
        await (arrowQueue.get(oldest) ?? Promise.resolve()).catch(() => {})
        await freeArrowRelation(oldest)
      }
    })
  arrowQueue.set(name, next)
  // A failed ingest must not poison the chain, but must still reach its own caller.
  void next.catch(() => {}).finally(() => {
    if (arrowQueue.get(name) === next)
      arrowQueue.delete(name)
  })
  return next
}

function normalize(value: unknown): unknown {
  if (typeof value === 'bigint')
    return Number(value)
  if (Array.isArray(value))
    return value.map(normalize)
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, normalize(v)]))
  return value
}

/** Run a Mosaic query (Query builder or SQL string) and return rows as objects. */
export async function runQuery<T = Record<string, unknown>>(query: Query | string): Promise<T[]> {
  const mc = await getCoordinator()
  const rows = await mc.query(query, { type: 'json' })
  return (rows as Record<string, unknown>[]).map(row => normalize(row)) as T[]
}
