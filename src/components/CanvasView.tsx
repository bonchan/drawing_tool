import { useEffect, useRef } from 'react'
import { engine } from '../session'
import { isBrushId, type BrushId } from '../engine/brushes'
import { rgbToHex } from '../engine/color'
import type { InputPoint } from '../engine/stroke'
import { get2d, getCheckerTile } from '../engine/textures'
import { toolStore, tools, type ToolId } from '../state/tools'
import { cursorStore, ui, view, viewStore } from '../state/ui'
import { i18n } from '../i18n'
import { isTyping, releaseFocus } from '../lib/dom'
import { blockedMessage } from '../lib/labels'

type Mode = 'idle' | 'paint' | 'pan' | 'move' | 'pick' | 'gesture'


export function CanvasView() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const wrap = wrapRef.current!
    const canvas = canvasRef.current!
    const overlay = overlayRef.current!
    const sheet = sheetRef.current!
    const ctx = get2d(canvas)
    const octx = get2d(overlay)
    let dpr = window.devicePixelRatio || 1
    let viewDirty = true
    let overlayDirty = true
    let raf = 0
    let checker: CanvasPattern | null = null

    let mode: Mode = 'idle'
    let activePointer = -1
    let cursor: { x: number; y: number } | null = null
    let pickColor: string | null = null
    let pickPrev: string | null = null
    let spaceDown = false
    let altDown = false
    let penSeenAt = -Infinity
    const pan = { sx: 0, sy: 0, px: 0, py: 0 }
    const moveStart = { x: 0, y: 0 }
    const touches = new Map<number, { x: number; y: number }>()
    const gesture = { d0: 1, mx: 0, my: 0, z0: 1, px: 0, py: 0, t0: 0, moved: false, fingers: 0 }

    // ---------------------------------------------------------- sizing

    const resize = () => {
      const r = wrap.getBoundingClientRect()
      dpr = window.devicePixelRatio || 1
      for (const c of [canvas, overlay]) {
        c.width = Math.max(1, Math.round(r.width * dpr))
        c.height = Math.max(1, Math.round(r.height * dpr))
      }
      const first = viewStore.get().vw === 0
      viewStore.set({ vw: r.width, vh: r.height })
      if (first) view.fit(engine.width, engine.height)
      viewDirty = overlayDirty = true
    }
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    resize()

    let lastDoc = `${engine.width}x${engine.height}`
    const unsubView = viewStore.subscribe(() => {
      viewDirty = overlayDirty = true
    })
    const unsubEngine = engine.subscribe(() => {
      const doc = `${engine.width}x${engine.height}`
      if (doc !== lastDoc) {
        lastDoc = doc
        view.fit(engine.width, engine.height)
      }
      viewDirty = true
    })
    const unsubTools = toolStore.subscribe(() => {
      overlayDirty = true
      updateCursorStyle()
    })

    // ---------------------------------------------------------- drawing

    const drawDisplay = () => {
      const v = viewStore.get()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.setTransform(dpr * v.zoom, 0, 0, dpr * v.zoom, dpr * v.panX, dpr * v.panY)
      if (!engine.paper.visible) {
        checker ??= ctx.createPattern(getCheckerTile(), 'repeat')
        if (checker) {
          checker.setTransform(new DOMMatrix().scale(1 / v.zoom))
          ctx.fillStyle = checker
          ctx.fillRect(0, 0, engine.width, engine.height)
        }
      }
      ctx.imageSmoothingEnabled = v.zoom < 2.5
      ctx.imageSmoothingQuality = v.zoom < 1 ? 'medium' : 'low'
      ctx.drawImage(engine.composite, 0, 0)
      sheet.style.transform = `translate(${v.panX}px, ${v.panY}px)`
      sheet.style.width = `${engine.width * v.zoom}px`
      sheet.style.height = `${engine.height * v.zoom}px`
    }

    const currentTool = (): ToolId => {
      if (spaceDown || mode === 'pan') return 'hand'
      const t = toolStore.get().tool
      if (altDown && isBrushId(t)) return 'eyedropper'
      return t
    }

    const drawGuides = () => {
      const sym = toolStore.get().symmetry
      if (sym === 'off') return
      const v = viewStore.get()
      const k = dpr * v.zoom
      const cx = (v.panX + (engine.width / 2) * v.zoom) * dpr
      const cy = (v.panY + (engine.height / 2) * v.zoom) * dpr
      const angles = sym === 'mirror' ? [90] : sym === 'quad' ? [0, 90] : [90, 30, 150]
      octx.save()
      octx.beginPath()
      octx.rect(v.panX * dpr, v.panY * dpr, engine.width * k, engine.height * k)
      octx.clip()
      const L = Math.hypot(engine.width, engine.height) * k
      for (const [color, w, dash] of [
        ['rgba(0,0,0,.35)', 3, []],
        ['rgba(126,166,255,.95)', 1.25, [6, 5]],
      ] as const) {
        octx.strokeStyle = color
        octx.lineWidth = w * dpr
        octx.setLineDash(dash.map((n) => n * dpr))
        octx.beginPath()
        for (const deg of angles) {
          const a = (deg * Math.PI) / 180
          octx.moveTo(cx - Math.cos(a) * L, cy - Math.sin(a) * L)
          octx.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L)
        }
        octx.stroke()
      }
      octx.restore()
    }

    const drawOverlay = () => {
      octx.setTransform(1, 0, 0, 1, 0, 0)
      octx.clearRect(0, 0, overlay.width, overlay.height)
      drawGuides()
      if (!cursor || mode === 'pan' || mode === 'gesture') return
      const cx = cursor.x * dpr
      const cy = cursor.y * dpr
      const tool = currentTool()
      if (mode === 'pick' || (tool === 'eyedropper' && pickColor)) {
        drawLoupe(cx, cy)
        return
      }
      if (!isBrushId(tool)) return
      const s = toolStore.get().settings[tool]
      const z = viewStore.get().zoom
      const r = (s.size / 2) * z * dpr
      octx.lineWidth = Math.max(1, dpr)
      if (tool === 'calligraphy' || tool === 'highlighter') {
        const a = ((tool === 'highlighter' ? 90 : s.angle) * Math.PI) / 180
        const hx = Math.cos(a) * r
        const hy = Math.sin(a) * r
        for (const [color, w] of [
          ['rgba(0,0,0,.6)', 3],
          ['rgba(255,255,255,.95)', 1],
        ] as const) {
          octx.strokeStyle = color
          octx.lineWidth = w * dpr
          octx.beginPath()
          octx.moveTo(cx - hx, cy - hy)
          octx.lineTo(cx + hx, cy + hy)
          octx.stroke()
        }
        return
      }
      if (r < 3 * dpr) {
        crosshair(cx, cy, 6 * dpr)
        return
      }
      octx.strokeStyle = 'rgba(0,0,0,.55)'
      octx.beginPath()
      octx.arc(cx, cy, r + dpr * 0.5, 0, Math.PI * 2)
      octx.stroke()
      octx.strokeStyle = 'rgba(255,255,255,.9)'
      octx.beginPath()
      octx.arc(cx, cy, Math.max(1, r - dpr * 0.5), 0, Math.PI * 2)
      octx.stroke()
      if (r > 12 * dpr) {
        octx.fillStyle = 'rgba(255,255,255,.85)'
        octx.fillRect(cx - dpr, cy - dpr, dpr * 2, dpr * 2)
      }
    }

    const crosshair = (cx: number, cy: number, n: number) => {
      for (const [color, w] of [
        ['rgba(0,0,0,.6)', 3],
        ['rgba(255,255,255,.95)', 1],
      ] as const) {
        octx.strokeStyle = color
        octx.lineWidth = w * dpr
        octx.beginPath()
        octx.moveTo(cx - n, cy)
        octx.lineTo(cx + n, cy)
        octx.moveTo(cx, cy - n)
        octx.lineTo(cx, cy + n)
        octx.stroke()
      }
    }

    const drawLoupe = (cx: number, cy: number) => {
      const R = 34 * dpr
      const w = 12 * dpr
      octx.lineWidth = w
      octx.strokeStyle = pickPrev ?? toolStore.get().color
      octx.beginPath()
      octx.arc(cx, cy, R, 0, Math.PI)
      octx.stroke()
      octx.strokeStyle = pickColor ?? toolStore.get().color
      octx.beginPath()
      octx.arc(cx, cy, R, Math.PI, Math.PI * 2)
      octx.stroke()
      octx.lineWidth = dpr
      octx.strokeStyle = 'rgba(0,0,0,.45)'
      octx.beginPath()
      octx.arc(cx, cy, R + w / 2, 0, Math.PI * 2)
      octx.stroke()
      octx.beginPath()
      octx.arc(cx, cy, R - w / 2, 0, Math.PI * 2)
      octx.stroke()
      crosshair(cx, cy, 5 * dpr)
    }

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (mode === 'paint') engine.tick(now)
      const changed = engine.render()
      if (changed || viewDirty) {
        drawDisplay()
        viewDirty = false
      }
      if (overlayDirty) {
        drawOverlay()
        overlayDirty = false
      }
    }
    raf = requestAnimationFrame(loop)

    const updateCursorStyle = () => {
      const t = currentTool()
      let c = 'none'
      if (t === 'hand') c = mode === 'pan' ? 'grabbing' : 'grab'
      else if (t === 'move') c = 'move'
      else if (t === 'fill') c = 'crosshair'
      else if (t === 'eyedropper') c = 'crosshair'
      overlay.style.cursor = c
    }
    updateCursorStyle()

    // ---------------------------------------------------------- input

    const local = (e: { clientX: number; clientY: number }) => {
      const r = overlay.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const toDoc = (e: { clientX: number; clientY: number }) => {
      const l = local(e)
      const v = viewStore.get()
      return { x: (l.x - v.panX) / v.zoom, y: (l.y - v.panY) / v.zoom }
    }
    const toInput = (e: PointerEvent): InputPoint => {
      const p = toDoc(e)
      return {
        x: p.x,
        y: p.y,
        pressure: e.pressure,
        tiltX: e.tiltX || 0,
        tiltY: e.tiltY || 0,
        time: e.timeStamp,
        pointerType: e.pointerType,
      }
    }

    const pickAt = (e: PointerEvent) => {
      const p = toDoc(e)
      const rgb = engine.pickColor(p.x, p.y)
      if (rgb) {
        pickColor = rgbToHex(rgb)
        tools.setColor(pickColor)
      }
      overlayDirty = true
    }

    const startGesture = () => {
      const [a, b] = [...touches.values()]
      gesture.d0 = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))
      const r = overlay.getBoundingClientRect()
      gesture.mx = (a.x + b.x) / 2 - r.left
      gesture.my = (a.y + b.y) / 2 - r.top
      const v = viewStore.get()
      gesture.z0 = v.zoom
      gesture.px = v.panX
      gesture.py = v.panY
      gesture.t0 = performance.now()
      gesture.moved = false
      gesture.fingers = 2
      mode = 'gesture'
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'pen') penSeenAt = performance.now()
      // preventDefault below stops the canvas from taking focus, so release it
      // explicitly – otherwise a focused slider or text field swallows shortcuts.
      releaseFocus()
      cursor = local(e)
      if (e.pointerType === 'touch') {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (touches.size === 2) {
          if (mode === 'paint') engine.cancelStroke()
          if (mode === 'move') engine.endMove()
          startGesture()
          return
        }
        if (touches.size > 2) {
          gesture.fingers = Math.max(gesture.fingers, touches.size)
          return
        }
      }
      if (mode !== 'idle') return
      try {
        overlay.setPointerCapture(e.pointerId)
      } catch {
        /* synthetic or already-released pointer */
      }
      activePointer = e.pointerId
      e.preventDefault()

      // Palm rejection: once a stylus has been used, a finger only pans.
      const fingerAfterPen = e.pointerType === 'touch' && performance.now() - penSeenAt < 60_000
      let tool = currentTool()
      if (e.button === 1 || fingerAfterPen) tool = 'hand'
      if (e.button === 2) tool = 'eyedropper'

      if (tool === 'hand') {
        mode = 'pan'
        const v = viewStore.get()
        pan.sx = e.clientX
        pan.sy = e.clientY
        pan.px = v.panX
        pan.py = v.panY
        updateCursorStyle()
        overlayDirty = true
        return
      }
      if (tool === 'eyedropper') {
        mode = 'pick'
        pickPrev = toolStore.get().color
        pickAt(e)
        return
      }
      const reason = engine.blockedReason()
      if (reason && tool !== 'move') {
        ui.toast(blockedMessage(i18n(), reason), 'warn')
        return
      }
      if (tool === 'fill') {
        const p = toDoc(e)
        const { color, fill } = toolStore.get()
        if (engine.fill(p.x, p.y, color, fill)) tools.pushRecent(color)
        return
      }
      if (tool === 'move') {
        if (!engine.beginMove()) {
          if (reason) ui.toast(blockedMessage(i18n(), reason), 'warn')
          return
        }
        mode = 'move'
        const p = toDoc(e)
        moveStart.x = p.x
        moveStart.y = p.y
        return
      }
      if (isBrushId(tool)) {
        const { settings, color } = toolStore.get()
        const brushId = tool as BrushId
        const p = toInput(e)
        if (e.shiftKey && engine.lastStrokeEnd) {
          const from = { ...p, ...engine.lastStrokeEnd }
          if (engine.beginStroke(brushId, settings[brushId], color, from, { straight: true })) {
            engine.strokeTo([p])
            engine.endStroke()
            if (brushId !== 'eraser' && brushId !== 'smudge') tools.pushRecent(color)
          }
          return
        }
        if (engine.beginStroke(brushId, settings[brushId], color, p)) mode = 'paint'
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'pen') penSeenAt = performance.now()
      if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (mode === 'gesture' && touches.size >= 2) {
          const [a, b] = [...touches.values()]
          const r = overlay.getBoundingClientRect()
          const mx = (a.x + b.x) / 2 - r.left
          const my = (a.y + b.y) / 2 - r.top
          const ratio = Math.hypot(a.x - b.x, a.y - b.y) / gesture.d0
          if (Math.abs(ratio - 1) > 0.06 || Math.hypot(mx - gesture.mx, my - gesture.my) > 10) gesture.moved = true
          if (!gesture.moved) return
          const z = Math.max(0.05, Math.min(32, gesture.z0 * ratio))
          const docX = (gesture.mx - gesture.px) / gesture.z0
          const docY = (gesture.my - gesture.py) / gesture.z0
          viewStore.set({ zoom: z, panX: mx - docX * z, panY: my - docY * z })
          return
        }
      }
      cursor = local(e)
      overlayDirty = true
      if (mode === 'idle') {
        const p = toDoc(e)
        cursorStore.set({ pos: { x: p.x, y: p.y } })
      }
      if (e.pointerId !== activePointer) return
      if (mode === 'paint') {
        const list = e.getCoalescedEvents?.() ?? []
        const events = list.length ? list : [e]
        engine.strokeTo(events.map(toInput))
      } else if (mode === 'pan') {
        viewStore.set({ panX: pan.px + e.clientX - pan.sx, panY: pan.py + e.clientY - pan.sy })
      } else if (mode === 'move') {
        const p = toDoc(e)
        engine.moveBy(p.x - moveStart.x, p.y - moveStart.y)
      } else if (mode === 'pick') {
        pickAt(e)
      }
    }

    const finish = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        touches.delete(e.pointerId)
        if (mode === 'gesture') {
          if (touches.size === 0) {
            mode = 'idle'
            // Quick two-finger tap = undo, three-finger tap = redo.
            if (!gesture.moved && performance.now() - gesture.t0 < 320) {
              if (gesture.fingers === 2) engine.undo()
              else if (gesture.fingers >= 3) engine.redo()
            }
          }
          return
        }
      }
      if (e.pointerId !== activePointer) return
      activePointer = -1
      if (mode === 'paint') {
        engine.endStroke()
        const t = toolStore.get().tool
        if (t !== 'eraser' && t !== 'smudge') tools.pushRecent(toolStore.get().color)
      } else if (mode === 'move') {
        engine.endMove()
      } else if (mode === 'pick') {
        if (pickColor) {
          tools.pushRecent(pickColor)
          // A deliberate eyedropper pick goes straight back to painting.
          const { tool, lastBrush } = toolStore.get()
          if (tool === 'eyedropper') tools.setTool(lastBrush)
        }
        pickColor = null
        pickPrev = null
      }
      mode = 'idle'
      updateCursorStyle()
      overlayDirty = true
    }

    const onLeave = () => {
      cursor = null
      overlayDirty = true
      cursorStore.set({ pos: null })
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const l = local(e)
      const mouseWheel = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY))
      if (e.ctrlKey || e.metaKey || (mouseWheel && !e.shiftKey)) {
        const amount = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY
        view.zoomBy(Math.exp(-amount * (e.ctrlKey && !mouseWheel ? 0.01 : 0.0018)), l.x, l.y)
      } else if (e.shiftKey && e.deltaX === 0) {
        view.panBy(-e.deltaY, 0)
      } else {
        view.panBy(-e.deltaX, -e.deltaY)
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      if (e.code === 'Space' && !spaceDown) {
        spaceDown = true
        e.preventDefault()
        // don't let Space also "click" whichever button has focus
        if (document.activeElement instanceof HTMLButtonElement) releaseFocus()
        updateCursorStyle()
        overlayDirty = true
      }
      if (e.key === 'Alt') {
        altDown = true
        e.preventDefault()
        updateCursorStyle()
        overlayDirty = true
      }
      if (e.key === 'Escape' && mode === 'paint') {
        engine.cancelStroke()
        mode = 'idle'
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDown = false
      if (e.key === 'Alt') altDown = false
      updateCursorStyle()
      overlayDirty = true
    }
    const onBlur = () => {
      spaceDown = altDown = false
      if (mode === 'paint') engine.endStroke()
      if (mode === 'move') engine.endMove()
      mode = 'idle'
      updateCursorStyle()
    }
    const noMenu = (e: Event) => e.preventDefault()

    overlay.addEventListener('pointerdown', onPointerDown)
    overlay.addEventListener('pointermove', onPointerMove)
    overlay.addEventListener('pointerup', finish)
    overlay.addEventListener('pointercancel', finish)
    overlay.addEventListener('pointerleave', onLeave)
    overlay.addEventListener('wheel', onWheel, { passive: false })
    overlay.addEventListener('contextmenu', noMenu)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      unsubView()
      unsubEngine()
      unsubTools()
      overlay.removeEventListener('pointerdown', onPointerDown)
      overlay.removeEventListener('pointermove', onPointerMove)
      overlay.removeEventListener('pointerup', finish)
      overlay.removeEventListener('pointercancel', finish)
      overlay.removeEventListener('pointerleave', onLeave)
      overlay.removeEventListener('wheel', onWheel)
      overlay.removeEventListener('contextmenu', noMenu)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <div className="canvas-sheet" ref={sheetRef} />
      <canvas className="canvas-display" ref={canvasRef} />
      <canvas className="canvas-overlay" ref={overlayRef} />
    </div>
  )
}
