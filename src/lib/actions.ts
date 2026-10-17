import { NOT_A_PROJECT, download, exportProject, parseProject } from '../engine/persistence'
import { t } from '../i18n'
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
  ui.toast(t('toasts.exported'))
}

export async function saveProject() {
  const blob = await exportProject(engine)
  download(blob, `atelier-${stamp()}.atelier`)
  ui.toast(t('toasts.saved'))
}

export async function openFile(file: File) {
  try {
    if (file.type.startsWith('image/')) {
      const bmp = await createImageBitmap(file)
      const name = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || engine.naming.layer(engine.layerCount + 1)
      engine.importImage(bmp, name)
      bmp.close?.()
      ui.toast(t('toasts.imported', { name: file.name }))
      return
    }
    const doc = await parseProject(await file.text())
    await engine.load(doc)
    view.fit(engine.width, engine.height)
    ui.toast(t('toasts.opened', { name: file.name }))
  } catch (err) {
    const notProject = err instanceof Error && err.message === NOT_A_PROJECT
    ui.toast(t(notProject ? 'errors.notProject' : 'errors.openFailed'), 'warn')
  }
}
