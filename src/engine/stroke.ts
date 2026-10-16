/** Raw input sample coming from a pointer event, already in document space. */
export interface InputPoint {
  x: number
  y: number
  pressure: number
  tiltX: number
  tiltY: number
  time: number
  pointerType: string
}

/** A single brush placement along the (smoothed, interpolated) stroke path. */
export interface Dab {
  x: number
  y: number
  /** Effective pressure 0..1 (real pen pressure, or simulated from velocity). */
  pressure: number
  /** Direction of travel in radians. */
  angle: number
  /** Smoothed speed in document px per millisecond. */
  speed: number
  /** Pen tilt (degrees, -90..90) – zero for mice. */
  tiltX: number
  tiltY: number
  /** Distance travelled along the stroke so far. */
  dist: number
  time: number
  /** True only for the very first dab of a stroke. */
  first: boolean
}

export type PressureMode = 'pen-or-full' | 'pen-or-velocity'

export interface StrokeBuilderOptions {
  /** 0..1 – stabiliser strength. */
  smoothing: number
  /** Distance between dabs, as a function of the current pressure. */
  spacing: (pressure: number) => number
  pressureMode: PressureMode
  onDab: (d: Dab) => void
}

interface PathPoint {
  x: number
  y: number
  p: number
  tx: number
  ty: number
  t: number
}

export class StrokeBuilder {
  private opts: StrokeBuilderOptions
  private raw: PathPoint | null = null
  private smoothed: PathPoint | null = null
  private ctrl: PathPoint[] = []
  private carry = 0
  private dist = 0
  private speed = 0
  private angle = 0
  private haveAngle = false
  private velPressure = 0.6
  private emittedFirst = false
  private isPen = false
  lastPoint: InputPoint | null = null

  constructor(opts: StrokeBuilderOptions) {
    this.opts = opts
  }

  private pressureOf(p: InputPoint, speed: number): number {
    if (p.pointerType === 'pen') {
      this.isPen = true
      // Gentle curve so light strokes are easy to control.
      return Math.max(0.02, Math.pow(Math.min(1, p.pressure || 0.0), 0.85))
    }
    if (this.opts.pressureMode === 'pen-or-velocity') {
      const target = Math.max(0.22, Math.min(1, 1.12 - speed / 2.6))
      this.velPressure += (target - this.velPressure) * 0.18
      return this.velPressure
    }
    return 1
  }

  push(p: InputPoint) {
    const prevRaw = this.lastPoint
    this.lastPoint = p
    if (prevRaw) {
      const dt = Math.max(1, p.time - prevRaw.time)
      const d = Math.hypot(p.x - prevRaw.x, p.y - prevRaw.y)
      this.speed += (d / dt - this.speed) * 0.25
    }
    const pressure = this.pressureOf(p, this.speed)
    const pt: PathPoint = { x: p.x, y: p.y, p: pressure, tx: p.tiltX, ty: p.tiltY, t: p.time }
    this.raw = pt
    if (!this.smoothed) {
      this.smoothed = { ...pt }
    } else {
      // Exponential "lazy" stabiliser. Stronger smoothing = slower follow.
      const k = 1 - Math.min(0.95, this.opts.smoothing * 0.93)
      const s = this.smoothed
      s.x += (pt.x - s.x) * k
      s.y += (pt.y - s.y) * k
      s.p += (pt.p - s.p) * Math.max(k, 0.35)
      s.tx = pt.tx
      s.ty = pt.ty
      s.t = pt.t
    }
    this.addControl({ ...this.smoothed })
  }

  /** Flush the stabiliser so the stroke ends exactly where the pen lifted. */
  finish() {
    if (!this.raw || !this.smoothed) return
    const s = this.smoothed
    const r = this.raw
    const gap = Math.hypot(r.x - s.x, r.y - s.y)
    if (gap > 0.5) {
      const steps = Math.min(24, Math.ceil(gap / 3))
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        this.addControl({
          x: s.x + (r.x - s.x) * t,
          y: s.y + (r.y - s.y) * t,
          p: s.p + (r.p - s.p) * t,
          tx: r.tx,
          ty: r.ty,
          t: r.t,
        })
      }
    }
    // Close out the last quadratic segment with a straight run to the final control point.
    const n = this.ctrl.length
    if (n >= 2) {
      const a = this.ctrl[n - 2]
      const b = this.ctrl[n - 1]
      const mid = midpoint(a, b)
      this.walkLine(mid, b)
    } else if (n === 1 && !this.emittedFirst) {
      this.emit(this.ctrl[0], 0)
    }
  }

  private addControl(c: PathPoint) {
    const last = this.ctrl[this.ctrl.length - 1]
    if (last && Math.hypot(c.x - last.x, c.y - last.y) < 0.35) {
      // Pressure can still change while the pen is stationary.
      last.p = c.p
      return
    }
    this.ctrl.push(c)
    const n = this.ctrl.length
    if (n === 1) {
      this.emit(c, 0)
      return
    }
    if (n === 2) {
      // First segment: straight line from the first point to the first midpoint.
      this.walkLine(this.ctrl[0], midpoint(this.ctrl[0], this.ctrl[1]))
      return
    }
    // Quadratic Bézier through midpoints: smooth (C1) curve with one-sample latency.
    const p0 = midpoint(this.ctrl[n - 3], this.ctrl[n - 2])
    const p1 = this.ctrl[n - 2]
    const p2 = midpoint(this.ctrl[n - 2], this.ctrl[n - 1])
    const len = Math.hypot(p1.x - p0.x, p1.y - p0.y) + Math.hypot(p2.x - p1.x, p2.y - p1.y)
    const steps = Math.max(1, Math.min(64, Math.ceil(len / 1.5)))
    let prev = p0
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const it = 1 - t
      const q: PathPoint = {
        x: it * it * p0.x + 2 * it * t * p1.x + t * t * p2.x,
        y: it * it * p0.y + 2 * it * t * p1.y + t * t * p2.y,
        p: it * it * p0.p + 2 * it * t * p1.p + t * t * p2.p,
        tx: p2.tx,
        ty: p2.ty,
        t: p0.t + (p2.t - p0.t) * t,
      }
      this.walkLine(prev, q)
      prev = q
    }
    // Keep memory bounded – only the last few controls matter.
    if (this.ctrl.length > 8) this.ctrl.splice(0, this.ctrl.length - 4)
  }

  /** Walk a straight sub-segment, emitting dabs at the brush spacing. */
  private walkLine(a: PathPoint, b: PathPoint) {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    if (len < 1e-6) return
    const segAngle = Math.atan2(dy, dx)
    if (!this.haveAngle) {
      this.angle = segAngle
      this.haveAngle = true
    } else {
      let d = segAngle - this.angle
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      this.angle += d * 0.35
    }
    let pos = 0
    while (true) {
      const pAt = a.p + (b.p - a.p) * Math.min(1, (pos + this.carry) / len)
      const spacing = Math.max(0.35, this.opts.spacing(pAt))
      const need = spacing - this.carry
      if (pos + need > len) {
        this.carry += len - pos
        break
      }
      pos += need
      this.carry = 0
      const t = pos / len
      const q: PathPoint = {
        x: a.x + dx * t,
        y: a.y + dy * t,
        p: a.p + (b.p - a.p) * t,
        tx: a.tx + (b.tx - a.tx) * t,
        ty: a.ty + (b.ty - a.ty) * t,
        t: a.t + (b.t - a.t) * t,
      }
      this.dist += need
      this.emit(q, this.dist)
    }
  }

  private emit(q: PathPoint, dist: number) {
    const d: Dab = {
      x: q.x,
      y: q.y,
      pressure: q.p,
      angle: this.angle,
      speed: this.speed,
      tiltX: q.tx,
      tiltY: q.ty,
      dist,
      time: q.t,
      first: !this.emittedFirst,
    }
    this.emittedFirst = true
    this.opts.onDab(d)
  }

  get usedPen() {
    return this.isPen
  }
}

function midpoint(a: PathPoint, b: PathPoint): PathPoint {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    p: (a.p + b.p) / 2,
    tx: (a.tx + b.tx) / 2,
    ty: (a.ty + b.ty) / 2,
    t: (a.t + b.t) / 2,
  }
}
