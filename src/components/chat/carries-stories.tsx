import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CaretRight } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import type { useT } from '@/hooks/use-t'
import { fetchCardMemory, type MemSource } from '@/components/character/memory-api'
import { fetchLitLinks } from '@/components/library/litopys-api'
import { storyChoices, withStoryChoice } from '@/lib/carries'
import { getChatMemorySources, setChatMemorySources, type ChatMemorySources } from '@/lib/engine'
import { cn } from '@/lib/utils'

type T = ReturnType<typeof useT>
interface Loaded { sources: MemSource[]; links: Record<string, { from: string }>; overrides: ChatMemorySources | null }

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** "Stories in this chat": which of the card's stories feed this chat. Read when opened; every switch is saved at once
 *  into the chat (meta.memory.sources) and `onChanged` reads the numbers again. Only this chat changes. */
export function StoryChoices({ chatId, cardId, t, onChanged }: { chatId: string; cardId: string; t: T; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState('')
  const latest = useRef<ChatMemorySources | null>(null)

  const load = useCallback(async () => {
    setError('')
    try {
      const [mem, links, overrides] = await Promise.all([
        fetchCardMemory(cardId),
        fetchLitLinks().then((r) => r.links).catch(() => ({})),
        getChatMemorySources(chatId),
      ])
      latest.current = overrides
      setData({ sources: mem.memory.sources, links, overrides })
    } catch (e) {
      setError(errText(e))
    }
  }, [chatId, cardId])
  useEffect(() => { if (open) void load() }, [open, load])

  const save = async (next: ChatMemorySources | null) => {
    const before = latest.current
    latest.current = next
    setData((d) => (d ? { ...d, overrides: next } : d))
    try {
      const stored = await setChatMemorySources(chatId, next)
      latest.current = stored
      setData((d) => (d ? { ...d, overrides: stored } : d))
      onChanged()
    } catch (e) {
      latest.current = before
      setData((d) => (d ? { ...d, overrides: before } : d))
      toast.error(t('carries.saveFailed', { error: errText(e) }))
    }
  }

  const choices = data ? storyChoices(data.sources, chatId, data.links, data.overrides) : []
  const panelId = `carries-stories-${cardId}`
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        data-testid="carries-stories-toggle"
        className="flex min-h-8 w-fit items-center gap-1 rounded-md px-1 text-sm font-medium outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring/60 max-md:min-h-10"
      >
        <CaretRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none', open && 'rotate-90')} aria-hidden="true" />
        {t('carries.stories.toggle')}
      </button>
      {open && (
        <div id={panelId} className="flex flex-col gap-1 rounded-md border border-border bg-muted/30 p-2" data-testid="carries-stories">
          <p className="text-xs text-muted-foreground">{t('carries.stories.hint')}</p>
          {error && <p className="text-xs text-destructive">{t('carries.stories.error', { error })}</p>}
          {!data && !error && <p className="text-xs text-muted-foreground">{t('carries.stories.loading')}</p>}
          {data && choices.length === 0 && <p className="text-xs text-muted-foreground">{t('carries.stories.none')}</p>}
          <ul className="flex flex-col">
            {choices.map((s) => {
              const title = s.title || t('mem.untitled')
              const note = s.own ? t('carries.stories.own') : s.cardOff ? t('carries.stories.cardOff') : s.canon === 'separate' ? t('carries.stories.separate') : ''
              const fixed = s.own || s.cardOff
              return (
                <li key={s.id} className="border-t border-border first:border-t-0" data-testid="carries-story">
                  <label className="flex min-h-10 items-start gap-3 py-1.5">
                    <Switch
                      checked={!fixed && s.checked}
                      disabled={fixed}
                      onCheckedChange={(v) => void save(withStoryChoice(latest.current, s, v))}
                      aria-label={t('carries.stories.use', { title })}
                      className="mt-0.5 max-md:after:-inset-y-4"
                    />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block break-words text-sm', fixed && 'text-muted-foreground')}>{title}</span>
                      {note && <span className="block text-xs text-muted-foreground">{note}</span>}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          {data?.overrides && (
            <Button variant="ghost" size="sm" className="h-auto min-h-8 w-fit max-w-full whitespace-normal py-1.5 text-left max-md:min-h-10" onClick={() => void save(null)}>{t('carries.stories.reset')}</Button>
          )}
        </div>
      )}
    </div>
  )
}
