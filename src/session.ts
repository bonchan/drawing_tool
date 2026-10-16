import { PaletteAnalyzer } from './analysis/analyzer'
import { Engine } from './engine/Engine'
import { loadAutosave, saveAutosave } from './engine/persistence'
import { uiStore, view } from './state/ui'

/** The single document engine and its live colour analyser. */
export const engine = new Engine(1800, 1200)
export const analyzer = new PaletteAnalyzer(engine)

// ------------------------------------------------------------------ autosave

let restoring = true
let saveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSave() {
  if (restoring) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    if (engine.isStroking) return scheduleSave()
    uiStore.set({ saving: 'saving' })
    try {
      await saveAutosave(engine)
      uiStore.set({ saving: 'saved' })
    } catch {
      uiStore.set({ saving: 'error' })
    }
  }, 1500)
}

engine.onContentChange((live) => {
  if (!live) scheduleSave()
})
// Layer renames / locks don't change pixels but should still be saved.
engine.subscribe(() => scheduleSave())

export async function restoreSession() {
  const doc = await loadAutosave()
  if (doc) {
    try {
      await engine.load(doc)
    } catch {
      /* corrupted autosave – start fresh */
    }
  }
  restoring = false
  view.fit(engine.width, engine.height)
}

// Handy for debugging from the console during development.
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__atelier = { engine, analyzer }
}
