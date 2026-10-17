import { ChevronDown } from 'lucide-react'
import { useContext, useId, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { formatValue } from '../lib/format'
import { fromSliderPos, toSliderPos, type SliderScale } from '../lib/sliderMath'
import { useStore } from '../state/store'
import { ui, uiStore } from '../state/ui'
import { SectionContext } from './sectionContext'

export function Section({
  id,
  title,
  icon,
  actions,
  children,
  className,
}: {
  id: string
  title: string
  icon?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  const { forceOpen } = useContext(SectionContext)
  const collapsedPref = useStore(uiStore, (s) => !!s.collapsed[id])
  const collapsed = collapsedPref && !forceOpen
  return (
    <section className={`section ${collapsed ? 'is-collapsed' : ''} ${className ?? ''}`}>
      <header className="section-head">
        <button
          type="button"
          className="section-toggle"
          onClick={() => !forceOpen && ui.toggleSection(id)}
          aria-expanded={!collapsed}
        >
          {!forceOpen && <ChevronDown size={14} className="section-chevron" />}
          {icon}
          <span>{title}</span>
        </button>
        {actions && <div className="section-actions">{actions}</div>}
      </header>
      {!collapsed && <div className="section-body">{children}</div>}
    </section>
  )
}

export function IconButton({
  label,
  onClick,
  children,
  active,
  disabled,
  shortcut,
  className,
}: {
  label: string
  onClick?: () => void
  children: ReactNode
  active?: boolean
  disabled?: boolean
  shortcut?: string
  className?: string
}) {
  return (
    <button
      type="button"
      className={`icon-btn ${active ? 'is-active' : ''} ${className ?? ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      data-tip={shortcut ? `${label}  ·  ${shortcut}` : label}
    >
      {children}
    </button>
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  unit,
  curve,
  hint,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  curve?: 'quad'
  hint?: string
  onChange: (v: number) => void
}) {
  const id = useId()
  const i18n = useI18n()
  const scale: SliderScale = { min, max, step, unit, curve }
  const fromPos = (p: number) => fromSliderPos(p, scale)
  const pos = toSliderPos(value, scale)
  return (
    <div className="slider" title={hint}>
      <div className="slider-top">
        <label htmlFor={id}>{label}</label>
        <span className="slider-value">{formatValue(i18n, value, unit)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={1000}
        step={1}
        value={Math.round(pos * 1000)}
        style={{ '--fill': `${pos * 100}%` } as CSSProperties}
        onChange={(e) => onChange(fromPos(Number(e.target.value) / 1000))}
      />
    </div>
  )
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  hint?: string
}) {
  return (
    <label className="toggle" title={hint}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden />
      <span>{label}</span>
    </label>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'is-active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Vertical slider for touch layouts (brush size / opacity at the canvas edge).
 * Drag anywhere on it; arrow keys work too.
 */
export function VerticalSlider({
  label,
  value,
  scale,
  onChange,
}: {
  label: string
  value: number
  scale: SliderScale
  onChange: (v: number) => void
}) {
  const i18n = useI18n()
  const track = useRef<HTMLDivElement>(null)
  const dragging = useRef<number | null>(null)
  const pos = toSliderPos(value, scale)
  const text = formatValue(i18n, value, scale.unit)
  const setFrom = (e: PointerEvent<HTMLDivElement>) => {
    const r = track.current!.getBoundingClientRect()
    onChange(fromSliderPos(1 - (e.clientY - r.top) / r.height, scale))
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 0.03 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -0.03 : 0
    if (!d) return
    e.preventDefault()
    onChange(fromSliderPos(pos + d, scale))
  }
  return (
    <div
      className="vslider"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuetext={text}
      aria-valuenow={Math.round(pos * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-orientation="vertical"
      data-tip={`${label}  ·  ${text}`}
      onPointerDown={(e) => {
        dragging.current = e.pointerId
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          /* we track the drag ourselves */
        }
        setFrom(e)
      }}
      onPointerMove={(e) => dragging.current === e.pointerId && setFrom(e)}
      onPointerUp={() => (dragging.current = null)}
      onPointerCancel={() => (dragging.current = null)}
      onKeyDown={onKey}
    >
      <div className="vslider-track" ref={track}>
        <div className="vslider-fill" style={{ height: `${pos * 100}%` }} />
        <div className="vslider-thumb" style={{ bottom: `${pos * 100}%` }} />
      </div>
      <span className="vslider-value">{text}</span>
    </div>
  )
}
