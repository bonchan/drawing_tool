import type { RGB } from '../color'
import type { Dab, PressureMode } from '../stroke'

export type BrushId =
  | 'pencil'
  | 'pen'
  | 'ink'
  | 'calligraphy'
  | 'marker'
  | 'highlighter'
  | 'brush'
  | 'watercolor'
  | 'oil'
  | 'airbrush'
  | 'spray'
  | 'charcoal'
  | 'crayon'
  | 'eraser'
  | 'smudge'

export interface BrushSettings {
  size: number
  opacity: number
  flow: number
  smoothing: number
  hardness: number
  [extra: string]: number
}

export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface ControlDef {
  key: string
  label: string
  min: number
  max: number
  step?: number
  /** How the value is displayed. */
  unit?: '%' | 'px' | '°' | ''
  /** Non-linear slider response, handy for brush size. */
  curve?: 'quad'
  hint?: string
}

/** Everything a brush needs to paint, independent of the document (so previews can reuse it). */
export interface PaintContext {
  /** Per-stroke buffer. Buffer brushes paint here; it is merged into the layer on stroke end. */
  buf: CanvasRenderingContext2D
  /** Target layer. Direct brushes (smudge) paint here; others may sample from it. */
  layer: CanvasRenderingContext2D
  width: number
  height: number
  color: RGB
  s: BrushSettings
  rng: () => number
  /** Report a modified rectangle (document coordinates). */
  dirty(x0: number, y0: number, x1: number, y1: number): void
  /** Average colour of the target layer near a point, or null if transparent. */
  sample(x: number, y: number, r: number): [number, number, number, number] | null
  /** A reusable scratch canvas of at least the given size. */
  scratch(w: number, h: number): CanvasRenderingContext2D
}

export interface BrushDef<S = unknown> {
  id: BrushId
  name: string
  group: 'Dry media' | 'Ink & pens' | 'Paint' | 'Utility'
  description: string
  shortcut?: string
  /** 'buffer' paints into a stroke buffer merged on release (opacity acts as a ceiling). */
  target: 'buffer' | 'layer'
  /** How the stroke buffer is merged into the layer. */
  composite: GlobalCompositeOperation
  pressureMode: PressureMode
  defaults: BrushSettings
  controls: ControlDef[]
  spacing(s: BrushSettings, pressure: number): number
  begin(ctx: PaintContext, first: Dab): S
  dab(ctx: PaintContext, d: Dab, state: S): void
  /** Optional finishing pass. May return a grown dirty rect (e.g. watercolor bleeding). */
  end?(ctx: PaintContext, state: S, bounds: Rect): Rect | void
  /** Keep depositing while the pointer is held still (airbrush, spray). */
  continuous?: boolean
  /** The finishing pass already applied opacity into the buffer pixels. */
  bakesOpacity?: boolean
  /** Opacity multiplier for the live (pre-finish) preview. */
  previewOpacity?: number
}

export const COMMON = {
  size: { key: 'size', label: 'Size', min: 1, max: 400, unit: 'px', curve: 'quad' } as ControlDef,
  opacity: { key: 'opacity', label: 'Opacity', min: 0.01, max: 1, step: 0.01, unit: '%' } as ControlDef,
  flow: { key: 'flow', label: 'Flow', min: 0.01, max: 1, step: 0.01, unit: '%' } as ControlDef,
  hardness: { key: 'hardness', label: 'Hardness', min: 0, max: 1, step: 0.01, unit: '%' } as ControlDef,
  smoothing: {
    key: 'smoothing',
    label: 'Stabilizer',
    min: 0,
    max: 1,
    step: 0.01,
    unit: '%',
    hint: 'Smooths out hand jitter',
  } as ControlDef,
}
