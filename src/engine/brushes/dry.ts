import { clamp } from '../color'
import { getGrainPattern, getRoundDab, tintRect } from '../textures'
import { blobPath, gaussian, markCircle, tiltAmount } from './helpers'
import { COMMON, type BrushDef } from './types'

const texture = {
  key: 'texture',
  label: 'grain',
  min: 0,
  max: 1,
  step: 0.01,
  unit: '%',
  hint: 'grain',
} as const

export const pencil: BrushDef<null> = {
  id: 'pencil',
  group: 'dry',
  shortcut: 'P',
  target: 'buffer',
  composite: 'source-over',
  pressureMode: 'pen-or-full',
  defaults: { size: 4, opacity: 0.92, flow: 0.55, smoothing: 0.2, hardness: 0.5, texture: 0.55 },
  controls: [COMMON.size, COMMON.opacity, { ...COMMON.flow, label: 'density' }, texture, COMMON.smoothing],
  spacing: (s) => Math.max(0.5, s.size * 0.16),
  begin: () => null,
  dab(ctx, d) {
    const s = ctx.s
    const tilt = tiltAmount(d.tiltX, d.tiltY)
    const p = d.pressure
    const r = Math.max(0.6, (s.size / 2) * (0.55 + 0.45 * p) * (1 + tilt * 2.4))
    const coverage = clamp((0.3 + 0.7 * p) * (1 - s.texture * 0.6) * (1 - tilt * 0.4), 0.08, 1)
    const b = ctx.buf
    b.globalAlpha = clamp(s.flow * (0.3 + 0.7 * p) * (1 - tilt * 0.45), 0.01, 1)
    b.fillStyle = getGrainPattern(b, coverage, 0.1 + (1 - s.texture) * 0.3)
    const x = d.x + (ctx.rng() - 0.5) * r * 0.25
    const y = d.y + (ctx.rng() - 0.5) * r * 0.25
    b.beginPath()
    b.arc(x, y, r, 0, Math.PI * 2)
    b.fill()
    tintRect(b, ctx.color, x - r - 1, y - r - 1, x + r + 1, y + r + 1)
    markCircle(ctx, x, y, r)
  },
}

export const charcoal: BrushDef<null> = {
  id: 'charcoal',
  group: 'dry',
  shortcut: 'C',
  target: 'buffer',
  composite: 'source-over',
  pressureMode: 'pen-or-full',
  defaults: { size: 18, opacity: 0.95, flow: 0.4, smoothing: 0.12, hardness: 0.3, texture: 0.7, scatter: 0.5 },
  controls: [
    COMMON.size,
    COMMON.opacity,
    { ...COMMON.flow, label: 'density' },
    texture,
    { key: 'scatter', label: 'dust', min: 0, max: 1, step: 0.01, unit: '%' },
    COMMON.smoothing,
  ],
  spacing: (s) => Math.max(0.6, s.size * 0.14),
  begin: () => null,
  dab(ctx, d) {
    const s = ctx.s
    const b = ctx.buf
    const p = d.pressure
    const tilt = tiltAmount(d.tiltX, d.tiltY)
    const r = Math.max(0.8, (s.size / 2) * (0.65 + 0.35 * p) * (1 + tilt * 1.5))
    // faint haze of dust beneath the stroke
    if (s.scatter > 0) {
      b.globalAlpha = 0.05 * s.flow * s.scatter
      const hr = r * 1.6
      b.drawImage(getRoundDab([0, 0, 0], 0), d.x - hr, d.y - hr, hr * 2, hr * 2)
    }
    const coverage = clamp((0.22 + 0.62 * p) * (1 - s.texture * 0.45), 0.08, 1)
    b.globalAlpha = clamp(s.flow * (0.35 + 0.65 * p), 0.01, 1)
    b.fillStyle = getGrainPattern(b, coverage, 0.2)
    b.save()
    b.translate(d.x, d.y)
    b.rotate(d.angle + Math.PI / 2)
    b.scale(1, 0.62)
    blobPath(b, 0, 0, r, ctx.rng, 0.42, 14)
    b.restore()
    b.fill()
    // scattered particles
    const specks = Math.round(r * s.scatter * 0.7)
    b.fillStyle = '#000'
    for (let i = 0; i < specks; i++) {
      const sx = d.x + gaussian(ctx.rng) * r * 0.75
      const sy = d.y + gaussian(ctx.rng) * r * 0.75
      const sr = 0.3 + ctx.rng() * 0.9
      b.globalAlpha = 0.15 + ctx.rng() * 0.35
      b.fillRect(sx, sy, sr, sr)
    }
    const m = r * 2.6
    tintRect(b, ctx.color, d.x - m, d.y - m, d.x + m, d.y + m)
    ctx.dirty(d.x - m, d.y - m, d.x + m, d.y + m)
  },
}

export const crayon: BrushDef<null> = {
  id: 'crayon',
  group: 'dry',
  shortcut: 'Y',
  target: 'buffer',
  composite: 'source-over',
  pressureMode: 'pen-or-full',
  defaults: { size: 14, opacity: 1, flow: 0.85, smoothing: 0.2, hardness: 0.8, texture: 0.5 },
  controls: [COMMON.size, COMMON.opacity, { ...COMMON.flow, label: 'wax' }, texture, COMMON.smoothing],
  spacing: (s) => Math.max(0.6, s.size * 0.12),
  begin: () => null,
  dab(ctx, d) {
    const s = ctx.s
    const b = ctx.buf
    const p = d.pressure
    const r = Math.max(0.8, (s.size / 2) * (0.7 + 0.3 * p))
    const coverage = clamp((0.45 + 0.5 * p) * (1 - s.texture * 0.5), 0.1, 1)
    b.globalAlpha = clamp(s.flow * (0.55 + 0.45 * p), 0.01, 1)
    b.fillStyle = getGrainPattern(b, coverage, 0.06)
    blobPath(b, d.x, d.y, r, ctx.rng, 0.16, 16)
    b.fill()
    tintRect(b, ctx.color, d.x - r * 1.2, d.y - r * 1.2, d.x + r * 1.2, d.y + r * 1.2)
    markCircle(ctx, d.x, d.y, r * 1.2)
  },
}

