import { download, exportProject, parseProject } from '../engine/persistence'
import { engine } from '../session'
import { ui, view } from '../state/ui'

const stamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

export async function exportPng() {
  const blob = await engine.exportPNG(true)
  download(blob, `atelier-${stamp()}.png`)
  ui.toast('Exported PNG')
}

export async function saveProject() {
  const blob = await exportProject(engine)
  download(blob, `atelier-${stamp()}.atelier`)
  ui.toast('Project saved')
}

export async function openFile(file: File) {
  try {
    if (file.type.startsWith('image/')) {
      const bmp = await createImageBitmap(file)
      engine.importImage(bmp, file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Image')
      bmp.close?.()
      ui.toast(`Imported “${file.name}” as a new layer`)
      return
    }
    const doc = await parseProject(await file.text())
    await engine.load(doc)
    view.fit(engine.width, engine.height)
    ui.toast(`Opened “${file.name}”`)
  } catch (err) {
    ui.toast(err instanceof Error ? err.message : 'Could not open file', 'warn')
  }
}
