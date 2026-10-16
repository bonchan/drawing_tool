import { clamp, mixRgb, type RGB } from '../color'
import { getRoundDab } from '../textures'
import { gaussian, markCircle } from './helpers'
import { COMMON, type BrushDef } from './types'

export const brush: BrushDef<null> = {
  id: 'brush',
  name: 'Round Brush',
  group: 'Paint',
  description: 'Soft round brush with pressure-controlled size and flow. The everyday workhorse.',
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
  tone: number // brightness multiplier
  px: number
  py: number
  has: boolean
}

interface OilState {
  color: RGB
  load: number
  bristles: Bristle[]
  sampleCountdown: number
  angle: number
}

export const oil: BrushDef<OilState> = {
  id: 'oil',
  name: 'Oil Paint',
  group: 'Paint',
  description: 'Bristle brush that leaves streaks, runs dry, and picks up and blends the colours already on the canvas.',
  shortcut: 'O',
  target: 'buffer',
  composite: 'source-over',
  pressureMode: 'pen-or-full',
  defaults: { size: 34, opacity: 1, flow: 0.85, smoothing: 0.3, hardness: 0.5, mix: 0.45, load: 0.6 },
  controls: [
    COMMON.size,
    COMMON.opacity,
    { ...COMMON.flow, label: 'Paint' },
    { key: 'mix', label: 'Blending', min: 0, max: 1, step: 0.01, unit: '%', hint: 'Picks up colour from the canvas' },
    { key: 'load', label: 'Load', min: 0, max: 1, step: 0.01, unit: '%', hint: 'How long until the brush runs dry' },
    COMMON.smoothing,
  ],
  spacing: (s) => Math.max(0.8, s.size * 0.07),
  begin(ctx, first) {
    const count = Math.round(clamp(ctx.s.size * 0.9, 8, 70))
    const bristles: Bristle[] = []
    for (let i = 0; i < count; i++) {
      const o = (i / (count - 1)) * 2 - 1
      bristles.push({
        offset: clamp(o + (ctx.rng() - 0.5) * (2 / count), -1, 1),
        along: (ctx.rng() - 0.5) * 0.35,
        width: 0.6 + ctx.rng() * 1.1,
        alpha: 0.45 + ctx.rng() * 0.55,
        tone: 0.88 + ctx.rng() * 0.24,
        px: 0,
        py: 0,
        has: false,
      })
    }
    let color = ctx.color
    const under = ctx.sample(first.x, first.y, Math.max(1, ctx.s.size * 0.25))
    if (under && ctx.s.mix > 0) color = mixRgb(color, [under[0], under[1], under[2]], ctx.s.mix * 0.35 * under[3])
    return { color, load: 1, bristles, sampleCountdown: 0, angle: first.angle }
  },
  dab(ctx, d, st) {
    const s = ctx.s
    const b = ctx.buf
    // pick up colour from the canvas as we drag through it
    if (s.mix > 0 && --st.sampleCountdown <= 0) {
      st.sampleCountdown = 3
      const under = ctx.sample(d.x, d.y, Math.max(1, s.size * 0.3))
      if (under && under[3] > 0.05) {
        st.color = mixRgb(st.color, [under[0], under[1], under[2]], s.mix * 0.22 * under[3])
      }
      // ...while slowly reloading toward the brush colour
      st.color = mixRgb(st.color, ctx.color, 0.04 * (1 - s.mix))
    }
    const spacing = Math.max(0.8, s.size * 0.07)
    const life = (6 + 60 * s.load) * s.size
    st.load = Math.max(0, st.load - spacing / life)
    let da = d.angle - st.angle
    while (da > Math.PI) da -= Math.PI * 2
    while (da < -Math.PI) da += Math.PI * 2
    st.angle += da * 0.25
    const nx = -Math.sin(st.angle)
    const ny = Math.cos(st.angle)
    const tx = Math.cos(st.angle)
    const ty = Math.sin(st.angle)
    const r = (s.size / 2) * (0.55 + 0.45 * d.pressure)
    const scale = Math.max(1, s.size / 26)
    // with less paint/pressure, only some bristles touch the canvas → dry-brush scumbling
    const contact = clamp(0.25 + 0.55 * d.pressure + 0.5 * st.load, 0, 1.2)
    const [cr, cg, cb] = st.color
    b.lineCap = 'round'
    for (const br of st.bristles) {
      const reach = Math.abs(br.offset)
      const x = d.x + nx * br.offset * r + tx * br.along * r
      const y = d.y + ny * br.offset * r + ty * br.along * r
      if (br.has && reach < contact && ctx.rng() < 0.6 + 0.4 * st.load) {
        const k = br.tone
        b.strokeStyle = `rgb(${clamp(cr * k, 0, 255) | 0},${clamp(cg * k, 0, 255) | 0},${clamp(cb * k, 0, 255) | 0})`
        b.globalAlpha = clamp(s.flow * br.alpha * (0.35 + 0.65 * st.load) * (1 - reach * 0.35), 0.01, 1)
        b.lineWidth = br.width * scale
        b.beginPath()
        b.moveTo(br.px, br.py)
        b.lineTo(x, y)
        b.stroke()
      }
      br.px = x
      br.py = y
      br.has = true
    }
    markCircle(ctx, d.x, d.y, r + 6 * scale + s.size * 0.1)
  },
}

interface SprayState {
  last: number
}

export const airbrush: BrushDef<SprayState> = {
  id: 'airbrush',
  name: 'Airbrush',
  group: 'Paint',
  description: 'Ultra-soft spray that keeps building up while you hold it in place.',
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
  name: 'Spray Can',
  group: 'Paint',
  description: 'Graffiti-style spray paint made of thousands of tiny droplets.',
  shortcut: 'J',
  target: 'buffer',
  composite: 'source-over',
  pressureMode: 'pen-or-full',
  continuous: true,
  defaults: { size: 60, opacity: 1, flow: 0.5, smoothing: 0.15, hardness: 0.5, droplet: 0.35 },
  controls: [
    COMMON.size,
    COMMON.opacity,
    { ...COMMON.flow, label: 'Density' },
    { key: 'droplet', label: 'Droplet size', min: 0, max: 1, step: 0.01, unit: '%' },
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
