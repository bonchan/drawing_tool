import { clamp, shiftLightness } from '../color'
import { getEdgeNoise, getLowNoise, getPaperGrain, getRoundDab } from '../textures'
import { boxBlur, markCircle, smoothstep } from './helpers'
import { COMMON, type BrushDef, type Rect } from './types'

/**
 * Watercolor ("acuarela").
 *
 * While painting, the stroke is laid down as a soft "wet" mask so it can be
 * previewed instantly. When the stroke is released the paint "dries": the
 * mask is blurred and re-thresholded against noise so the edge bleeds
 * irregularly, pigment collects at the rim (edge darkening), settles into the
 * paper grain (granulation) and pools unevenly (blooms). The result is merged
 * with a multiply blend, so overlapping washes glaze like real transparent paint.
 */
export const watercolor: BrushDef<null> = {
  id: 'watercolor',
  group: 'paint',
  shortcut: 'W',
  target: 'buffer',
  composite: 'multiply',
  pressureMode: 'pen-or-full',
  bakesOpacity: true,
  previewOpacity: 0.8,
  defaults: { size: 44, opacity: 0.5, flow: 1, smoothing: 0.3, hardness: 0.5, wetness: 0.5, granulation: 0.45 },
  controls: [
    COMMON.size,
    { ...COMMON.opacity, label: 'pigment' },
    { key: 'wetness', label: 'wetness', min: 0, max: 1, step: 0.01, unit: '%', hint: 'wetness' },
    {
      key: 'granulation',
      label: 'granulation',
      min: 0,
      max: 1,
      step: 0.01,
      unit: '%',
      hint: 'granulation',
    },
    COMMON.smoothing,
  ],
  spacing: (s) => Math.max(0.8, s.size * 0.1),
  begin: () => null,
  dab(ctx, d) {
    const s = ctx.s
    const r = Math.max(1, (s.size / 2) * (0.5 + 0.5 * d.pressure))
    ctx.buf.globalAlpha = 0.5 + 0.5 * d.pressure
    ctx.buf.drawImage(getRoundDab(ctx.color, 0.6), d.x - r, d.y - r, r * 2, r * 2)
    markCircle(ctx, d.x, d.y, r)
  },
  end(ctx, _st, bounds): Rect {
    const s = ctx.s
    const wet = clamp(s.wetness, 0, 1)
    const bleed = Math.round(s.size * (0.08 + 0.32 * wet)) + 3
    const pad = bleed * 2 + 4
    const x0 = Math.max(0, Math.floor(bounds.x0 - pad))
    const y0 = Math.max(0, Math.floor(bounds.y0 - pad))
    const x1 = Math.min(ctx.width, Math.ceil(bounds.x1 + pad))
    const y1 = Math.min(ctx.height, Math.ceil(bounds.y1 + pad))
    const w = x1 - x0
    const h = y1 - y0
    if (w <= 0 || h <= 0) return bounds
    const img = ctx.buf.getImageData(x0, y0, w, h)
    const data = img.data
    const n = w * h
    const mask = new Float32Array(n)
    for (let i = 0; i < n; i++) mask[i] = data[i * 4 + 3] / 255

    // 1. Spread the water outward.
    const spread = Float32Array.from(mask)
    boxBlur(spread, w, h, bleed * 0.6, 3)
    const field = new Float32Array(n)
    for (let i = 0; i < n; i++) field[i] = Math.max(mask[i], Math.min(1, spread[i] * 1.8))

    // 2. Threshold against noise → irregular, organic wet edge.
    const edgeN = getEdgeNoise()
    const low = getLowNoise()
    const grain = getPaperGrain()
    const kEdge = clamp(34 / s.size, 0.35, 1.6)
    const softness = 0.035 + 0.12 * wet
    const wobble = 0.55 * (0.35 + 0.65 * wet)
    const shape = new Float32Array(n)
    for (let y = 0; y < h; y++) {
      const gy = y0 + y
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        const f = field[i]
        if (f <= 0.01) continue
        const level = 0.5 + (edgeN.at((x0 + x) * kEdge, gy * kEdge) - 0.5) * wobble
        shape[i] = smoothstep(level - softness, level + softness, f)
      }
    }

    // 3. Distance-to-edge proxy for the darker dried rim.
    const rim = Float32Array.from(shape)
    boxBlur(rim, w, h, Math.max(1.5, s.size * 0.045 + 1), 2)

    const base = ctx.color
    const dark = shiftLightness(base, -0.13)
    const light = shiftLightness(base, 0.05)
    const edgeStrength = 1.15 - 0.55 * wet
    const gran = clamp(s.granulation, 0, 1)
    const opacity = clamp(s.opacity, 0, 1)
    const kBloom = clamp(20 / s.size, 0.25, 0.9)

    for (let y = 0; y < h; y++) {
      const gy = y0 + y
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        const o = i * 4
        const sh = shape[i]
        if (sh <= 0.002) {
          data[o + 3] = 0
          continue
        }
        const gx = x0 + x
        const edge = clamp((1 - rim[i]) * 2.3 - 0.15, 0, 1)
        const bloom = low.at(gx * kBloom, gy * kBloom)
        const g = grain.at(gx, gy)
        const pigment = 0.65 + 0.35 * Math.min(1, field[i])
        const density =
          (0.62 + (bloom - 0.5) * 0.55) *
          (1 + edgeStrength * edge * edge) *
          (1 + gran * (0.5 - g) * 1.6) *
          pigment
        const a = clamp(opacity * density * sh, 0, 1)
        const te = edge * 0.7
        const tl = Math.max(0, bloom - 0.5) * 0.8 * (1 - edge)
        data[o] = base[0] + (dark[0] - base[0]) * te + (light[0] - base[0]) * tl
        data[o + 1] = base[1] + (dark[1] - base[1]) * te + (light[1] - base[1]) * tl
        data[o + 2] = base[2] + (dark[2] - base[2]) * te + (light[2] - base[2]) * tl
        data[o + 3] = a * 255
      }
    }
    ctx.buf.putImageData(img, x0, y0)
    return { x0, y0, x1, y1 }
  },
}
