import { useAnalysis, useDoc } from '../hooks/useApp'
import { useI18n } from '../i18n'
import { formatShare, swatchName } from '../lib/labels'
import { useStore } from '../state/store'
import { tools } from '../state/tools'
import { cursorStore, uiStore } from '../state/ui'

/** Always-visible palette strip: the live colour composition of the painting. */
function PaletteStrip() {
  const i18n = useI18n()
  const { t } = i18n
  const swatches = useAnalysis((s) => s.swatches)
  const other = useAnalysis((s) => s.result?.other ?? 0)
  const empty = swatches.length === 0
  return (
    <div className="palette-strip" aria-label={t('status.livePalette')}>
      <span className="strip-label">{t('status.palette')}</span>
      <div className="strip-bar">
        {empty ? (
          <span className="strip-empty">{t('status.paletteEmpty')}</span>
        ) : (
          <>
            {swatches.map((s) => {
              const label = `${swatchName(i18n, s)} · ${formatShare(i18n, s.share)}`
              return (
                <button
                  key={s.id}
                  type="button"
                  style={{ flexGrow: s.share, background: s.hex }}
                  data-tip={label}
                  aria-label={label}
                  onClick={() => tools.setColor(s.hex)}
                />
              )
            })}
            {other > 0.0005 && (
              <span className="strip-other" style={{ flexGrow: other }} data-tip={`${t('status.other')} · ${formatShare(i18n, other)}`} />
            )}
          </>
        )}
      </div>
    </div>
  )
}

export function StatusBar() {
  const i18n = useI18n()
  const { t } = i18n
  const w = useDoc((s) => s.width)
  const h = useDoc((s) => s.height)
  const layers = useDoc((s) => s.layers.length)
  const pos = useStore(cursorStore, (s) => s.pos)
  const saving = useStore(uiStore, (s) => s.saving)
  return (
    <footer className="statusbar">
      <span className="status-item">{t('status.size', { w, h })}</span>
      <span className="status-item">{t('layers.count', { count: layers })}</span>
      <span className="status-item status-pos">{pos ? `${Math.round(pos.x)}, ${Math.round(pos.y)}` : '—'}</span>
      <PaletteStrip />
      <span className={`status-item status-save is-${saving}`}>
        {saving === 'saving'
          ? t('status.saving')
          : saving === 'saved'
            ? t('status.saved')
            : saving === 'error'
              ? t('status.saveError')
              : t('status.autosaveOn')}
      </span>
    </footer>
  )
}
