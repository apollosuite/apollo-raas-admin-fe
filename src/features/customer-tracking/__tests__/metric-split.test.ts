import { describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'

import MetricSplit from '../components/metric-split.vue'

/** SSR keeps this test independent of a DOM environment (none is configured). */
function render(props: Record<string, unknown>): Promise<string> {
  return renderToString(createSSRApp(MetricSplit, props))
}

const ROW = { sp: 259_569.18, sb: 122_490.84, sd: 3_564.07 }

describe('metricSplit', () => {
  it('renders one labelled value per series', async () => {
    const html = await render({ value: ROW, currency: true })
    for (const label of ['SP', 'SB', 'SD'])
      expect(html).toContain(`>${label}</span>`)
    expect(html).toContain('$259.6K')
    expect(html).toContain('$122.5K')
    expect(html).toContain('$3.6K')
  })

  it('keeps the exact amount and the share of the row total on hover', async () => {
    const html = await render({ value: ROW, currency: true })
    expect(html).toContain('title="SP $259,569.18 · 67.3% of $385,624.09"')
  })

  it('formats counts without a currency prefix', async () => {
    const html = await render({ value: { sp: 1_250_000, sb: 340_000, sd: 12_000 } })
    expect(html).toContain('1.3M')
    expect(html).toContain('340K')
    expect(html).toContain('12K')
    expect(html).not.toContain('$')
  })

  it('renders a missing series as an em dash rather than zero', async () => {
    const html = await render({ value: { sp: null, sb: 0, sd: 1_500 }, currency: true })
    expect(html).toContain('—')
    expect(html).toContain('$0')
    expect(html).toContain('$1.5K')
  })
})
