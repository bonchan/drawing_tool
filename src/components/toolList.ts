import { Eraser, FingerprintPattern, Hand, Move, PaintBucket, Pipette } from 'lucide-react'
import type { BrushId } from '../engine/brushes'
import type { ToolId } from '../state/tools'

type UtilityTool = Exclude<ToolId, BrushId> | 'eraser' | 'smudge'

/** Non-painting tools (plus eraser and blender) with their icons and shortcut keys. */
export const UTILITY_TOOLS: Array<{ id: UtilityTool; icon: typeof Eraser; key: string }> = [
  { id: 'eraser', icon: Eraser, key: 'E' },
  { id: 'smudge', icon: FingerprintPattern, key: 'U' },
  { id: 'fill', icon: PaintBucket, key: 'G' },
  { id: 'eyedropper', icon: Pipette, key: 'I' },
  { id: 'move', icon: Move, key: 'V' },
  { id: 'hand', icon: Hand, key: 'H' },
]
