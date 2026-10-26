// A chat that continues an earlier story but still opens with the card's own greeting (#113): the greeting reads
// like a first meeting, the memory above it says otherwise. One line under the first message with a way to edit it.

import { useState } from 'react'
import { GitBranch } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useT } from '@/hooks/use-t'

/** MessageRow listens for this and opens its editor, so the hint does not need to know how editing works. */
export const EDIT_MESSAGE_EVENT = 'rp-edit-message'

const key = (chatId: string) => `rp.openingHint.${chatId}`

function dismissed(chatId: string): boolean {
  try {
    return localStorage.getItem(key(chatId)) === '1'
  } catch {
    return false
  }
}

export function OpeningHint({ chatId, opening }: { chatId: string; opening: { messageId: string; title: string } | null | undefined }) {
  const t = useT()
  const [hidden, setHidden] = useState(() => dismissed(chatId))
  if (!opening || hidden) return null
  const dismiss = () => {
    setHidden(true)
    try {
      localStorage.setItem(key(chatId), '1')
    } catch {
      // private mode: the hint comes back next time, which is harmless
    }
  }
  return (
    <div
      className="my-2 flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs"
      role="note"
      data-testid="opening-hint"
    >
      <div className="flex items-start gap-2">
        <GitBranch className="mt-px size-4 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="break-words">{t('opening.hint', { title: opening.title })}</span>
          <span className="text-[11px] text-muted-foreground">{t('opening.hintBody')}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-10 md:h-7"
          onClick={() => window.dispatchEvent(new CustomEvent(EDIT_MESSAGE_EVENT, { detail: { chatId, messageId: opening.messageId } }))}
        >
          {t('opening.edit')}
        </Button>
        <Button variant="ghost" size="sm" className="h-10 md:h-7" onClick={dismiss}>
          {t('opening.dismiss')}
        </Button>
      </div>
    </div>
  )
}
