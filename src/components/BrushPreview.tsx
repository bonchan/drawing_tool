import { useDeferredValue, useEffect, useRef } from 'react'
import type { BrushId } from '../engine/brushes'
import { renderBrushPreview } from '../engine/brushPreview'
import { useDoc } from '../hooks/useApp'
import { useStore } from '../state/store'
import { toolStore } from '../state/tools'

export function BrushPreview({
  id,
  height,
  maxSize,
  amplitude,
  delay = 0,
}: {
  id: BrushId
  height: number
  maxSize: number
  amplitude?: number
  /** Wait for changes to settle before re-rendering (used by the many library previews). */
  delay?: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const settings = useStore(toolStore, (s) => s.settings[id])
  const color = useDeferredValue(useStore(toolStore, (s) => s.color))
  const paper = useDoc((s) => s.paper.color)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    // Coalesce rapid changes (dragging the colour picker) into one render.
    let raf = 0
    const render = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = Math.max(40, c.clientWidth)
      c.width = Math.round(w * dpr)
      c.height = Math.round(height * dpr)
      renderBrushPreview(c, id, settings, color, { paper, scale: dpr, maxSize, amplitude })
    }
    const timer = setTimeout(() => (raf = requestAnimationFrame(render)), delay)
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(raf)
    }
  }, [id, settings, color, paper, height, maxSize, amplitude, delay])

  return <canvas ref={ref} className="brush-preview" style={{ height }} aria-hidden />
}
