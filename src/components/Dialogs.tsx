import { X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { engine } from '../session'
import { BRUSH_LIST } from '../engine/brushes'
import { useStore } from '../state/store'
import { ui, uiStore, view } from '../state/ui'

function Modal({ title, children, onClose, wide }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'is-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

const PRESETS = [
  { label: 'Landscape', w: 1800, h: 1200 },
  { label: 'Portrait', w: 1200, h: 1600 },
  { label: 'Square', w: 1600, h: 1600 },
  { label: 'HD 16:9', w: 1920, h: 1080 },
  { label: 'Instagram 4:5', w: 1080, h: 1350 },
  { label: 'A4 @150dpi', w: 1754, h: 1240 },
]

const PAPERS = [
  { label: 'Cold press', color: '#fbf8f1' },
  { label: 'Bright white', color: '#ffffff' },
  { label: 'Cream', color: '#f3ead6' },
  { label: 'Kraft', color: '#c9a978' },
  { label: 'Mid grey', color: '#8f9094' },
  { label: 'Black', color: '#1c1c1f' },
]

function NewCanvas({ onClose }: { onClose: () => void }) {
  const [w, setW] = useState(1800)
  const [h, setH] = useState(1200)
  const [paper, setPaper] = useState('#fbf8f1')
  const valid = w >= 64 && h >= 64 && w <= 4096 && h <= 4096
  const create = async () => {
    if (!valid) return
    await engine.load({ width: Math.round(w), height: Math.round(h), paper: { color: paper, visible: true } })
    view.fit(engine.width, engine.height)
    onClose()
    ui.toast('New canvas ready')
  }
  return (
    <Modal title="New canvas" onClose={onClose}>
      <div className="mini-label">Size</div>
      <div className="preset-grid">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className={`preset ${p.w === w && p.h === h ? 'is-active' : ''}`}
            onClick={() => {
              setW(p.w)
              setH(p.h)
            }}
          >
            <span className="preset-shape" style={{ aspectRatio: `${p.w} / ${p.h}` }} />
            <span>{p.label}</span>
            <small>
              {p.w}×{p.h}
            </small>
          </button>
        ))}
      </div>
      <div className="size-inputs">
        <label>
          Width
          <input type="number" min={64} max={4096} value={w} onChange={(e) => setW(Number(e.target.value))} />
        </label>
        <span>×</span>
        <label>
          Height
          <input type="number" min={64} max={4096} value={h} onChange={(e) => setH(Number(e.target.value))} />
        </label>
        <span className="muted">px (64–4096)</span>
      </div>
      <div className="mini-label">Paper</div>
      <div className="paper-grid">
        {PAPERS.map((p) => (
          <button key={p.color} type="button" className={`paper-choice ${paper === p.color ? 'is-active' : ''}`} onClick={() => setPaper(p.color)}>
            <span style={{ background: p.color }} />
            {p.label}
          </button>
        ))}
      </div>
      <p className="muted small">This replaces the current painting. Save a project file first if you want to keep it.</p>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" disabled={!valid} onClick={create}>
          Create canvas
        </button>
      </div>
    </Modal>
  )
}

const KEYS: Array<[string, string]> = [
  ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'],
  ['[ and ]', 'Brush size smaller / bigger'],
  ['1 … 0', 'Brush opacity 10% … 100%'],
  ['X', 'Swap primary / secondary colour'],
  ['Space + drag', 'Pan the canvas'],
  ['Scroll / pinch', 'Zoom around the cursor'],
  ['Ctrl+0 / Ctrl+1', 'Fit to screen / actual size'],
  ['Shift + click', 'Straight line from the last stroke'],
  ['Alt + click, right-click', 'Pick a colour'],
  ['Ctrl+Shift+N', 'New layer'],
  ['Ctrl+J / Ctrl+E', 'Duplicate layer / merge down'],
  ['Delete', 'Clear the active layer'],
  ['Ctrl+S / Ctrl+O', 'Save / open a project file'],
  ['Ctrl+Shift+E', 'Export PNG'],
  ['Tab', 'Show / hide panels'],
  ['Esc', 'Cancel the current stroke'],
]

function Shortcuts({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Shortcuts & tips" onClose={onClose} wide>
      <div className="shortcut-cols">
        <div>
          <div className="mini-label">Brushes & tools</div>
          <dl className="kbd-list">
            {BRUSH_LIST.filter((b) => b.shortcut).map((b) => (
              <div key={b.id}>
                <dt>
                  <kbd>{b.shortcut}</kbd>
                </dt>
                <dd>{b.name}</dd>
              </div>
            ))}
            <div>
              <dt><kbd>G</kbd></dt>
              <dd>Fill bucket</dd>
            </div>
            <div>
              <dt><kbd>I</kbd></dt>
              <dd>Eyedropper</dd>
            </div>
            <div>
              <dt><kbd>V</kbd></dt>
              <dd>Move layer</dd>
            </div>
            <div>
              <dt><kbd>H</kbd></dt>
              <dd>Pan</dd>
            </div>
          </dl>
        </div>
        <div>
          <div className="mini-label">Everything else</div>
          <dl className="kbd-list">
            {KEYS.map(([k, d]) => (
              <div key={k}>
                <dt>
                  <kbd>{k}</kbd>
                </dt>
                <dd>{d}</dd>
              </div>
            ))}
          </dl>
          <div className="mini-label">Tips</div>
          <ul className="tips">
            <li>Pen tablets and Apple Pencil get full pressure and tilt. With a mouse, the Ink Brush follows your speed instead.</li>
            <li>Watercolor dries when you lift the pen: edges bleed, darken and granulate. Glaze transparent layers on top of each other.</li>
            <li>The colour composition panel updates as you paint. Click any colour there to paint with it again.</li>
            <li>Your painting is autosaved in this browser. Use Save to move it to another computer.</li>
          </ul>
        </div>
      </div>
    </Modal>
  )
}

export function Dialogs() {
  const dialog = useStore(uiStore, (s) => s.dialog)
  const close = () => ui.openDialog(null)
  if (dialog === 'new') return <NewCanvas onClose={close} />
  if (dialog === 'shortcuts') return <Shortcuts onClose={close} />
  return null
}

export function Toast() {
  const toast = useStore(uiStore, (s) => s.toast)
  if (!toast) return null
  return (
    <div key={toast.id} className={`toast is-${toast.tone}`} role="status">
      {toast.text}
    </div>
  )
}
