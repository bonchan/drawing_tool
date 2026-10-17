import { Eraser, FingerprintPattern, Hand, Move, PaintBucket, Paintbrush, Pipette, RotateCcw } from 'lucide-react'
import { BRUSHES, BRUSH_GROUPS, isBrushId, type BrushId } from '../engine/brushes'
import { useI18n, type MessageKey } from '../i18n'
import { useStore } from '../state/store'
import { toolStore, tools, type ToolId } from '../state/tools'
import { ui } from '../state/ui'
import { BrushPreview } from './BrushPreview'
import { IconButton, Section, Segmented, Slider, Toggle } from './kit'

type UtilityTool = Exclude<ToolId, BrushId> | 'eraser' | 'smudge'

const UTILITY_TOOLS: Array<{ id: UtilityTool; icon: typeof Eraser; key: string }> = [
  { id: 'eraser', icon: Eraser, key: 'E' },
  { id: 'smudge', icon: FingerprintPattern, key: 'U' },
  { id: 'fill', icon: PaintBucket, key: 'G' },
  { id: 'eyedropper', icon: Pipette, key: 'I' },
  { id: 'move', icon: Move, key: 'V' },
  { id: 'hand', icon: Hand, key: 'H' },
]

/** The paint tool (current brush) plus the utility tools, as icon buttons. */
export function ToolButtons({ iconSize = 18 }: { iconSize?: number }) {
  const { t } = useI18n()
  const tool = useStore(toolStore, (s) => s.tool)
  const lastBrush = useStore(toolStore, (s) => s.lastBrush)
  const paintActive = isBrushId(tool) && tool !== 'eraser' && tool !== 'smudge'
  return (
    <>
      <IconButton
        label={t('tools.paint', { brush: t(`brushes.${lastBrush}.name`) })}
        active={paintActive}
        onClick={() => tools.setTool(lastBrush)}
        shortcut={BRUSHES[lastBrush].shortcut}
      >
        <Paintbrush size={iconSize} />
      </IconButton>
      {UTILITY_TOOLS.map((u) => (
        <IconButton
          key={u.id}
          label={t(`tools.${u.id}`)}
          active={tool === u.id}
          onClick={() => tools.setTool(u.id)}
          shortcut={u.id === 'hand' ? `H / ${t('tools.space')}` : u.key}
        >
          <u.icon size={iconSize} />
        </IconButton>
      ))}
    </>
  )
}

function ToolRow() {
  const { t } = useI18n()
  return (
    <div className="tool-row" role="toolbar" aria-label={t('tools.label')}>
      <ToolButtons />
    </div>
  )
}

function BrushLibrary() {
  const { t } = useI18n()
  const tool = useStore(toolStore, (s) => s.tool)
  return (
    <div className="brush-library">
      {BRUSH_GROUPS.map((g) => (
        <div key={g.id} className="brush-group">
          <div className="brush-group-title">{t(`brushGroups.${g.id}`)}</div>
          {g.brushes.map((b) => (
            <button
              key={b.id}
              type="button"
              className={`brush-card ${tool === b.id ? 'is-active' : ''}`}
              onClick={() => {
                tools.setTool(b.id)
                // On small screens the panel covers the canvas – get out of the way.
                ui.closeOverlays()
              }}
              title={t(`brushes.${b.id as BrushId}.description`)}
            >
              <span className="brush-card-head">
                <span className="brush-card-name">{t(`brushes.${b.id as BrushId}.name`)}</span>
                {b.shortcut && <kbd>{b.shortcut}</kbd>}
              </span>
              <BrushPreview id={b.id} height={30} maxSize={13} amplitude={0.2} delay={140} />
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

function BrushControls({ id }: { id: BrushId }) {
  const { t } = useI18n()
  const brush = BRUSHES[id]
  const settings = useStore(toolStore, (s) => s.settings[id])
  return (
    <div className="tool-settings">
      <BrushPreview id={id} height={64} maxSize={40} />
      <p className="tool-desc">{t(`brushes.${id}.description`)}</p>
      {brush.controls.map((c) => (
        <Slider
          key={c.key}
          label={t(`controls.${c.label}`)}
          value={settings[c.key] ?? brush.defaults[c.key]}
          min={c.min}
          max={c.max}
          step={c.step}
          unit={c.unit}
          curve={c.curve}
          hint={c.hint ? t(`hints.${c.hint}`) : undefined}
          onChange={(v) => tools.setSetting(id, c.key, v)}
        />
      ))}
    </div>
  )
}

function FillControls() {
  const { t } = useI18n()
  const fill = useStore(toolStore, (s) => s.fill)
  return (
    <div className="tool-settings">
      <p className="tool-desc">{t('tools.hints.fill')}</p>
      <Slider
        label={t('controls.tolerance')}
        value={fill.tolerance}
        min={0}
        max={1}
        unit="%"
        onChange={(v) => tools.setFill({ tolerance: v })}
        hint={t('hints.tolerance')}
      />
      <Slider
        label={t('controls.grow')}
        value={fill.expand}
        min={0}
        max={6}
        step={1}
        unit="px"
        onChange={(v) => tools.setFill({ expand: Math.round(v) })}
        hint={t('hints.grow')}
      />
      <Slider label={t('controls.opacity')} value={fill.opacity} min={0.01} max={1} unit="%" onChange={(v) => tools.setFill({ opacity: v })} />
      <Toggle label={t('controls.sampleAll')} checked={fill.sampleAll} onChange={(v) => tools.setFill({ sampleAll: v })} hint={t('hints.sampleAll')} />
    </div>
  )
}

const HINT_KEYS: Partial<Record<ToolId, MessageKey>> = {
  eyedropper: 'tools.hints.eyedropper',
  move: 'tools.hints.move',
  hand: 'tools.hints.hand',
}

function SymmetryRow() {
  const { t } = useI18n()
  const symmetry = useStore(toolStore, (s) => s.symmetry)
  return (
    <div className="symmetry-row" title={t('symmetry.hint')}>
      <span className="mini-label">{t('symmetry.label')}</span>
      <Segmented
        label={t('symmetry.label')}
        value={symmetry}
        onChange={tools.setSymmetry}
        options={[
          { value: 'off', label: t('symmetry.off') },
          { value: 'mirror', label: t('symmetry.mirror') },
          { value: 'quad', label: t('symmetry.quad') },
          { value: 'radial', label: t('symmetry.radial') },
        ]}
      />
    </div>
  )
}

/**
 * Tools, symmetry, the current tool's settings and the brush library.
 * `showTools` is off where a tool rail already shows the tool buttons.
 */
export function ToolPanelContent({ showTools = true }: { showTools?: boolean }) {
  const { t } = useI18n()
  const tool = useStore(toolStore, (s) => s.tool)
  const title = isBrushId(tool) ? t(`brushes.${tool}.name`) : t(`tools.${tool}`)
  const hint = HINT_KEYS[tool]
  return (
    <>
      {showTools && <ToolRow />}
      <SymmetryRow />
      <div className="panel-scroll">
        <Section
          id="settings"
          title={title}
          actions={
            isBrushId(tool) ? (
              <IconButton label={t('tools.resetBrush')} onClick={() => tools.resetBrush(tool)}>
                <RotateCcw size={14} />
              </IconButton>
            ) : undefined
          }
        >
          {isBrushId(tool) ? (
            <BrushControls id={tool} />
          ) : tool === 'fill' ? (
            <FillControls />
          ) : (
            hint && <p className="tool-desc">{t(hint)}</p>
          )}
        </Section>
        <Section id="brushes" title={t('tools.library')}>
          <BrushLibrary />
        </Section>
      </div>
    </>
  )
}

export function LeftPanel({ drawer = false }: { drawer?: boolean }) {
  const { t } = useI18n()
  return (
    <aside className={`panel panel-left ${drawer ? 'is-drawer' : ''}`} aria-label={t('tools.panel')}>
      <ToolPanelContent showTools={!drawer} />
    </aside>
  )
}
