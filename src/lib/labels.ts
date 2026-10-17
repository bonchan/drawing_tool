import type { ColorSwatch } from '../analysis/palette'
import type { BlockedReason, HistoryLabel } from '../engine/Engine'
import type { I18n } from '../i18n'

/** Display name of a colour group, e.g. "Sap Green (light)" / "Verde vejiga (tono claro)". */
export function swatchName({ t }: I18n, s: Pick<ColorSwatch, 'nameId' | 'shade'>): string {
  const name = t(`colors.${s.nameId}`)
  if (s.shade === undefined) return name
  if (typeof s.shade === 'number') return t('shades.numbered', { name, n: s.shade })
  return t('shades.qualified', { name, shade: t(`shades.${s.shade}`) })
}

/** What an undo/redo step did, e.g. "Watercolor stroke" / "trazo de Acuarela". */
export function historyLabel({ t }: I18n, label: HistoryLabel): string {
  if (label.startsWith('brush:')) {
    const id = label.slice(6) as Extract<HistoryLabel, `brush:${string}`> extends `brush:${infer B}` ? B : never
    return t('history.stroke', { brush: t(`brushes.${id}.name`) })
  }
  return t(`history.${label as Exclude<HistoryLabel, `brush:${string}`>}`)
}

export function blockedMessage({ t }: I18n, b: BlockedReason): string {
  return t(`errors.${b.reason}`, { name: b.layer })
}

/** "12.5%" for big shares, "0.42%" for small ones, "<0.1%" below that – localised. */
export function formatShare({ t, percent }: I18n, share: number): string {
  if (share >= 0.0995) return percent(share, 1)
  if (share >= 0.001) return percent(share, 2)
  return t('composition.lessThan', { value: percent(0.001, 1) })
}
