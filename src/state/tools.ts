import { BRUSHES, BRUSH_LIST, isBrushId, type BrushId, type BrushSettings } from '../engine/brushes'
import type { Symmetry } from '../engine/Engine'
import { createStore } from './store'

export type ToolId = BrushId | 'fill' | 'eyedropper' | 'move' | 'hand'

export interface FillSettings {
  tolerance: number
  sampleAll: boolean
  expand: number
  opacity: number
}

export interface ToolState {
  tool: ToolId
  /** The last painting brush (used by the B shortcut and after picking a colour). */
  lastBrush: BrushId
  settings: Record<BrushId, BrushSettings>
  fill: FillSettings
  color: string
  secondary: string
  recent: string[]
  symmetry: Symmetry
}

const STORAGE_KEY = 'atelier.tools.v1'

function defaults(): ToolState {
  return {
    tool: 'watercolor',
    lastBrush: 'watercolor',
    settings: Object.fromEntries(BRUSH_LIST.map((b) => [b.id, { ...b.defaults }])) as Record<BrushId, BrushSettings>,
    fill: { tolerance: 0.18, sampleAll: true, expand: 1, opacity: 1 },
    color: '#2f6fb3',
    secondary: '#ffffff',
    recent: ['#2f6fb3', '#c23b3b', '#e8b33a', '#3e8e5a', '#2a2a2e'],
    symmetry: 'off',
  }
}

function load(): ToolState {
  const base = defaults()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const saved = JSON.parse(raw) as Partial<ToolState>
    const settings = { ...base.settings }
    for (const id of Object.keys(saved.settings ?? {})) {
      if (isBrushId(id)) settings[id] = { ...BRUSHES[id].defaults, ...saved.settings![id] }
    }
    return {
      ...base,
      ...saved,
      tool: saved.tool && (isBrushId(saved.tool) || ['fill', 'eyedropper', 'move', 'hand'].includes(saved.tool)) ? saved.tool : base.tool,
      settings,
      fill: { ...base.fill, ...saved.fill },
      recent: Array.isArray(saved.recent) ? saved.recent.slice(0, 16) : base.recent,
    }
  } catch {
    return base
  }
}

export const toolStore = createStore<ToolState>(load())

let saveTimer: ReturnType<typeof setTimeout> | null = null
toolStore.subscribe(() => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      const { tool, lastBrush, settings, fill, color, secondary, recent, symmetry } = toolStore.get()
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ tool: tool === 'hand' ? lastBrush : tool, lastBrush, settings, fill, color, secondary, recent, symmetry }),
      )
    } catch {
      /* storage unavailable – preferences just won't persist */
    }
  }, 400)
})

export const tools = {
  setTool(tool: ToolId) {
    toolStore.set((s) => ({ tool, lastBrush: isBrushId(tool) && tool !== 'eraser' && tool !== 'smudge' ? tool : s.lastBrush }))
  },
  setSetting(id: BrushId, key: string, value: number) {
    toolStore.set((s) => ({ settings: { ...s.settings, [id]: { ...s.settings[id], [key]: value } } }))
  },
  resetBrush(id: BrushId) {
    toolStore.set((s) => ({ settings: { ...s.settings, [id]: { ...BRUSHES[id].defaults } } }))
  },
  setSymmetry(symmetry: Symmetry) {
    toolStore.set({ symmetry })
  },
  setFill(patch: Partial<FillSettings>) {
    toolStore.set((s) => ({ fill: { ...s.fill, ...patch } }))
  },
  setColor(hex: string) {
    toolStore.set({ color: hex.toLowerCase() })
  },
  swapColors() {
    toolStore.set((s) => ({ color: s.secondary, secondary: s.color }))
  },
  /** Remember a colour once it has actually been used to paint. */
  pushRecent(hex: string) {
    const h = hex.toLowerCase()
    toolStore.set((s) => (s.recent[0] === h ? {} : { recent: [h, ...s.recent.filter((c) => c !== h)].slice(0, 16) }))
  },
  /** Brush size for the current tool (if it is a brush). */
  nudgeSize(factor: number) {
    const { tool, settings } = toolStore.get()
    if (!isBrushId(tool)) return
    const size = settings[tool].size
    const next = Math.max(1, Math.min(400, Math.round(factor > 1 ? Math.max(size + 1, size * factor) : Math.min(size - 1, size * factor))))
    tools.setSetting(tool, 'size', next)
  },
  setOpacity(v: number) {
    const { tool } = toolStore.get()
    if (isBrushId(tool)) tools.setSetting(tool, 'opacity', v)
  },
}
