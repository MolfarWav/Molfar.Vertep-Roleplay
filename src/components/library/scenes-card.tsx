import { useState } from 'react'
import { CircleNotch, Sparkle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { SceneMarkDialog } from '@/components/chat/scene-mark-dialog'
import { useT } from '@/hooks/use-t'
import { useApp } from '@/lib/store'
import type { LitChat } from './litopys-api'

/**
 * The top of a chat's record: how many messages are in no scene yet, and the two ways to close scenes
 * by hand: ask the model where the story turns, or pick a run of messages. The suggestion itself is
 * reviewed in the dialog; nothing becomes a scene until the reader saves it.
 */
export function ScenesCard({ chat, onRefresh }: { chat: LitChat; onRefresh: () => void }) {
  const t = useT()
  const stored = useApp((s) => s.chats.find((c) => c.id === chat.chatId))
  const ensure = useApp((s) => s.ensureChatMessages)
  const [dialog, setDialog] = useState<'suggested' | 'hand' | null>(null)
  const [busy, setBusy] = useState(false)
  const sug = chat.sceneSuggest
  // an older plugin has no suggestions; a chat with fewer than two messages has nothing to close
  if (!sug || !stored || !chat.hasData || chat.messages < 2) return null

  const open = async (tab: 'suggested' | 'hand') => {
    setBusy(true)
    try {
      await ensure(chat.chatId)
      setDialog(tab)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const status =
    sug.state === 'working'
      ? t('scene.card.working')
      : sug.state === 'done' && sug.scenes.length > 0
        ? t('scene.card.ready', { n: sug.scenes.length })
        : sug.state === 'failed'
          ? t('scene.card.failed')
          : sug.free === 0
            ? t('scene.card.allDone')
            : t('scene.card.free', { n: sug.free, total: chat.messages })

  return (
    <div data-testid="scenes-card" className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-medium">{t('scene.card.title')}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
            {sug.state === 'working' && <CircleNotch className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />}
            {status}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {sug.state === 'done' && sug.scenes.length > 0 ? (
            <Button size="sm" className="min-h-10 sm:min-h-8" disabled={busy} data-testid="scenes-review" onClick={() => void open('suggested')}>
              <Sparkle className="size-4" aria-hidden="true" />
              {t('scene.card.review')}
            </Button>
          ) : (
            <Button
              size="sm"
              variant={sug.state === 'working' ? 'outline' : 'default'}
              className="min-h-10 sm:min-h-8"
              disabled={busy || (sug.state !== 'working' && sug.free < 2)}
              data-testid="scenes-suggest"
              onClick={() => void open('suggested')}
            >
              <Sparkle className="size-4" aria-hidden="true" />
              {sug.state === 'working' ? t('scene.card.show') : t('scene.card.suggest')}
            </Button>
          )}
          <Button size="sm" variant="ghost" className="min-h-10 sm:min-h-8" disabled={busy} data-testid="scenes-hand" onClick={() => void open('hand')}>
            {t('scene.card.hand')}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t('scene.card.hint')}</p>
      {dialog && stored && <SceneMarkDialog chat={stored} tab={dialog} onClose={() => { setDialog(null); onRefresh() }} />}
    </div>
  )
}
