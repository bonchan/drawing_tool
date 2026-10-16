import { Eraser, FingerprintPattern, Hand, Move, PaintBucket, Paintbrush, Pipette, RotateCcw } from 'lucide-react'
import { BRUSHES, BRUSH_GROUPS, isBrushId, type BrushId } from '../engine/brushes'
import { useStore } from '../state/store'
import { toolStore, tools, type ToolId } from '../state/tools'
import { uiStore } from '../state/ui'
import { BrushPreview } from './BrushPreview'
import { IconButton, Section, Segmented, Slider, Toggle } from './kit'

const UTILITY_TOOLS: Array<{ id: ToolId; label: string; icon: typeof Eraser; key: string }> = [
  { id: 'eraser', label: 'Eraser', icon: Eraser, key: 'E' },
  { id: 'smudge', label: 'Blender', icon: FingerprintPattern, key: 'U' },
  { id: 'fill', label: 'Fill bucket', icon: PaintBucket, key: 'G' },
  { id: 'eyedropper', label: 'Eyedropper', icon: Pipette, key: 'I' },
  { id: 'move', label: 'Move layer', icon: Move, key: 'V' },
  { id: 'hand', label: 'Pan', icon: Hand, key: 'H / Space' },
]

function ToolRow() {
  const tool = useStore(toolStore, (s) => s.tool)
  const lastBrush = useStore(toolStore, (s) => s.lastBrush)
  const paintActive = isBrushId(tool) && tool !== 'eraser' && tool !== 'smudge'
  return (
    <div className="tool-row" role="toolbar" aria-label="Tools">
      <IconButton
        label={`Paint (${BRUSHES[lastBrush].name})`}
        active={paintActive}
        onClick={() => tools.setTool(lastBrush)}
        shortcut={BRUSHES[lastBrush].shortcut}
      >
        <Paintbrush size={18} />
      </IconButton>
      {UTILITY_TOOLS.map((t) => (
        <IconButton key={t.id} label={t.label} active={tool === t.id} onClick={() => tools.setTool(t.id)} shortcut={t.key}>
          <t.icon size={18} />
        </IconButton>
      ))}
    </div>
  )
}

function BrushLibrary() {
  const tool = useStore(toolStore, (s) => s.tool)
  return (
    <div className="brush-library">
      {BRUSH_GROUPS.map((g) => (
        <div key={g.name} className="brush-group">
          <div className="brush-group-title">{g.name}</div>
          {g.brushes.map((b) => (
            <button
              key={b.id}
              type="button"
              className={`brush-card ${tool === b.id ? 'is-active' : ''}`}
              onClick={() => {
                tools.setTool(b.id)
                // On small screens the panel covers the canvas – get out of the way.
                if (window.innerWidth < 900) uiStore.set({ leftOpen: false })
              }}
              title={b.description}
            >
              <span className="brush-card-head">
                <span className="brush-card-name">{b.name}</span>
                {b.shortcut && <kbd>{b.shortcut}</kbd>}
              </span>
              <BrushPreview id={b.id} height={30} maxSize={13} amplitude={0.2} />
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

function BrushControls({ id }: { id: BrushId }) {
  const brush = BRUSHES[id]
  const settings = useStore(toolStore, (s) => s.settings[id])
  return (
    <div className="tool-settings">
      <BrushPreview id={id} height={64} maxSize={40} />
      <p className="tool-desc">{brush.description}</p>
      {brush.controls.map((c) => (
        <Slider
          key={c.key}
          label={c.label}
          value={settings[c.key] ?? brush.defaults[c.key]}
          min={c.min}
          max={c.max}
          step={c.step}
          unit={c.unit}
          curve={c.curve}
          hint={c.hint}
          onChange={(v) => tools.setSetting(id, c.key, v)}
        />
      ))}
    </div>
  )
}

function FillControls() {
  const fill = useStore(toolStore, (s) => s.fill)
  return (
    <div className="tool-settings">
      <p className="tool-desc">Floods a connected area with the current colour.</p>
      <Slider label="Tolerance" value={fill.tolerance} min={0} max={1} unit="%" onChange={(v) => tools.setFill({ tolerance: v })} hint="How different a colour can be and still get filled" />
      <Slider label="Grow" value={fill.expand} min={0} max={6} step={1} unit="px" onChange={(v) => tools.setFill({ expand: Math.round(v) })} hint="Expands the fill under anti-aliased line edges" />
      <Slider label="Opacity" value={fill.opacity} min={0.01} max={1} unit="%" onChange={(v) => tools.setFill({ opacity: v })} />
      <Toggle label="Sample all layers" checked={fill.sampleAll} onChange={(v) => tools.setFill({ sampleAll: v })} hint="Use line art on other layers as the fill boundary" />
    </div>
  )
}

const HINTS: Partial<Record<ToolId, string>> = {
  eyedropper: 'Click or drag on the canvas to pick a colour. Tip: hold Alt or right-click with any brush to pick without switching tools.',
  move: 'Drag to move the contents of the active layer.',
  hand: 'Drag to pan. Scroll or pinch to zoom. Hold Space with any tool to pan temporarily.',
}

function SymmetryRow() {
  const symmetry = useStore(toolStore, (s) => s.symmetry)
  return (
    <div className="symmetry-row" title="Paint mirrored copies around the canvas centre">
      <span className="mini-label">Symmetry</span>
      <Segmented
        label="Symmetry"
        value={symmetry}
        onChange={tools.setSymmetry}
        options={[
          { value: 'off', label: 'Off' },
          { value: 'mirror', label: 'Mirror' },
          { value: 'quad', label: '4×' },
          { value: 'radial', label: '6×' },
        ]}
      />
    </div>
  )
}

export function LeftPanel() {
  const tool = useStore(toolStore, (s) => s.tool)
  const title = isBrushId(tool)
    ? BRUSHES[tool].name
    : tool === 'fill'
      ? 'Fill bucket'
      : tool === 'eyedropper'
        ? 'Eyedropper'
        : tool === 'move'
          ? 'Move'
          : 'Pan'
  return (
    <aside className="panel panel-left" aria-label="Tools and brushes">
      <ToolRow />
      <SymmetryRow />
      <div className="panel-scroll">
        <Section
          id="settings"
          title={title}
          actions={
            isBrushId(tool) ? (
              <IconButton label="Reset brush" onClick={() => tools.resetBrush(tool)}>
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
            <p className="tool-desc">{HINTS[tool]}</p>
          )}
        </Section>
        <Section id="brushes" title="Brush library">
          <BrushLibrary />
        </Section>
      </div>
    </aside>
  )
}
