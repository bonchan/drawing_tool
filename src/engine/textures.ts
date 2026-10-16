import { type RGB } from './color'

/** Small, fast, seedable PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(w))
  c.height = Math.max(1, Math.ceil(h))
  return c
}

export function get2d(c: HTMLCanvasElement, opts?: CanvasRenderingContext2DSettings) {
  const ctx = c.getContext('2d', opts)
  if (!ctx) throw new Error('2D canvas not supported')
  return ctx
}

const smooth = (t: number) => t * t * (3 - 2 * t)

/** Tileable value noise of a given lattice period, values in 0..1. */
function tileableValueNoise(size: number, period: number, rng: () => number): Float32Array {
  const cells = Math.max(1, Math.round(size / period))
  const lattice = new Float32Array(cells * cells)
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng()
  const out = new Float32Array(size * size)
  const scale = cells / size
  for (let y = 0; y < size; y++) {
    const fy = y * scale
    const y0 = Math.floor(fy)
    const ty = smooth(fy - y0)
    const r0 = (y0 % cells) * cells
    const r1 = ((y0 + 1) % cells) * cells
    for (let x = 0; x < size; x++) {
      const fx = x * scale
      const x0 = Math.floor(fx)
      const tx = smooth(fx - x0)
      const c0 = x0 % cells
      const c1 = (x0 + 1) % cells
      const a = lattice[r0 + c0] + (lattice[r0 + c1] - lattice[r0 + c0]) * tx
      const b = lattice[r1 + c0] + (lattice[r1 + c1] - lattice[r1 + c0]) * tx
      out[y * size + x] = a + (b - a) * ty
    }
  }
  return out
}

function fbm(size: number, octaves: Array<[period: number, weight: number]>, seed: number) {
  const rng = mulberry32(seed)
  const out = new Float32Array(size * size)
  for (const [period, weight] of octaves) {
    const n = tileableValueNoise(size, period, rng)
    for (let i = 0; i < out.length; i++) out[i] += n[i] * weight
  }
  // Normalise to the full 0..1 range using robust percentiles so contrast is consistent.
  const sorted = Float32Array.from(out).sort()
  const lo = sorted[Math.floor(sorted.length * 0.01)]
  const hi = sorted[Math.floor(sorted.length * 0.99)]
  const k = 1 / Math.max(1e-6, hi - lo)
  for (let i = 0; i < out.length; i++) out[i] = Math.min(1, Math.max(0, (out[i] - lo) * k))
  return out
}

export interface NoiseField {
  size: number
  data: Float32Array
  /** Sample with wrap-around (tileable). */
  at(x: number, y: number): number
}

function field(size: number, data: Float32Array): NoiseField {
  const mask = size - 1
  return {
    size,
    data,
    at(x, y) {
      return data[((y | 0) & mask) * size + ((x | 0) & mask)]
    },
  }
}

let paperGrain: NoiseField | null = null
let lowNoise: NoiseField | null = null
let lowNoise2: NoiseField | null = null

/** Fine paper "tooth": what dry media catches on. */
export function getPaperGrain(): NoiseField {
  if (!paperGrain) {
    paperGrain = field(
      512,
      fbm(
        512,
        [
          [2, 0.38],
          [4, 0.3],
          [8, 0.18],
          [32, 0.09],
          [128, 0.05],
        ],
        1337,
      ),
    )
  }
  return paperGrain
}

/** Soft, cloudy low-frequency noise – watercolor blooms and pigment flow. */
export function getLowNoise(): NoiseField {
  if (!lowNoise) {
    lowNoise = field(
      512,
      fbm(
        512,
        [
          [16, 0.2],
          [32, 0.3],
          [64, 0.3],
          [128, 0.2],
        ],
        4242,
      ),
    )
  }
  return lowNoise
}

/** A second independent low-frequency field, used to wobble watercolor edges. */
export function getEdgeNoise(): NoiseField {
  if (!lowNoise2) {
    lowNoise2 = field(
      512,
      fbm(
        512,
        [
          [8, 0.25],
          [16, 0.35],
          [32, 0.25],
          [64, 0.15],
        ],
        9001,
      ),
    )
  }
  return lowNoise2
}

// ---------------------------------------------------------------------------
// Grain patterns: an alpha tile that follows the paper tooth. Higher `coverage`
// fills deeper into the grain (more pressure = more pigment). Tiles are colour
// agnostic – dry brushes paint alpha first and tint afterwards (see tintRect).
// ---------------------------------------------------------------------------

export const GRAIN_LEVELS = 12
const grainTiles = new Map<string, HTMLCanvasElement>()
const patternCache = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>()

function grainKey(coverage: number, softness: number) {
  const level = Math.max(0, Math.min(GRAIN_LEVELS - 1, Math.round(coverage * GRAIN_LEVELS) - 1))
  const soft = Math.max(0.04, Math.round(softness * 20) / 20)
  return { level, soft, key: `${level}|${soft}` }
}

function grainTile(level: number, soft: number, key: string): HTMLCanvasElement {
  let tile = grainTiles.get(key)
  if (tile) return tile
  const grain = getPaperGrain()
  const size = grain.size
  tile = createCanvas(size, size)
  const ctx = get2d(tile)
  const img = ctx.createImageData(size, size)
  const coverage = (level + 1) / GRAIN_LEVELS
  const threshold = 1 - coverage
  const d = img.data
  for (let i = 0; i < grain.data.length; i++) {
    const t = (grain.data[i] - threshold + soft) / (2 * soft)
    d[i * 4 + 3] = t <= 0 ? 0 : t >= 1 ? 255 : smooth(t) * 255
  }
  ctx.putImageData(img, 0, 0)
  grainTiles.set(key, tile)
  return tile
}

export function getGrainPattern(
  ctx: CanvasRenderingContext2D,
  coverage: number,
  softness = 0.18,
): CanvasPattern {
  const { level, soft, key } = grainKey(coverage, softness)
  let map = patternCache.get(ctx)
  if (!map) {
    map = new Map()
    patternCache.set(ctx, map)
  }
  let pat = map.get(key)
  if (!pat) {
    pat = ctx.createPattern(grainTile(level, soft, key), 'repeat')!
    map.set(key, pat)
  }
  return pat
}

/** Re-colour everything already painted inside a rect, keeping its alpha. */
export function tintRect(
  ctx: CanvasRenderingContext2D,
  color: RGB,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  // 'source-in' is an unbounded operation: without a clip it would wipe the
  // whole buffer outside the rect.
  ctx.save()
  ctx.beginPath()
  ctx.rect(Math.floor(x0), Math.floor(y0), Math.ceil(x1 - x0) + 1, Math.ceil(y1 - y0) + 1)
  ctx.clip()
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`
  ctx.fill()
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Soft round dabs (pre-rendered radial falloff), tinted & cached.
// ---------------------------------------------------------------------------

const dabCache = new Map<string, HTMLCanvasElement>()
export const DAB_SIZE = 128

export function getRoundDab(color: RGB, hardness: number): HTMLCanvasElement {
  const h = Math.round(Math.max(0, Math.min(1, hardness)) * 20) / 20
  const key = `${color.join(',')}|${h}`
  let dab = dabCache.get(key)
  if (dab) return dab
  if (dabCache.size > 96) dabCache.clear()
  dab = createCanvas(DAB_SIZE, DAB_SIZE)
  const ctx = get2d(dab)
  const r = DAB_SIZE / 2
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r)
  const [cr, cg, cb] = color
  const inner = Math.min(0.98, h)
  grad.addColorStop(0, `rgba(${cr},${cg},${cb},1)`)
  grad.addColorStop(inner, `rgba(${cr},${cg},${cb},1)`)
  // A smooth (not linear) falloff looks far more natural.
  const steps = 6
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const pos = inner + (1 - inner) * t
    const a = Math.pow(1 - t, 1.8) * (1 - t * 0.15)
    grad.addColorStop(Math.min(1, pos), `rgba(${cr},${cg},${cb},${a.toFixed(4)})`)
  }
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, DAB_SIZE, DAB_SIZE)
  dabCache.set(key, dab)
  return dab
}

// ---------------------------------------------------------------------------
// Paper surface + checkerboard
// ---------------------------------------------------------------------------

let paperSurface: HTMLCanvasElement | null = null

/** Greyscale multiply tile that gives the paper a subtle cold-press texture. */
export function getPaperSurfaceTile(): HTMLCanvasElement {
  if (paperSurface) return paperSurface
  const grain = getPaperGrain()
  const low = getLowNoise()
  const size = grain.size
  paperSurface = createCanvas(size, size)
  const ctx = get2d(paperSurface)
  const img = ctx.createImageData(size, size)
  for (let i = 0; i < grain.data.length; i++) {
    const g = grain.data[i]
    const l = low.data[i]
    const v = 255 * (1 - 0.075 * (1 - g) - 0.03 * (1 - l))
    const o = i * 4
    img.data[o] = v
    img.data[o + 1] = v
    img.data[o + 2] = v * 0.995
    img.data[o + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return paperSurface
}

let checker: HTMLCanvasElement | null = null
export function getCheckerTile(): HTMLCanvasElement {
  if (checker) return checker
  checker = createCanvas(16, 16)
  const ctx = get2d(checker)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 16, 16)
  ctx.fillStyle = '#e3e3e6'
  ctx.fillRect(0, 0, 8, 8)
  ctx.fillRect(8, 8, 8, 8)
  return checker
}
