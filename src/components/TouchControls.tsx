import { ChartPie, Eraser, Layers, Library, Paintbrush, X } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { BRUSHES, isBrushId } from '../engine/brushes'
import { useI18n, type MessageKey } from '../i18n'
import { useStore } from '../state/store'
import { toolStore, tools } from '../state/tools'
import { ui, uiStore, type SheetId } from '../state/ui'
import { ColorPanel } from './ColorPanel'
import { CompositionPanel } from './CompositionPanel'
import { IconButton, VerticalSlider } from './kit'
import { LayersPanel } from './LayersPanel'
import { ToolButtons, ToolPanelContent } from './LeftPanel'
import { UTILITY_TOOLS } from './toolList'
import { SectionContext } from './sectionContext'

/** Brush size + opacity (or blender strength) at the edge of the canvas. */
export function QuickSliders({ variant }: { variant: 'rail' | 'floating' }) {
  const { t } = useI18n()
  const tool = useStore(toolStore, (s) => s.tool)
  const settings = useStore(toolStore, (s) => (isBrushId(s.tool) ? s.settings[s.tool] : null))
  if (!isBrushId(tool) || !settings) return null
  const controls = BRUSHES[tool].controls
  const size = controls.find((c) => c.key === 'size')
  const second = controls.find((c) => c.key === 'opacity') ?? controls.find((c) => c.key === 'strength')
  return (
    <div className={`quick-sliders is-${variant}`}>
      {size && (
        <VerticalSlider label={t('controls.size')} value={settings.size} scale={size} onChange={(v) => tools.setSetting(tool, 'size', v)} />
      )}
      {second && (
        <VerticalSlider
          label={t(`controls.${second.label}`)}
          value={settings[second.key]}
          scale={second}
          onChange={(v) => tools.setSetting(tool, second.key, v)}
        />
      )}
    </div>
  )
}

/** Tablet: a slim, always-visible column of tools along the left edge. */
export function ToolRail() {
  const { t } = useI18n()
  const leftOpen = useStore(uiStore, (s) => s.leftOpen)
  const rightOpen = useStore(uiStore, (s) => s.rightOpen)
  const dockRight = useStore(uiStore, (s) => s.dockRight)
  const color = useStore(toolStore, (s) => s.color)
  return (
    <nav className="tool-rail" aria-label={t('tools.label')}>
      <IconButton
        label={t('tools.library')}
        active={leftOpen}
        onClick={() => uiStore.set({ leftOpen: !leftOpen, rightOpen: dockRight ? rightOpen : false })}
      >
        <Library size={20} />
      </IconButton>
      <span className="rail-sep" />
      <ToolButtons iconSize={20} />
      <span className="rail-sep" />
      <button
        type="button"
        className="rail-color"
        style={{ background: color }}
        aria-label={t('color.current')}
        data-tip={t('color.current')}
        onClick={() =>
          uiStore.set((s) => ({
            rightOpen: dockRight ? true : !s.rightOpen,
            leftOpen: dockRight ? s.leftOpen : false,
            collapsed: { ...s.collapsed, color: false },
          }))
        }
      />
      <QuickSliders variant="rail" />
    </nav>
  )
}

function DockButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button type="button" className={`dock-btn ${active ? 'is-active' : ''}`} onClick={onClick} aria-pressed={active}>
      {children}
      <span className="dock-label">{label}</span>
    </button>
  )
}

/** Phone: thumb-reachable tool bar along the bottom. */
export function PhoneDock() {
  const { t } = useI18n()
  const sheet = useStore(uiStore, (s) => s.sheet)
  const tool = useStore(toolStore, (s) => s.tool)
  const lastBrush = useStore(toolStore, (s) => s.lastBrush)
  const color = useStore(toolStore, (s) => s.color)
  // The first button always shows the tool you're using (brush, blender, fill…);
  // while erasing it shows the brush to go back to.
  const current = tool === 'eraser' ? lastBrush : tool
  const CurrentIcon = isBrushId(current) && current !== 'smudge' ? Paintbrush : (UTILITY_TOOLS.find((u) => u.id === current)?.icon ?? Paintbrush)
  const currentLabel = isBrushId(current) ? t(`brushes.${current}.name`) : t(`tools.${current}`)
  // First tap selects the tool; tapping it again opens its settings.
  const pick = (id: typeof tool) => {
    if (tool === id) ui.toggleSheet('tools')
    else {
      tools.setTool(id)
      uiStore.set({ sheet: null })
    }
  }
  return (
    <nav className="phone-dock" aria-label={t('tools.label')}>
      <DockButton label={currentLabel} active={tool === current} onClick={() => pick(current)}>
        <CurrentIcon size={20} />
      </DockButton>
      <DockButton label={t('tools.eraser')} active={tool === 'eraser'} onClick={() => pick('eraser')}>
        <Eraser size={20} />
      </DockButton>
      <DockButton label={t('color.title')} active={sheet === 'color'} onClick={() => ui.toggleSheet('color')}>
        <span className="dock-color" style={{ background: color }} />
      </DockButton>
      <DockButton label={t('layers.title')} active={sheet === 'layers'} onClick={() => ui.toggleSheet('layers')}>
        <Layers size={20} />
      </DockButton>
      <DockButton label={t('status.palette')} active={sheet === 'composition'} onClick={() => ui.toggleSheet('composition')}>
        <ChartPie size={20} />
      </DockButton>
    </nav>
  )
}

const SHEET_TITLES: Record<SheetId, MessageKey> = {
  tools: 'tools.panel',
  color: 'color.title',
  layers: 'layers.title',
  composition: 'composition.title',
}

/** Phone: panels slide up from the bottom; swipe the grip down (or tap outside) to close. */
export function PhoneSheet() {
  const { t } = useI18n()
  const sheet = useStore(uiStore, (s) => s.sheet)
  const panel = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; dy: number } | null>(null)
  if (!sheet) return null
  const close = () => uiStore.set({ sheet: null })
  return (
    <div className="sheet-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div ref={panel} className={`sheet sheet-${sheet}`} role="dialog" aria-modal="true" aria-label={t(SHEET_TITLES[sheet])}>
        <div
          className="sheet-head"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            drag.current = { y: e.clientY, dy: 0 }
          }}
          onPointerMove={(e) => {
            if (!drag.current || !panel.current) return
            drag.current.dy = Math.max(0, e.clientY - drag.current.y)
            panel.current.style.transform = `translateY(${drag.current.dy}px)`
          }}
          onPointerUp={() => {
            const dy = drag.current?.dy ?? 0
            drag.current = null
            if (panel.current) panel.current.style.transform = ''
            if (dy > 70) close()
          }}
          onPointerCancel={() => {
            drag.current = null
            if (panel.current) panel.current.style.transform = ''
          }}
        >
          <span className="sheet-grip" aria-hidden />
          <button type="button" className="icon-btn sheet-close" onClick={close} onPointerDown={(e) => e.stopPropagation()} aria-label={t('common.close')}>
            <X size={18} />
          </button>
        </div>
        <div className="sheet-body">
          {sheet === 'tools' ? (
            <ToolPanelContent />
          ) : (
            <SectionContext.Provider value={{ forceOpen: true }}>
              {sheet === 'color' && <ColorPanel />}
              {sheet === 'layers' && <LayersPanel />}
              {sheet === 'composition' && <CompositionPanel />}
            </SectionContext.Provider>
          )}
        </div>
      </div>
    </div>
  )
}

/** Tablet: tapping the canvas area outside an open drawer closes it instead of painting. */
export function DrawerScrim() {
  const leftOpen = useStore(uiStore, (s) => s.leftOpen)
  const rightOpen = useStore(uiStore, (s) => s.rightOpen)
  const dockRight = useStore(uiStore, (s) => s.dockRight)
  const covering = leftOpen || (rightOpen && !dockRight)
  if (!covering) return null
  return <div className="drawer-scrim" onPointerDown={() => ui.closeOverlays()} aria-hidden />
}
