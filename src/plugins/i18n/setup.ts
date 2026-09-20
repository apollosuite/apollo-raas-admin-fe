import type { App } from 'vue'

import { createI18n } from 'vue-i18n'

import en from './en.json'
import zh from './zh.json'

/**
 * The app's i18n instance, as a value rather than an installed plugin, so tests
 * can register the exact same instance (and pick a locale) via
 * `mount(..., { global: { plugins: [createAppI18n()] } })`.
 */
export function createAppI18n(locale: 'en' | 'zh' = 'en') {
  return createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'en',
    messages: {
      zh,
      en,
    },
  })
}

export function setupI18n(app: App) {
  app.use(createAppI18n())
}
