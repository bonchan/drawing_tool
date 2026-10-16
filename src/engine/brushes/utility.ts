import { clamp } from '../color'
import { createCanvas, get2d, getRoundDab } from '../textures'
import { markCircle } from './helpers'
import { COMMON, type BrushDef } from './types'

export const eraser: BrushDef<null> = {
  id: 'eraser',
  name: 'Eraser',
  group: 'Utility',
  description: 'Removes paint from the active layer. Lower hardness for a soft kneaded-eraser feel.',
  shortcut: 'E',
  target: 'buffer',
  composite: 'destination-out',
  pressureMode: 'pen-or-full',
  defaults: { size: 36, opacity: 1, flow: 1, smoothing: 0.2, hardness: 0.85 },
  controls: [COMMON.size, COMMON.opacity, COMMON.flow, COMMON.hardness, COMMON.smoothing],
  spacing: (s) => Math.max(0.6, s.size * 0.08),
  begin: () => null,
  dab(ctx, d) {
    const s = ctx.s
    const r = Math.max(0.5, (s.size / 2) * (0.5 + 0.5 * d.pressure))
    ctx.buf.globalAlpha = clamp(s.flow * (0.5 + 0.5 * d.pressure), 0.01, 1)
    ctx.buf.drawImage(getRoundDab([0, 0, 0], s.hardness), d.x - r, d.y - r, r * 2, r * 2)
    markCircle(ctx, d.x, d.y, r)
  },
}

interface SmudgeState {
  carry: HTMLCanvasElement
  carryCtx: CanvasRenderingContext2D
  d: number
}

export const smudge: BrushDef<SmudgeState> = {
  id: 'smudge',
  name: 'Blender',
  group: 'Utility',
  description: 'Smudges and blends paint like a finger or a soft blending stump.',
  shortcut: 'U',
  target: 'layer',
  composite: 'source-over',
  pressureMode: 'pen-or-full',
  defaults: { size: 40, opacity: 1, flow: 1, smoothing: 0.25, hardness: 0.3, strength: 0.7 },
  controls: [
    COMMON.size,
    { key: 'strength', label: 'Strength', min: 0.05, max: 0.98, step: 0.01, unit: '%', hint: 'How far paint is dragged' },
    COMMON.hardness,
    COMMON.smoothing,
  ],
  spacing: (s) => Math.max(0.6, s.size * 0.07),
  begin(ctx, first) {
    const d = Math.max(2, Math.ceil(ctx.s.size))
    const carry = createCanvas(d, d)
    const carryCtx = get2d(carry)
    carryCtx.drawImage(ctx.layer.canvas, first.x - d / 2, first.y - d / 2, d, d, 0, 0, d, d)
    return { carry, carryCtx, d }
  },
  dab(ctx, dab, st) {
    const s = ctx.s
    const D = st.d
    const r = D / 2
    const k = clamp(s.strength * (0.45 + 0.55 * dab.pressure), 0, 0.98)
    const mask = getRoundDab([0, 0, 0], s.hardness)
    // All mixing happens in premultiplied space with destination-out + lighter,
    // i.e. a true lerp – so smudging into empty areas thins the paint out
    // instead of dragging an endless trail of colour.
    // 1. carried paint through the soft brush mask
    const tmp = ctx.scratch(D, D)
    tmp.globalAlpha = 1
    tmp.globalCompositeOperation = 'copy'
    tmp.drawImage(st.carry, 0, 0)
    tmp.globalCompositeOperation = 'destination-in'
    tmp.drawImage(mask, 0, 0, D, D)
    tmp.globalCompositeOperation = 'source-over'
    // 2. layer = layer·(1 − k·mask) + carry·mask·k
    const L = ctx.layer
    L.save()
    L.beginPath()
    L.rect(dab.x - r, dab.y - r, D, D)
    L.clip()
    L.globalAlpha = k
    L.globalCompositeOperation = 'destination-out'
    L.drawImage(mask, dab.x - r, dab.y - r, D, D)
    L.globalCompositeOperation = 'lighter'
    L.drawImage(tmp.canvas, 0, 0, D, D, dab.x - r, dab.y - r, D, D)
    L.restore()
    // 3. carry = carry·k + under·(1 − k)
    const c = st.carryCtx
    c.globalAlpha = 1 - k
    c.globalCompositeOperation = 'destination-out'
    c.fillStyle = '#000'
    c.fillRect(0, 0, D, D)
    c.globalCompositeOperation = 'lighter'
    c.drawImage(L.canvas, dab.x - r, dab.y - r, D, D, 0, 0, D, D)
    c.globalAlpha = 1
    c.globalCompositeOperation = 'source-over'
    markCircle(ctx, dab.x, dab.y, r)
  },
}
