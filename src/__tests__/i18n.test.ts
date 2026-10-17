import { afterAll, describe, expect, it } from 'vitest'
import { COLOR_NAME_IDS } from '../analysis/colorNames'
import { BRUSH_LIST } from '../engine/brushes'
import { BLEND_MODES } from '../engine/Engine'
import { LOCALES, i18n, i18nStore, setLocale, t } from '../i18n'
import en from '../i18n/locales/en'
import type { Plural } from '../i18n/types'
import { formatShare, historyLabel, swatchName } from '../lib/labels'
import { translateName } from '../lib/layerNames'

type Tree = { [k: string]: string | Plural | Tree }
const isPlural = (v: unknown): v is Plural => !!v && typeof v === 'object' && '__plural' in v

/** Flatten a catalog into dotted paths → leaf. */
function leaves(tree: Tree, prefix = ''): Map<string, string | Plural> {
  const out = new Map<string, string | Plural>()
  for (const [k, v] of Object.entries(tree)) {
    const path = `${prefix}${k}`
    if (typeof v === 'string' || isPlural(v)) out.set(path, v)
    else for (const [p, leaf] of leaves(v, `${path}.`)) out.set(p, leaf)
  }
  return out
}

const placeholders = (s: string) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))
const forms = (v: string | Plural) => (typeof v === 'string' ? [v] : Object.entries(v).filter(([k]) => k !== '__plural').map(([, s]) => s as string))

const enLeaves = leaves(en as unknown as Tree)

afterAll(() => setLocale('en', { persist: false }))

describe.each(LOCALES.map((l) => [l.code, l] as const))('locale %s', (_code, info) => {
  it('has exactly the same messages as English', async () => {
    const messages = (await info.load()).default as unknown as Tree
    const own = leaves(messages)
    expect([...own.keys()].filter((k) => !enLeaves.has(k))).toEqual([])
    expect([...enLeaves.keys()].filter((k) => !own.has(k))).toEqual([])
  })

  it('keeps every {placeholder} and has no empty strings', async () => {
    const own = leaves((await info.load()).default as unknown as Tree)
    for (const [key, enValue] of enLeaves) {
      const value = own.get(key)!
      const expected = new Set(forms(enValue).flatMap((f) => [...placeholders(f)]))
      for (const form of forms(value)) {
        expect(form.trim(), key).not.toBe('')
        for (const p of placeholders(form)) expect(expected.has(p), `${key} uses unknown {${p}}`).toBe(true)
      }
      if (isPlural(enValue)) expect(isPlural(value), `${key} must be a plural`).toBe(true)
      else expect(placeholders(value as string), key).toEqual(placeholders(enValue))
    }
  })
})

describe('catalog coverage', () => {
  it('names every brush, colour and blend mode', () => {
    for (const b of BRUSH_LIST) {
      expect(enLeaves.has(`brushes.${b.id}.name`), b.id).toBe(true)
      expect(enLeaves.has(`brushes.${b.id}.description`), b.id).toBe(true)
      for (const c of b.controls) {
        expect(enLeaves.has(`controls.${c.label}`), c.label).toBe(true)
        if (c.hint) expect(enLeaves.has(`hints.${c.hint}`), c.hint).toBe(true)
      }
    }
    for (const id of COLOR_NAME_IDS) expect(enLeaves.has(`colors.${id}`), id).toBe(true)
    for (const m of BLEND_MODES) expect(enLeaves.has(`blend.${m}`), m).toBe(true)
  })
})

describe('translation runtime', () => {
  it('interpolates and picks plural forms', async () => {
    await setLocale('en', { persist: false })
    expect(t('layers.count', { count: 1 })).toBe('1 layer')
    expect(t('layers.count', { count: 3 })).toBe('3 layers')
    expect(t('errors.locked', { name: 'Sky' })).toBe('“Sky” is locked')
    await setLocale('es', { persist: false })
    expect(i18nStore.get().locale).toBe('es')
    expect(t('layers.count', { count: 1 })).toBe('1 capa')
    expect(t('layers.count', { count: 2 })).toBe('2 capas')
    expect(t('topbar.undoWhat', { what: historyLabel(i18n(), 'brush:watercolor') })).toBe('Deshacer trazo de Acuarela')
  })

  it('formats numbers the local way', async () => {
    await setLocale('es', { persist: false })
    expect(formatShare(i18n(), 0.125).replace(/\s/g, ' ')).toBe('12,5 %')
    await setLocale('en', { persist: false })
    expect(formatShare(i18n(), 0.125)).toBe('12.5%')
    expect(formatShare(i18n(), 0.0004)).toBe('<0.1%')
  })

  it('names colour groups with qualifiers', async () => {
    await setLocale('es', { persist: false })
    expect(swatchName(i18n(), { nameId: 'sapGreen', shade: 'light' })).toBe('Verde vejiga (tono claro)')
    await setLocale('en', { persist: false })
    expect(swatchName(i18n(), { nameId: 'paper' })).toBe('Paper')
    expect(swatchName(i18n(), { nameId: 'gray', shade: 2 })).toBe('Gray (2)')
  })

  it('lets the latest language choice win', async () => {
    const slow = setLocale('es', { persist: false })
    const fast = setLocale('en', { persist: false })
    await Promise.all([slow, fast])
    expect(i18nStore.get().locale).toBe('en')
  })

  it('falls back to English and then to the key', async () => {
    await setLocale('en', { persist: false })
    i18nStore.set({ locale: 'es', messages: { layers: { title: 'Capas' } } })
    expect(t('layers.title')).toBe('Capas')
    expect(t('layers.add')).toBe('New layer')
    expect(t('nope.missing' as never)).toBe('nope.missing')
  })
})

describe('translateName', () => {
  const enP = { layer: 'Layer {n}', copy: '{name} copy' }
  const esP = { layer: 'Capa {n}', copy: '{name} copia' }
  it('renames generated names and leaves custom names alone', () => {
    expect(translateName('Layer 2', enP, esP)).toBe('Capa 2')
    expect(translateName('Layer 2 copy copy', enP, esP)).toBe('Capa 2 copia copia')
    expect(translateName('Sky copy', enP, esP)).toBe('Sky copia')
    expect(translateName('Sky', enP, esP)).toBeNull()
    expect(translateName('Capa 7', esP, enP)).toBe('Layer 7')
  })
})
