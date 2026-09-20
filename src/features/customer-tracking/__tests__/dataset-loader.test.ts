import { describe, expect, it } from 'vitest'

import { assertArrowPayload, assertParquetPayload } from '@/services/mosaic'

/**
 * The loader used to hand whatever HTTP returned straight to DuckDB, which then
 * failed much later with an opaque "No magic bytes found at end of file". These
 * assertions make the failure name what was actually downloaded.
 */
function parquet(body = 'DATA'): Uint8Array {
  return new TextEncoder().encode(`PAR1${body}PAR1`)
}

describe('assertParquetPayload', () => {
  it('accepts a well-formed parquet payload', () => {
    expect(() => assertParquetPayload(parquet(), 'accounts_l1_dim', 'part00001.parquet', 'application/octet-stream')).not.toThrow()
  })

  it('rejects an empty body and reports the size', () => {
    expect(() => assertParquetPayload(new Uint8Array(0), 'accounts_l1_dim', 'part00001.parquet', null))
      .toThrow(/0 bytes/)
  })

  it('rejects an XML error page served with HTTP 200', () => {
    const body = new TextEncoder().encode('<Error><Code>AccessDenied</Code></Error>')
    expect(() => assertParquetPayload(body, 'accounts_l1_dim', 'part00001.parquet', 'application/xml'))
      .toThrow(/not Parquet/)
  })

  it('names the dataset, the part and the content type', () => {
    const body = new TextEncoder().encode('not a parquet file at all')
    expect(() => assertParquetPayload(body, 'accounts_l2_profiles', 'part00007.parquet', 'text/html'))
      .toThrow(/accounts_l2_profiles.*part00007\.parquet.*text\/html/s)
  })

  it('rejects a payload that only has the leading magic bytes (truncated)', () => {
    const truncated = new TextEncoder().encode('PAR1truncated')
    expect(() => assertParquetPayload(truncated, 'd', 'p', null)).toThrow(/not Parquet/)
  })
})

/** An Arrow IPC stream: continuation marker, metadata length, then the metadata. */
function arrow(metadataLength = 64, marker = true): Uint8Array {
  const bytes = new Uint8Array(16 + metadataLength)
  const view = new DataView(bytes.buffer)
  if (marker) {
    view.setUint32(0, 0xFFFFFFFF, true)
    view.setUint32(4, metadataLength, true)
  }
  else {
    view.setUint32(0, metadataLength, true)
  }
  return bytes
}

describe('assertArrowPayload', () => {
  it('accepts a marker-prefixed stream', () => {
    expect(() => assertArrowPayload(arrow(), 'campaigns')).not.toThrow()
  })

  it('accepts a stream that omits the optional continuation marker', () => {
    expect(() => assertArrowPayload(arrow(64, false), 'campaigns')).not.toThrow()
  })

  it('rejects an empty body instead of registering an empty relation', () => {
    expect(() => assertArrowPayload(new Uint8Array(0), 'campaigns')).toThrow(/0 bytes/)
  })

  it('rejects an error page relayed with HTTP 200', () => {
    const body = new TextEncoder().encode('{"detail":"query failed"}')
    expect(() => assertArrowPayload(body, 'campaigns')).toThrow(/not an Arrow IPC stream/)
  })

  it('names the aggregate it rejected', () => {
    expect(() => assertArrowPayload(new Uint8Array(0), 'perf_attribution')).toThrow(/perf_attribution/)
  })
})
