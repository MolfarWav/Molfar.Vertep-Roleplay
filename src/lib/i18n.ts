// A deliberately small i18n: the navigation labels, the section page titles and
// the Home page go through it. The rest of the app stays English. The language
// is the `language` app setting ('en' | 'uk'); anything else (a fresh install,
// the 'English' string older builds wrote) follows the browser.
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

  'home.pickUp': 'Pick up the story',
  'home.continue': 'Continue',
  'home.branches': 'Branches',
  'home.newChat': 'New chat',
  'home.persona': 'Persona',
  'home.lorebook': 'Lorebook',
  'home.msgs': 'msgs',
  'home.noModel': 'no model',
  'home.emptyTitle': 'Your story starts here',
  'home.emptyText': 'Create a character or import a card, then start a chat.',
  'home.pickCharacter': 'Pick a character',
  'home.create': 'Create',
  'home.createText': 'From scratch, from a PNG/JSON card, or let Molfar draft it.',
  'home.newCharacter': 'New character',
  'home.importCard': 'Import card',
  'home.withMolfar': 'With Molfar',
  'home.ask': 'Ask Molfar',
  'home.askText': 'It works in your workshop: characters, dashboards, plugins.',
  'home.askPlaceholder': 'What should it do?',
  'home.askOpen': 'Open Molfar',
  'home.askError': 'Could not open Molfar',
  'home.chip1': 'character from a description',
  'home.chip2': 'my own dashboard',
  'home.chip3': 'Litopys review',
  'home.achievements': 'Achievements',
  'home.marathon': 'Marathon',
  'home.archivist': 'Archivist',
  'home.puppeteer': 'Puppeteer',
  'home.firstContact': 'First Contact',
  'home.branching': 'Branching Out',
  'home.statMessages': 'Messages',
  'home.statChats': 'Chats',
  'home.statCharacters': 'Characters',
  'home.recent': 'Recent chats',
  'home.allChats': 'All chats',
  'home.all': 'All',
  'home.character': 'Character',
  'home.noMatch': 'No chats match these filters.',
  'home.noChatsYet': 'No chats yet.',
  'home.showAll': 'Show all ({n})',
  'home.select': 'Select',
  'home.cancel': 'Cancel',
  'home.selectAll': 'Select all',
  'home.selectedN': '{n} selected',
  'home.deleteN': 'Delete {n}',
  'home.deleteChat': 'Delete chat',
  'home.delete': 'Delete',
  'home.confirmOne': 'Delete this chat?',
  'home.confirmMany': 'Delete {n} chats?',
  'home.confirmBodyOne': 'This permanently removes "{name}" and all its messages. This cannot be undone.',
  'home.confirmBodyMany': 'This permanently removes {n} chats and all their messages. This cannot be undone.',
  'home.busy': 'A reply is being generated in this chat. Stop it first.',
  'home.busySkipped': 'The chat that is generating a reply was left out.',
  'home.deletedOne': 'Chat deleted',
  'home.deletedMany': 'Deleted {n} chats',
  'home.myApps': 'My apps',
  'home.appPlaceholderTitle': 'A new app',
  'home.appPlaceholder': 'Molfar can build an app for you; it appears here.',
  'home.filterBy': 'Filter chats',
  'time.now': 'just now',
  'time.m': '{n}m ago',
  'time.h': '{n}h ago',
  'time.d': '{n}d ago',
  'time.mo': '{n}mo ago',
  'dashboard.trimmed': 'The dashboard insert did not fit its limit (about {need} of {limit} tokens), so {what} was left out of the prompt. Raise "Insert limit" in Tools → Relationship dashboard.',
  'dashboard.trim.others': 'the lines about the other characters',
  'dashboard.trim.notebooks': 'what the characters know about you',
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

  'home.pickUp': 'Продовжити історію',
  'home.continue': 'Продовжити',
  'home.branches': 'Гілки',
  'home.newChat': 'Новий чат',
  'home.persona': 'Персона',
  'home.lorebook': 'Лорбук',
  'home.msgs': 'повід.',
  'home.noModel': 'без моделі',
  'home.emptyTitle': 'Твоя історія починається тут',
  'home.emptyText': 'Створи персонажа або імпортуй картку, а тоді почни чат.',
  'home.pickCharacter': 'Обрати персонажа',
  'home.create': 'Створити',
  'home.createText': 'З нуля, з картки PNG/JSON, або нехай Мольфар зробить чернетку.',
  'home.newCharacter': 'Новий персонаж',
  'home.importCard': 'Імпорт картки',
  'home.withMolfar': 'З Мольфаром',
  'home.ask': 'Запитай Мольфара',
  'home.askText': 'Він працює у твоїй майстерні: персонажі, дашборди, плагіни.',
  'home.askPlaceholder': 'Що зробити?',
  'home.askOpen': 'Відкрити Мольфара',
  'home.askError': 'Не вдалося відкрити Мольфара',
  'home.chip1': 'персонаж з опису',
  'home.chip2': 'свій дашборд',
  'home.chip3': 'огляд Літопису',
  'home.achievements': 'Досягнення',
  'home.marathon': 'Марафон',
  'home.archivist': 'Архіваріус',
  'home.puppeteer': 'Лялькар',
  'home.firstContact': 'Перший контакт',
  'home.branching': 'Розгалуження',
  'home.statMessages': 'Повідомлення',
  'home.statChats': 'Чати',
  'home.statCharacters': 'Персонажі',
  'home.recent': 'Останні чати',
  'home.allChats': 'Усі чати',
  'home.all': 'Усі',
  'home.character': 'Персонаж',
  'home.noMatch': 'Немає чатів за цими фільтрами.',
  'home.noChatsYet': 'Чатів ще немає.',
  'home.showAll': 'Показати всі ({n})',
  'home.select': 'Вибрати',
  'home.cancel': 'Скасувати',
  'home.selectAll': 'Вибрати всі',
  'home.selectedN': 'Вибрано: {n}',
  'home.deleteN': 'Видалити ({n})',
  'home.deleteChat': 'Видалити чат',
  'home.delete': 'Видалити',
  'home.confirmOne': 'Видалити цей чат?',
  'home.confirmMany': 'Видалити чатів: {n}?',
  'home.confirmBodyOne': 'Це назавжди видалить «{name}» і всі його повідомлення. Скасувати не вийде.',
  'home.confirmBodyMany': 'Це назавжди видалить чатів: {n} з усіма повідомленнями. Скасувати не вийде.',
  'home.busy': 'У цьому чаті зараз генерується відповідь. Спершу зупини її.',
  'home.busySkipped': 'Чат, у якому йде генерація, залишено.',
  'home.deletedOne': 'Чат видалено',
  'home.deletedMany': 'Видалено чатів: {n}',
  'home.myApps': 'Мої застосунки',
  'home.appPlaceholderTitle': 'Новий застосунок',
  'home.appPlaceholder': 'Мольфар може зробити застосунок для тебе, і він з’явиться тут.',
  'home.filterBy': 'Фільтр чатів',
  'time.now': 'щойно',
  'time.m': '{n} хв тому',
  'time.h': '{n} год тому',
  'time.d': '{n} дн. тому',
  'time.mo': '{n} міс. тому',
  'dashboard.trimmed': 'Вставка дашборду не вмістилася в ліміт (потрібно близько {need} з {limit} токенів), тож із промпту випало: {what}. Збільште «Insert limit» в Інструменти → Relationship dashboard.',
  'dashboard.trim.others': 'рядки про інших персонажів',
  'dashboard.trim.notebooks': 'що персонажі знають про вас',
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

export type Vars = Record<string, string | number>

/** Translate a key into the current language (or an explicit one); `{name}`
 *  placeholders are filled from vars. */
export function t(key: MsgKey, lang: Lang = current, vars?: Vars): string {
  const s = DICTIONARIES[lang][key] ?? en[key]
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s
}

/** "just now", "5m ago", "2h ago", … in the given language. */
export function relativeTime(ts: number, lang: Lang = current, now = Date.now()): string {
  const m = Math.floor((now - ts) / 60000)
  if (m < 1) return t('time.now', lang)
  if (m < 60) return t('time.m', lang, { n: m })
  const h = Math.floor(m / 60)
  if (h < 24) return t('time.h', lang, { n: h })
  const d = Math.floor(h / 24)
  if (d < 30) return t('time.d', lang, { n: d })
  return t('time.mo', lang, { n: Math.floor(d / 30) })
}
