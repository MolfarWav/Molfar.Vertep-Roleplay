/** The toast for an earned skill (#106). The needs-you source (lib/attention.ts) polls the Library's chat list,
 *  which carries no skill counts, so this rides on the chat's own record when a view already has it. */
import { toast } from 'sonner'
import type { LitSkill } from '@/components/library/litopys-api'
import { t, resolveLanguage } from '@/lib/i18n'
import { useApp } from '@/lib/store'
import { takeEarned } from './skill-earned'

const BTN = 'max-md:!h-10 max-md:!px-3'

/** Toasts once per call when a skill was earned since this browser last showed one (see `takeEarned`). */
export function announceEarned(chatId: string, skills: readonly LitSkill[] | undefined, opts: { quiet?: boolean } = {}) {
  if (!skills) return
  const hit = takeEarned(chatId, skills, opts)
  if (!hit) return
  const st = useApp.getState()
  const lang = resolveLanguage(st.settings.language)
  const phone = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches
  toast.success(t('lit.skills.toast', lang, { who: hit.skill.who, name: hit.skill.name }), {
    id: `skill-earned-${chatId}`,
    description: hit.more > 0 ? t('lit.skills.toast.more', lang, { n: hit.more }) : undefined,
    duration: 12_000,
    position: phone ? 'bottom-center' : undefined,
    action: {
      label: t('lit.skills.toast.open', lang),
      onClick: () => { useApp.setState({ ledgerTabRequest: 'skills' }); useApp.getState().focusLibraryChat(chatId) },
    },
    classNames: { actionButton: BTN },
  })
}
