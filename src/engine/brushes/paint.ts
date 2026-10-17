import { clamp, mixRgb, type RGB } from '../color'
import { getRoundDab } from '../textures'
import { capsule, gaussian, markCircle } from './helpers'
import { COMMON, type BrushDef } from './types'

export const brush: BrushDef<null> = {
  id: 'brush',
  group: 'paint',
  shortcut: 'B',
  target: 'buffer',
  composite: 'source-over',
  pressureMode: 'pen-or-full',
  defaults: { size: 28, opacity: 1, flow: 0.35, smoothing: 0.25, hardness: 0.55 },
  controls: [COMMON.size, COMMON.opacity, COMMON.flow, COMMON.hardness, COMMON.smoothing],
  spacing: (s, p) => Math.max(0.6, s.size * (0.3 + 0.7 * p) * 0.08),
  begin: () => null,
  dab(ctx, d) {
    const s = ctx.s
    const r = Math.max(0.5, (s.size / 2) * (0.3 + 0.7 * d.pressure))
    ctx.buf.globalAlpha = clamp(s.flow * (0.4 + 0.6 * d.pressure), 0.005, 1)
    ctx.buf.drawImage(getRoundDab(ctx.color, s.hardness), d.x - r, d.y - r, r * 2, r * 2)
    markCircle(ctx, d.x, d.y, r)
  },
}

interface Bristle {
  offset: number // -1..1 across the brush
  along: number
  width: number
  alpha: number
  tone: number // brightness multiplier → streaks
  load: number // each bristle holds its own paint and runs dry at its own pace
  thirst: number
  px: number
  py: number
}

interface OilState {
  color: RGB
  load: number
  bristles: Bristle[]
  sampleCountdown: number
  angle: number
  cx: number
  cy: number
  cr: number
  oriented: boolean
}

export const oil: BrushDef<OilState> = {
  id: 'oil',
  group: 'paint',
  shortcut: 'O',
  target: 'buffer',
  composite: 'source-over',
  pressureMode: 'pen-or-full',
  defaults: { size: 34, opacity: 1, flow: 0.9, smoothing: 0.3, hardness: 0.5, mix: 0.45, load: 0.6 },
  controls: [
    COMMON.size,
    COMMON.opacity,
    { ...COMMON.flow, label: 'paint' },
    { key: 'mix', label: 'blending', min: 0, max: 1, step: 0.01, unit: '%', hint: 'blending' },
    { key: 'load', label: 'load', min: 0, max: 1, step: 0.01, unit: '%', hint: 'load' },
    COMMON.smoothing,
  ],
  spacing: (s) => Math.max(0.8, s.size * 0.06),
  begin(ctx, first) {
    const count = Math.round(clamp(ctx.s.size * 0.8, 10, 64))
    const bristles: Bristle[] = []
    for (let i = 0; i < count; i++) {
      const o = (i / (count - 1)) * 2 - 1
      bristles.push({
        offset: clamp(o + (ctx.rng() - 0.5) * (1.6 / count), -1, 1),
        along: (ctx.rng() - 0.5) * 0.3,
        width: 0.7 + ctx.rng() * 1.5,
        alpha: 0.4 + ctx.rng() * 0.6,
        tone: 0.72 + ctx.rng() * 0.52,
        // edge bristles carry less paint, so strokes dry from the outside in
        load: 1 - Math.abs(o) * 0.35 - ctx.rng() * 0.15,
        thirst: 0.6 + ctx.rng() * 0.9,
        px: first.x,
        py: first.y,
      })
    }
    let color = ctx.color
    const under = ctx.sample(first.x, first.y, Math.max(1, ctx.s.size * 0.25))
    if (under && ctx.s.mix > 0) color = mixRgb(color, [under[0], under[1], under[2]], ctx.s.mix * 0.35 * under[3])
    return {
      color,
      load: 1,
      bristles,
      sampleCountdown: 0,
      angle: first.angle,
      cx: first.x,
      cy: first.y,
      cr: 0,
      oriented: false,
    }
  },
  dab(ctx, d, st) {
    const s = ctx.s
    const b = ctx.buf
    if (d.first) return
    // pick up colour from the canvas as we drag through it
    if (s.mix > 0 && --st.sampleCountdown <= 0) {
      st.sampleCountdown = 3
      const under = ctx.sample(d.x, d.y, Math.max(1, s.size * 0.3))
      if (under && under[3] > 0.05) {
        st.color = mixRgb(st.color, [under[0], under[1], under[2]], s.mix * 0.2 * under[3])
      }
      // ...while slowly drifting back toward the loaded colour
      st.color = mixRgb(st.color, ctx.color, 0.03 * (1 - s.mix))
    }
    const spacing = Math.max(0.8, s.size * 0.06)
    const life = (5 + 55 * s.load) * s.size
    st.load = Math.max(0, st.load - spacing / life)

    if (!st.oriented) {
      st.angle = d.angle
      st.oriented = true
    } else {
      let da = d.angle - st.angle
      while (da > Math.PI) da -= Math.PI * 2
      while (da < -Math.PI) da += Math.PI * 2
      st.angle += da * 0.3
    }
    const nx = -Math.sin(st.angle)
    const ny = Math.cos(st.angle)
    const tx = Math.cos(st.angle)
    const ty = Math.sin(st.angle)
    const r = (s.size / 2) * (0.6 + 0.4 * d.pressure)
    const scale = Math.max(1, s.size / 24)
    if (st.cr === 0) {
      // First movement: lay the bristles out across the start point, facing the stroke.
      for (const br of st.bristles) {
        br.px = st.cx + nx * br.offset * r + tx * br.along * r
        br.py = st.cy + ny * br.offset * r + ty * br.along * r
      }
    }
    const [cr, cg, cb] = st.color

    // 1. body of paint underneath the bristle texture
    const body = Math.pow(st.load, 0.8) * (0.35 + 0.65 * d.pressure)
    if (body > 0.02) {
      // Overlapping dabs accumulate; solve for the per-dab alpha that builds up
      // to the target coverage across the brush width.
      const target = clamp(s.flow * 0.62 * body, 0, 0.98)
      b.globalAlpha = 1 - Math.pow(1 - target, spacing / Math.max(1, r * 1.56))
      b.fillStyle = `rgb(${cr | 0},${cg | 0},${cb | 0})`
      const r0 = st.cr || r * 0.78
      capsule(b, st.cx, st.cy, r0, d.x, d.y, r * 0.78)
    }
    st.cx = d.x
    st.cy = d.y
    st.cr = r * 0.78

    // 2. bristle streaks
    const contact = 0.35 + 0.75 * d.pressure
    b.lineCap = 'round'
    for (const br of st.bristles) {
      const x = d.x + nx * br.offset * r + tx * br.along * r
      const y = d.y + ny * br.offset * r + ty * br.along * r
      br.load = Math.max(0, br.load - (spacing / life) * br.thirst * (0.6 + Math.abs(br.offset)))
      const reach = Math.abs(br.offset)
      const paint = Math.min(br.load, st.load + 0.25)
      if (reach < contact && paint > 0.04) {
        const k = br.tone
        b.strokeStyle = `rgb(${clamp(cr * k, 0, 255) | 0},${clamp(cg * k, 0, 255) | 0},${clamp(cb * k, 0, 255) | 0})`
        b.globalAlpha = clamp(s.flow * br.alpha * (0.3 + 0.7 * Math.sqrt(paint)), 0.01, 1)
        b.lineWidth = br.width * scale
        b.beginPath()
        b.moveTo(br.px, br.py)
        b.lineTo(x, y)
        b.stroke()
      }
      br.px = x
      br.py = y
    }
    markCircle(ctx, d.x, d.y, r + 6 * scale + s.size * 0.1)
  },
}

interface SprayState {
  last: number
}

export const airbrush: BrushDef<SprayState> = {
  id: 'airbrush',
  group: 'paint',
  shortcut: 'A',
  target: 'buffer',
  composite: 'source-over',
  pressureMode: 'pen-or-full',
  continuous: true,
  defaults: { size: 90, opacity: 1, flow: 0.06, smoothing: 0.2, hardness: 0 },
  controls: [COMMON.size, COMMON.opacity, COMMON.flow, COMMON.hardness, COMMON.smoothing],
  spacing: (s) => Math.max(1, s.size * 0.06),
  begin: () => ({ last: 0 }),
  dab(ctx, d) {
    const s = ctx.s
    const r = Math.max(1, s.size / 2)
    ctx.buf.globalAlpha = clamp(s.flow * (0.15 + 0.85 * d.pressure), 0.002, 1)
    ctx.buf.drawImage(getRoundDab(ctx.color, s.hardness * 0.6), d.x - r, d.y - r, r * 2, r * 2)
    markCircle(ctx, d.x, d.y, r)
  },
}

export const spray: BrushDef<SprayState> = {
  id: 'spray',
  group: 'paint',
  shortcut: 'J',
  target: 'buffer',
  composite: 'source-over',
  pressureMode: 'pen-or-full',
  continuous: true,
  defaults: { size: 60, opacity: 1, flow: 0.5, smoothing: 0.15, hardness: 0.5, droplet: 0.35 },
  controls: [
    COMMON.size,
    COMMON.opacity,
    { ...COMMON.flow, label: 'density' },
    { key: 'droplet', label: 'dropletSize', min: 0, max: 1, step: 0.01, unit: '%' },
    COMMON.smoothing,
  ],
  spacing: (s) => Math.max(1, s.size * 0.1),
  begin: () => ({ last: 0 }),
  dab(ctx, d) {
    const s = ctx.s
    const b = ctx.buf
    const r = Math.max(1, s.size / 2)
    const n = Math.round(clamp(r * r * 0.05 * s.flow * (0.3 + 0.7 * d.pressure), 2, 900))
    const [cr, cg, cb] = ctx.color
    b.fillStyle = `rgb(${cr},${cg},${cb})`
    const dropBase = 0.35 + s.droplet * 1.6
    for (let i = 0; i < n; i++) {
      const gx = gaussian(ctx.rng) * 0.42
      const gy = gaussian(ctx.rng) * 0.42
      if (gx * gx + gy * gy > 1.2) continue
      const dr = dropBase * (0.4 + ctx.rng() * ctx.rng() * 1.6)
      b.globalAlpha = 0.35 + ctx.rng() * 0.65
      b.beginPath()
      b.arc(d.x + gx * r, d.y + gy * r, dr, 0, Math.PI * 2)
      b.fill()
    }
    markCircle(ctx, d.x, d.y, r * 1.2 + 4)
  },
}
