/**
 * Shared ECharts theming for the customer-tracking charts.
 *
 * Colours come from the Tailwind CSS custom properties, so a chart follows the
 * light/dark switch without being re-rendered. ECharts paints onto a canvas and
 * therefore needs a resolved colour string - `var(--chart-1)` is not one - so each
 * token is read back through a 1x1 canvas.
 */

export const CHART_PALETTE_TOKENS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'] as const

export function cssVarColor(name: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext('2d')
    if (!ctx)
      return value
    ctx.fillStyle = value
    ctx.fillRect(0, 0, 1, 1)
    const d = ctx.getImageData(0, 0, 1, 1).data
    return `rgb(${d[0]}, ${d[1]}, ${d[2]})`
  }
  catch {
    // A theme token that cannot be parsed (e.g. under jsdom) still beats a crash.
    return value
  }
}

export interface ChartTokens {
  palette: string[]
  muted: string
  foreground: string
  background: string
  border: string
}

/** Measures a string with a CSS font shorthand; injectable so it can be tested. */
export type TextMeasurer = (font: string, text: string) => number

function measureWithCanvas(font: string, text: string): number {
  try {
    const ctx = document.createElement('canvas').getContext('2d')
    if (!ctx)
      return 0
    ctx.font = font
    return ctx.measureText(text).width
  }
  catch {
    return 0
  }
}

/**
 * How many pixels of width one point of font size buys for a given string.
 *
 * Measured with a throwaway 2D context because character widths differ per family
 * and per digit; a fixed guess would mis-size "$193.6M" against "434.2K". The font
 * size is a separate argument rather than parsed out of the shorthand: parsing
 * "600 20px ..." yields the weight 600, which silently made every label measure as
 * extremely narrow and therefore never shrink. Returns 0 when nothing can be
 * measured (no 2D context, e.g. jsdom), which callers read as "cannot measure".
 */
export function textWidthPerPoint(
  text: string,
  fontSize: number,
  fontFamily: string,
  fontWeight: number | string = 600,
  measure?: TextMeasurer,
): number {
  if (!(fontSize > 0) || !text)
    return 0
  const font = `${fontWeight} ${fontSize}px ${fontFamily}`
  const width = measure ? measure(font, text) : measureWithCanvas(font, text)
  return width > 0 ? width / fontSize : 0
}

/**
 * Largest font size at which `textWidthPerPoint` worth of text still fits in
 * `availablePx`, clamped to [min, base].
 *
 * A donut's centre label is drawn on a fixed canvas, so an oversized total slides
 * under the ring and reads as clipped rather than wrapping.
 */
export function fitFontSize(textWidthPerPoint: number, availablePx: number, base = 20, min = 11): number {
  if (!Number.isFinite(textWidthPerPoint) || textWidthPerPoint <= 0)
    return base
  if (!Number.isFinite(availablePx) || availablePx <= 0)
    return base
  return Math.max(min, Math.min(base, Math.floor(availablePx / textWidthPerPoint)))
}

/** Resolve every token the chart components need, once per render. */
export function chartTokens(): ChartTokens {
  return {
    palette: CHART_PALETTE_TOKENS.map(cssVarColor),
    muted: cssVarColor('--muted-foreground'),
    foreground: cssVarColor('--foreground'),
    background: cssVarColor('--background'),
    border: cssVarColor('--border'),
  }
}
