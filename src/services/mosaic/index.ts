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

/**
 * Download a (presigned) Parquet URL with the browser `fetch` (plain GET) and
 * register the bytes locally before loading them into a DuckDB table. This
 * sidesteps duckdb-wasm httpfs's HEAD probe, which breaks on method-scoped OSS
 * presigned URLs.
 */
export async function loadDataset(name: string, urls: string[], filenames: string[]): Promise<void> {
  const db = await getDuckDb()
  for (let i = 0; i < urls.length; i++) {
    const resp = await fetch(urls[i])
    if (!resp.ok)
      throw new Error(`Failed to fetch dataset "${name}" (part ${i + 1}/${urls.length}): HTTP ${resp.status}`)
    await db.registerFileBuffer(filenames[i], new Uint8Array(await resp.arrayBuffer()))
  }
  const files = filenames.map(f => `'${f.replace(/'/g, '\'\'')}'`).join(', ')
  const mc = await getCoordinator()
  await mc.exec(`CREATE OR REPLACE TABLE "${name}" AS SELECT * FROM read_parquet([${files}])`)
}

/**
 * Ingest a backend-provided Arrow IPC stream into a DuckDB table. The backend
 * serves heavy campaign data as Arrow IPC; DuckDB registers it as a table that
 * the Mosaic coordinator can then query.
 */
export async function loadArrowDataset(name: string, bytes: Uint8Array): Promise<void> {
  const connector = await getConnector()
  const conn = await connector.getConnection()
  // Replace any existing table/view (arrow scan may register either) so a
  // re-fetch for a different profile replaces rather than appends.
  for (const kind of ['VIEW', 'TABLE'] as const) {
    try {
      await conn.query(`DROP ${kind} IF EXISTS "${name}"`)
    }
    catch {}
  }
  await conn.insertArrowFromIPCStream(bytes, { name })
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
