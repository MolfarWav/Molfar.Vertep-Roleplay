import { useMemo, useState } from 'react'
import { CircleNotch, Play, Warning, Check } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useT } from '@/hooks/use-t'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { NativeSelect } from './card-form'
import type { Dry } from './try-panel'

/**
 * The top of the Try tab: run the trial on a real chat. "Fill" copies what the agent would receive in that chat and the
 * memory it keeps there into the boxes below (the chat is only read); "Run with the model" then asks the chat's model
 * what the agent's questions ask, once, and puts its answers into the boxes, so every trial after that costs nothing.
 */
export function ChatTrial({ dry, calls, titleOf }: { dry: Dry; calls: number; titleOf: (id: string) => string }) {
  const t = useT()
  const chats = useApp((s) => s.chats)
  const characters = useApp((s) => s.characters)
  const list = useMemo(() => [...chats].filter((c) => !c.temporary).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)).slice(0, 100), [chats])
  const [chosen, setChosen] = useState('')
  // the newest chat is the one most people mean, so one press is enough
  const pick = list.some((c) => c.id === chosen) ? chosen : (list[0]?.id ?? '')
  const { edits, busy, note, fromChat, askModel } = dry
  const mark = edits.chat
  const models = mark ? [...new Set(Object.values(mark.models).filter(Boolean))] : []
  const label = (c: (typeof list)[number]) => {
    const who = characters.find((x) => x.id === c.characterId)?.name
    const n = c.messageCount ?? c.messages.length
    return `${c.title || t('fg.chat.untitled')}${who ? ` · ${who}` : ''} · ${n}`
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3" aria-label={t('fg.chat.title')} data-testid="try-chat">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('fg.chat.title')}</h4>
      {list.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="try-chat-none">{t('fg.chat.none')}</p>
      ) : (
        <>
          <p className="text-caption text-muted-foreground">{t('fg.chat.lead')}</p>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="min-w-0 flex-1">
              <NativeSelect value={pick} onChange={setChosen} label={t('fg.chat.pick')}>
                {list.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}
              </NativeSelect>
            </div>
            <Button variant="outline" size="sm" className="shrink-0 max-md:h-10" disabled={!pick || busy !== null} onClick={() => void fromChat(pick)} data-testid="try-chat-fill">
              {busy === 'probe' && <CircleNotch className="size-3.5 animate-spin" aria-hidden="true" />}
              {t(mark ? 'fg.chat.refill' : 'fg.chat.fill')}
            </Button>
          </div>
        </>
      )}

      {mark && (
        <>
          <p role="status" className="text-xs" data-testid="try-chat-filled">
            {t('fg.chat.filled', { title: mark.title || t('fg.chat.untitled'), n: mark.messages })}
            {mark.empty.length > 0 && <span className="text-muted-foreground"> {t('fg.chat.empty', { what: mark.empty.join(', ') })}</span>}
          </p>
          <div className="flex flex-col gap-2 border-t border-border pt-2">
            {calls === 0 ? (
              <p className="text-caption text-muted-foreground">{t('fg.chat.noCalls')}</p>
            ) : (
              <>
                <p className="text-caption text-muted-foreground" data-testid="try-chat-cost">
                  {t('fg.chat.cost', { model: models.length ? models.join(', ') : t('fg.chat.appModel'), n: calls })}
                </p>
                <Button size="sm" className="self-start max-md:h-10 max-md:self-stretch" disabled={busy !== null} onClick={() => void askModel()} data-testid="try-chat-run">
                  {busy === 'live' ? <CircleNotch className="size-3.5 animate-spin" aria-hidden="true" /> : <Play className="size-3.5" weight="fill" aria-hidden="true" />}
                  {busy === 'live' ? t('fg.chat.asking') : t('fg.chat.run', { n: calls })}
                </Button>
              </>
            )}
            {note && (
              <div role="status" className="flex flex-col gap-1 text-xs" data-testid="try-chat-note">
                {note.stopped ? (
                  <p className="flex items-start gap-1.5 text-destructive"><Warning className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /><span>{t('fg.chat.stopped', { why: note.stopped })}</span></p>
                ) : (
                  <p className={cn('flex items-start gap-1.5', note.failed.length ? 'text-foreground' : 'text-emerald-600 dark:text-emerald-400')}>
                    <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    <span>{t('fg.chat.asked', { model: note.models.join(', ') || t('fg.chat.appModel'), n: note.calls, input: note.input.toLocaleString(), output: note.output.toLocaleString() })}</span>
                  </p>
                )}
                {note.failed.map((f) => (
                  <p key={f.node} className="flex items-start gap-1.5 text-destructive"><Warning className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /><span className="min-w-0 break-words">{t('fg.chat.noneFor', { card: titleOf(f.node), why: f.error })}</span></p>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}
