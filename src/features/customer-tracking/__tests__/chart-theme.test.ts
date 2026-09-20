import { describe, expect, it } from 'vitest'

import { fitFontSize, textWidthPerPoint } from '../components/chart-theme'

describe('fitFontSize', () => {
  it('keeps the base size when the text already fits', () => {
    // 3px of width per point: a 20pt label is 60px wide, well inside 66px.
    expect(fitFontSize(3, 66)).toBe(20)
  })

  it('shrinks the label so a long total stays inside the donut hole', () => {
    // 3.7 * 20 = 74px wide, which does not fit 66px.
    expect(fitFontSize(3.7, 66)).toBe(17)
  })

  it('never drops below the readable floor', () => {
    expect(fitFontSize(30, 60)).toBe(11)
  })

  it('honours a custom base and floor', () => {
    expect(fitFontSize(1, 500, 24, 8)).toBe(24)
    expect(fitFontSize(20, 100, 24, 8)).toBe(8)
  })

  it('falls back to the base size when the text cannot be measured', () => {
    expect(fitFontSize(0, 66)).toBe(20)
    expect(fitFontSize(Number.NaN, 66)).toBe(20)
    expect(fitFontSize(3, 0)).toBe(20)
  })
})

describe('textWidthPerPoint', () => {
  /** Pretends every glyph is 10px wide at the 20px base size. */
  const measurer = (font: string, text: string) => (font.includes('20px') ? text.length * 10 : 0)

  it('divides the measured width by the font size, not by the font weight', () => {
    // "$193.6M" is 7 glyphs = 70px at 20pt, i.e. 3.5px per point. Parsing the size
    // out of "600 20px sans-serif" returned 600, which made this 0.117 and left
    // every centre label at the base size for ever.
    expect(textWidthPerPoint('$193.6M', 20, 'sans-serif', 600, measurer)).toBeCloseTo(3.5)
  })

  it('builds the measuring font from the size and family it is given', () => {
    expect(textWidthPerPoint('x', 20, 'serif', 400, measurer)).toBeCloseTo(0.5)
  })

  it('cannot measure without a 2D context, and says so instead of guessing', () => {
    // jsdom has no canvas implementation; the caller must keep the base size.
    expect(textWidthPerPoint('$193.6M', 20, 'sans-serif', 600)).toBe(0)
  })

  it('rejects a meaningless font size instead of dividing by it', () => {
    expect(textWidthPerPoint('$193.6M', 0, 'sans-serif', 600, measurer)).toBe(0)
  })
})
