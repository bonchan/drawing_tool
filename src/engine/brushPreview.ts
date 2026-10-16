import { BRUSHES, type BrushId, type BrushSettings, type PaintContext } from './brushes'
import { hexToRgb } from './color'
import { StrokeBuilder } from './stroke'
import { createCanvas, get2d, getPaperSurfaceTile, mulberry32 } from './textures'

interface Surfaces {
  buf: CanvasRenderingContext2D
  layer: CanvasRenderingContext2D
  scratch: CanvasRenderingContext2D
  sample: CanvasRenderingContext2D
}

const surfaces = new Map<string, Surfaces>()

function getSurfaces(w: number, h: number): Surfaces {
  const key = `${w}x${h}`
  let s = surfaces.get(key)
  if (!s) {
    s = {
      buf: get2d(createCanvas(w, h), { willReadFrequently: true }),
      layer: get2d(createCanvas(w, h), { willReadFrequently: true }),
      scratch: get2d(createCanvas(128, 128)),
      sample: get2d(createCanvas(4, 4), { willReadFrequently: true }),
    }
    surfaces.set(key, s)
  }
  return s
}

const paperPatterns = new WeakMap<CanvasRenderingContext2D, CanvasPattern | null>()

/**
 * Paint a sample S-curve with a brush, using the real brush engine, so the
 * library and settings panel show exactly what the brush will do.
 */
export function renderBrushPreview(
  target: HTMLCanvasElement,
  brushId: BrushId,
  settings: BrushSettings,
  colorHex: string,
  opts: { paper: string; scale: number; maxSize: number; amplitude?: number },
) {
  const brush = BRUSHES[brushId]
  const W = target.width
  const H = target.height
  const out = get2d(target)
  out.globalCompositeOperation = 'source-over'
  out.globalAlpha = 1
  out.fillStyle = opts.paper
  out.fillRect(0, 0, W, H)
  if (!paperPatterns.has(out)) paperPatterns.set(out, out.createPattern(getPaperSurfaceTile(), 'repeat'))
  const pat = paperPatterns.get(out)
  if (pat) {
    out.globalCompositeOperation = 'multiply'
    out.fillStyle = pat
    out.fillRect(0, 0, W, H)
    out.globalCompositeOperation = 'source-over'
  }

  const surf = getSurfaces(W, H)
  const { buf, layer } = surf
  buf.clearRect(0, 0, W, H)
  layer.clearRect(0, 0, W, H)
  layer.globalAlpha = 1
  layer.globalCompositeOperation = 'source-over'

  const s: BrushSettings = {
    ...settings,
    size: Math.max(1, Math.min(settings.size, opts.maxSize) * opts.scale),
    smoothing: 0,
  }

  // Eraser and blender need something to work on.
  if (brushId === 'eraser' || brushId === 'smudge') {
    const bands = ['#e2574c', '#f2b134', '#3b8bd4', '#46a36b']
    const bw = W / bands.length
    bands.forEach((c, i) => {
      layer.fillStyle = c
      layer.fillRect(i * bw, H * 0.18, bw + 1, H * 0.64)
    })
  }

  let bounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  const ctx: PaintContext = {
    buf,
    layer,
    width: W,
    height: H,
    color: hexToRgb(colorHex),
    s,
    rng: mulberry32(11),
    dirty(x0, y0, x1, y1) {
      bounds = {
        x0: Math.min(bounds.x0, x0),
        y0: Math.min(bounds.y0, y0),
        x1: Math.max(bounds.x1, x1),
        y1: Math.max(bounds.y1, y1),
      }
    },
    sample(x, y, r) {
      const c = surf.sample
      c.globalCompositeOperation = 'copy'
      c.drawImage(layer.canvas, x - r, y - r, r * 2, r * 2, 0, 0, 4, 4)
      const d = c.getImageData(0, 0, 4, 4).data
      let rr = 0
      let gg = 0
      let bb = 0
      let aa = 0
      for (let i = 0; i < 64; i += 4) {
        rr += d[i] * d[i + 3]
        gg += d[i + 1] * d[i + 3]
        bb += d[i + 2] * d[i + 3]
        aa += d[i + 3]
      }
      return aa < 64 ? null : [rr / aa, gg / aa, bb / aa, aa / (16 * 255)]
    },
    scratch(w, h) {
      const c = surf.scratch
      if (c.canvas.width < w || c.canvas.height < h) {
        c.canvas.width = Math.max(c.canvas.width, Math.ceil(w))
        c.canvas.height = Math.max(c.canvas.height, Math.ceil(h))
      }
      return c
    },
  }

  let state: unknown = null
  let started = false
  const builder = new StrokeBuilder({
    smoothing: 0,
    pressureMode: brush.pressureMode,
    spacing: (p) => brush.spacing(s, p),
    onDab: (d) => {
      if (!started) {
        state = brush.begin(ctx, d)
        started = true
      }
      buf.globalAlpha = 1
      buf.globalCompositeOperation = 'source-over'
      brush.dab(ctx, d, state)
    },
  })

  const pad = Math.min(W * 0.12, s.size / 2 + 6 * opts.scale)
  const amp = (opts.amplitude ?? 0.24) * H
  const steps = 48
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    builder.push({
      x: pad + (W - pad * 2) * t,
      y: H / 2 - Math.sin(t * Math.PI * 2) * amp,
      pressure: 0.25 + 0.75 * Math.pow(Math.sin(Math.PI * t), 0.6),
      tiltX: 0,
      tiltY: 0,
      time: i * 12,
      pointerType: 'pen',
    })
  }
  builder.finish()
  if (started && brush.end && bounds.x1 > bounds.x0) {
    const b = {
      x0: Math.max(0, Math.floor(bounds.x0)),
      y0: Math.max(0, Math.floor(bounds.y0)),
      x1: Math.min(W, Math.ceil(bounds.x1)),
      y1: Math.min(H, Math.ceil(bounds.y1)),
    }
    if (brush.endMode === 'rerender') buf.clearRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0)
    brush.end(ctx, state, b)
  }
  if (brush.target === 'buffer') {
    layer.save()
    layer.globalAlpha = brush.bakesOpacity ? 1 : s.opacity
    layer.globalCompositeOperation = brush.composite
    layer.drawImage(buf.canvas, 0, 0)
    layer.restore()
  }
  out.drawImage(layer.canvas, 0, 0)
}
