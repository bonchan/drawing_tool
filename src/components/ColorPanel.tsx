import { ArrowLeftRight, Palette } from 'lucide-react'
import { useState, type PointerEvent as RPointerEvent } from 'react'
import { hexToRgb, hsvToRgb, isValidHex, rgbToHex, rgbToHsv, type HSV } from '../engine/color'
import { useStore } from '../state/store'
import { toolStore, tools } from '../state/tools'
import { IconButton, Section } from './kit'

/** A pigment-inspired starter palette. */
const SWATCHES = [
  '#1b1b1f', '#4a4a50', '#8d8d93', '#d9d6cf', '#ffffff',
  '#7a1f2b', '#c23b3b', '#e8613c', '#f29e4c', '#f2c94c',
  '#f5e6a8', '#8a6a3b', '#5b3a29', '#b5651d', '#d9a066',
  '#2f5d34', '#3e8e5a', '#8cbf6a', '#1f6f78', '#4fb3bf',
  '#1d2f6f', '#2f6fb3', '#7fb0e0', '#5b3c88', '#b07cc6',
]

function useDrag(onMove: (x: number, y: number) => void) {
  return {
    onPointerDown(e: RPointerEvent<HTMLDivElement>) {
      const el = e.currentTarget
      el.setPointerCapture(e.pointerId)
      const r = el.getBoundingClientRect()
      onMove((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
    },
    onPointerMove(e: RPointerEvent<HTMLDivElement>) {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
      const r = e.currentTarget.getBoundingClientRect()
      onMove((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
    },
  }
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

export function ColorPanel() {
  const color = useStore(toolStore, (s) => s.color)
  const secondary = useStore(toolStore, (s) => s.secondary)
  const recent = useStore(toolStore, (s) => s.recent)
  const [hsv, setHsv] = useState<HSV>(() => rgbToHsv(hexToRgb(color)))
  const [hexDraft, setHexDraft] = useState(color)
  const [seen, setSeen] = useState(color)
  const [own, setOwn] = useState(color)

  // Follow external changes (eyedropper, swatches) without losing the hue on greys.
  if (color !== seen) {
    setSeen(color)
    setHexDraft(color)
    if (color !== own) {
      const next = rgbToHsv(hexToRgb(color))
      setHsv((prev) => ({ h: next.s < 0.01 || next.v < 0.01 ? prev.h : next.h, s: next.s, v: next.v }))
    }
  }

  const apply = (next: HSV) => {
    setHsv(next)
    const hex = rgbToHex(hsvToRgb(next))
    setOwn(hex)
    tools.setColor(hex)
  }

  const sv = useDrag((x, y) => apply({ ...hsv, s: clamp01(x), v: clamp01(1 - y) }))
  const hue = useDrag((x) => apply({ ...hsv, h: clamp01(x) * 360 }))
  const hueColor = rgbToHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 }))

  return (
    <Section id="color" title="Colour" icon={<Palette size={14} />}>
      <div className="color-panel">
        <div className="sv-box" style={{ background: hueColor }} {...sv} role="slider" aria-label="Saturation and brightness" aria-valuetext={color}>
          <div className="sv-white" />
          <div className="sv-black" />
          <div className="sv-handle" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: color }} />
        </div>
        <div className="hue-bar" {...hue} role="slider" aria-label="Hue" aria-valuenow={Math.round(hsv.h)} aria-valuemin={0} aria-valuemax={360}>
          <div className="hue-handle" style={{ left: `${(hsv.h / 360) * 100}%`, background: hueColor }} />
        </div>
        <div className="color-row">
          <div className="color-chips">
            <button type="button" className="chip chip-secondary" style={{ background: secondary }} onClick={() => tools.swapColors()} aria-label="Secondary colour (click to swap)" data-tip="Secondary  ·  X to swap" />
            <span className="chip chip-primary" style={{ background: color }} aria-label="Current colour" />
          </div>
          <IconButton label="Swap colours" shortcut="X" onClick={() => tools.swapColors()}>
            <ArrowLeftRight size={14} />
          </IconButton>
          <input
            className="hex-input"
            value={hexDraft}
            spellCheck={false}
            aria-label="Hex colour"
            onChange={(e) => {
              setHexDraft(e.target.value)
              const v = e.target.value.trim()
              if (isValidHex(v)) tools.setColor(rgbToHex(hexToRgb(v)))
            }}
            onBlur={() => setHexDraft(color)}
          />
          <span className="hsv-readout">
            {Math.round(hsv.h)}° {Math.round(hsv.s * 100)}% {Math.round(hsv.v * 100)}%
          </span>
        </div>
        <div className="swatch-grid">
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              className={`swatch ${c === color ? 'is-active' : ''}`}
              style={{ background: c }}
              onClick={() => tools.setColor(c)}
              aria-label={c}
              data-tip={c}
            />
          ))}
        </div>
        {recent.length > 0 && (
          <>
            <div className="mini-label">Recently used</div>
            <div className="swatch-row">
              {recent.slice(0, 12).map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`swatch ${c === color ? 'is-active' : ''}`}
                  style={{ background: c }}
                  onClick={() => tools.setColor(c)}
                  aria-label={c}
                  data-tip={c}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </Section>
  )
}
