import { analyzePalette, type PaletteRequest } from './palette'

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<{ id: number; req: PaletteRequest }>) => void) | null
  postMessage(msg: unknown): void
}

ctx.onmessage = (e) => {
  const { id, req } = e.data
  ctx.postMessage({ id, result: analyzePalette(req) })
}
