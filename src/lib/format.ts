import type { I18n } from '../i18n'

/** Slider read-outs in the current language ("50%" / "50 %", "2.5px" / "2,5 px"). */
export function formatValue({ percent, number }: I18n, v: number, unit?: string) {
  if (unit === '%') return percent(v)
  if (unit === 'px') return `${number(v, v < 10 ? 1 : 0)}px`
  if (unit === '°') return `${Math.round(v)}°`
  return number(v, 2)
}
