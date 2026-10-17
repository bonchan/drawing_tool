import { describe, expect, it } from 'vitest'
import { analyzePalette, familyOf, type PaletteRequest } from '../analysis/palette'
import { hexToRgb, rgbToOklab, type RGB } from '../engine/color'

const PAPER: RGB = [251, 248, 241]

/** Build a fake sample grid from a list of [colour, count, painted] runs. */
function grid(runs: Array<[string, number, boolean]>): Pick<PaletteRequest, 'color' | 'coverage'> {
  const n = runs.reduce((s, r) => s + r[1], 0)
  const color = new Uint8ClampedArray(n * 4)
  const coverage = new Uint8ClampedArray(n * 4)
  let i = 0
  for (const [hex, count, painted] of runs) {
    const [r, g, b] = hexToRgb(hex)
    for (let k = 0; k < count; k++, i++) {
      color.set([r, g, b, 255], i * 4)
      coverage.set([r, g, b, painted ? 255 : 0], i * 4)
    }
  }
  return { color, coverage }
}

const req = (g: ReturnType<typeof grid>, extra: Partial<PaletteRequest> = {}): PaletteRequest => ({
  ...g,
  includePaper: false,
  mergeDistance: 0.06,
  maxColors: 12,
  paper: PAPER,
  ...extra,
})

describe('analyzePalette', () => {
  it('reports exact shares of painted colours', () => {
    const r = analyzePalette(
      req(grid([['#fbf8f1', 500, false], ['#2f6fb3', 300, true], ['#c23b3b', 150, true], ['#f2c94c', 50, true]])),
    )
    expect(r.swatches.map((s) => s.hex)).toEqual(['#2f6fb3', '#c23b3b', '#f2c94c'])
    expect(r.swatches[0].share).toBeCloseTo(0.6, 5)
    expect(r.swatches[1].share).toBeCloseTo(0.3, 5)
    expect(r.swatches[2].share).toBeCloseTo(0.1, 5)
    expect(r.coverage).toBeCloseTo(0.5, 5)
    expect(r.other).toBe(0)
  })

  it('counts the paper when asked and labels it', () => {
    const r = analyzePalette(req(grid([['#fbf8f1', 750, false], ['#2f6fb3', 250, true]]), { includePaper: true }))
    expect(r.swatches[0].nameId).toBe('paper')
    expect(r.swatches[0].isPaper).toBe(true)
    expect(r.swatches[0].share).toBeCloseTo(0.75, 5)
  })

  it('merges near-identical tints but keeps distinct colours apart', () => {
    const r = analyzePalette(req(grid([['#2f6fb3', 100, true], ['#3070b4', 100, true], ['#c23b3b', 100, true]])))
    expect(r.swatches).toHaveLength(2)
    expect(r.swatches[0].share).toBeCloseTo(2 / 3, 5)
  })

  it('keeps pale tints of different hues apart', () => {
    const r = analyzePalette(req(grid([['#edcac5', 200, true], ['#d3dde5', 100, true]])))
    expect(r.swatches).toHaveLength(2)
    expect(r.swatches[0].share).toBeCloseTo(2 / 3, 5)
  })

  it('treats light and dark variants of one wash as one colour', () => {
    const r = analyzePalette(req(grid([['#d3dde5', 200, true], ['#bbcddd', 100, true], ['#a3bdd5', 30, true]])))
    expect(r.swatches).toHaveLength(1)
  })

  it('separates more colours at higher detail', () => {
    const g = grid([['#2f6fb3', 100, true], ['#4a86c6', 100, true], ['#1d4f8a', 100, true]])
    const coarse = analyzePalette(req(g, { mergeDistance: 0.17 }))
    const fine = analyzePalette(req(g, { mergeDistance: 0.02 }))
    expect(coarse.swatches.length).toBeLessThan(fine.swatches.length)
    expect(fine.swatches).toHaveLength(3)
  })

  it('ignores paper-coloured paint when paper is excluded', () => {
    const r = analyzePalette(req(grid([['#fbf8f1', 400, true], ['#2f6fb3', 100, true]])))
    expect(r.swatches).toHaveLength(1)
    expect(r.swatches[0].share).toBeCloseTo(1, 5)
  })

  it('folds the tail into "other" beyond maxColors', () => {
    const hexes = ['#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6']
    const runs = hexes.map((h, i): [string, number, boolean] => [h, 100 - i * 5, true])
    const r = analyzePalette(req(grid(runs), { maxColors: 4 }))
    expect(r.swatches).toHaveLength(4)
    const sum = r.swatches.reduce((s, c) => s + c.share, 0) + r.other
    expect(sum).toBeCloseTo(1, 5)
    expect(r.other).toBeGreaterThan(0)
  })

  it('gives duplicate names light/dark qualifiers', () => {
    const r = analyzePalette(req(grid([['#2f6fb3', 100, true], ['#1d4f8a', 100, true]]), { mergeDistance: 0.02 }))
    const names = r.swatches.map((s) => `${s.nameId}|${s.shade ?? ''}`)
    expect(new Set(names).size).toBe(names.length)
  })

  it('returns an empty result for a blank canvas', () => {
    const r = analyzePalette(req(grid([['#fbf8f1', 100, false]])))
    expect(r.samples).toBe(0)
    expect(r.swatches).toEqual([])
  })

  it('builds a value (lightness) histogram that sums to 1', () => {
    const r = analyzePalette(req(grid([['#111111', 50, true], ['#eeeeee', 50, true]])))
    expect(r.values.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5)
    expect(r.values[0] + r.values[1] + r.values[2]).toBeCloseTo(0.5, 5)
  })
})

describe('familyOf', () => {
  const fam = (hex: string) => familyOf(rgbToOklab(hexToRgb(hex)))
  it('classifies common colours', () => {
    expect(fam('#d62828')).toBe('reds')
    expect(fam('#f77f00')).toBe('oranges')
    expect(fam('#fcbf49')).toBe('yellows')
    expect(fam('#2a9d3f')).toBe('greens')
    expect(fam('#1d4fd8')).toBe('blues')
    expect(fam('#7b2cbf')).toBe('purples')
    expect(fam('#808080')).toBe('neutrals')
    expect(fam('#6f4e37')).toBe('browns')
    expect(fam('#8a3324')).toBe('browns')
    expect(fam('#c23b3b')).toBe('reds')
  })
})
