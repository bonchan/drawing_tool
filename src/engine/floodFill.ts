export interface FillResult {
  mask: Uint8Array
  x0: number
  y0: number
  x1: number
  y1: number
  count: number
}

/**
 * Scanline flood fill. Returns a 0/1 mask of the connected region whose colour
 * is within `tolerance` (0..1) of the seed pixel.
 */
export function floodFillMask(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  sx: number,
  sy: number,
  tolerance: number,
): FillResult | null {
  sx = Math.floor(sx)
  sy = Math.floor(sy)
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null
  const tol = Math.round(Math.max(0, Math.min(1, tolerance)) * 255)
  const si = (sy * w + sx) * 4
  const tr = data[si]
  const tg = data[si + 1]
  const tb = data[si + 2]
  const ta = data[si + 3]
  const transparentSeed = ta < 8

  const matches = (i: number) => {
    const o = i * 4
    const a = data[o + 3]
    if (transparentSeed) return a <= Math.max(8, tol)
    if (Math.abs(a - ta) > tol) return false
    return (
      Math.abs(data[o] - tr) <= tol &&
      Math.abs(data[o + 1] - tg) <= tol &&
      Math.abs(data[o + 2] - tb) <= tol
    )
  }

  const mask = new Uint8Array(w * h)
  const stack: number[] = [sx, sy]
  let x0 = sx
  let x1 = sx
  let y0 = sy
  let y1 = sy
  let count = 0
  while (stack.length) {
    const y = stack.pop()!
    let x = stack.pop()!
    let i = y * w + x
    // walk left
    while (x > 0 && !mask[i - 1] && matches(i - 1)) {
      x--
      i--
    }
    let spanUp = false
    let spanDown = false
    while (x < w && !mask[i] && matches(i)) {
      mask[i] = 1
      count++
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
      if (y > 0) {
        const up = i - w
        const m = !mask[up] && matches(up)
        if (m && !spanUp) {
          stack.push(x, y - 1)
          spanUp = true
        } else if (!m) spanUp = false
      }
      if (y < h - 1) {
        const dn = i + w
        const m = !mask[dn] && matches(dn)
        if (m && !spanDown) {
          stack.push(x, y + 1)
          spanDown = true
        } else if (!m) spanDown = false
      }
      x++
      i++
    }
  }
  if (count === 0) return null
  return { mask, x0, y0, x1: x1 + 1, y1: y1 + 1, count }
}

/** Grow a mask by `r` pixels (square kernel) so fills tuck under anti-aliased line edges. */
export function dilateMask(res: FillResult, w: number, h: number, r: number): FillResult {
  if (r <= 0) return res
  const src = res.mask
  const tmp = new Uint8Array(w * h)
  const out = new Uint8Array(w * h)
  const x0 = Math.max(0, res.x0 - r)
  const x1 = Math.min(w, res.x1 + r)
  const y0 = Math.max(0, res.y0 - r)
  const y1 = Math.min(h, res.y1 + r)
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      let v = 0
      for (let k = -r; k <= r && !v; k++) {
        const xx = x + k
        if (xx >= 0 && xx < w) v = src[y * w + xx]
      }
      tmp[y * w + x] = v
    }
  }
  let count = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      let v = 0
      for (let k = -r; k <= r && !v; k++) {
        const yy = y + k
        if (yy >= 0 && yy < h) v = tmp[yy * w + x]
      }
      out[y * w + x] = v
      count += v
    }
  }
  return { mask: out, x0, y0, x1, y1, count }
}
