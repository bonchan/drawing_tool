import { charcoal, crayon, pencil } from './dry'
import { calligraphy, highlighter, ink, marker, pen } from './ink'
import { airbrush, brush, oil, spray } from './paint'
import type { BrushDef, BrushId } from './types'
import { eraser, smudge } from './utility'
import { watercolor } from './watercolor'

export * from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBrush = BrushDef<any>

export const BRUSH_LIST: AnyBrush[] = [
  pencil,
  charcoal,
  crayon,
  pen,
  ink,
  calligraphy,
  marker,
  highlighter,
  brush,
  watercolor,
  oil,
  airbrush,
  spray,
  eraser,
  smudge,
]

export const BRUSHES = Object.fromEntries(BRUSH_LIST.map((b) => [b.id, b])) as Record<BrushId, AnyBrush>

export const BRUSH_GROUPS: Array<{ id: AnyBrush['group']; brushes: AnyBrush[] }> = (
  ['dry', 'ink', 'paint'] as const
).map((id) => ({ id, brushes: BRUSH_LIST.filter((b) => b.group === id) }))

export function isBrushId(id: string): id is BrushId {
  return id in BRUSHES
}
