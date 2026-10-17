import { Languages } from 'lucide-react'
import { LOCALES, setLocale, useI18n, type LocaleCode } from '../i18n'

/** Language picker – lists every registered locale by its own name. */
export function LanguageSelect() {
  const { locale, t } = useI18n()
  return (
    <label className="lang-select" data-tip={t('common.language')}>
      <Languages size={16} aria-hidden />
      <span className="lang-code" aria-hidden>
        {locale.toUpperCase()}
      </span>
      <select value={locale} aria-label={t('common.language')} onChange={(e) => void setLocale(e.target.value as LocaleCode)}>
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  )
}
