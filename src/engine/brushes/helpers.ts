import type { PaintContext } from './types'

/** Fill the convex hull of two circles – a smooth variable-width line segment. */
export function capsule(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  r0: number,
  x1: number,
  y1: number,
  r1: number,
) {
  const dx = x1 - x0
  const dy = y1 - y0
  const d = Math.hypot(dx, dy)
  ctx.beginPath()
  if (d <= Math.abs(r1 - r0) + 1e-3) {
    if (r0 >= r1) ctx.arc(x0, y0, Math.max(0.01, r0), 0, Math.PI * 2)
    else ctx.arc(x1, y1, Math.max(0.01, r1), 0, Math.PI * 2)
    ctx.fill()
    return
  }
  const a = Math.atan2(dy, dx)
  const th = Math.acos(Math.max(-1, Math.min(1, (r0 - r1) / d)))
  ctx.arc(x0, y0, Math.max(0.01, r0), a + th, a + Math.PI * 2 - th)
  ctx.arc(x1, y1, Math.max(0.01, r1), a - th, a + th)
  ctx.closePath()
  ctx.fill()
}

/** Irregular blob outline – used by watercolor and crayon for organic edges. */
export function blobPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  rng: () => number,
  roughness: number,
  points = 12,
) {
  ctx.beginPath()
  const rot = rng() * Math.PI * 2
  for (let i = 0; i <= points; i++) {
    const a = rot + (i / points) * Math.PI * 2
    const rr = r * (1 + (rng() - 0.5) * roughness)
    const px = x + Math.cos(a) * rr
    const py = y + Math.sin(a) * rr
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
}

/** Gaussian random number (Box-Muller). */
export function gaussian(rng: () => number): number {
  let u = 0
  while (u === 0) u = rng()
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** Tilt magnitude 0..1 from pen tiltX/tiltY degrees. */
export function tiltAmount(tx: number, ty: number): number {
  return Math.min(1, Math.hypot(tx, ty) / 70)
}

export function markCircle(ctx: PaintContext, x: number, y: number, r: number) {
  ctx.dirty(x - r - 2, y - r - 2, x + r + 2, y + r + 2)
}

/** Separable box blur, run `passes` times (3 ≈ gaussian). In-place on `src`. */
export function boxBlur(src: Float32Array, w: number, h: number, radius: number, passes = 3) {
  const r = Math.max(1, Math.round(radius))
  const tmp = new Float32Array(src.length)
  for (let p = 0; p < passes; p++) {
    blurH(src, tmp, w, h, r)
    blurV(tmp, src, w, h, r)
  }
}

function blurH(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
  const inv = 1 / (2 * r + 1)
  for (let y = 0; y < h; y++) {
    const row = y * w
    let acc = 0
    for (let i = -r; i <= r; i++) acc += src[row + Math.min(w - 1, Math.max(0, i))]
    for (let x = 0; x < w; x++) {
      dst[row + x] = acc * inv
      const add = src[row + Math.min(w - 1, x + r + 1)]
      const sub = src[row + Math.max(0, x - r)]
      acc += add - sub
    }
  }
}

function blurV(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
  const inv = 1 / (2 * r + 1)
  for (let x = 0; x < w; x++) {
    let acc = 0
    for (let i = -r; i <= r; i++) acc += src[Math.min(h - 1, Math.max(0, i)) * w + x]
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = acc * inv
      const add = src[Math.min(h - 1, y + r + 1) * w + x]
      const sub = src[Math.max(0, y - r) * w + x]
      acc += add - sub
    }
  }
}

export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}
