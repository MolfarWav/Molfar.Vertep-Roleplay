import { useApp } from '@/lib/store'
import { relativeTime, resolveLanguage, t, type Lang, type MsgKey, type Vars } from '@/lib/i18n'

/** `t` bound to the language setting: the component re-renders when it changes. */
export function useT(): (key: MsgKey, vars?: Vars) => string {
  const setting = useApp((s) => s.settings.language)
  const lang: Lang = resolveLanguage(setting)
  return (key, vars) => t(key, lang, vars)
}

/** Relative time ("2h ago" / "2 год тому") in the setting's language. */
export function useRelativeTime(): (ts: number) => string {
  const setting = useApp((s) => s.settings.language)
  const lang: Lang = resolveLanguage(setting)
  return (ts) => relativeTime(ts, lang)
}
