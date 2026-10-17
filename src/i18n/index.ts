import { useMemo } from 'react'
import { createStore, useStore } from '../state/store'
import en, { type Messages } from './locales/en'
import type { DeepPartial, Leaves, Params, Plural } from './types'

export type { Messages } from './locales/en'
export type MessageKey = Leaves<Messages>

// ---------------------------------------------------------------------------
// Locale registry. To add a language: create `locales/<code>.ts` exporting a
// `Messages` object (type-checked against English) and add one line here.
// Missing strings in a partial locale fall back to English.
// ---------------------------------------------------------------------------

export interface LocaleInfo {
  code: string
  /** Name of the language in that language. */
  name: string
  load: () => Promise<{ default: DeepPartial<Messages> }>
}

export const LOCALES = [
  { code: 'en', name: 'English', load: () => Promise.resolve({ default: en }) },
  { code: 'es', name: 'Español', load: () => import('./locales/es') },
] as const satisfies readonly LocaleInfo[]

export type LocaleCode = (typeof LOCALES)[number]['code']

const STORAGE_KEY = 'atelier.locale'
const DEFAULT_LOCALE: LocaleCode = 'en'

const isLocale = (code: string | null | undefined): code is LocaleCode => LOCALES.some((l) => l.code === code)

/** Saved choice first, then the browser's preferred languages, then English. */
export function detectLocale(): LocaleCode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isLocale(saved)) return saved
  } catch {
    /* storage unavailable */
  }
  const prefs = typeof navigator !== 'undefined' ? (navigator.languages ?? [navigator.language]) : []
  for (const lang of prefs) {
    const base = lang?.toLowerCase().split('-')[0]
    if (isLocale(base)) return base
  }
  return DEFAULT_LOCALE
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface I18nState {
  locale: LocaleCode
  messages: DeepPartial<Messages>
}

export const i18nStore = createStore<I18nState>({ locale: DEFAULT_LOCALE, messages: en })

type LocaleListener = (next: LocaleCode, prev: LocaleCode) => void
const localeListeners = new Set<LocaleListener>()

/** Run something whenever the language changes (e.g. rename default layer names). */
export function onLocaleChange(fn: LocaleListener) {
  localeListeners.add(fn)
  return () => localeListeners.delete(fn)
}

let requestId = 0

export async function setLocale(code: LocaleCode, opts: { persist?: boolean } = {}) {
  const request = ++requestId
  const info = LOCALES.find((l) => l.code === code) ?? LOCALES[0]
  let messages: DeepPartial<Messages> = en
  try {
    messages = (await info.load()).default
  } catch {
    code = DEFAULT_LOCALE
  }
  // A newer choice was made while this language was downloading – it wins.
  if (request !== requestId) return
  const prev = i18nStore.get().locale
  i18nStore.set({ locale: code, messages })
  if (opts.persist !== false) {
    try {
      localStorage.setItem(STORAGE_KEY, code)
    } catch {
      /* ignore */
    }
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = code
    document.title = translate(i18nStore.get(), 'app.documentTitle')
  }
  if (prev !== code) for (const l of localeListeners) l(code, prev)
}

/** Resolves once the initial language is loaded – render after this to avoid a flash of English. */
export const i18nReady: Promise<void> =
  typeof window === 'undefined' ? Promise.resolve() : setLocale(detectLocale(), { persist: false })

// ---------------------------------------------------------------------------
// Lookup, interpolation, plurals and number formatting
// ---------------------------------------------------------------------------

function lookup(tree: unknown, key: string): string | Plural | undefined {
  let node = tree
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' || (node && typeof node === 'object' && '__plural' in node)
    ? (node as string | Plural)
    : undefined
}

const pluralRules = new Map<string, Intl.PluralRules>()
function pluralCategory(locale: string, n: number) {
  let rules = pluralRules.get(locale)
  if (!rules) {
    rules = new Intl.PluralRules(locale)
    pluralRules.set(locale, rules)
  }
  return rules.select(n) as Exclude<keyof Plural, '__plural'>
}

function interpolate(text: string, params?: Params) {
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m))
}

function translate(state: I18nState, key: string, params?: Params): string {
  const msg = lookup(state.messages, key) ?? lookup(en, key)
  if (msg === undefined) {
    if (import.meta.env.DEV) console.warn(`[i18n] missing message: ${key}`)
    return key
  }
  if (typeof msg === 'string') return interpolate(msg, params)
  const count = Number(params?.count ?? 0)
  const form = msg[pluralCategory(state.locale, count)] ?? msg.other
  return interpolate(form, params)
}

const numberFormats = new Map<string, Intl.NumberFormat>()
function numberFormat(locale: string, opts: Intl.NumberFormatOptions) {
  const key = `${locale}|${JSON.stringify(opts)}`
  let f = numberFormats.get(key)
  if (!f) {
    f = new Intl.NumberFormat(locale, opts)
    numberFormats.set(key, f)
  }
  return f
}

export interface I18n {
  locale: LocaleCode
  t: (key: MessageKey, params?: Params) => string
  /** Percentage of a 0..1 share, e.g. 0.125 → "12.5%" / "12,5 %". */
  percent: (share: number, digits?: number) => string
  number: (value: number, digits?: number) => string
}

function makeI18n(state: I18nState): I18n {
  return {
    locale: state.locale,
    t: (key, params) => translate(state, key, params),
    percent: (share, digits = 0) =>
      numberFormat(state.locale, { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(
        share,
      ),
    number: (value, digits = 0) =>
      numberFormat(state.locale, { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(value),
  }
}

/** Translate outside React (toasts, actions). Uses the current language. */
export function t(key: MessageKey, params?: Params): string {
  return translate(i18nStore.get(), key, params)
}

/** Current-language helpers for non-React code. */
export function i18n(): I18n {
  return makeI18n(i18nStore.get())
}

/** React hook – components re-render when the language changes. */
export function useI18n(): I18n {
  const state = useStore(i18nStore, (s) => s)
  return useMemo(() => makeI18n(state), [state])
}
