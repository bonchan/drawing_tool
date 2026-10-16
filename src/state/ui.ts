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

export interface UiState {
  leftOpen: boolean
  rightOpen: boolean
  dialog: null | 'new' | 'shortcuts' | 'about'
  toast: { id: number; text: string; tone: 'info' | 'warn' } | null
  /** Collapsed panel sections by key. */
  collapsed: Record<string, boolean>
  saving: 'idle' | 'saving' | 'saved' | 'error'
}

const narrow = typeof window !== 'undefined' && window.innerWidth < 900

export const uiStore = createStore<UiState>({
  leftOpen: !narrow,
  rightOpen: !narrow,
  dialog: null,
  toast: null,
  collapsed: {},
  saving: 'idle',
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
  toggleSection(key: string) {
    uiStore.set((s) => ({ collapsed: { ...s.collapsed, [key]: !s.collapsed[key] } }))
  },
}
