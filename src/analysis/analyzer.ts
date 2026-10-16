import type { Engine } from '../engine/Engine'
import { hexToRgb, labDistance } from '../engine/color'
import { createCanvas, get2d } from '../engine/textures'
import { analyzePalette, type ColorSwatch, type PaletteRequest, type PaletteResult } from './palette'

export interface AnalysisOptions {
  scope: 'visible' | 'active'
  includePaper: boolean
  /** 0 = broad colour groups, 1 = very fine distinctions. */
  detail: number
  maxColors: number
}

export interface TrackedSwatch extends ColorSwatch {
  /** Stable identity across updates so the UI can animate instead of re-mounting. */
  id: string
}

export interface AnalysisState {
  result: PaletteResult | null
  swatches: TrackedSwatch[]
  options: AnalysisOptions
  /** Milliseconds the last analysis took (sampling + clustering). */
  took: number
  updates: number
}

const SAMPLE_MAX = 300
const LIVE_INTERVAL = 110

export function mergeDistanceFor(detail: number) {
  return 0.17 * Math.pow(0.024 / 0.17, Math.max(0, Math.min(1, detail)))
}

export class PaletteAnalyzer {
  private engine: Engine
  private worker: Worker | null = null
  private listeners = new Set<() => void>()
  private state: AnalysisState
  private busy = false
  private pending = false
  private lastRun = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private jobId = 0
  private startedAt = 0
  private colorCtx = get2d(createCanvas(1, 1), { willReadFrequently: true })
  private coverCtx = get2d(createCanvas(1, 1), { willReadFrequently: true })
  private nextSwatchId = 1

  constructor(engine: Engine) {
    this.engine = engine
    this.state = {
      result: null,
      swatches: [],
      options: { scope: 'visible', includePaper: false, detail: 0.5, maxColors: 12 },
      took: 0,
      updates: 0,
    }
    try {
      this.worker = new Worker(new URL('./palette.worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (e: MessageEvent<{ id: number; result: PaletteResult }>) => {
        if (e.data.id === this.jobId) this.accept(e.data.result)
        this.finishJob()
      }
      this.worker.onerror = () => {
        // Fall back to the main thread if the worker cannot start.
        this.worker = null
        this.finishJob()
        this.schedule(false)
      }
    } catch {
      this.worker = null
    }
    engine.onContentChange((live) => this.schedule(live))
    this.schedule(false)
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getState = () => this.state

  setOptions(opts: Partial<AnalysisOptions>) {
    this.state = { ...this.state, options: { ...this.state.options, ...opts } }
    this.emit()
    this.schedule(false)
  }

  private emit() {
    for (const l of this.listeners) l()
  }

  schedule(live: boolean) {
    if (this.busy) {
      this.pending = true
      return
    }
    const wait = live ? Math.max(0, LIVE_INTERVAL - (performance.now() - this.lastRun)) : 0
    if (this.timer) {
      if (live) return
      clearTimeout(this.timer)
    }
    this.timer = setTimeout(() => {
      this.timer = null
      this.run()
    }, wait)
  }

  private finishJob() {
    this.busy = false
    if (this.pending) {
      this.pending = false
      this.schedule(true)
    }
  }

  private run() {
    const engine = this.engine
    const opts = this.state.options
    const k = Math.min(1, SAMPLE_MAX / Math.max(engine.width, engine.height))
    const w = Math.max(1, Math.round(engine.width * k))
    const h = Math.max(1, Math.round(engine.height * k))
    for (const c of [this.colorCtx, this.coverCtx]) {
      if (c.canvas.width !== w || c.canvas.height !== h) {
        c.canvas.width = w
        c.canvas.height = h
      }
    }
    this.startedAt = performance.now()
    this.lastRun = this.startedAt
    const activeOnly = opts.scope === 'active'
    engine.renderForAnalysis(this.colorCtx, w, h, { withPaper: true, activeOnly })
    engine.renderForAnalysis(this.coverCtx, w, h, { withPaper: false, activeOnly })
    const color = this.colorCtx.getImageData(0, 0, w, h).data
    const coverage = this.coverCtx.getImageData(0, 0, w, h).data
    const req: PaletteRequest = {
      color,
      coverage,
      includePaper: opts.includePaper,
      mergeDistance: mergeDistanceFor(opts.detail),
      maxColors: opts.maxColors,
      paper: hexToRgb(engine.paper.color),
    }
    const id = ++this.jobId
    this.busy = true
    if (this.worker) {
      this.worker.postMessage({ id, req }, [color.buffer, coverage.buffer])
    } else {
      this.accept(analyzePalette(req))
      this.finishJob()
    }
  }

  private accept(result: PaletteResult) {
    // Keep identities stable: match each new swatch to the closest previous one.
    const prev = this.state.swatches.slice()
    const used = new Set<string>()
    const tol = Math.max(0.05, mergeDistanceFor(this.state.options.detail) * 1.2)
    const swatches: TrackedSwatch[] = result.swatches.map((s) => {
      let best: TrackedSwatch | null = null
      let bestD = Infinity
      for (const p of prev) {
        if (used.has(p.id)) continue
        const d = labDistance(p.lab, s.lab)
        if (d < bestD) {
          bestD = d
          best = p
        }
      }
      if (best && bestD < tol) {
        used.add(best.id)
        return { ...s, id: best.id }
      }
      return { ...s, id: `c${this.nextSwatchId++}` }
    })
    this.state = {
      ...this.state,
      result,
      swatches,
      took: performance.now() - this.startedAt,
      updates: this.state.updates + 1,
    }
    this.emit()
  }
}
