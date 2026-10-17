/**
 * Plural message: one string per CLDR plural category. English only needs
 * `one`/`other`, but other languages can fill in `few`, `many`, … as needed.
 */
export interface Plural {
  readonly __plural: true
  zero?: string
  one?: string
  two?: string
  few?: string
  many?: string
  other: string
}

export function plural(forms: Omit<Plural, '__plural'>): Plural {
  return { __plural: true, ...forms }
}

/** A message tree: nested groups whose leaves are strings or plurals. */
export interface MessageTree {
  [key: string]: string | Plural | MessageTree
}

/** Dotted paths to every leaf of a message tree, e.g. `"layers.title"`. */
export type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string | Plural ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>
}[keyof T & string]

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends string | Plural ? T[K] : DeepPartial<T[K]>
}

export type Params = Record<string, string | number>
