/** The toast for an earned habit (#106). The needs-you source (lib/attention.ts) polls the Library's chat list,
 *  which carries no habit counts, so this rides on the chat's own record when a view already has it. */
import { toast } from 'sonner'
import type { LitHabit } from '@/components/library/litopys-api'
import { t, resolveLanguage } from '@/lib/i18n'
import { useApp } from '@/lib/store'
import { takeEarned } from './habit-earned'

const BTN = 'max-md:!h-10 max-md:!px-3'

/** Toasts once per call when a habit was earned since this browser last showed one (see `takeEarned`). */
export function announceEarned(chatId: string, habits: readonly LitHabit[] | undefined, opts: { quiet?: boolean } = {}) {
  if (!habits) return
  const hit = takeEarned(chatId, habits, opts)
  if (!hit) return
  const st = useApp.getState()
  const lang = resolveLanguage(st.settings.language)
  const phone = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches
  toast.success(t('lit.habits.toast', lang, { who: hit.habit.who, name: hit.habit.name }), {
    id: `habit-earned-${chatId}`,
    description: hit.more > 0 ? t('lit.habits.toast.more', lang, { n: hit.more }) : undefined,
    duration: 12_000,
    position: phone ? 'bottom-center' : undefined,
    action: {
      label: t('lit.habits.toast.open', lang),
      onClick: () => { useApp.setState({ ledgerTabRequest: 'habits' }); useApp.getState().focusLibraryChat(chatId) },
    },
    classNames: { actionButton: BTN },
  })
}
