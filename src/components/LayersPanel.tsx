import { ArrowDownToLine, Copy, Eraser, Eye, EyeOff, Layers, Lock, LockOpen, Plus, Trash } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { engine } from '../session'
import { BLEND_MODES, MAX_LAYERS, type BlendMode, type LayerMeta } from '../engine/Engine'
import { getCheckerTile } from '../engine/textures'
import { useDoc } from '../hooks/useApp'
import { useI18n } from '../i18n'
import { ui } from '../state/ui'
import { IconButton, Section, Slider, Toggle } from './kit'

function LayerThumb({ layer, docW, docH }: { layer: LayerMeta; docW: number; docH: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    const src = engine.getLayerCanvas(layer.id)
    if (!c || !src) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const W = 52
    const H = 36
    c.width = W * dpr
    c.height = H * dpr
    const ctx = c.getContext('2d')!
    const k = Math.min((W * dpr) / docW, (H * dpr) / docH)
    const w = docW * k
    const h = docH * k
    const x = (W * dpr - w) / 2
    const y = (H * dpr - h) / 2
    ctx.clearRect(0, 0, c.width, c.height)
    const pat = ctx.createPattern(getCheckerTile(), 'repeat')
    if (pat) {
      pat.setTransform(new DOMMatrix().scale(0.5 * dpr))
      ctx.fillStyle = pat
      ctx.fillRect(x, y, w, h)
    }
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(src, x, y, w, h)
  }, [layer.id, layer.version, docW, docH])
  return <canvas ref={ref} className="layer-thumb" aria-hidden />
}

function LayerRow({
  layer,
  index,
  active,
  docW,
  docH,
  onDragIndex,
}: {
  layer: LayerMeta
  index: number
  active: boolean
  docW: number
  docH: number
  onDragIndex: (from: number, to: number) => void
}) {
  const i18n = useI18n()
  const { t } = i18n
  const [editing, setEditing] = useState(false)
  const [over, setOver] = useState(false)
  return (
    <li
      className={`layer-row ${active ? 'is-active' : ''} ${layer.visible ? '' : 'is-hidden'} ${over ? 'is-drop' : ''}`}
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/x-layer-index', String(index))
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('text/x-layer-index')) {
          e.preventDefault()
          setOver(true)
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false)
        const from = Number(e.dataTransfer.getData('text/x-layer-index'))
        if (!Number.isNaN(from)) onDragIndex(from, index)
      }}
      onClick={() => engine.setActiveLayer(layer.id)}
    >
      <button
        type="button"
        className="layer-eye"
        aria-label={t(layer.visible ? 'layers.hideNamed' : 'layers.showNamed', { name: layer.name })}
        data-tip={t(layer.visible ? 'layers.hide' : 'layers.show')}
        onClick={(e) => {
          e.stopPropagation()
          engine.setLayerProps(layer.id, { visible: !layer.visible })
        }}
      >
        {layer.visible ? <Eye size={15} /> : <EyeOff size={15} />}
      </button>
      <LayerThumb layer={layer} docW={docW} docH={docH} />
      <div className="layer-info">
        {editing ? (
          <input
            className="layer-name-input"
            defaultValue={layer.name}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              engine.setLayerProps(layer.id, { name: e.target.value.trim() || layer.name })
              setEditing(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') setEditing(false)
            }}
          />
        ) : (
          <span className="layer-name" onDoubleClick={() => setEditing(true)} title={t('layers.rename')}>
            {layer.name}
          </span>
        )}
        <span className="layer-meta">
          {t(`blend.${layer.blend}`)}
          {layer.opacity < 1 ? ` · ${i18n.percent(layer.opacity)}` : ''}
          {layer.alphaLock ? ` · ${t('layers.alphaLocked')}` : ''}
        </span>
      </div>
      <button
        type="button"
        className={`layer-lock ${layer.locked ? 'is-on' : ''}`}
        aria-label={t(layer.locked ? 'layers.unlockNamed' : 'layers.lockNamed', { name: layer.name })}
        data-tip={t(layer.locked ? 'layers.unlock' : 'layers.lock')}
        onClick={(e) => {
          e.stopPropagation()
          engine.setLayerProps(layer.id, { locked: !layer.locked })
        }}
      >
        {layer.locked ? <Lock size={13} /> : <LockOpen size={13} />}
      </button>
    </li>
  )
}

function PaperRow() {
  const { t } = useI18n()
  const paper = useDoc((s) => s.paper)
  return (
    <div className={`layer-row paper-row ${paper.visible ? '' : 'is-hidden'}`}>
      <button
        type="button"
        className="layer-eye"
        aria-label={t(paper.visible ? 'layers.hidePaper' : 'layers.showPaper')}
        data-tip={t(paper.visible ? 'layers.hidePaper' : 'layers.showPaper')}
        onClick={() => engine.setPaper({ visible: !paper.visible })}
      >
        {paper.visible ? <Eye size={15} /> : <EyeOff size={15} />}
      </button>
      <label className="paper-swatch" style={{ background: paper.color }} data-tip={t('layers.paperColor')}>
        <input type="color" value={paper.color} onChange={(e) => engine.setPaper({ color: e.target.value })} aria-label={t('layers.paperColor')} />
      </label>
      <div className="layer-info">
        <span className="layer-name">{t('layers.paper')}</span>
        <span className="layer-meta">{t('layers.background')}</span>
      </div>
      <Toggle label={t('layers.texture')} checked={paper.texture} onChange={(texture) => engine.setPaper({ texture })} hint={t('layers.textureHint')} />
    </div>
  )
}

export function LayersPanel() {
  const { t } = useI18n()
  const layers = useDoc((s) => s.layers)
  const activeId = useDoc((s) => s.activeId)
  const docW = useDoc((s) => s.width)
  const docH = useDoc((s) => s.height)
  const active = layers.find((l) => l.id === activeId)
  const activeIndex = layers.findIndex((l) => l.id === activeId)
  const top = [...layers].reverse()

  return (
    <Section
      id="layers"
      title={t('layers.title')}
      icon={<Layers size={14} />}
      className="layers"
      actions={
        <>
          <IconButton
            label={t('layers.add')}
            shortcut="Ctrl+Shift+N"
            disabled={layers.length >= MAX_LAYERS}
            onClick={() => {
              if (!engine.addLayer()) ui.toast(t('layers.maxReached', { max: MAX_LAYERS }), 'warn')
            }}
          >
            <Plus size={15} />
          </IconButton>
          <IconButton label={t('layers.duplicate')} shortcut="Ctrl+J" onClick={() => engine.duplicateLayer(activeId)}>
            <Copy size={14} />
          </IconButton>
          <IconButton
            label={t('layers.mergeDown')}
            shortcut="Ctrl+E"
            disabled={activeIndex <= 0}
            onClick={() => {
              if (layers[activeIndex - 1]?.locked) ui.toast(t('errors.locked', { name: layers[activeIndex - 1].name }), 'warn')
              else engine.mergeDown(activeId)
            }}
          >
            <ArrowDownToLine size={14} />
          </IconButton>
          <IconButton
            label={t('layers.remove')}
            onClick={() => (active?.locked ? ui.toast(t('errors.locked', { name: active.name }), 'warn') : engine.deleteLayer(activeId))}
          >
            <Trash size={14} />
          </IconButton>
        </>
      }
    >
      {active && (
        <div className="layer-props">
          <select
            className="blend-select"
            value={active.blend}
            aria-label={t('layers.blendMode')}
            onChange={(e) => engine.setLayerProps(active.id, { blend: e.target.value as BlendMode })}
          >
            {BLEND_MODES.map((b) => (
              <option key={b} value={b}>
                {t(`blend.${b}`)}
              </option>
            ))}
          </select>
          <Slider label={t('layers.opacity')} value={active.opacity} min={0} max={1} unit="%" onChange={(opacity) => engine.setLayerProps(active.id, { opacity })} />
          <div className="layer-props-row">
            <Toggle
              label={t('layers.lockTransparency')}
              checked={active.alphaLock}
              onChange={(alphaLock) => engine.setLayerProps(active.id, { alphaLock })}
              hint={t('layers.lockTransparencyHint')}
            />
            <button
              type="button"
              className="btn btn-small"
              onClick={() => (active.locked ? ui.toast(t('errors.locked', { name: active.name }), 'warn') : engine.clearLayer(active.id))}
              data-tip={t('layers.clearTip')}
            >
              <Eraser size={13} />
              {t('layers.clear')}
            </button>
          </div>
        </div>
      )}
      <ul className="layer-list">
        {top.map((l) => {
          const index = layers.indexOf(l)
          return (
            <LayerRow
              key={l.id}
              layer={l}
              index={index}
              active={l.id === activeId}
              docW={docW}
              docH={docH}
              onDragIndex={(from, to) => engine.moveLayer(layers[from].id, to)}
            />
          )
        })}
      </ul>
      <PaperRow />
    </Section>
  )
}
