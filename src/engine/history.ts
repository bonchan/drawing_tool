export interface HistoryEntry<L extends string = string> {
  label: L
  /** Approximate memory held by this entry, used to cap total history size. */
  bytes: number
  undo(): void
  redo(): void
}

const MAX_ENTRIES = 80
const MAX_BYTES = 320 * 1024 * 1024

export class History<L extends string = string> {
  private past: HistoryEntry<L>[] = []
  private future: HistoryEntry<L>[] = []
  private bytes = 0

  push(entry: HistoryEntry<L>) {
    this.past.push(entry)
    this.bytes += entry.bytes
    for (const f of this.future) this.bytes -= f.bytes
    this.future = []
    while (this.past.length > MAX_ENTRIES || (this.bytes > MAX_BYTES && this.past.length > 1)) {
      const old = this.past.shift()!
      this.bytes -= old.bytes
    }
  }

  undo(): HistoryEntry<L> | null {
    const e = this.past.pop()
    if (!e) return null
    e.undo()
    this.future.push(e)
    return e
  }

  redo(): HistoryEntry<L> | null {
    const e = this.future.pop()
    if (!e) return null
    e.redo()
    this.past.push(e)
    return e
  }

  clear() {
    this.past = []
    this.future = []
    this.bytes = 0
  }

  get canUndo() {
    return this.past.length > 0
  }
  get canRedo() {
    return this.future.length > 0
  }
  get undoLabel() {
    return this.past[this.past.length - 1]?.label ?? null
  }
  get redoLabel() {
    return this.future[this.future.length - 1]?.label ?? null
  }
}
