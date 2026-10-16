import { labDistance, labToLch, oklabToRgb, rgbToHex, rgbToOklab, type Lab, type RGB } from '../engine/color'
import { nameColor } from './colorNames'

export interface PaletteRequest {
  /** RGBA of the flattened image over the paper colour. */
  color: Uint8ClampedArray
  /** RGBA of the layers alone – its alpha tells painted from bare paper. */
  coverage: Uint8ClampedArray
  includePaper: boolean
  /** OKLab distance under which colours are considered the same (≈0.02–0.2). */
  mergeDistance: number
  maxColors: number
  paper: RGB
}

export interface ColorSwatch {
  hex: string
  rgb: RGB
  lab: Lab
  name: string
  /** 0..1 share of the analysed area. */
  share: number
  isPaper: boolean
}

export type FamilyName =
  | 'Reds'
  | 'Oranges'
  | 'Yellows'
  | 'Greens'
  | 'Cyans'
  | 'Blues'
  | 'Purples'
  | 'Pinks'
  | 'Browns'
  | 'Neutrals'

export interface FamilyShare {
  name: FamilyName
  share: number
  hex: string
}

export interface PaletteResult {
  swatches: ColorSwatch[]
  /** Share of everything not in `swatches`. */
  other: number
  /** Number of distinct colour groups found (before truncation). */
  distinct: number
  /** Fraction of the canvas that carries paint. */
  coverage: number
  /** How many samples were analysed. */
  samples: number
  families: FamilyShare[]
  /** 10 lightness buckets, dark → light, each a share 0..1. */
  values: number[]
  temperature: { warm: number; cool: number; neutral: number }
}

const BINS = 32768
const NEUTRAL_CHROMA = 0.035
const PAINT_ALPHA = 38
/** Painted pixels this close to the paper colour are visually just paper. */
const PAPER_LIKE = 0.03

interface Cluster {
  l: number
  a: number
  b: number
  w: number
  // representative = heaviest member bin
  repW: number
  rep: number
}

export function analyzePalette(req: PaletteRequest): PaletteResult {
  const { color, coverage } = req
  const counts = new Uint32Array(BINS)
  const sr = new Float64Array(BINS)
  const sg = new Float64Array(BINS)
  const sb = new Float64Array(BINS)
  const n = color.length / 4
  let samples = 0
  let painted = 0
  for (let i = 0; i < n; i++) {
    const o = i * 4
    // Ignore whisper-thin haze (airbrush falloff, charcoal dust): it reads as paper.
    const isPainted = coverage[o + 3] > PAINT_ALPHA
    if (isPainted) painted++
    if (!req.includePaper && !isPainted) continue
    const r = color[o]
    const g = color[o + 1]
    const b = color[o + 2]
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
    counts[key]++
    sr[key] += r
    sg[key] += g
    sb[key] += b
    samples++
  }

  const result: PaletteResult = {
    swatches: [],
    other: 0,
    distinct: 0,
    coverage: n ? painted / n : 0,
    samples,
    families: [],
    values: new Array(10).fill(0),
    temperature: { warm: 0, cool: 0, neutral: 0 },
  }
  if (samples === 0) return result

  // Collect occupied bins (dropping paper-coloured ones unless paper is counted).
  const paperLab = rgbToOklab(req.paper)
  const binKeys: number[] = []
  for (let k = 0; k < BINS; k++) {
    const c = counts[k]
    if (!c) continue
    if (!req.includePaper) {
      const lab = rgbToOklab([sr[k] / c, sg[k] / c, sb[k] / c])
      if (labDistance(lab, paperLab) < PAPER_LIKE) {
        samples -= c
        continue
      }
    }
    binKeys.push(k)
  }
  if (samples <= 0) {
    result.samples = 0
    if (!req.includePaper) result.coverage = 0
    return result
  }
  result.samples = samples
  if (!req.includePaper) result.coverage = samples / n
  binKeys.sort((x, y) => counts[y] - counts[x])
  const m = binKeys.length
  const binLab: Lab[] = new Array(m)
  const binRgb: RGB[] = new Array(m)
  const binW = new Float64Array(m)
  for (let i = 0; i < m; i++) {
    const k = binKeys[i]
    const c = counts[k]
    const rgb: RGB = [sr[k] / c, sg[k] / c, sb[k] / c]
    binRgb[i] = rgb
    binLab[i] = rgbToOklab(rgb)
    binW[i] = c
  }

  // Lightness distribution (value study).
  for (let i = 0; i < m; i++) {
    const bucket = Math.min(9, Math.max(0, Math.floor(binLab[i][0] * 10)))
    result.values[bucket] += binW[i] / samples
  }

  // Greedy clustering seeded by the most common colours, then refine (k-means style).
  const T = req.mergeDistance
  let clusters: Cluster[] = []
  const assign = new Int32Array(m)
  for (let i = 0; i < m; i++) {
    const lab = binLab[i]
    let best = -1
    let bestD = Infinity
    for (let c = 0; c < clusters.length; c++) {
      const cl = clusters[c]
      const d = distTo(lab, cl)
      if (d < bestD) {
        bestD = d
        best = c
      }
    }
    if (best >= 0 && (bestD < T || clusters.length >= 160)) {
      const cl = clusters[best]
      const w = binW[i]
      const tw = cl.w + w
      cl.l += ((lab[0] - cl.l) * w) / tw
      cl.a += ((lab[1] - cl.a) * w) / tw
      cl.b += ((lab[2] - cl.b) * w) / tw
      cl.w = tw
      assign[i] = best
    } else {
      clusters.push({ l: lab[0], a: lab[1], b: lab[2], w: binW[i], repW: binW[i], rep: i })
      assign[i] = clusters.length - 1
    }
  }

  for (let iter = 0; iter < 2; iter++) {
    const next = clusters.map(() => ({ l: 0, a: 0, b: 0, w: 0, repW: 0, rep: -1 }))
    for (let i = 0; i < m; i++) {
      const lab = binLab[i]
      let best = 0
      let bestD = Infinity
      for (let c = 0; c < clusters.length; c++) {
        const cl = clusters[c]
        const d = distTo(lab, cl)
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
      assign[i] = best
      const nx = next[best]
      const w = binW[i]
      nx.l += lab[0] * w
      nx.a += lab[1] * w
      nx.b += lab[2] * w
      nx.w += w
      if (w > nx.repW) {
        nx.repW = w
        nx.rep = i
      }
    }
    clusters = next
      .filter((c) => c.w > 0)
      .map((c) => ({ l: c.l / c.w, a: c.a / c.w, b: c.b / c.w, w: c.w, repW: c.repW, rep: c.rep }))
  }

  // Merge any clusters that drifted within the threshold of each other.
  let merged = true
  while (merged) {
    merged = false
    outer: for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const A = clusters[i]
        const B = clusters[j]
        if (distTo([A.l, A.a, A.b], B) < T * 0.8) {
          const w = A.w + B.w
          clusters[i] = {
            l: (A.l * A.w + B.l * B.w) / w,
            a: (A.a * A.w + B.a * B.w) / w,
            b: (A.b * A.w + B.b * B.w) / w,
            w,
            repW: Math.max(A.repW, B.repW),
            rep: A.repW >= B.repW ? A.rep : B.rep,
          }
          clusters.splice(j, 1)
          merged = true
          break outer
        }
      }
    }
  }

  clusters.sort((x, y) => y.w - x.w)
  result.distinct = clusters.filter((c) => c.w / samples >= 0.001).length

  const familyAcc = new Map<FamilyName, { w: number; l: number; a: number; b: number }>()
  for (const cl of clusters) {
    const share = cl.w / samples
    const lab: Lab = [cl.l, cl.a, cl.b]
    const fam = familyOf(lab)
    const f = familyAcc.get(fam) ?? { w: 0, l: 0, a: 0, b: 0 }
    f.w += cl.w
    f.l += cl.l * cl.w
    f.a += cl.a * cl.w
    f.b += cl.b * cl.w
    familyAcc.set(fam, f)
    const [, chroma, hue] = labToLch(lab)
    if (chroma < NEUTRAL_CHROMA) result.temperature.neutral += share
    else if (hue >= 330 || hue < 115) result.temperature.warm += share
    else result.temperature.cool += share
  }

  const shown = clusters.filter((c) => c.w / samples >= 0.001).slice(0, req.maxColors)
  result.swatches = shown.map((cl) => {
    // Show the most common actual colour in the group – that is the colour you painted.
    const rgb = cl.rep >= 0 ? binRgb[cl.rep] : oklabToRgb([cl.l, cl.a, cl.b])
    const lab = rgbToOklab(rgb)
    const isPaper = req.includePaper && labDistance(lab, paperLab) < Math.max(0.02, T * 0.6)
    return {
      hex: rgbToHex(rgb),
      rgb: [Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2])] as RGB,
      lab,
      name: isPaper ? 'Paper' : nameColor(rgb, lab),
      share: cl.w / samples,
      isPaper,
    }
  })
  result.other = Math.max(0, 1 - result.swatches.reduce((s, c) => s + c.share, 0))
  if (result.other < 1e-6) result.other = 0

  result.families = [...familyAcc.entries()]
    .map(([name, f]) => ({
      name,
      share: f.w / samples,
      hex: rgbToHex(oklabToRgb([f.l / f.w, f.a / f.w, f.b / f.w])),
    }))
    .filter((f) => f.share >= 0.001)
    .sort((x, y) => y.share - x.share)

  return result
}

/**
 * Perceptual distance used for grouping:
 * - lightness counts for less than hue/chroma, so a wash with darker dried rims
 *   or a shaded stroke still reads as one colour;
 * - hue differences between pale (low-chroma) tints are boosted, so a pale pink
 *   and a pale blue wash never collapse into one group.
 */
const L_WEIGHT = 0.5
const HUE_FLOOR = 0.06

export function paletteDistance(lab: Lab, c: { l: number; a: number; b: number }) {
  const dl = (lab[0] - c.l) * L_WEIGHT
  const c1 = Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2])
  const c2 = Math.sqrt(c.a * c.a + c.b * c.b)
  const dc = c1 - c2
  let dh2: number
  if (c1 > 0.015 && c2 > 0.015) {
    const cos = (lab[1] * c.a + lab[2] * c.b) / (c1 * c2)
    const sinHalf2 = Math.max(0, (1 - cos) / 2)
    const k = Math.max(Math.sqrt(c1 * c2), HUE_FLOOR)
    dh2 = 4 * k * k * sinHalf2
  } else {
    const da = lab[1] - c.a
    const db = lab[2] - c.b
    dh2 = Math.max(0, da * da + db * db - dc * dc)
  }
  return Math.sqrt(dl * dl + dc * dc + dh2)
}

const distTo = paletteDistance

export function familyOf(lab: Lab): FamilyName {
  const [L, C, h] = labToLch(lab)
  if (C < NEUTRAL_CHROMA) return 'Neutrals'
  if (h >= 20 && h < 95 && L < 0.62 && C < 0.17) return 'Browns'
  if (h >= 345 || h < 15) return L > 0.72 ? 'Pinks' : 'Reds'
  if (h < 45) return L > 0.8 && C < 0.12 ? 'Pinks' : 'Reds'
  if (h < 75) return 'Oranges'
  if (h < 115) return 'Yellows'
  if (h < 170) return 'Greens'
  if (h < 225) return 'Cyans'
  if (h < 285) return 'Blues'
  if (h < 320) return 'Purples'
  return 'Pinks'
}
