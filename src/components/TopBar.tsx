import {
  CircleQuestionMark,
  Download,
  FilePlus,
  FolderOpen,
  ImagePlus,
  Maximize,
  PanelLeft,
  PanelRight,
  Redo2,
  Save,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useRef } from 'react'
import { useDoc } from '../hooks/useApp'
import { useI18n } from '../i18n'
import { exportPng, openFile, saveProject } from '../lib/actions'
import { historyLabel } from '../lib/labels'
import { engine } from '../session'
import { useStore } from '../state/store'
import { ui, uiStore, view, viewStore } from '../state/ui'
import { IconButton } from './kit'
import { LanguageSelect } from './LanguageSelect'

export function TopBar() {
  const i18n = useI18n()
  const { t } = i18n
  const canUndo = useDoc((s) => s.canUndo)
  const canRedo = useDoc((s) => s.canRedo)
  const undoLabel = useDoc((s) => s.undoLabel)
  const redoLabel = useDoc((s) => s.redoLabel)
  const docW = useDoc((s) => s.width)
  const docH = useDoc((s) => s.height)
  const zoom = useStore(viewStore, (s) => s.zoom)
  const leftOpen = useStore(uiStore, (s) => s.leftOpen)
  const rightOpen = useStore(uiStore, (s) => s.rightOpen)
  const layout = useStore(uiStore, (s) => s.layout)
  const dockRight = useStore(uiStore, (s) => s.dockRight)
  // Tablets: drawers that would overlap each other close one another.
  const toggleLeft = () =>
    uiStore.set({ leftOpen: !leftOpen, rightOpen: layout === 'tablet' && !dockRight && !leftOpen ? false : rightOpen })
  const toggleRight = () =>
    uiStore.set({ rightOpen: !rightOpen, leftOpen: layout === 'tablet' && !dockRight && !rightOpen ? false : leftOpen })
  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)

  return (
    <header className="topbar">
      <div className="topbar-group">
        {layout !== 'phone' && (
          <IconButton label={t('topbar.toggleTools')} shortcut="Tab" active={leftOpen} onClick={toggleLeft}>
            <PanelLeft size={17} />
          </IconButton>
        )}
        <div className="brand" aria-label={t('app.name')}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <defs>
              <linearGradient id="brand-g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#ff8a5c" />
                <stop offset="0.5" stopColor="#f2c94c" />
                <stop offset="1" stopColor="#4fb3bf" />
              </linearGradient>
            </defs>
            <path d="M12 2.5c5.2 0 9.5 3.9 9.5 8.7 0 3-2.4 4.6-4.6 4.6h-1.6c-1 0-1.7.8-1.7 1.7 0 .5.2.9.5 1.2.3.4.5.8.5 1.3 0 1-.8 1.5-1.8 1.5C7.3 21.5 2.5 17.2 2.5 12S6.8 2.5 12 2.5z" fill="url(#brand-g)" />
            <circle cx="7.6" cy="11" r="1.5" fill="#1b1b1f" />
            <circle cx="10.6" cy="6.9" r="1.5" fill="#1b1b1f" />
            <circle cx="15.4" cy="7.2" r="1.5" fill="#1b1b1f" />
          </svg>
          <span>{t('app.name')}</span>
        </div>
      </div>

      <div className="topbar-group">
        <IconButton
          label={undoLabel ? t('topbar.undoWhat', { what: historyLabel(i18n, undoLabel) }) : t('topbar.undo')}
          shortcut="Ctrl+Z"
          disabled={!canUndo}
          onClick={() => engine.undo()}
        >
          <Undo2 size={17} />
        </IconButton>
        <IconButton
          label={redoLabel ? t('topbar.redoWhat', { what: historyLabel(i18n, redoLabel) }) : t('topbar.redo')}
          shortcut="Ctrl+Shift+Z"
          disabled={!canRedo}
          onClick={() => engine.redo()}
        >
          <Redo2 size={17} />
        </IconButton>
        <span className="topbar-sep hide-sm" />
        <IconButton label={t('topbar.zoomOut')} shortcut="−" className="hide-sm" onClick={() => view.zoomBy(1 / 1.25)}>
          <ZoomOut size={17} />
        </IconButton>
        <button type="button" className="zoom-readout" onClick={() => view.actualSize(docW, docH)} data-tip={`${t('topbar.actualSize')}  ·  Ctrl+1`}>
          {i18n.percent(zoom)}
        </button>
        <IconButton label={t('topbar.zoomIn')} shortcut="+" className="hide-sm" onClick={() => view.zoomBy(1.25)}>
          <ZoomIn size={17} />
        </IconButton>
        <IconButton label={t('topbar.fit')} shortcut="Ctrl+0" onClick={() => view.fit(docW, docH)}>
          <Maximize size={16} />
        </IconButton>
      </div>

      <div className="topbar-group">
        <IconButton label={t('topbar.newCanvas')} onClick={() => ui.openDialog('new')}>
          <FilePlus size={17} />
        </IconButton>
        <IconButton label={t('topbar.open')} shortcut="Ctrl+O" onClick={() => fileRef.current?.click()}>
          <FolderOpen size={17} />
        </IconButton>
        <IconButton label={t('topbar.importImage')} className="hide-sm" onClick={() => imageRef.current?.click()}>
          <ImagePlus size={17} />
        </IconButton>
        <IconButton label={t('topbar.save')} shortcut="Ctrl+S" className="hide-sm" onClick={saveProject}>
          <Save size={17} />
        </IconButton>
        <button type="button" className="btn btn-primary" onClick={exportPng} data-tip={`${t('topbar.exportPng')}  ·  Ctrl+Shift+E`}>
          <Download size={15} />
          <span>{t('topbar.export')}</span>
        </button>
        <LanguageSelect />
        <IconButton label={t('topbar.help')} shortcut="?" className="hide-sm" onClick={() => ui.openDialog('shortcuts')}>
          <CircleQuestionMark size={17} />
        </IconButton>
        {layout !== 'phone' && (
          <IconButton label={t('topbar.toggleSide')} active={rightOpen} onClick={toggleRight}>
            <PanelRight size={17} />
          </IconButton>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".atelier,application/json,image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) openFile(f)
          e.target.value = ''
        }}
      />
      <input
        ref={imageRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) openFile(f)
          e.target.value = ''
        }}
      />
    </header>
  )
}
