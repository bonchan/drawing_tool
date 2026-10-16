import type { Engine, SerializedDoc } from './Engine'

const DB_NAME = 'atelier'
const STORE = 'documents'
const KEY = 'autosave'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode)
      const req = fn(t.objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

export async function loadAutosave(): Promise<SerializedDoc | null> {
  try {
    const doc = await tx<SerializedDoc | undefined>('readonly', (s) => s.get(KEY))
    return doc && doc.version === 1 && doc.layers?.length ? doc : null
  } catch {
    return null
  }
}

export async function saveAutosave(engine: Engine): Promise<void> {
  const doc = await engine.serialize()
  await tx('readwrite', (s) => s.put(doc, KEY))
}

// ---------------------------------------------------------------- project files

interface ProjectFile extends Omit<SerializedDoc, 'layers'> {
  app: 'atelier'
  layers: Array<Omit<SerializedDoc['layers'][number], 'png'> & { png: string }>
}

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(b)
  })

export async function exportProject(engine: Engine): Promise<Blob> {
  const doc = await engine.serialize()
  const file: ProjectFile = {
    ...doc,
    app: 'atelier',
    layers: await Promise.all(doc.layers.map(async (l) => ({ ...l, png: await blobToDataUrl(l.png) }))),
  }
  return new Blob([JSON.stringify(file)], { type: 'application/json' })
}

export async function parseProject(text: string): Promise<SerializedDoc> {
  const file = JSON.parse(text) as ProjectFile
  if (file.app !== 'atelier' || file.version !== 1 || !Array.isArray(file.layers)) {
    throw new Error('Not an Atelier project file')
  }
  const layers = await Promise.all(
    file.layers.map(async (l) => ({ ...l, png: await (await fetch(l.png)).blob() })),
  )
  return { ...file, layers }
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
