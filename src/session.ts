import { PaletteAnalyzer } from './analysis/analyzer'
import { Engine } from './engine/Engine'
import { loadAutosave, saveAutosave } from './engine/persistence'
import { getEdgeNoise, getLowNoise, getPaperGrain } from './engine/textures'
import { i18nReady, onLocaleChange, t } from './i18n'
import en from './i18n/locales/en'
import { translateName, type NamePatterns } from './lib/layerNames'
import { toolStore } from './state/tools'
import { uiStore, view, viewStore } from './state/ui'

/** The single document engine and its live colour analyser. */
export const engine = new Engine(1800, 1200)
export const analyzer = new PaletteAnalyzer(engine)

engine.symmetry = toolStore.get().symmetry
toolStore.subscribe(() => {
  engine.symmetry = toolStore.get().symmetry
})

// ------------------------------------------------------------- layer names

/** New layers are named in the current language. */
engine.naming = {
  layer: (n) => t('layers.defaultName', { n }),
  copy: (name) => t('layers.copyName', { name }),
}

const currentPatterns = (): NamePatterns => ({ layer: t('layers.defaultName'), copy: t('layers.copyName') })
let namedWith: NamePatterns = { layer: en.layers.defaultName, copy: en.layers.copyName }

function localizeLayerNames() {
  const from = namedWith
  const to = currentPatterns()
  namedWith = to
  if (from.layer === to.layer && from.copy === to.copy) return
  engine.renameLayers((name) => translateName(name, from, to))
}

onLocaleChange(() => localizeLayerNames())

// ------------------------------------------------------------------ autosave

let restoring = true
let saveTimer: ReturnType<typeof setTimeout> | null = null
let dirty = false
let saving: Promise<void> | null = null

async function saveNow() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = null
  if (!dirty || restoring) return
  if (engine.isStroking) return scheduleSave()
  if (saving) await saving
  dirty = false
  uiStore.set({ saving: 'saving' })
  saving = saveAutosave(engine)
    .then(() => uiStore.set({ saving: dirty ? 'saving' : 'saved' }))
    .catch(() => {
      dirty = true
      uiStore.set({ saving: 'error' })
    })
    .finally(() => {
      saving = null
    })
  await saving
}

function scheduleSave() {
  if (restoring) return
  dirty = true
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(saveNow, 900)
}

engine.onContentChange((live) => {
  if (!live) scheduleSave()
})
// Layer renames / locks don't change pixels but should still be saved.
engine.subscribe(() => scheduleSave())

// Save straight away when the tab is hidden or closed, and warn if a save
// genuinely could not finish in time.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void saveNow()
})
window.addEventListener('pagehide', () => void saveNow())
window.addEventListener('beforeunload', (e) => {
  if (dirty || saving) {
    void saveNow()
    e.preventDefault()
  }
})

let restoring$: Promise<void> | null = null

/** Restore the autosaved painting (once, even if called repeatedly). */
export function restoreSession() {
  return (restoring$ ??= restore())
}

async function restore() {
  await i18nReady
  const doc = await loadAutosave()
  if (doc) {
    try {
      await engine.load(doc)
    } catch {
      /* corrupted autosave – start fresh */
    }
  }
  // Default names were generated in English (fresh document) or saved in English.
  namedWith = { layer: en.layers.defaultName, copy: en.layers.copyName }
  localizeLayerNames()
  restoring = false
  view.fit(engine.width, engine.height)
  // Generate the procedural noise textures before the first watercolor/pencil stroke needs them.
  const warm = () => {
    getEdgeNoise()
    getLowNoise()
    getPaperGrain()
  }
  if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 2000 })
  else setTimeout(warm, 500)
}

// Handy for debugging from the console (dev builds, or any build with ?debug).
if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
  ;(window as unknown as Record<string, unknown>).__atelier = { engine, analyzer, viewStore }
}
