/** Slider position (0..1) ↔ value, shared by horizontal and vertical sliders. */
export interface SliderScale {
  min: number
  max: number
  step?: number
  unit?: string
  /** Non-linear response – more precision at the low end (brush size). */
  curve?: 'quad'
}

export function toSliderPos(v: number, { min, max, curve }: SliderScale) {
  const t = Math.max(0, Math.min(1, (v - min) / (max - min)))
  return curve === 'quad' ? Math.sqrt(t) : t
}

export function fromSliderPos(p: number, { min, max, step = 0.01, unit, curve }: SliderScale) {
  const q = Math.max(0, Math.min(1, p))
  const t = curve === 'quad' ? q * q : q
  let v = min + t * (max - min)
  if (unit === 'px') v = v < 10 ? Math.round(v * 2) / 2 : Math.round(v)
  else if (step) v = Math.round(v / step) * step
  return Math.max(min, Math.min(max, v))
}
