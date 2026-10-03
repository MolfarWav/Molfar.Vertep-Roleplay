import { useApp } from '@/lib/store'
import { resolveLanguage, type Lang } from '@/lib/i18n'

/** The effective UI language, for things `useT` does not cover (decimal signs). */
export function useLang(): Lang {
  return resolveLanguage(useApp((s) => s.settings.language))
}
