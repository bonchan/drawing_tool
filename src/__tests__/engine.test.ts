import { describe, expect, it } from 'vitest'
import { hexToRgb, hsvToRgb, labDistance, oklabToRgb, rgbToHex, rgbToHsv, rgbToOklab } from '../engine/color'
import { dilateMask, floodFillMask } from '../engine/floodFill'
import { History } from '../engine/history'
import { StrokeBuilder, type Dab } from '../engine/stroke'

describe('colour conversions', () => {
  it('round-trips hex, rgb and hsv', () => {
    for (const hex of ['#000000', '#ffffff', '#2f6fb3', '#c23b3b', '#f2c94c']) {
      expect(rgbToHex(hexToRgb(hex))).toBe(hex)
      expect(rgbToHex(hsvToRgb(rgbToHsv(hexToRgb(hex))))).toBe(hex)
    }
    expect(hexToRgb('#abc')).toEqual([0xaa, 0xbb, 0xcc])
  })

  it('round-trips through OKLab', () => {
    const rgb = hexToRgb('#3e8e5a')
    const back = oklabToRgb(rgbToOklab(rgb))
    back.forEach((v, i) => expect(v).toBeCloseTo(rgb[i], 0))
    expect(labDistance(rgbToOklab([0, 0, 0]), rgbToOklab([255, 255, 255]))).toBeCloseTo(1, 2)
  })
})

describe('floodFillMask', () => {
  // 6×4 image: a vertical black wall at x = 3 splits two white regions.
  const W = 6
  const H = 4
  const img = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = x === 3 ? 0 : 255
      img.set([v, v, v, 255], (y * W + x) * 4)
    }

  it('fills only the connected region', () => {
    const res = floodFillMask(img, W, H, 0, 0, 0.1)!
    expect(res.count).toBe(3 * H)
    expect(res.x0).toBe(0)
    expect(res.x1).toBe(3)
    expect(res.mask[2]).toBe(1)
    expect(res.mask[3]).toBe(0)
    expect(res.mask[4]).toBe(0)
  })

  it('crosses the wall when tolerance allows', () => {
    expect(floodFillMask(img, W, H, 0, 0, 1)!.count).toBe(W * H)
  })

  it('grows the mask under line edges', () => {
    const res = dilateMask(floodFillMask(img, W, H, 0, 0, 0.1)!, W, H, 1)
    expect(res.count).toBe(4 * H)
  })

  it('returns null outside the image', () => {
    expect(floodFillMask(img, W, H, -1, 0, 0.1)).toBeNull()
  })
})

describe('StrokeBuilder', () => {
  const run = (smoothing: number, spacing = 2) => {
    const dabs: Dab[] = []
    const b = new StrokeBuilder({
      smoothing,
      spacing: () => spacing,
      pressureMode: 'pen-or-full',
      onDab: (d) => dabs.push(d),
    })
    for (let i = 0; i <= 50; i++) {
      b.push({ x: i * 2, y: 10, pressure: 0.5, tiltX: 0, tiltY: 0, time: i * 8, pointerType: 'pen' })
    }
    b.finish()
    return dabs
  }

  it('places evenly spaced dabs along the path', () => {
    const dabs = run(0)
    expect(dabs[0].first).toBe(true)
    expect(dabs.slice(1).every((d) => !d.first)).toBe(true)
    for (let i = 2; i < dabs.length; i++) expect(dabs[i].x - dabs[i - 1].x).toBeCloseTo(2, 1)
    expect(dabs[dabs.length - 1].x).toBeGreaterThan(97)
  })

  it('still reaches the end point with heavy smoothing', () => {
    const dabs = run(0.9)
    expect(dabs[dabs.length - 1].x).toBeGreaterThan(96)
    expect(dabs.every((d) => Math.abs(d.y - 10) < 1e-6)).toBe(true)
  })

  it('uses real pen pressure', () => {
    const dabs = run(0)
    expect(dabs[5].pressure).toBeGreaterThan(0.4)
    expect(dabs[5].pressure).toBeLessThan(0.7)
  })
})

describe('History', () => {
  it('undoes and redoes in order and drops the redo stack on new work', () => {
    const log: string[] = []
    const h = new History()
    const entry = (n: string) => ({ label: n, bytes: 1, undo: () => log.push(`-${n}`), redo: () => log.push(`+${n}`) })
    h.push(entry('a'))
    h.push(entry('b'))
    expect(h.undoLabel).toBe('b')
    h.undo()
    h.undo()
    expect(h.canUndo).toBe(false)
    h.redo()
    expect(log).toEqual(['-b', '-a', '+a'])
    h.push(entry('c'))
    expect(h.canRedo).toBe(false)
    expect(h.undoLabel).toBe('c')
  })
})
