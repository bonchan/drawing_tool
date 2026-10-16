const TEXT_INPUTS = new Set(['text', 'search', 'email', 'number', 'password', 'url', 'tel'])

/** True when keystrokes belong to a text field rather than to shortcuts. */
export function isTyping(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  if (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true
  return t instanceof HTMLInputElement && TEXT_INPUTS.has(t.type)
}

/** Drop focus from form controls/buttons so keyboard shortcuts reach the app. */
export function releaseFocus() {
  const el = document.activeElement
  if (el instanceof HTMLElement && el !== document.body) el.blur()
}
