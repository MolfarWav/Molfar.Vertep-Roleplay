import { toast } from 'sonner'
import { t, resolveLanguage } from '@/lib/i18n'
import { useApp } from '@/lib/store'
import { discardPendingTranslation, savePendingTranslation, usePendingTranslations } from '@/lib/card-translate-store'

/** While a translation waits for confirmation a toast asks "Save the translation
 *  of <name>?". It stays until Save or Discard (from here or from the editor's
 *  banner): no timeout, no close button, and leaving the editor keeps it. */
const toastId = (cardId: string) => `translation-pending-${cardId}`

let installed = false
export function installTranslationToasts(): void {
  if (installed) return
  installed = true
  usePendingTranslations.subscribe((state, prev) => {
    const lang = () => resolveLanguage(useApp.getState().settings.language)
    for (const id of Object.keys(state.byId)) {
      if (prev.byId[id]) continue
      const name = useApp.getState().characters.find((c) => c.id === id)?.name ?? id
      toast(t('tr.saveToast', lang(), { name }), {
        id: toastId(id),
        duration: Infinity,
        dismissible: false,
        closeButton: false,
        action: { label: t('tr.save', lang()), onClick: () => savePendingTranslation(id, name) },
        cancel: { label: t('tr.discard', lang()), onClick: () => discardPendingTranslation(id) },
      })
    }
    for (const id of Object.keys(prev.byId)) {
      if (!state.byId[id]) toast.dismiss(toastId(id))
    }
  })
}
