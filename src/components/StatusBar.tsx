import { useAnalysis, useDoc } from '../hooks/useApp'
import { useStore } from '../state/store'
import { tools } from '../state/tools'
import { cursorStore, uiStore } from '../state/ui'

/** Always-visible palette strip: the live colour composition of the painting. */
function PaletteStrip() {
  const swatches = useAnalysis((s) => s.swatches)
  const other = useAnalysis((s) => s.result?.other ?? 0)
  const empty = swatches.length === 0
  return (
    <div className="palette-strip" aria-label="Live palette">
      <span className="strip-label">Palette</span>
      <div className="strip-bar">
        {empty ? (
          <span className="strip-empty">paint to see your palette</span>
        ) : (
          <>
            {swatches.map((s) => (
              <button
                key={s.id}
                type="button"
                style={{ flexGrow: s.share, background: s.hex }}
                data-tip={`${s.name} · ${(s.share * 100).toFixed(1)}%`}
                aria-label={`${s.name} ${(s.share * 100).toFixed(1)} percent`}
                onClick={() => tools.setColor(s.hex)}
              />
            ))}
            {other > 0.0005 && <span className="strip-other" style={{ flexGrow: other }} data-tip={`Other · ${(other * 100).toFixed(1)}%`} />}
          </>
        )}
      </div>
    </div>
  )
}

export function StatusBar() {
  const w = useDoc((s) => s.width)
  const h = useDoc((s) => s.height)
  const layers = useDoc((s) => s.layers.length)
  const pos = useStore(cursorStore, (s) => s.pos)
  const saving = useStore(uiStore, (s) => s.saving)
  return (
    <footer className="statusbar">
      <span className="status-item">
        {w} × {h}px
      </span>
      <span className="status-item">{layers} {layers === 1 ? 'layer' : 'layers'}</span>
      <span className="status-item status-pos">{pos ? `${Math.round(pos.x)}, ${Math.round(pos.y)}` : '—'}</span>
      <PaletteStrip />
      <span className={`status-item status-save is-${saving}`}>
        {saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Saved in browser' : saving === 'error' ? 'Autosave failed' : 'Autosave on'}
      </span>
    </footer>
  )
}
