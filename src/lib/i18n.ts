// A deliberately small i18n: only the navigation labels and the section page
// titles go through it. The rest of the app stays English. The language is the
// `language` app setting ('en' | 'uk'); anything else (a fresh install, the
// 'English' string older builds wrote) follows the browser.
//
// Pure module on purpose (no store import): components subscribe through the
// `useT` hook in hooks/use-t.ts, which keeps this in step with the setting.

export type Lang = 'en' | 'uk'

const en = {
  'nav.home': 'Home',
  'nav.chats': 'Chats',
  'nav.characters': 'Characters',
  'nav.marketplace': 'Marketplace',
  'nav.personas': 'Personas',
  'nav.lorebooks': 'Lorebooks',
  'nav.presets': 'Presets',
  'nav.connections': 'Connections',
  'nav.quickreplies': 'Shortcuts',
  'nav.extensions': 'Tools',
  'nav.settings': 'Settings',
  'nav.more': 'More',
} as const

export type MsgKey = keyof typeof en

const uk: Record<MsgKey, string> = {
  'nav.home': 'Головна',
  'nav.chats': 'Чати',
  'nav.characters': 'Персонажі',
  'nav.marketplace': 'Маркет',
  'nav.personas': 'Персони',
  'nav.lorebooks': 'Лорбуки',
  'nav.presets': 'Пресети',
  'nav.connections': 'Підключення',
  'nav.quickreplies': 'Швидкі відповіді',
  'nav.extensions': 'Інструменти',
  'nav.settings': 'Налаштування',
  'nav.more': 'Ще',
}

export const DICTIONARIES: Record<Lang, Record<MsgKey, string>> = { en, uk }

/** The browser's language as one of ours: Ukrainian locales get uk, the rest en. */
export function detectLanguage(nav: string | undefined = typeof navigator === 'undefined' ? undefined : navigator.language): Lang {
  return (nav ?? '').toLowerCase().startsWith('uk') ? 'uk' : 'en'
}

/** The effective language for a stored setting value. */
export function resolveLanguage(setting: unknown): Lang {
  return setting === 'uk' || setting === 'en' ? setting : detectLanguage()
}

let current: Lang = detectLanguage()

/** Called by useT whenever the setting changes. */
export function setLanguage(setting: unknown): Lang {
  current = resolveLanguage(setting)
  return current
}

/** Translate a key into the current language (or an explicit one). */
export function t(key: MsgKey, lang: Lang = current): string {
  return DICTIONARIES[lang][key] ?? en[key]
}
