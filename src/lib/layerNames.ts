/** Name patterns from the i18n catalogs, e.g. `Layer {n}` and `{name} copy`. */
export interface NamePatterns {
  layer: string
  copy: string
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const patternRe = (pattern: string) =>
  new RegExp(`^${escapeRe(pattern).replace('\\{n\\}', '(\\d+)').replace('\\{name\\}', '(.+)')}$`)

/**
 * Auto-generated names ("Layer 2", "Layer 2 copy") follow the language; names
 * the user typed are left alone.
 */
export function translateName(name: string, from: NamePatterns, to: NamePatterns): string | null {
  const copy = patternRe(from.copy).exec(name)
  if (copy) return to.copy.replace('{name}', translateName(copy[1], from, to) ?? copy[1])
  const layer = patternRe(from.layer).exec(name)
  if (layer) return to.layer.replace('{n}', layer[1])
  return null
}
