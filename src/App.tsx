import { useEffect, useState } from 'react'
import { engine, restoreSession } from './session'
import { CanvasView } from './components/CanvasView'
import { ColorPanel } from './components/ColorPanel'
import { CompositionPanel } from './components/CompositionPanel'
import { Dialogs, Toast } from './components/Dialogs'
import { LayersPanel } from './components/LayersPanel'
import { LeftPanel } from './components/LeftPanel'
import { StatusBar } from './components/StatusBar'
import { TooltipLayer } from './components/TooltipLayer'
import { TopBar } from './components/TopBar'
import { exportPng, openFile, saveProject } from './lib/actions'
import { BRUSH_LIST } from './engine/brushes'
import { MAX_LAYERS } from './engine/Engine'
import { useStore } from './state/store'
import { tools, type ToolId } from './state/tools'
import { ui, uiStore, view } from './state/ui'

const TOOL_KEYS: Record<string, ToolId> = {
  ...Object.fromEntries(BRUSH_LIST.filter((b) => b.shortcut).map((b) => [b.shortcut!.toLowerCase(), b.id])),
  g: 'fill',
  i: 'eyedropper',
  v: 'move',
  h: 'hand',
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || uiStore.get().dialog) return
      const k = e.key.toLowerCase()
      const mod = e.ctrlKey || e.metaKey
      if (mod) {
        if (k === 'z' && !e.shiftKey) engine.undo()
        else if ((k === 'z' && e.shiftKey) || k === 'y') engine.redo()
        else if (k === 's') saveProject()
        else if (k === 'o') document.querySelector<HTMLInputElement>('input[type=file][accept^=".atelier"]')?.click()
        else if (k === 'e' && e.shiftKey) exportPng()
        else if (k === 'e') engine.mergeDown(engine.getState().activeId)
        else if (k === 'j') engine.duplicateLayer(engine.getState().activeId)
        else if (k === 'n' && e.shiftKey) {
          if (!engine.addLayer()) ui.toast(`Maximum of ${MAX_LAYERS} layers`, 'warn')
        } else if (k === '0') view.fit(engine.width, engine.height)
        else if (k === '1') view.actualSize(engine.width, engine.height)
        else if (k === '=' || k === '+') view.zoomBy(1.25)
        else if (k === '-') view.zoomBy(1 / 1.25)
        else return
        e.preventDefault()
        return
      }
      if (e.altKey) return
      if (TOOL_KEYS[k]) tools.setTool(TOOL_KEYS[k])
      else if (k === '[') tools.nudgeSize(1 / 1.15)
      else if (k === ']') tools.nudgeSize(1.15)
      else if (k === 'x') tools.swapColors()
      else if (/^[0-9]$/.test(k)) tools.setOpacity(k === '0' ? 1 : Number(k) / 10)
      else if (k === '+' || k === '=') view.zoomBy(1.25)
      else if (k === '-') view.zoomBy(1 / 1.25)
      else if (k === 'delete' || k === 'backspace') engine.clearLayer(engine.getState().activeId)
      else if (k === 'tab') {
        const s = uiStore.get()
        const open = !(s.leftOpen || s.rightOpen)
        uiStore.set({ leftOpen: open, rightOpen: open })
      } else if (k === '?') ui.openDialog('shortcuts')
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function useFileDrop() {
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (!depth) setDragging(false)
    }
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      const f = e.dataTransfer?.files?.[0]
      if (f) openFile(f)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [])
  return dragging
}

export default function App() {
  const leftOpen = useStore(uiStore, (s) => s.leftOpen)
  const rightOpen = useStore(uiStore, (s) => s.rightOpen)
  const [ready, setReady] = useState(false)
  useShortcuts()
  const dragging = useFileDrop()

  useEffect(() => {
    restoreSession().finally(() => setReady(true))
  }, [])

  return (
    <div className={`app ${leftOpen ? 'left-open' : ''} ${rightOpen ? 'right-open' : ''}`}>
      <TopBar />
      <div className="workspace">
        {leftOpen && <LeftPanel />}
        <main className="stage">
          <CanvasView />
          {!ready && <div className="stage-loading">Restoring your painting…</div>}
        </main>
        {rightOpen && (
          <aside className="panel panel-right" aria-label="Colour, composition and layers">
            <div className="panel-scroll">
              <ColorPanel />
              <CompositionPanel />
              <LayersPanel />
            </div>
          </aside>
        )}
      </div>
      <StatusBar />
      <Dialogs />
      <Toast />
      <TooltipLayer />
      {dragging && (
        <div className="drop-overlay">
          <div>Drop an image to add it as a layer, or an .atelier project to open it</div>
        </div>
      )}
    </div>
  )
}
