import { capsule, smoothstep } from './helpers'
import { COMMON, type BrushDef, type PaintContext } from './types'
import type { Dab } from '../stroke'

interface CapsuleState {
  px: number
  py: number
  pr: number
  has: boolean
}

function solid(ctx: PaintContext) {
  const [r, g, b] = ctx.color
  ctx.buf.globalAlpha = 1
  ctx.buf.fillStyle = `rgb(${r},${g},${b})`
}

function capsuleDab(ctx: PaintContext, d: Dab, st: CapsuleState, radius: number) {
  solid(ctx)
  if (st.has) capsule(ctx.buf, st.px, st.py, st.pr, d.x, d.y, radius)
  else capsule(ctx.buf, d.x, d.y, radius, d.x, d.y, radius)
  const m = Math.max(radius, st.has ? st.pr : 0) + 2
  ctx.dirty(Math.min(st.has ? st.px : d.x, d.x) - m, Math.min(st.has ? st.py : d.y, d.y) - m,
    Math.max(st.has ? st.px : d.x, d.x) + m, Math.max(st.has ? st.py : d.y, d.y) + m)
  st.px = d.x
  st.py = d.y
  st.pr = radius
  st.has = true
}

const newCapsule = (): CapsuleState => ({ px: 0, py: 0, pr: 0, has: false })

export const pen: BrushDef<CapsuleState> = {
  id: 'pen',
  group: 'ink',
  shortcut: 'N',
  target: 'buffer',
  composite: 'source-over',
  pressureMode: 'pen-or-full',
  defaults: { size: 3, opacity: 1, flow: 1, smoothing: 0.45, hardness: 1 },
  controls: [COMMON.size, COMMON.opacity, COMMON.smoothing],
  spacing: (s) => Math.max(0.6, s.size * 0.22),
  begin: newCapsule,
  dab(ctx, d, st) {
    capsuleDab(ctx, d, st, Math.max(0.45, (ctx.s.size / 2) * (0.72 + 0.28 * d.pressure)))
  },
}

interface InkState {
  pts: Array<{ x: number; y: number; r: number; dist: number }>
  cap: CapsuleState
}

function inkRadius(ctx: PaintContext, d: Dab) {
  const s = ctx.s
  const curve = 0.05 + 0.95 * Math.pow(d.pressure, 1.35)
  const taperIn = s.taper > 0 ? 0.15 + 0.85 * smoothstep(0, s.size * 1.2 * s.taper, d.dist) : 1
  return Math.max(0.35, (s.size / 2) * curve * taperIn)
}

export const ink: BrushDef<InkState> = {
  id: 'ink',
  group: 'ink',
  shortcut: 'K',
  target: 'buffer',
  composite: 'source-over',
  pressureMode: 'pen-or-velocity',
  defaults: { size: 16, opacity: 1, flow: 1, smoothing: 0.35, hardness: 1, taper: 0.6 },
  controls: [
    COMMON.size,
    COMMON.opacity,
    { key: 'taper', label: 'taper', min: 0, max: 1, step: 0.01, unit: '%', hint: 'taper' },
    COMMON.smoothing,
  ],
  spacing: (s) => Math.max(0.6, s.size * 0.12),
  begin: () => ({ pts: [], cap: newCapsule() }),
  dab(ctx, d, st) {
    const r = inkRadius(ctx, d)
    st.pts.push({ x: d.x, y: d.y, r, dist: d.dist })
    capsuleDab(ctx, d, st.cap, r)
  },
  endMode: 'rerender',
  end(ctx, st) {
    const s = ctx.s
    if (st.pts.length === 0) return
    if (s.taper <= 0 || st.pts.length < 3) {
      // nothing to taper: just put the plain stroke back
      solid(ctx)
      let prev = st.pts[0]
      for (const p of st.pts) {
        capsule(ctx.buf, prev.x, prev.y, prev.r, p.x, p.y, p.r)
        prev = p
      }
      return
    }
    const total = st.pts[st.pts.length - 1].dist
    const taperLen = Math.max(1, Math.min(total * 0.45, s.size * 4 * s.taper))
    // Re-render the whole stroke with a pointed tail (the caller cleared the buffer).
    solid(ctx)
    let prev = st.pts[0]
    for (let i = 0; i < st.pts.length; i++) {
      const p = st.pts[i]
      const k = Math.pow(Math.min(1, (total - p.dist) / taperLen), 0.65)
      const r = Math.max(0.3, p.r * k)
      const pr = i === 0 ? r : Math.max(0.3, prev.r * Math.pow(Math.min(1, (total - prev.dist) / taperLen), 0.65))
      capsule(ctx.buf, prev.x, prev.y, pr, p.x, p.y, r)
      prev = p
    }
  },
}

interface NibState {
  ax: number
  ay: number
  bx: number
  by: number
  has: boolean
}

function nibDab(ctx: PaintContext, d: Dab, st: NibState, width: number, angleDeg: number, thickness: number) {
  const a = (angleDeg * Math.PI) / 180
  const hx = (Math.cos(a) * width) / 2
  const hy = (Math.sin(a) * width) / 2
  const ax = d.x + hx
  const ay = d.y + hy
  const bx = d.x - hx
  const by = d.y - hy
  solid(ctx)
  const b = ctx.buf
  if (st.has) {
    b.beginPath()
    b.moveTo(st.ax, st.ay)
    b.lineTo(st.bx, st.by)
    b.lineTo(bx, by)
    b.lineTo(ax, ay)
    b.closePath()
    b.fill()
  }
  // the nib itself, so strokes parallel to the nib keep a minimum thickness
  b.lineWidth = thickness
  b.lineCap = 'round'
  b.strokeStyle = b.fillStyle
  b.beginPath()
  b.moveTo(ax, ay)
  b.lineTo(bx, by)
  b.stroke()
  const m = width / 2 + thickness + 2
  const minx = Math.min(d.x, st.has ? (st.ax + st.bx) / 2 : d.x)
  const maxx = Math.max(d.x, st.has ? (st.ax + st.bx) / 2 : d.x)
  const miny = Math.min(d.y, st.has ? (st.ay + st.by) / 2 : d.y)
  const maxy = Math.max(d.y, st.has ? (st.ay + st.by) / 2 : d.y)
  ctx.dirty(minx - m, miny - m, maxx + m, maxy + m)
  st.ax = ax
  st.ay = ay
  st.bx = bx
  st.by = by
  st.has = true
}

const newNib = (): NibState => ({ ax: 0, ay: 0, bx: 0, by: 0, has: false })

export const calligraphy: BrushDef<NibState> = {
  id: 'calligraphy',
  group: 'ink',
  shortcut: 'Q',
  target: 'buffer',
  composite: 'source-over',
  pressureMode: 'pen-or-full',
  defaults: { size: 18, opacity: 1, flow: 1, smoothing: 0.4, hardness: 1, angle: 40 },
  controls: [
    COMMON.size,
    COMMON.opacity,
    { key: 'angle', label: 'nibAngle', min: 0, max: 180, step: 1, unit: '°' },
    COMMON.smoothing,
  ],
  spacing: (s) => Math.max(0.6, s.size * 0.08),
  begin: newNib,
  dab(ctx, d, st) {
    const s = ctx.s
    nibDab(ctx, d, st, s.size * (0.35 + 0.65 * d.pressure), s.angle, Math.max(1, s.size * 0.07))
  },
}

export const marker: BrushDef<CapsuleState> = {
  id: 'marker',
  group: 'ink',
  shortcut: 'M',
  target: 'buffer',
  composite: 'multiply',
  pressureMode: 'pen-or-full',
  defaults: { size: 16, opacity: 0.7, flow: 1, smoothing: 0.3, hardness: 1 },
  controls: [COMMON.size, COMMON.opacity, COMMON.smoothing],
  spacing: (s) => Math.max(0.6, s.size * 0.15),
  begin: newCapsule,
  dab(ctx, d, st) {
    capsuleDab(ctx, d, st, Math.max(0.5, (ctx.s.size / 2) * (0.88 + 0.12 * d.pressure)))
  },
}

export const highlighter: BrushDef<NibState> = {
  id: 'highlighter',
  group: 'ink',
  shortcut: 'L',
  target: 'buffer',
  composite: 'multiply',
  pressureMode: 'pen-or-full',
  defaults: { size: 26, opacity: 0.45, flow: 1, smoothing: 0.5, hardness: 1 },
  controls: [COMMON.size, COMMON.opacity, COMMON.smoothing],
  spacing: (s) => Math.max(0.6, s.size * 0.06),
  begin: newNib,
  dab(ctx, d, st) {
    nibDab(ctx, d, st, ctx.s.size, 90, Math.max(2, ctx.s.size * 0.32))
  },
}
