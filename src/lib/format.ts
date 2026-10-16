export function formatValue(v: number, unit?: string) {
  if (unit === '%') return `${Math.round(v * 100)}%`
  if (unit === 'px') return v < 10 ? `${(Math.round(v * 10) / 10).toString()}px` : `${Math.round(v)}px`
  if (unit === '°') return `${Math.round(v)}°`
  return `${Math.round(v * 100) / 100}`
}
