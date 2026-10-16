import { BRUSHES, type BrushDef, type BrushId, type BrushSettings, type PaintContext, type Rect } from './brushes'
import { hexToRgb, type RGB } from './color'
import { dilateMask, floodFillMask } from './floodFill'
import { History, type HistoryEntry } from './history'
import { StrokeBuilder, type Dab, type InputPoint } from './stroke'
import { createCanvas, get2d, getPaperSurfaceTile, mulberry32 } from './textures'

export type BlendMode =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'

export const BLEND_MODES: Array<{ id: BlendMode; label: string }> = [
  { id: 'source-over', label: 'Normal' },
  { id: 'multiply', label: 'Multiply' },
  { id: 'screen', label: 'Screen' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'darken', label: 'Darken' },
  { id: 'lighten', label: 'Lighten' },
  { id: 'color-dodge', label: 'Color dodge' },
  { id: 'color-burn', label: 'Color burn' },
  { id: 'hard-light', label: 'Hard light' },
  { id: 'soft-light', label: 'Soft light' },
  { id: 'difference', label: 'Difference' },
  { id: 'exclusion', label: 'Exclusion' },
  { id: 'hue', label: 'Hue' },
  { id: 'saturation', label: 'Saturation' },
  { id: 'color', label: 'Color' },
  { id: 'luminosity', label: 'Luminosity' },
]

export interface LayerMeta {
  id: string
  name: string
  visible: boolean
  opacity: number
  blend: BlendMode
  locked: boolean
  /** Paint only where the layer already has pixels ("preserve transparency"). */
  alphaLock: boolean
  /** Bumped whenever the layer's pixels change (drives thumbnails). */
  version: number
}

interface Layer extends LayerMeta {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
}

export interface Paper {
  color: string
  texture: boolean
  visible: boolean
}

export interface DocState {
  width: number
  height: number
  /** Bottom → top. */
  layers: LayerMeta[]
  activeId: string
  paper: Paper
  canUndo: boolean
  canRedo: boolean
  undoLabel: string | null
  redoLabel: string | null
  stroking: boolean
}

export interface SerializedDoc {
  version: 1
  width: number
  height: number
  paper: Paper
  activeIndex: number
  layers: Array<Omit<LayerMeta, 'id' | 'version'> & { png: Blob }>
}

export const MAX_LAYERS = 40

interface ActiveStroke {
  brush: BrushDef<unknown>
  settings: BrushSettings
  layer: Layer
  state: unknown
  builder: StrokeBuilder
  paint: PaintContext
  bounds: Rect | null
  lastDab: Dab | null
  lastTick: number
  label: string
  started: boolean
}

let idCounter = 0
const newId = () => `L${Date.now().toString(36)}${(idCounter++).toString(36)}`

const emptyRect = (): Rect => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity })

export class Engine {
  width: number
  height: number
  private layers: Layer[] = []
  private activeId = ''
  paper: Paper = { color: '#fbf8f1', texture: true, visible: true }

  /** Final flattened image (paper + visible layers), document resolution. */
  readonly composite: HTMLCanvasElement
  private compCtx: CanvasRenderingContext2D
  private buffer: HTMLCanvasElement
  private bufCtx: CanvasRenderingContext2D
  private temp: HTMLCanvasElement
  private tempCtx: CanvasRenderingContext2D
  private snapshot: HTMLCanvasElement
  private snapCtx: CanvasRenderingContext2D
  private scratchCanvas: HTMLCanvasElement
  private scratchCtx: CanvasRenderingContext2D
  private sampleCtx: CanvasRenderingContext2D
  private paperPattern: CanvasPattern | null = null

  private history = new History()
  private stroke: ActiveStroke | null = null
  private moving: { layer: Layer; dx: number; dy: number } | null = null
  private dirty: Rect = emptyRect()
  private listeners = new Set<() => void>()
  private contentListeners = new Set<(live: boolean) => void>()
  private state!: DocState
  private seed = 1
  private loadToken = 0
  /** End of the last stroke, for shift-click straight lines. */
  lastStrokeEnd: { x: number; y: number } | null = null

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.composite = createCanvas(width, height)
    this.compCtx = get2d(this.composite)
    this.buffer = createCanvas(width, height)
    this.bufCtx = get2d(this.buffer)
    this.temp = createCanvas(width, height)
    this.tempCtx = get2d(this.temp)
    this.snapshot = createCanvas(width, height)
    this.snapCtx = get2d(this.snapshot)
    this.scratchCanvas = createCanvas(256, 256)
    this.scratchCtx = get2d(this.scratchCanvas)
    this.sampleCtx = get2d(createCanvas(4, 4), { willReadFrequently: true })
    this.addLayerInternal('Layer 1', 0)
    this.activeId = this.layers[0].id
    this.markAllDirty()
    this.refreshState()
  }

  // ------------------------------------------------------------------ state

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getState = () => this.state

  onContentChange(fn: (live: boolean) => void) {
    this.contentListeners.add(fn)
    return () => this.contentListeners.delete(fn)
  }

  private refreshState() {
    this.state = {
      width: this.width,
      height: this.height,
      layers: this.layers.map(({ id, name, visible, opacity, blend, locked, alphaLock, version }) => ({
        id,
        name,
        visible,
        opacity,
        blend,
        locked,
        alphaLock,
        version,
      })),
      activeId: this.activeId,
      paper: { ...this.paper },
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      undoLabel: this.history.undoLabel,
      redoLabel: this.history.redoLabel,
      stroking: this.stroke !== null,
    }
  }

  private emit() {
    this.refreshState()
    for (const l of this.listeners) l()
  }

  private contentChanged(live = false) {
    for (const l of this.contentListeners) l(live)
  }

  // ------------------------------------------------------------- rendering

  markDirty(x0: number, y0: number, x1: number, y1: number) {
    const d = this.dirty
    if (x0 < d.x0) d.x0 = x0
    if (y0 < d.y0) d.y0 = y0
    if (x1 > d.x1) d.x1 = x1
    if (y1 > d.y1) d.y1 = y1
  }

  markAllDirty() {
    this.markDirty(0, 0, this.width, this.height)
  }

  /** Bring the composite up to date. Returns true if anything was redrawn. */
  render(): boolean {
    const d = this.dirty
    if (d.x1 <= d.x0 || d.y1 <= d.y0) return false
    const x0 = Math.max(0, Math.floor(d.x0))
    const y0 = Math.max(0, Math.floor(d.y0))
    const x1 = Math.min(this.width, Math.ceil(d.x1))
    const y1 = Math.min(this.height, Math.ceil(d.y1))
    this.dirty = emptyRect()
    if (x1 <= x0 || y1 <= y0) return false
    this.compose(this.compCtx, x0, y0, x1 - x0, y1 - y0)
    return true
  }

  private getPaperPattern(ctx: CanvasRenderingContext2D) {
    if (!this.paperPattern) this.paperPattern = ctx.createPattern(getPaperSurfaceTile(), 'repeat')
    return this.paperPattern
  }

  private compose(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    c.save()
    c.beginPath()
    c.rect(x, y, w, h)
    c.clip()
    c.globalCompositeOperation = 'source-over'
    c.globalAlpha = 1
    c.clearRect(x, y, w, h)
    if (this.paper.visible) {
      c.fillStyle = this.paper.color
      c.fillRect(x, y, w, h)
      if (this.paper.texture) {
        const pat = this.getPaperPattern(c)
        if (pat) {
          c.globalCompositeOperation = 'multiply'
          c.fillStyle = pat
          c.fillRect(x, y, w, h)
        }
      }
    }
    const s = this.stroke
    for (const layer of this.layers) {
      if (!layer.visible) continue
      let src: HTMLCanvasElement = layer.canvas
      if (s && s.layer === layer && s.brush.target === 'buffer') {
        const t = this.tempCtx
        t.save()
        t.beginPath()
        t.rect(x, y, w, h)
        t.clip()
        t.globalCompositeOperation = 'copy'
        t.globalAlpha = 1
        t.drawImage(layer.canvas, x, y, w, h, x, y, w, h)
        t.globalCompositeOperation = s.brush.composite
        t.globalAlpha = Math.min(1, s.settings.opacity * (s.brush.previewOpacity ?? 1))
        t.drawImage(this.buffer, x, y, w, h, x, y, w, h)
        if (layer.alphaLock) {
          t.globalAlpha = 1
          t.globalCompositeOperation = 'destination-in'
          t.drawImage(this.snapshot, x, y, w, h, x, y, w, h)
        }
        t.restore()
        src = this.temp
      }
      c.globalAlpha = layer.opacity
      c.globalCompositeOperation = layer.blend
      if (this.moving && this.moving.layer === layer) {
        c.drawImage(src, Math.round(this.moving.dx), Math.round(this.moving.dy))
      } else {
        c.drawImage(src, x, y, w, h, x, y, w, h)
      }
    }
    c.restore()
  }

  /**
   * Draw a downscaled flattening into `target` – used by the colour analysis.
   * Nearest-neighbour sampling keeps true pixel colours (no blended fringes).
   */
  renderForAnalysis(
    target: CanvasRenderingContext2D,
    w: number,
    h: number,
    opts: { withPaper: boolean; activeOnly: boolean },
  ) {
    target.save()
    target.setTransform(1, 0, 0, 1, 0, 0)
    target.globalCompositeOperation = 'source-over'
    target.globalAlpha = 1
    target.clearRect(0, 0, w, h)
    target.imageSmoothingEnabled = false
    if (opts.withPaper) {
      target.fillStyle = this.paper.color
      target.fillRect(0, 0, w, h)
    }
    const s = this.stroke
    for (const layer of this.layers) {
      if (opts.activeOnly ? layer.id !== this.activeId : !layer.visible) continue
      const src = s && s.layer === layer && s.brush.target === 'buffer' ? this.temp : layer.canvas
      target.globalAlpha = opts.activeOnly ? 1 : layer.opacity
      target.globalCompositeOperation = opts.activeOnly ? 'source-over' : layer.blend
      if (this.moving && this.moving.layer === layer) {
        const kx = w / this.width
        const ky = h / this.height
        target.drawImage(src, this.moving.dx * kx, this.moving.dy * ky, w, h)
      } else {
        target.drawImage(src, 0, 0, this.width, this.height, 0, 0, w, h)
      }
    }
    target.restore()
  }

  // ---------------------------------------------------------------- layers

  private findLayer(id: string) {
    return this.layers.find((l) => l.id === id)
  }

  private get active(): Layer {
    return this.findLayer(this.activeId) ?? this.layers[this.layers.length - 1]
  }

  getLayerCanvas(id: string): HTMLCanvasElement | null {
    return this.findLayer(id)?.canvas ?? null
  }

  private makeLayer(name: string): Layer {
    const canvas = createCanvas(this.width, this.height)
    return {
      id: newId(),
      name,
      visible: true,
      opacity: 1,
      blend: 'source-over',
      locked: false,
      alphaLock: false,
      version: 0,
      canvas,
      ctx: get2d(canvas),
    }
  }

  private addLayerInternal(name: string, index: number, layer?: Layer) {
    const l = layer ?? this.makeLayer(name)
    this.layers.splice(index, 0, l)
    return l
  }

  private nextLayerName() {
    let n = this.layers.length + 1
    const names = new Set(this.layers.map((l) => l.name))
    while (names.has(`Layer ${n}`)) n++
    return `Layer ${n}`
  }

  addLayer(name?: string): string | null {
    if (this.layers.length >= MAX_LAYERS) return null
    const index = this.layers.indexOf(this.active) + 1
    const layer = this.addLayerInternal(name ?? this.nextLayerName(), index)
    const prevActive = this.activeId
    this.activeId = layer.id
    this.pushStructural('New layer', layer, index, prevActive)
    this.afterLayerChange()
    return layer.id
  }

  private pushStructural(label: string, layer: Layer, index: number, prevActive: string) {
    this.history.push({
      label,
      bytes: 1024,
      undo: () => {
        this.layers.splice(this.layers.indexOf(layer), 1)
        this.activeId = this.findLayer(prevActive) ? prevActive : this.layers[Math.max(0, index - 1)].id
      },
      redo: () => {
        this.layers.splice(index, 0, layer)
        this.activeId = layer.id
      },
    })
  }

  duplicateLayer(id: string) {
    const src = this.findLayer(id)
    if (!src || this.layers.length >= MAX_LAYERS) return
    const index = this.layers.indexOf(src) + 1
    const copy = this.makeLayer(`${src.name} copy`)
    copy.opacity = src.opacity
    copy.blend = src.blend
    copy.visible = src.visible
    copy.alphaLock = src.alphaLock
    copy.ctx.drawImage(src.canvas, 0, 0)
    this.addLayerInternal(copy.name, index, copy)
    const prevActive = this.activeId
    this.activeId = copy.id
    const entry: HistoryEntry = {
      label: 'Duplicate layer',
      bytes: this.width * this.height * 4,
      undo: () => {
        this.layers.splice(this.layers.indexOf(copy), 1)
        this.activeId = this.findLayer(prevActive) ? prevActive : src.id
      },
      redo: () => {
        this.layers.splice(index, 0, copy)
        this.activeId = copy.id
      },
    }
    this.history.push(entry)
    this.afterLayerChange()
  }

  deleteLayer(id: string) {
    const layer = this.findLayer(id)
    if (!layer) return
    if (this.layers.length === 1) {
      this.clearLayer(id)
      return
    }
    const index = this.layers.indexOf(layer)
    const wasActive = this.activeId === id
    this.layers.splice(index, 1)
    if (wasActive) this.activeId = this.layers[Math.max(0, index - 1)].id
    const prevActive = id
    this.history.push({
      label: 'Delete layer',
      bytes: this.width * this.height * 4,
      undo: () => {
        this.layers.splice(index, 0, layer)
        if (wasActive) this.activeId = prevActive
      },
      redo: () => {
        this.layers.splice(this.layers.indexOf(layer), 1)
        if (this.activeId === id) this.activeId = this.layers[Math.max(0, index - 1)].id
      },
    })
    this.afterLayerChange()
  }

  moveLayer(id: string, toIndex: number) {
    const layer = this.findLayer(id)
    if (!layer) return
    const from = this.layers.indexOf(layer)
    const to = Math.max(0, Math.min(this.layers.length - 1, toIndex))
    if (from === to) return
    const move = (a: number, b: number) => {
      const [l] = this.layers.splice(a, 1)
      this.layers.splice(b, 0, l)
    }
    move(from, to)
    this.history.push({
      label: 'Reorder layers',
      bytes: 64,
      undo: () => move(to, from),
      redo: () => move(from, to),
    })
    this.afterLayerChange()
  }

  mergeDown(id: string) {
    const upper = this.findLayer(id)
    if (!upper) return
    const index = this.layers.indexOf(upper)
    if (index <= 0) return
    const lower = this.layers[index - 1]
    const before = lower.ctx.getImageData(0, 0, this.width, this.height)
    lower.ctx.save()
    lower.ctx.globalAlpha = upper.visible ? upper.opacity : 0
    lower.ctx.globalCompositeOperation = upper.blend
    lower.ctx.drawImage(upper.canvas, 0, 0)
    lower.ctx.restore()
    const after = lower.ctx.getImageData(0, 0, this.width, this.height)
    this.layers.splice(index, 1)
    const wasActive = this.activeId
    this.activeId = lower.id
    lower.version++
    this.history.push({
      label: 'Merge down',
      bytes: before.data.length * 2,
      undo: () => {
        lower.ctx.putImageData(before, 0, 0)
        lower.version++
        this.layers.splice(index, 0, upper)
        this.activeId = wasActive
      },
      redo: () => {
        lower.ctx.putImageData(after, 0, 0)
        lower.version++
        this.layers.splice(this.layers.indexOf(upper), 1)
        this.activeId = lower.id
      },
    })
    this.afterLayerChange()
  }

  clearLayer(id: string) {
    const layer = this.findLayer(id)
    if (!layer || layer.locked) return
    this.snapCtx.globalCompositeOperation = 'copy'
    this.snapCtx.drawImage(layer.canvas, 0, 0)
    this.snapCtx.globalCompositeOperation = 'source-over'
    layer.ctx.clearRect(0, 0, this.width, this.height)
    this.pushPixels(layer, { x0: 0, y0: 0, x1: this.width, y1: this.height }, 'Clear layer')
    this.afterLayerChange()
  }

  setActiveLayer(id: string) {
    if (!this.findLayer(id) || this.stroke) return
    this.activeId = id
    this.emit()
    this.contentChanged()
  }

  setLayerProps(
    id: string,
    props: Partial<Pick<LayerMeta, 'name' | 'visible' | 'opacity' | 'blend' | 'locked' | 'alphaLock'>>,
  ) {
    const layer = this.findLayer(id)
    if (!layer) return
    Object.assign(layer, props)
    if ('visible' in props || 'opacity' in props || 'blend' in props) {
      this.markAllDirty()
      this.contentChanged()
    }
    this.emit()
  }

  setPaper(p: Partial<Paper>) {
    Object.assign(this.paper, p)
    this.markAllDirty()
    this.emit()
    this.contentChanged()
  }

  private afterLayerChange() {
    this.markAllDirty()
    this.emit()
    this.contentChanged()
  }

  /** Add an image as a new layer, scaled to fit the canvas. */
  importImage(img: CanvasImageSource & { width: number; height: number }, name: string) {
    const id = this.addLayer(name)
    if (!id) return
    const layer = this.findLayer(id)!
    const k = Math.min(1, this.width / img.width, this.height / img.height)
    const w = img.width * k
    const h = img.height * k
    layer.ctx.imageSmoothingQuality = 'high'
    layer.ctx.drawImage(img, (this.width - w) / 2, (this.height - h) / 2, w, h)
    layer.version++
    this.afterLayerChange()
  }

  /** Clip a layer back to the coverage it had before the operation (alpha lock). */
  private restoreAlpha(layer: Layer, b: Rect) {
    const x = Math.max(0, Math.floor(b.x0))
    const y = Math.max(0, Math.floor(b.y0))
    const w = Math.min(this.width, Math.ceil(b.x1)) - x
    const h = Math.min(this.height, Math.ceil(b.y1)) - y
    if (w <= 0 || h <= 0) return
    const L = layer.ctx
    L.save()
    L.beginPath()
    L.rect(x, y, w, h)
    L.clip()
    L.globalCompositeOperation = 'destination-in'
    L.drawImage(this.snapshot, x, y, w, h, x, y, w, h)
    L.restore()
  }

  // --------------------------------------------------------------- history

  private pushPixels(layer: Layer, b: Rect, label: string) {
    const x = Math.max(0, Math.floor(b.x0))
    const y = Math.max(0, Math.floor(b.y0))
    const w = Math.min(this.width, Math.ceil(b.x1)) - x
    const h = Math.min(this.height, Math.ceil(b.y1)) - y
    if (w <= 0 || h <= 0) return
    const before = this.snapCtx.getImageData(x, y, w, h)
    const after = layer.ctx.getImageData(x, y, w, h)
    layer.version++
    this.history.push({
      label,
      bytes: before.data.length * 2,
      undo: () => {
        layer.ctx.putImageData(before, x, y)
        layer.version++
        this.markDirty(x, y, x + w, y + h)
      },
      redo: () => {
        layer.ctx.putImageData(after, x, y)
        layer.version++
        this.markDirty(x, y, x + w, y + h)
      },
    })
  }

  undo() {
    if (this.stroke) return
    if (this.history.undo()) this.afterLayerChange()
  }

  redo() {
    if (this.stroke) return
    if (this.history.redo()) this.afterLayerChange()
  }

  // --------------------------------------------------------------- strokes

  /** Why painting on the active layer is not possible right now, if anything. */
  blockedReason(): string | null {
    const l = this.active
    if (!l.visible) return `“${l.name}” is hidden — show it to paint`
    if (l.locked) return `“${l.name}” is locked`
    return null
  }

  private scratch = (w: number, h: number) => {
    if (this.scratchCanvas.width < w || this.scratchCanvas.height < h) {
      this.scratchCanvas.width = Math.max(this.scratchCanvas.width, Math.ceil(w))
      this.scratchCanvas.height = Math.max(this.scratchCanvas.height, Math.ceil(h))
    }
    return this.scratchCtx
  }

  private sampleFrom(layer: Layer, x: number, y: number, r: number): [number, number, number, number] | null {
    const s = this.sampleCtx
    s.globalCompositeOperation = 'copy'
    s.imageSmoothingEnabled = true
    s.drawImage(layer.canvas, x - r, y - r, r * 2, r * 2, 0, 0, 4, 4)
    const d = s.getImageData(0, 0, 4, 4).data
    let rr = 0
    let gg = 0
    let bb = 0
    let aa = 0
    for (let i = 0; i < 64; i += 4) {
      const a = d[i + 3]
      rr += d[i] * a
      gg += d[i + 1] * a
      bb += d[i + 2] * a
      aa += a
    }
    if (aa < 16 * 4) return null
    return [rr / aa, gg / aa, bb / aa, aa / (16 * 255)]
  }

  beginStroke(
    brushId: BrushId,
    settings: BrushSettings,
    colorHex: string,
    p: InputPoint,
    opts: { straight?: boolean } = {},
  ): boolean {
    if (this.stroke || this.blockedReason()) return false
    const brush = BRUSHES[brushId] as BrushDef<unknown>
    const layer = this.active
    const color: RGB = hexToRgb(colorHex)

    // snapshot for undo
    this.snapCtx.globalCompositeOperation = 'copy'
    this.snapCtx.drawImage(layer.canvas, 0, 0)
    this.snapCtx.globalCompositeOperation = 'source-over'
    // the temp (layer + buffer) surface must start fully in sync with the layer
    this.tempCtx.globalCompositeOperation = 'copy'
    this.tempCtx.drawImage(layer.canvas, 0, 0)
    this.tempCtx.globalCompositeOperation = 'source-over'

    const rng = mulberry32(this.seed++ * 7919)
    const stroke: ActiveStroke = {
      brush,
      settings: { ...settings },
      layer,
      state: null,
      builder: null as unknown as StrokeBuilder,
      paint: null as unknown as PaintContext,
      bounds: null,
      lastDab: null,
      lastTick: performance.now(),
      label: brush.name,
      started: false,
    }
    stroke.paint = {
      buf: this.bufCtx,
      layer: layer.ctx,
      width: this.width,
      height: this.height,
      color,
      s: stroke.settings,
      rng,
      dirty: (x0, y0, x1, y1) => {
        const b = stroke.bounds ?? (stroke.bounds = emptyRect())
        if (x0 < b.x0) b.x0 = x0
        if (y0 < b.y0) b.y0 = y0
        if (x1 > b.x1) b.x1 = x1
        if (y1 > b.y1) b.y1 = y1
        this.markDirty(x0, y0, x1, y1)
      },
      sample: (x, y, r) => this.sampleFrom(layer, x, y, r),
      scratch: this.scratch,
    }
    stroke.builder = new StrokeBuilder({
      smoothing: opts.straight ? 0 : settings.smoothing,
      pressureMode: brush.pressureMode,
      spacing: (pr) => brush.spacing(stroke.settings, pr),
      onDab: (d) => {
        if (!stroke.started) {
          stroke.state = brush.begin(stroke.paint, d)
          stroke.started = true
        }
        resetCtx(this.bufCtx)
        brush.dab(stroke.paint, d, stroke.state)
        stroke.lastDab = d
        stroke.lastTick = performance.now()
      },
    })
    this.stroke = stroke
    stroke.builder.push(p)
    this.emit()
    return true
  }

  strokeTo(points: InputPoint[]) {
    const s = this.stroke
    if (!s) return
    for (const p of points) s.builder.push(p)
    this.contentChanged(true)
  }

  /** Called every frame while the pointer is down – lets airbrushes build up in place. */
  tick(now: number) {
    const s = this.stroke
    if (!s || !s.brush.continuous || !s.lastDab || !s.started) return
    if (now - s.lastTick < 28) return
    s.lastTick = now
    resetCtx(this.bufCtx)
    s.brush.dab(s.paint, { ...s.lastDab, time: now, first: false }, s.state)
    this.contentChanged(true)
  }

  endStroke() {
    const s = this.stroke
    if (!s) return
    s.builder.finish()
    let bounds = s.bounds
    const layer = s.layer
    if (bounds && s.brush.end && s.started) {
      resetCtx(this.bufCtx)
      const grown = s.brush.end(s.paint, s.state, clampRect(bounds, this.width, this.height))
      if (grown) bounds = unionRect(bounds, grown)
    }
    if (bounds) {
      const b = clampRect(bounds, this.width, this.height)
      if (b.x1 > b.x0 && b.y1 > b.y0) {
        if (s.brush.target === 'buffer') {
          const L = layer.ctx
          L.save()
          L.globalAlpha = s.brush.bakesOpacity ? 1 : s.settings.opacity
          L.globalCompositeOperation = s.brush.composite
          const w = b.x1 - b.x0
          const h = b.y1 - b.y0
          L.drawImage(this.buffer, b.x0, b.y0, w, h, b.x0, b.y0, w, h)
          L.restore()
        }
        if (layer.alphaLock) this.restoreAlpha(layer, b)
        this.pushPixels(layer, b, s.label)
        this.bufCtx.clearRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0)
        this.markDirty(b.x0, b.y0, b.x1, b.y1)
      }
    }
    const last = s.builder.lastPoint
    if (last) this.lastStrokeEnd = { x: last.x, y: last.y }
    this.stroke = null
    this.emit()
    this.contentChanged(false)
  }

  cancelStroke() {
    const s = this.stroke
    if (!s) return
    if (s.brush.target === 'layer') {
      s.layer.ctx.save()
      s.layer.ctx.globalCompositeOperation = 'copy'
      s.layer.ctx.drawImage(this.snapshot, 0, 0)
      s.layer.ctx.restore()
    }
    this.bufCtx.clearRect(0, 0, this.width, this.height)
    this.stroke = null
    this.markAllDirty()
    this.emit()
    this.contentChanged(false)
  }

  get isStroking() {
    return this.stroke !== null
  }

  // ------------------------------------------------------------ fill & pick

  fill(x: number, y: number, colorHex: string, opts: { tolerance: number; sampleAll: boolean; expand: number; opacity: number }) {
    if (this.blockedReason()) return false
    const layer = this.active
    const W = this.width
    const H = this.height
    const data = opts.sampleAll
      ? this.flatten(0, 0, W, H).getImageData(0, 0, W, H).data
      : layer.ctx.getImageData(0, 0, W, H).data
    let res = floodFillMask(data, W, H, x, y, opts.tolerance)
    if (!res) return false
    res = dilateMask(res, W, H, Math.round(opts.expand))
    const [r, g, b] = hexToRgb(colorHex)
    const w = res.x1 - res.x0
    const h = res.y1 - res.y0
    const tmp = this.scratch(w, h)
    const img = tmp.createImageData(w, h)
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        if (!res.mask[(yy + res.y0) * W + xx + res.x0]) continue
        const o = (yy * w + xx) * 4
        img.data[o] = r
        img.data[o + 1] = g
        img.data[o + 2] = b
        img.data[o + 3] = 255
      }
    }
    tmp.clearRect(0, 0, w, h)
    tmp.putImageData(img, 0, 0)
    this.snapCtx.globalCompositeOperation = 'copy'
    this.snapCtx.drawImage(layer.canvas, 0, 0)
    this.snapCtx.globalCompositeOperation = 'source-over'
    layer.ctx.save()
    layer.ctx.globalAlpha = opts.opacity
    layer.ctx.drawImage(tmp.canvas, 0, 0, w, h, res.x0, res.y0, w, h)
    layer.ctx.restore()
    if (layer.alphaLock) this.restoreAlpha(layer, res)
    const rect = { x0: res.x0, y0: res.y0, x1: res.x1, y1: res.y1 }
    this.pushPixels(layer, rect, 'Fill')
    this.markDirty(rect.x0, rect.y0, rect.x1, rect.y1)
    this.emit()
    this.contentChanged()
    return true
  }

  /** Colour of the flattened image at a document point (null on transparency). */
  pickColor(x: number, y: number, activeOnly = false): RGB | null {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null
    const px = Math.floor(x)
    const py = Math.floor(y)
    const ctx = activeOnly ? this.active.ctx : this.flatten(px, py, 1, 1)
    const d = ctx.getImageData(px, py, 1, 1).data
    if (d[3] < 8) return null
    return [d[0], d[1], d[2]]
  }

  private flatCtx: CanvasRenderingContext2D | null = null

  /** Flatten a region without the paper texture – clean colours for sampling. */
  private flatten(x: number, y: number, w: number, h: number): CanvasRenderingContext2D {
    if (!this.flatCtx) this.flatCtx = get2d(createCanvas(this.width, this.height), { willReadFrequently: true })
    const c = this.flatCtx
    if (c.canvas.width !== this.width || c.canvas.height !== this.height) {
      c.canvas.width = this.width
      c.canvas.height = this.height
    }
    const tex = this.paper.texture
    this.paper.texture = false
    this.compose(c, x, y, w, h)
    this.paper.texture = tex
    return c
  }

  // ------------------------------------------------------------------ move

  beginMove(): boolean {
    if (this.blockedReason() || this.stroke) return false
    const layer = this.active
    this.snapCtx.globalCompositeOperation = 'copy'
    this.snapCtx.drawImage(layer.canvas, 0, 0)
    this.snapCtx.globalCompositeOperation = 'source-over'
    this.moving = { layer, dx: 0, dy: 0 }
    return true
  }

  moveBy(dx: number, dy: number) {
    if (!this.moving) return
    this.moving.dx = dx
    this.moving.dy = dy
    this.markAllDirty()
    this.contentChanged(true)
  }

  endMove() {
    const m = this.moving
    if (!m) return
    this.moving = null
    const dx = Math.round(m.dx)
    const dy = Math.round(m.dy)
    if (dx !== 0 || dy !== 0) {
      m.layer.ctx.save()
      m.layer.ctx.globalCompositeOperation = 'copy'
      m.layer.ctx.drawImage(this.snapshot, dx, dy)
      m.layer.ctx.restore()
      this.pushPixels(m.layer, { x0: 0, y0: 0, x1: this.width, y1: this.height }, 'Move layer')
    }
    this.afterLayerChange()
  }

  // --------------------------------------------------------- import/export

  /** Flattened PNG of the visible image. */
  async exportPNG(withPaper = true): Promise<Blob> {
    const out = createCanvas(this.width, this.height)
    const c = get2d(out)
    const paperVisible = this.paper.visible
    this.paper.visible = paperVisible && withPaper
    this.compose(c, 0, 0, this.width, this.height)
    this.paper.visible = paperVisible
    return new Promise((resolve, reject) =>
      out.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed'))), 'image/png'),
    )
  }

  async serialize(): Promise<SerializedDoc> {
    const layers = await Promise.all(
      this.layers.map(
        (l) =>
          new Promise<SerializedDoc['layers'][number]>((resolve, reject) =>
            l.canvas.toBlob((png) => {
              if (!png) return reject(new Error('Could not encode layer'))
              resolve({
                name: l.name,
                visible: l.visible,
                opacity: l.opacity,
                blend: l.blend,
                locked: l.locked,
                alphaLock: l.alphaLock,
                png,
              })
            }, 'image/png'),
          ),
      ),
    )
    return {
      version: 1,
      width: this.width,
      height: this.height,
      paper: { ...this.paper },
      activeIndex: Math.max(0, this.layers.indexOf(this.active)),
      layers,
    }
  }

  /** Replace the whole document (new canvas / open project). */
  async load(doc: SerializedDoc | { width: number; height: number; paper?: Partial<Paper> }) {
    const token = ++this.loadToken
    // Decode everything first, then swap the document in atomically, so a
    // second load started meanwhile can't interleave its layers with ours.
    const bitmaps =
      'layers' in doc ? await Promise.all(doc.layers.map((l) => createImageBitmap(l.png))) : []
    if (token !== this.loadToken) {
      for (const b of bitmaps) b.close?.()
      return
    }
    this.cancelStroke()
    this.moving = null
    this.resizeSurfaces(doc.width, doc.height)
    const layers: Layer[] = []
    if ('layers' in doc && doc.layers.length) {
      doc.layers.forEach((meta, i) => {
        const layer = this.makeLayer(meta.name)
        layer.visible = meta.visible
        layer.opacity = meta.opacity
        layer.blend = meta.blend
        layer.locked = meta.locked
        layer.alphaLock = !!meta.alphaLock
        layer.ctx.drawImage(bitmaps[i], 0, 0)
        bitmaps[i].close?.()
        layers.push(layer)
      })
    } else {
      layers.push(this.makeLayer('Layer 1'))
    }
    this.layers = layers
    const activeIndex = 'activeIndex' in doc ? doc.activeIndex : 0
    this.activeId = layers[Math.max(0, Math.min(layers.length - 1, activeIndex))].id
    if (doc.paper) Object.assign(this.paper, doc.paper)
    this.history.clear()
    this.lastStrokeEnd = null
    this.markAllDirty()
    this.emit()
    this.contentChanged()
  }

  private resizeSurfaces(w: number, h: number) {
    this.width = w
    this.height = h
    for (const c of [this.composite, this.buffer, this.temp, this.snapshot]) {
      c.width = w
      c.height = h
    }
  }

  get layerCount() {
    return this.layers.length
  }
}

function resetCtx(c: CanvasRenderingContext2D) {
  c.globalAlpha = 1
  c.globalCompositeOperation = 'source-over'
}

function clampRect(r: Rect, w: number, h: number): Rect {
  return {
    x0: Math.max(0, Math.floor(r.x0)),
    y0: Math.max(0, Math.floor(r.y0)),
    x1: Math.min(w, Math.ceil(r.x1)),
    y1: Math.min(h, Math.ceil(r.y1)),
  }
}

function unionRect(a: Rect, b: Rect): Rect {
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  }
}
