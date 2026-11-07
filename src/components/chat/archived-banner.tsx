// What an archived chat (#263) shows instead of the writing tools: a quiet band under the header (what this is, Unarchive,
// Download) and, in place of the composer, a line with the way forward ("Continue in a new chat", #262).
import { Archive, ChatCircleText, DownloadSimple, Lock } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useT } from '@/hooks/use-t'
import { exportChatTxt } from '@/lib/export'
import { unarchiveChat } from '@/lib/archive'
import { continueInNewChat } from '@/lib/continue-chat'
import { useApp } from '@/lib/store'
import type { Chat } from '@/lib/types'

export function ArchivedBanner({ chat }: { chat: Chat }) {
  const t = useT()
  const characters = useApp((s) => s.characters)
  return (
    <div role="status" data-testid="archived-banner" className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-muted/60 px-4 py-2">
      <Archive className="size-4 shrink-0 text-when-pinned" weight="fill" aria-hidden="true" />
      <p className="min-w-0 flex-1 basis-40 text-sm">{t('chat.archived.banner')}</p>
      <div className="flex shrink-0 gap-2">
        <Button variant="outline" size="sm" className="max-sm:h-10" onClick={() => unarchiveChat(chat.id)}>
          {t('chat.archived.unarchive')}
        </Button>
        <Button variant="ghost" size="sm" className="max-sm:size-10 max-sm:px-0" aria-label={t('chat.archived.download')} onClick={() => exportChatTxt(chat, characters)}>
          <DownloadSimple className="size-4" aria-hidden="true" /><span className="max-sm:sr-only">{t('chat.archived.download')}</span>
        </Button>
      </div>
    </div>
  )
}

/** Takes the composer's place. */
export function ArchivedFooter({ chat }: { chat: Chat }) {
  const t = useT()
  return (
    <div data-testid="archived-footer" className="chat-column mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-dashed border-border px-3 py-2.5">
      <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="min-w-0 flex-1 basis-40 text-sm text-muted-foreground">{t('chat.archived.noNew')}</p>
      <Button className="max-sm:h-10 max-sm:w-full" onClick={() => void continueInNewChat(chat.id)}>
        <ChatCircleText className="size-4" aria-hidden="true" />{t('chat.continueNew')}
      </Button>
    </div>
  )
}
