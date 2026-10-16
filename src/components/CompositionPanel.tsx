import { ClipboardCopy, PieChart } from 'lucide-react'
import { useMemo, useState } from 'react'
import { analyzer } from '../session'
import type { TrackedSwatch } from '../analysis/analyzer'
import { useAnalysis } from '../hooks/useApp'
import { useStore } from '../state/store'
import { toolStore, tools } from '../state/tools'
import { ui } from '../state/ui'
import { IconButton, Section, Segmented, Slider, Toggle } from './kit'

const pct = (v: number) => (v >= 0.0995 ? `${(v * 100).toFixed(1)}%` : v >= 0.001 ? `${(v * 100).toFixed(2)}%` : '<0.1%')

type Tab = 'colors' | 'families' | 'values'

function Donut({
  swatches,
  other,
  hovered,
  onHover,
}: {
  swatches: TrackedSwatch[]
  other: number
  hovered: string | null
  onHover: (id: string | null) => void
}) {
  const R = 46
  const C = 2 * Math.PI * R
  const gap = swatches.length + (other > 0 ? 1 : 0) > 1 ? 1.6 : 0
  let acc = 0
  const segs = [...swatches.map((s) => ({ id: s.id, share: s.share, color: s.hex })), ...(other > 0.0005 ? [{ id: 'other', share: other, color: 'var(--other)' }] : [])]
  return (
    <svg viewBox="0 0 120 120" className="donut" role="img" aria-label="Colour share donut chart">
      <circle cx="60" cy="60" r={R} className="donut-track" />
      {segs.map((s) => {
        const len = Math.max(0, s.share * C - gap)
        const el = (
          <circle
            key={s.id}
            cx="60"
            cy="60"
            r={R}
            className={`donut-seg ${hovered === s.id ? 'is-hovered' : ''} ${hovered && hovered !== s.id ? 'is-dim' : ''}`}
            stroke={s.color}
            strokeDasharray={`${len} ${C - len}`}
            strokeDashoffset={-acc * C}
            onPointerEnter={() => onHover(s.id)}
            onPointerLeave={() => onHover(null)}
          />
        )
        acc += s.share
        return el
      })}
    </svg>
  )
}

function ColorsTab({ swatches, other, hovered, onHover }: { swatches: TrackedSwatch[]; other: number; hovered: string | null; onHover: (id: string | null) => void }) {
  const current = useStore(toolStore, (s) => s.color)
  const max = Math.max(other, ...swatches.map((s) => s.share), 0.0001)
  return (
    <ul className="comp-list">
      {swatches.map((s) => (
        <li key={s.id}>
          <button
            type="button"
            className={`comp-row ${hovered === s.id ? 'is-hovered' : ''} ${s.hex === current ? 'is-current' : ''}`}
            onPointerEnter={() => onHover(s.id)}
            onPointerLeave={() => onHover(null)}
            onClick={() => tools.setColor(s.hex)}
            title={`Use ${s.name} (${s.hex})`}
          >
            <span className="comp-swatch" style={{ background: s.hex }} />
            <span className="comp-name">
              <span>{s.name}</span>
              <span className="comp-hex">{s.hex}</span>
            </span>
            <span className="comp-bar">
              <span style={{ width: `${(s.share / max) * 100}%`, background: s.hex }} />
            </span>
            <span className="comp-pct">{pct(s.share)}</span>
          </button>
        </li>
      ))}
      {other > 0.0005 && (
        <li>
          <div className="comp-row is-other">
            <span className="comp-swatch comp-swatch-other" />
            <span className="comp-name">
              <span>Other tints</span>
              <span className="comp-hex">small groups</span>
            </span>
            <span className="comp-bar">
              <span style={{ width: `${(other / max) * 100}%` }} />
            </span>
            <span className="comp-pct">{pct(other)}</span>
          </div>
        </li>
      )}
    </ul>
  )
}

function FamiliesTab() {
  const result = useAnalysis((s) => s.result)
  if (!result) return null
  const max = Math.max(...result.families.map((f) => f.share), 0.0001)
  return (
    <ul className="comp-list">
      {result.families.map((f) => (
        <li key={f.name} className="comp-row is-static">
          <span className="comp-swatch is-round" style={{ background: f.hex }} />
          <span className="comp-name">
            <span>{f.name}</span>
          </span>
          <span className="comp-bar">
            <span style={{ width: `${(f.share / max) * 100}%`, background: f.hex }} />
          </span>
          <span className="comp-pct">{pct(f.share)}</span>
        </li>
      ))}
    </ul>
  )
}

function ValuesTab() {
  const result = useAnalysis((s) => s.result)
  if (!result) return null
  const v = result.values
  const max = Math.max(...v, 0.0001)
  const shadows = v[0] + v[1] + v[2]
  const mids = v[3] + v[4] + v[5] + v[6]
  const lights = v[7] + v[8] + v[9]
  const t = result.temperature
  return (
    <div className="values-tab">
      <div className="value-hist" role="img" aria-label="Lightness distribution">
        {v.map((share, i) => {
          const g = Math.round(((i + 0.5) / 10) * 255)
          return (
            <div key={i} className="value-col" data-tip={`${i * 10}–${i * 10 + 10}% light · ${pct(share)}`}>
              <div className="value-bar" style={{ height: `${(share / max) * 100}%`, background: `rgb(${g},${g},${g})` }} />
            </div>
          )
        })}
      </div>
      <div className="value-axis">
        <span>Dark</span>
        <span>Light</span>
      </div>
      <dl className="stat-grid">
        <div>
          <dt>Shadows</dt>
          <dd>{pct(shadows)}</dd>
        </div>
        <div>
          <dt>Midtones</dt>
          <dd>{pct(mids)}</dd>
        </div>
        <div>
          <dt>Highlights</dt>
          <dd>{pct(lights)}</dd>
        </div>
      </dl>
      <div className="mini-label">Temperature</div>
      <div className="temp-bar">
        <span className="temp-warm" style={{ flexGrow: t.warm }} data-tip={`Warm ${pct(t.warm)}`} />
        <span className="temp-neutral" style={{ flexGrow: t.neutral }} data-tip={`Neutral ${pct(t.neutral)}`} />
        <span className="temp-cool" style={{ flexGrow: t.cool }} data-tip={`Cool ${pct(t.cool)}`} />
      </div>
      <div className="temp-legend">
        <span><i className="temp-warm" /> Warm {pct(t.warm)}</span>
        <span><i className="temp-neutral" /> Neutral {pct(t.neutral)}</span>
        <span><i className="temp-cool" /> Cool {pct(t.cool)}</span>
      </div>
    </div>
  )
}

export function CompositionPanel() {
  const state = useAnalysis((s) => s)
  const [tab, setTab] = useState<Tab>('colors')
  const [hovered, setHovered] = useState<string | null>(null)
  const { result, swatches, options } = state
  const empty = !result || result.samples === 0
  const hoveredSwatch = useMemo(() => swatches.find((s) => s.id === hovered) ?? null, [swatches, hovered])
  const top = swatches[0]

  const copy = async () => {
    const lines = swatches.map((s) => `${s.hex}  ${pct(s.share).padStart(6)}  ${s.name}`)
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      ui.toast('Palette copied to clipboard')
    } catch {
      ui.toast('Clipboard not available', 'warn')
    }
  }

  return (
    <Section
      id="composition"
      title="Colour composition"
      icon={<PieChart size={14} />}
      className="composition"
      actions={
        <>
          <span key={state.updates} className={`live-dot ${state.updates ? 'is-pulsing' : ''}`} title="Updates live while you paint" />
          <IconButton label="Copy palette" onClick={copy} disabled={empty}>
            <ClipboardCopy size={14} />
          </IconButton>
        </>
      }
    >
      {empty ? (
        <div className="comp-empty">
          <div className="comp-empty-ring" />
          <p>
            {options.scope === 'active' ? 'The active layer is empty.' : 'Nothing painted yet.'}
            <br />
            Start painting — this updates with every stroke.
          </p>
        </div>
      ) : (
        <>
          <div className="comp-summary">
            <div className="donut-wrap">
              <Donut swatches={swatches} other={result.other} hovered={hovered} onHover={setHovered} />
              <div className="donut-center">
                {hoveredSwatch ? (
                  <>
                    <strong>{pct(hoveredSwatch.share)}</strong>
                    <span>{hoveredSwatch.name}</span>
                  </>
                ) : (
                  <>
                    <strong>{result.distinct}</strong>
                    <span>{result.distinct === 1 ? 'colour' : 'colours'}</span>
                  </>
                )}
              </div>
            </div>
            <dl className="comp-stats">
              <div>
                <dt>Painted</dt>
                <dd>{pct(result.coverage)}</dd>
              </div>
              {top && (
                <div>
                  <dt>Dominant</dt>
                  <dd className="comp-dominant">
                    <i style={{ background: top.hex }} />
                    {top.name}
                  </dd>
                </div>
              )}
              <div>
                <dt>Share</dt>
                <dd>{top ? pct(top.share) : '—'}</dd>
              </div>
            </dl>
          </div>
          <div className="stack-bar" aria-hidden>
            {swatches.map((s) => (
              <span
                key={s.id}
                style={{ flexGrow: s.share, background: s.hex }}
                className={hovered && hovered !== s.id ? 'is-dim' : ''}
                onPointerEnter={() => setHovered(s.id)}
                onPointerLeave={() => setHovered(null)}
              />
            ))}
            {result.other > 0.0005 && <span style={{ flexGrow: result.other }} className="stack-other" />}
          </div>
          <Segmented
            label="Breakdown"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'colors', label: 'Colours' },
              { value: 'families', label: 'Families' },
              { value: 'values', label: 'Values' },
            ]}
          />
          {tab === 'colors' && <ColorsTab swatches={swatches} other={result.other} hovered={hovered} onHover={setHovered} />}
          {tab === 'families' && <FamiliesTab />}
          {tab === 'values' && <ValuesTab />}
        </>
      )}
      <div className="comp-options">
        <Segmented
          label="Analyse"
          value={options.scope}
          onChange={(scope) => analyzer.setOptions({ scope })}
          options={[
            { value: 'visible', label: 'All visible' },
            { value: 'active', label: 'Active layer' },
          ]}
        />
        <Toggle
          label="Count bare paper"
          checked={options.includePaper}
          onChange={(includePaper) => analyzer.setOptions({ includePaper })}
          hint="Include unpainted paper in the percentages"
        />
        <Slider
          label="Detail"
          value={options.detail}
          min={0}
          max={1}
          unit="%"
          hint="Low merges similar tints into broad groups; high separates subtle shades"
          onChange={(detail) => analyzer.setOptions({ detail })}
        />
      </div>
    </Section>
  )
}
