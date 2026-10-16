import { useEffect, useState } from 'react'

interface Tip {
  text: string
  x: number
  top: number
  bottom: number
}

/** One floating tooltip for every `[data-tip]` element, so panels with overflow never clip it. */
export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let current: Element | null = null
    let tipVisible = false
    const show = (el: Element) => {
      const text = el.getAttribute('data-tip')
      if (!text) return
      const r = el.getBoundingClientRect()
      setTip({ text, x: r.left + r.width / 2, top: r.top, bottom: r.bottom })
    }
    const over = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      const el = (e.target as Element | null)?.closest?.('[data-tip]') ?? null
      if (el === current) {
        if (el && tipVisible) show(el)
        return
      }
      current = el
      if (timer) clearTimeout(timer)
      if (!el) {
        setTip(null)
        tipVisible = false
        return
      }
      const delay = tipVisible ? 60 : 450
      timer = setTimeout(() => {
        tipVisible = true
        show(el)
      }, delay)
    }
    const hide = () => {
      if (timer) clearTimeout(timer)
      current = null
      tipVisible = false
      setTip(null)
    }
    window.addEventListener('pointerover', over)
    window.addEventListener('pointerdown', hide)
    window.addEventListener('blur', hide)
    return () => {
      window.removeEventListener('pointerover', over)
      window.removeEventListener('pointerdown', hide)
      window.removeEventListener('blur', hide)
      if (timer) clearTimeout(timer)
    }
  }, [])
  if (!tip) return null
  const below = tip.top < 44
  const x = Math.max(8, Math.min(window.innerWidth - 8, tip.x))
  return (
    <div
      className={`tooltip ${below ? 'is-below' : ''}`}
      style={{ left: x, top: below ? tip.bottom + 8 : tip.top - 8 }}
      role="tooltip"
    >
      {tip.text}
    </div>
  )
}
