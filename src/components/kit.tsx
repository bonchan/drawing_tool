import { ChevronDown } from 'lucide-react'
import { useId, type CSSProperties, type ReactNode } from 'react'
import { useStore } from '../state/store'
import { formatValue } from '../lib/format'
import { ui, uiStore } from '../state/ui'

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
  const collapsed = useStore(uiStore, (s) => !!s.collapsed[id])
  return (
    <section className={`section ${collapsed ? 'is-collapsed' : ''} ${className ?? ''}`}>
      <header className="section-head">
        <button
          type="button"
          className="section-toggle"
          onClick={() => ui.toggleSection(id)}
          aria-expanded={!collapsed}
        >
          <ChevronDown size={14} className="section-chevron" />
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
  const toPos = (v: number) => {
    const t = (v - min) / (max - min)
    return curve === 'quad' ? Math.sqrt(Math.max(0, t)) : t
  }
  const fromPos = (p: number) => {
    const t = curve === 'quad' ? p * p : p
    let v = min + t * (max - min)
    if (unit === 'px') v = v < 10 ? Math.round(v * 2) / 2 : Math.round(v)
    else if (step) v = Math.round(v / step) * step
    return Math.max(min, Math.min(max, v))
  }
  const pos = toPos(value)
  return (
    <div className="slider" title={hint}>
      <div className="slider-top">
        <label htmlFor={id}>{label}</label>
        <span className="slider-value">{formatValue(value, unit)}</span>
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
