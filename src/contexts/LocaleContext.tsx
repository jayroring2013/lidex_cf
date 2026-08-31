'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { Locale, translations, TranslationKey } from '@/lib/i18n'

interface LocaleContextValue {
  locale:    Locale
  setLocale: (l: Locale) => void
  t:         (key: TranslationKey) => string
}

const LocaleContext = createContext<LocaleContextValue>({
  locale:    'vi',
  setLocale: () => {},
  t:         (key) => translations.vi[key],
})

const STORAGE_KEY = 'lidex_locale'

export function LocaleProvider({ children }: { children: ReactNode }) {
  // Always Vietnamese
  const locale: Locale = 'vi'

  function setLocale(_l: Locale) {
    // No-op for VI only
  }

  function t(key: TranslationKey): string {
    return translations.vi[key] ?? key
  }

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  return useContext(LocaleContext)
}
