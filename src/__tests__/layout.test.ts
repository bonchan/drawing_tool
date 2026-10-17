import { afterEach, describe, expect, it } from 'vitest'
import { fromSliderPos, toSliderPos } from '../lib/sliderMath'
import { computeLayout, panelDefaults } from '../state/ui'

const g = globalThis as unknown as { window?: unknown }

function screen(w: number, h: number, coarse: boolean) {
  g.window = { innerWidth: w, innerHeight: h, matchMedia: () => ({ matches: coarse }) }
  return computeLayout()
}

afterEach(() => {
  delete g.window
})

describe('computeLayout', () => {
  it('picks a layout per device', () => {
    expect(screen(1440, 900, false)).toEqual({ layout: 'desktop', dockRight: true })
    expect(screen(1024, 768, false)).toEqual({ layout: 'desktop', dockRight: true })
    // iPad landscape / portrait
    expect(screen(1180, 820, true)).toEqual({ layout: 'tablet', dockRight: true })
    expect(screen(820, 1180, true)).toEqual({ layout: 'tablet', dockRight: false })
    expect(screen(768, 1024, false)).toEqual({ layout: 'tablet', dockRight: false })
    // phones, including landscape
    expect(screen(390, 844, true).layout).toBe('phone')
    expect(screen(844, 390, true).layout).toBe('phone')
    expect(screen(560, 900, false).layout).toBe('phone')
  })

  it('opens the right panels by default', () => {
    expect(panelDefaults({ layout: 'desktop', dockRight: true })).toEqual({ leftOpen: true, rightOpen: true, sheet: null })
    expect(panelDefaults({ layout: 'tablet', dockRight: true })).toEqual({ leftOpen: false, rightOpen: true, sheet: null })
    expect(panelDefaults({ layout: 'tablet', dockRight: false })).toEqual({ leftOpen: false, rightOpen: false, sheet: null })
    expect(panelDefaults({ layout: 'phone', dockRight: false })).toEqual({ leftOpen: false, rightOpen: false, sheet: null })
  })
})

describe('slider math', () => {
  it('round-trips linear and quadratic scales', () => {
    const size = { min: 1, max: 400, unit: 'px', curve: 'quad' as const }
    for (const v of [1, 4, 28, 150, 400]) expect(fromSliderPos(toSliderPos(v, size), size)).toBe(v)
    const opacity = { min: 0.01, max: 1, step: 0.01, unit: '%' }
    expect(fromSliderPos(toSliderPos(0.5, opacity), opacity)).toBeCloseTo(0.5, 5)
  })

  it('gives small sizes more travel and clamps', () => {
    const size = { min: 1, max: 400, unit: 'px', curve: 'quad' as const }
    expect(toSliderPos(20, size)).toBeGreaterThan(0.2)
    expect(fromSliderPos(-1, size)).toBe(1)
    expect(fromSliderPos(2, size)).toBe(400)
  })
})
