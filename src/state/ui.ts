import { createStore } from './store'

export interface ViewState {
  zoom: number
  panX: number
  panY: number
  /** Viewport size in CSS pixels, maintained by the canvas view. */
  vw: number
  vh: number
}

export const viewStore = createStore<ViewState>({ zoom: 1, panX: 0, panY: 0, vw: 0, vh: 0 })

/** Pointer position in document pixels (kept apart so moving the mouse doesn't redraw the view). */
export const cursorStore = createStore<{ pos: { x: number; y: number } | null }>({ pos: null })

export const MIN_ZOOM = 0.05
export const MAX_ZOOM = 32

export const view = {
  fit(docW: number, docH: number) {
    const { vw, vh } = viewStore.get()
    if (!vw || !vh) return
    const margin = Math.min(64, Math.min(vw, vh) * 0.06)
    const zoom = Math.max(MIN_ZOOM, Math.min(4, (vw - margin * 2) / docW, (vh - margin * 2) / docH))
    viewStore.set({ zoom, panX: (vw - docW * zoom) / 2, panY: (vh - docH * zoom) / 2 })
  },
  /** Zoom keeping the given viewport point fixed (defaults to the centre). */
  zoomTo(zoom: number, ax?: number, ay?: number) {
    const s = viewStore.get()
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom))
    const cx = ax ?? s.vw / 2
    const cy = ay ?? s.vh / 2
    const k = z / s.zoom
    viewStore.set({ zoom: z, panX: cx - (cx - s.panX) * k, panY: cy - (cy - s.panY) * k })
  },
  zoomBy(factor: number, ax?: number, ay?: number) {
    view.zoomTo(viewStore.get().zoom * factor, ax, ay)
  },
  actualSize(docW: number, docH: number) {
    const { vw, vh } = viewStore.get()
    viewStore.set({ zoom: 1, panX: (vw - docW) / 2, panY: (vh - docH) / 2 })
  },
  panBy(dx: number, dy: number) {
    const s = viewStore.get()
    viewStore.set({ panX: s.panX + dx, panY: s.panY + dy })
  },
}

export type CompositionTab = 'colors' | 'families' | 'values'

/**
 * desktop: docked side panels · tablet: tool rail + drawers (right panel docked
 * when there's room) · phone: bottom dock + bottom sheets.
 */
export type LayoutMode = 'desktop' | 'tablet' | 'phone'
export type SheetId = 'tools' | 'color' | 'layers' | 'composition'

export interface UiState {
  layout: LayoutMode
  /** Tablet only: the right panel fits next to the canvas instead of overlaying it. */
  dockRight: boolean
  leftOpen: boolean
  rightOpen: boolean
  /** Phone only: which bottom sheet is showing. */
  sheet: SheetId | null
  dialog: null | 'new' | 'shortcuts' | 'about'
  toast: { id: number; text: string; tone: 'info' | 'warn' } | null
  /** Collapsed panel sections by key. */
  collapsed: Record<string, boolean>
  compositionTab: CompositionTab
  saving: 'idle' | 'saving' | 'saved' | 'error'
}

export function computeLayout(): Pick<UiState, 'layout' | 'dockRight'> {
  if (typeof window === 'undefined') return { layout: 'desktop', dockRight: true }
  const w = window.innerWidth
  const h = window.innerHeight
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  // Phones in landscape are wide but very short – they still want the phone layout.
  if (w < 600 || (coarse && Math.min(w, h) < 500)) return { layout: 'phone', dockRight: false }
  if (w < 900 || (coarse && w < 1200)) return { layout: 'tablet', dockRight: w >= 1000 }
  return { layout: 'desktop', dockRight: true }
}

/** Which panels start open in each layout. */
export function panelDefaults(l: Pick<UiState, 'layout' | 'dockRight'>): Pick<UiState, 'leftOpen' | 'rightOpen' | 'sheet'> {
  if (l.layout === 'desktop') return { leftOpen: true, rightOpen: true, sheet: null }
  if (l.layout === 'tablet') return { leftOpen: false, rightOpen: l.dockRight, sheet: null }
  return { leftOpen: false, rightOpen: false, sheet: null }
}

const initialLayout = computeLayout()
const PREFS_KEY = 'atelier.ui.v1'

/** Layout preferences that survive reloads (open panels depend on the screen, so they don't). */
function loadPrefs(): Pick<UiState, 'collapsed' | 'compositionTab'> {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<UiState>
    const tab = saved.compositionTab
    return {
      collapsed: saved.collapsed && typeof saved.collapsed === 'object' ? saved.collapsed : {},
      compositionTab: tab === 'families' || tab === 'values' ? tab : 'colors',
    }
  } catch {
    return { collapsed: {}, compositionTab: 'colors' }
  }
}

export const uiStore = createStore<UiState>({
  ...initialLayout,
  ...panelDefaults(initialLayout),
  dialog: null,
  toast: null,
  ...loadPrefs(),
  saving: 'idle',
})

let savedPrefs = ''
uiStore.subscribe(() => {
  const { collapsed, compositionTab } = uiStore.get()
  const next = JSON.stringify({ collapsed, compositionTab })
  if (next === savedPrefs) return
  savedPrefs = next
  try {
    localStorage.setItem(PREFS_KEY, next)
  } catch {
    /* storage unavailable */
  }
})

let toastId = 0
let toastTimer: ReturnType<typeof setTimeout> | null = null

export const ui = {
  toast(text: string, tone: 'info' | 'warn' = 'info') {
    const id = ++toastId
    uiStore.set({ toast: { id, text, tone } })
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      if (uiStore.get().toast?.id === id) uiStore.set({ toast: null })
    }, 2600)
  },
  openDialog(dialog: UiState['dialog']) {
    uiStore.set({ dialog })
  },
  /** Phone: open a bottom sheet (or close it if it's already open). */
  toggleSheet(sheet: SheetId) {
    uiStore.set((s) => ({ sheet: s.sheet === sheet ? null : sheet }))
  },
  /** Close whatever covers the canvas on small screens (after choosing a brush, say). */
  closeOverlays() {
    const s = uiStore.get()
    if (s.layout === 'phone') uiStore.set({ sheet: null })
    else if (s.layout === 'tablet') uiStore.set({ leftOpen: false, rightOpen: s.dockRight ? s.rightOpen : false })
  },
  toggleSection(key: string) {
    uiStore.set((s) => ({ collapsed: { ...s.collapsed, [key]: !s.collapsed[key] } }))
  },
}
