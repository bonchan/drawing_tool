import { X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { BRUSH_LIST, type BrushId } from '../engine/brushes'
import { useI18n, type MessageKey } from '../i18n'
import { engine } from '../session'
import { useStore } from '../state/store'
import { ui, uiStore, view } from '../state/ui'

function Modal({ title, children, onClose, wide }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const { t } = useI18n()
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
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
            <X size={16} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

const PRESETS = [
  { id: 'landscape', w: 1800, h: 1200 },
  { id: 'portrait', w: 1200, h: 1600 },
  { id: 'square', w: 1600, h: 1600 },
  { id: 'hd', w: 1920, h: 1080 },
  { id: 'instagram', w: 1080, h: 1350 },
  { id: 'a4', w: 1754, h: 1240 },
] as const

const PAPERS = [
  { id: 'coldPress', color: '#fbf8f1' },
  { id: 'white', color: '#ffffff' },
  { id: 'cream', color: '#f3ead6' },
  { id: 'kraft', color: '#c9a978' },
  { id: 'gray', color: '#8f9094' },
  { id: 'black', color: '#1c1c1f' },
] as const

function NewCanvas({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const [w, setW] = useState(1800)
  const [h, setH] = useState(1200)
  const [paper, setPaper] = useState('#fbf8f1')
  const valid = w >= 64 && h >= 64 && w <= 4096 && h <= 4096
  const create = async () => {
    if (!valid) return
    await engine.load({ width: Math.round(w), height: Math.round(h), paper: { color: paper, visible: true } })
    view.fit(engine.width, engine.height)
    onClose()
    ui.toast(t('toasts.newCanvas'))
  }
  return (
    <Modal title={t('newCanvas.title')} onClose={onClose}>
      <div className="mini-label">{t('newCanvas.size')}</div>
      <div className="preset-grid">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`preset ${p.w === w && p.h === h ? 'is-active' : ''}`}
            onClick={() => {
              setW(p.w)
              setH(p.h)
            }}
          >
            <span className="preset-shape" style={{ aspectRatio: `${p.w} / ${p.h}` }} />
            <span>{t(`newCanvas.presets.${p.id}`)}</span>
            <small>
              {p.w}×{p.h}
            </small>
          </button>
        ))}
      </div>
      <div className="size-inputs">
        <label>
          {t('newCanvas.width')}
          <input type="number" min={64} max={4096} value={w} onChange={(e) => setW(Number(e.target.value))} />
        </label>
        <span>×</span>
        <label>
          {t('newCanvas.height')}
          <input type="number" min={64} max={4096} value={h} onChange={(e) => setH(Number(e.target.value))} />
        </label>
        <span className="muted">{t('newCanvas.range')}</span>
      </div>
      <div className="mini-label">{t('newCanvas.paper')}</div>
      <div className="paper-grid">
        {PAPERS.map((p) => (
          <button key={p.color} type="button" className={`paper-choice ${paper === p.color ? 'is-active' : ''}`} onClick={() => setPaper(p.color)}>
            <span style={{ background: p.color }} />
            {t(`newCanvas.papers.${p.id}`)}
          </button>
        ))}
      </div>
      <p className="muted small">{t('newCanvas.warning')}</p>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>
          {t('newCanvas.cancel')}
        </button>
        <button type="button" className="btn btn-primary" disabled={!valid} onClick={create}>
          {t('newCanvas.create')}
        </button>
      </div>
    </Modal>
  )
}

/** [keys – literal or a translation key, what it does]. */
const KEYS: Array<[string | { key: MessageKey }, MessageKey]> = [
  ['Ctrl+Z / Ctrl+Shift+Z', 'shortcuts.actions.undoRedo'],
  [{ key: 'shortcuts.keys.twoFingers' }, 'shortcuts.actions.touchUndo'],
  [{ key: 'shortcuts.keys.brackets' }, 'shortcuts.actions.size'],
  [{ key: 'shortcuts.keys.digits' }, 'shortcuts.actions.opacity'],
  ['X', 'shortcuts.actions.swap'],
  [{ key: 'shortcuts.keys.spaceDrag' }, 'shortcuts.actions.pan'],
  [{ key: 'shortcuts.keys.middleDrag' }, 'shortcuts.actions.pan'],
  [{ key: 'shortcuts.keys.twoFingerDrag' }, 'shortcuts.actions.panZoom'],
  [{ key: 'shortcuts.keys.scroll' }, 'shortcuts.actions.zoom'],
  ['Ctrl+0 / Ctrl+1', 'shortcuts.actions.fit'],
  [{ key: 'shortcuts.keys.shiftClick' }, 'shortcuts.actions.line'],
  [{ key: 'shortcuts.keys.altClick' }, 'shortcuts.actions.pick'],
  [{ key: 'shortcuts.keys.touchHold' }, 'shortcuts.actions.pick'],
  ['Ctrl+Shift+N', 'shortcuts.actions.newLayer'],
  ['Ctrl+J / Ctrl+E', 'shortcuts.actions.duplicateMerge'],
  [{ key: 'shortcuts.keys.delete' }, 'shortcuts.actions.clear'],
  ['Ctrl+S / Ctrl+O', 'shortcuts.actions.saveOpen'],
  ['Ctrl+Shift+E', 'shortcuts.actions.export'],
  ['Tab', 'shortcuts.actions.panels'],
  ['Esc', 'shortcuts.actions.cancel'],
]

const TOOL_KEYS: Array<[string, MessageKey]> = [
  ['G', 'tools.fill'],
  ['I', 'tools.eyedropper'],
  ['V', 'tools.move'],
  ['H', 'tools.hand'],
]

const TIPS: MessageKey[] = [
  'shortcuts.tipList.pen',
  'shortcuts.tipList.watercolor',
  'shortcuts.tipList.composition',
  'shortcuts.tipList.touch',
  'shortcuts.tipList.autosave',
]

function Shortcuts({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  return (
    <Modal title={t('shortcuts.title')} onClose={onClose} wide>
      <div className="shortcut-cols">
        <div>
          <div className="mini-label">{t('shortcuts.tools')}</div>
          <dl className="kbd-list">
            {BRUSH_LIST.filter((b) => b.shortcut).map((b) => (
              <div key={b.id}>
                <dt>
                  <kbd>{b.shortcut}</kbd>
                </dt>
                <dd>{t(`brushes.${b.id as BrushId}.name`)}</dd>
              </div>
            ))}
            {TOOL_KEYS.map(([k, label]) => (
              <div key={k}>
                <dt>
                  <kbd>{k}</kbd>
                </dt>
                <dd>{t(label)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <div className="mini-label">{t('shortcuts.other')}</div>
          <dl className="kbd-list">
            {KEYS.map(([k, d]) => (
              <div key={`${typeof k === 'string' ? k : k.key}|${d}`}>
                <dt>
                  <kbd>{typeof k === 'string' ? k : t(k.key)}</kbd>
                </dt>
                <dd>{t(d)}</dd>
              </div>
            ))}
          </dl>
          <div className="mini-label">{t('shortcuts.tips')}</div>
          <ul className="tips">
            {TIPS.map((tip) => (
              <li key={tip}>{t(tip)}</li>
            ))}
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
