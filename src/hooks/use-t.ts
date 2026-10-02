import { useApp } from '@/lib/store'
import { resolveLanguage, t, type Lang, type MsgKey } from '@/lib/i18n'

/** `t` bound to the language setting: the component re-renders when it changes. */
export function useT(): (key: MsgKey) => string {
  const setting = useApp((s) => s.settings.language)
  const lang: Lang = resolveLanguage(setting)
  return (key) => t(key, lang)
}
