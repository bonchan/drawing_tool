import { ChartPie, ClipboardCopy } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { TrackedSwatch } from '../analysis/analyzer'
import { useAnalysis } from '../hooks/useApp'
import { useI18n } from '../i18n'
import { formatShare, swatchName } from '../lib/labels'
import { analyzer } from '../session'
import { useStore } from '../state/store'
import { toolStore, tools } from '../state/tools'
import { ui, uiStore, type CompositionTab } from '../state/ui'
import { IconButton, Section, Segmented, Slider, Toggle } from './kit'

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
  const { t } = useI18n()
  const R = 46
  const C = 2 * Math.PI * R
  const gap = swatches.length + (other > 0 ? 1 : 0) > 1 ? 1.6 : 0
  let acc = 0
  const segs = [
    ...swatches.map((s) => ({ id: s.id, share: s.share, color: s.hex })),
    ...(other > 0.0005 ? [{ id: 'other', share: other, color: 'var(--other)' }] : []),
  ]
  return (
    <svg viewBox="0 0 120 120" className="donut" role="img" aria-label={t('composition.donut')}>
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

function ColorsTab({
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
  const i18n = useI18n()
  const { t } = i18n
  const current = useStore(toolStore, (s) => s.color)
  const max = Math.max(other, ...swatches.map((s) => s.share), 0.0001)
  return (
    <ul className="comp-list">
      {swatches.map((s) => {
        const name = swatchName(i18n, s)
        return (
          <li key={s.id}>
            <button
              type="button"
              className={`comp-row ${hovered === s.id ? 'is-hovered' : ''} ${s.hex === current ? 'is-current' : ''}`}
              onPointerEnter={() => onHover(s.id)}
              onPointerLeave={() => onHover(null)}
              onClick={() => tools.setColor(s.hex)}
              title={t('composition.use', { name, hex: s.hex })}
            >
              <span className="comp-swatch" style={{ background: s.hex }} />
              <span className="comp-name">
                <span>{name}</span>
                <span className="comp-hex">{s.hex}</span>
              </span>
              <span className="comp-bar">
                <span style={{ width: `${(s.share / max) * 100}%`, background: s.hex }} />
              </span>
              <span className="comp-pct">{formatShare(i18n, s.share)}</span>
            </button>
          </li>
        )
      })}
      {other > 0.0005 && (
        <li>
          <div className="comp-row is-other">
            <span className="comp-swatch comp-swatch-other" />
            <span className="comp-name">
              <span>{t('composition.otherTints')}</span>
              <span className="comp-hex">{t('composition.smallGroups')}</span>
            </span>
            <span className="comp-bar">
              <span style={{ width: `${(other / max) * 100}%` }} />
            </span>
            <span className="comp-pct">{formatShare(i18n, other)}</span>
          </div>
        </li>
      )}
    </ul>
  )
}

function FamiliesTab() {
  const i18n = useI18n()
  const result = useAnalysis((s) => s.result)
  if (!result) return null
  const max = Math.max(...result.families.map((f) => f.share), 0.0001)
  return (
    <ul className="comp-list">
      {result.families.map((f) => (
        <li key={f.id} className="comp-row is-static">
          <span className="comp-swatch is-round" style={{ background: f.hex }} />
          <span className="comp-name">
            <span>{i18n.t(`families.${f.id}`)}</span>
          </span>
          <span className="comp-bar">
            <span style={{ width: `${(f.share / max) * 100}%`, background: f.hex }} />
          </span>
          <span className="comp-pct">{formatShare(i18n, f.share)}</span>
        </li>
      ))}
    </ul>
  )
}

function ValuesTab() {
  const i18n = useI18n()
  const { t } = i18n
  const result = useAnalysis((s) => s.result)
  if (!result) return null
  const v = result.values
  const max = Math.max(...v, 0.0001)
  const share = (x: number) => formatShare(i18n, x)
  const shadows = v[0] + v[1] + v[2]
  const mids = v[3] + v[4] + v[5] + v[6]
  const lights = v[7] + v[8] + v[9]
  const temp = result.temperature
  return (
    <div className="values-tab">
      <div className="value-hist" role="img" aria-label={t('values.label')}>
        {v.map((s, i) => {
          const g = Math.round(((i + 0.5) / 10) * 255)
          return (
            <div
              key={i}
              className="value-col"
              data-tip={t('values.bucket', { from: i18n.percent(i / 10), to: i18n.percent((i + 1) / 10), share: share(s) })}
            >
              <div className="value-bar" style={{ height: `${(s / max) * 100}%`, background: `rgb(${g},${g},${g})` }} />
            </div>
          )
        })}
      </div>
      <div className="value-axis">
        <span>{t('values.dark')}</span>
        <span>{t('values.light')}</span>
      </div>
      <dl className="stat-grid">
        <div>
          <dt>{t('values.shadows')}</dt>
          <dd>{share(shadows)}</dd>
        </div>
        <div>
          <dt>{t('values.midtones')}</dt>
          <dd>{share(mids)}</dd>
        </div>
        <div>
          <dt>{t('values.highlights')}</dt>
          <dd>{share(lights)}</dd>
        </div>
      </dl>
      <div className="mini-label">{t('values.temperature')}</div>
      <div className="temp-bar">
        <span className="temp-warm" style={{ flexGrow: temp.warm }} data-tip={`${t('values.warm')} ${share(temp.warm)}`} />
        <span className="temp-neutral" style={{ flexGrow: temp.neutral }} data-tip={`${t('values.neutral')} ${share(temp.neutral)}`} />
        <span className="temp-cool" style={{ flexGrow: temp.cool }} data-tip={`${t('values.cool')} ${share(temp.cool)}`} />
      </div>
      <div className="temp-legend">
        <span>
          <i className="temp-warm" /> {t('values.warm')} {share(temp.warm)}
        </span>
        <span>
          <i className="temp-neutral" /> {t('values.neutral')} {share(temp.neutral)}
        </span>
        <span>
          <i className="temp-cool" /> {t('values.cool')} {share(temp.cool)}
        </span>
      </div>
    </div>
  )
}

export function CompositionPanel() {
  const i18n = useI18n()
  const { t } = i18n
  const state = useAnalysis((s) => s)
  const tab = useStore(uiStore, (s) => s.compositionTab)
  const [hovered, setHovered] = useState<string | null>(null)
  const { result, swatches, options } = state
  const empty = !result || result.samples === 0
  const hoveredSwatch = useMemo(() => swatches.find((s) => s.id === hovered) ?? null, [swatches, hovered])
  const top = swatches[0]

  const copy = async () => {
    const lines = swatches.map((s) => `${s.hex}  ${formatShare(i18n, s.share).padStart(7)}  ${swatchName(i18n, s)}`)
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      ui.toast(t('composition.copied'))
    } catch {
      ui.toast(t('composition.clipboardError'), 'warn')
    }
  }

  return (
    <Section
      id="composition"
      title={t('composition.title')}
      icon={<ChartPie size={14} />}
      className="composition"
      actions={
        <>
          <span key={state.updates} className={`live-dot ${state.updates ? 'is-pulsing' : ''}`} title={t('composition.live')} />
          <IconButton label={t('composition.copy')} onClick={copy} disabled={empty}>
            <ClipboardCopy size={14} />
          </IconButton>
        </>
      }
    >
      {empty ? (
        <div className="comp-empty">
          <div className="comp-empty-ring" />
          <p>
            {options.scope === 'active' ? t('composition.emptyActive') : t('composition.emptyAll')}
            <br />
            {t('composition.emptyCta')}
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
                    <strong>{formatShare(i18n, hoveredSwatch.share)}</strong>
                    <span>{swatchName(i18n, hoveredSwatch)}</span>
                  </>
                ) : (
                  <>
                    <strong>{i18n.number(result.distinct)}</strong>
                    <span>{t('composition.colorCount', { count: result.distinct })}</span>
                  </>
                )}
              </div>
            </div>
            <dl className="comp-stats">
              <div>
                <dt>{t('composition.painted')}</dt>
                <dd>{formatShare(i18n, result.coverage)}</dd>
              </div>
              {top && (
                <div>
                  <dt>{t('composition.dominant')}</dt>
                  <dd className="comp-dominant">
                    <i style={{ background: top.hex }} />
                    {swatchName(i18n, top)}
                  </dd>
                </div>
              )}
              <div>
                <dt>{t('composition.share')}</dt>
                <dd>{top ? formatShare(i18n, top.share) : '—'}</dd>
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
          <Segmented<CompositionTab>
            label={t('composition.breakdown')}
            value={tab}
            onChange={(compositionTab) => uiStore.set({ compositionTab })}
            options={[
              { value: 'colors', label: t('composition.tabColors') },
              { value: 'families', label: t('composition.tabFamilies') },
              { value: 'values', label: t('composition.tabValues') },
            ]}
          />
          {tab === 'colors' && <ColorsTab swatches={swatches} other={result.other} hovered={hovered} onHover={setHovered} />}
          {tab === 'families' && <FamiliesTab />}
          {tab === 'values' && <ValuesTab />}
        </>
      )}
      <div className="comp-options">
        <Segmented
          label={t('composition.analyse')}
          value={options.scope}
          onChange={(scope) => analyzer.setOptions({ scope })}
          options={[
            { value: 'visible', label: t('composition.scopeVisible') },
            { value: 'active', label: t('composition.scopeActive') },
          ]}
        />
        <Toggle
          label={t('composition.countPaper')}
          checked={options.includePaper}
          onChange={(includePaper) => analyzer.setOptions({ includePaper })}
          hint={t('composition.countPaperHint')}
        />
        <Slider
          label={t('composition.detail')}
          value={options.detail}
          min={0}
          max={1}
          unit="%"
          hint={t('composition.detailHint')}
          onChange={(detail) => analyzer.setOptions({ detail })}
        />
      </div>
    </Section>
  )
}
