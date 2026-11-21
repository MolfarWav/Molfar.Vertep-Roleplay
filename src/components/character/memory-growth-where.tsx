import { useId } from 'react'
import { GitBranch } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import type { useT } from '@/hooks/use-t'
import { type MsgKey, resolveLanguage } from '@/lib/i18n'
import { useApp } from '@/lib/store'
import { type GrowthEntry, type GrowthPatch, growthActs, growthReach } from './memory-api'

type T = ReturnType<typeof useT>

/** A chat of the card, as the dialog lists it. */
export interface CardChat { id: string; title: string; updatedAt: number }

/** What the chip under a block says about where it acts: "This story", "This story and 2 more chats", "Every chat of Aria, off in 1 chat" (#450). */
export function whereLabel(e: Pick<GrowthEntry, 'scope' | 'chats' | 'skip'>, name: string, t: T): string {
  const off = e.skip?.length ?? 0
  if (e.scope === 'story') {
    const more = e.chats?.length ?? 0
    if (more) return t('mem.grow.where.storyPlus', { n: more })
    return off ? t('mem.grow.where.storyOff', { n: off }) : t('mem.grow.where.story')
  }
  return off ? t('mem.grow.where.cardOff', { name, n: off }) : t('mem.grow.where.card', { name })
}

/** The chip under an accepted block: where it acts now; pressing it opens the dialog. A button, so it reads and works without hover. */
export function WhereChip({ entry, name, label, t, onOpen }: { entry: GrowthEntry; name: string; label: string; t: T; onOpen: () => void }) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-auto min-h-8 w-fit max-w-full justify-start whitespace-normal py-1 text-left text-caption max-md:min-h-10"
      onClick={onOpen}
      aria-label={t('mem.grow.where.open', { name: label })}
      data-testid="mem-grow-where-chip"
    >
      <GitBranch className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">{whereLabel(entry, name, t)}</span>
    </Button>
  )
}

/**
 * "Where it acts" for one block: every chat of the card or only its story, and chat by chat whether it goes into that chat
 * (#450). Every change acts at once through `act` (the plugin's `scope` and `chat` ops); the block is read again from the answer,
 * so the list always shows what is saved. A block the user wrote has no chat to be bound to and can only act everywhere.
 */
export function WhereDialog({ entry, name, label, chats, t, act, busy, onClose }: { entry: GrowthEntry; name: string; label: string; chats: CardChat[]; t: T; act: (patch: GrowthPatch) => Promise<boolean>; busy: boolean; onClose: () => void }) {
  const uid = useId()
  const lang = resolveLanguage(useApp((s) => s.settings.language))
  const bindable = !!entry.from?.chatId
  const mode = entry.scope === 'story' ? 'story' : 'card'
  const rows = [...chats].sort((a, b) => b.updatedAt - a.updatedAt)
  const modes: { id: 'story' | 'card'; title: string; hint: string; disabled: boolean }[] = [
    { id: 'story', title: t('mem.grow.where.mode.story'), hint: t('mem.grow.where.mode.story.hint'), disabled: !bindable },
    { id: 'card', title: t('mem.grow.where.mode.card', { name }), hint: t('mem.grow.where.mode.card.hint'), disabled: false },
  ]
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg" data-testid="mem-grow-where">
        <DialogTitle>{t('mem.grow.where.open', { name: label })}</DialogTitle>
        <DialogDescription>{t('mem.grow.where.hint')}</DialogDescription>

        <fieldset className="flex flex-col gap-2" disabled={busy}>
          <legend className="mb-1 text-caption font-medium">{t('mem.grow.where.mode')}</legend>
          {modes.map((m) => (
            <label key={m.id} className="flex min-h-10 cursor-pointer items-start gap-3 rounded-md border border-border p-2.5 has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
              <input
                type="radio"
                name={`${uid}-mode`}
                className="mt-1 size-4 accent-primary"
                checked={mode === m.id}
                disabled={m.disabled}
                onChange={() => { if (mode !== m.id) void act({ op: 'scope', id: entry.id, scope: m.id }) }}
                data-testid={`mem-grow-where-${m.id}`}
              />
              <span className="min-w-0">
                <span className="block text-body font-medium">{m.title}</span>
                <span className="block text-caption text-muted-foreground">{m.hint}</span>
              </span>
            </label>
          ))}
          {!bindable && <p className="text-caption text-muted-foreground" data-testid="mem-grow-where-nochat">{t('mem.grow.where.noChat')}</p>}
        </fieldset>

        <section className="flex min-h-0 flex-col gap-1" aria-labelledby={`${uid}-chats`}>
          <h4 id={`${uid}-chats`} className="text-caption font-medium">{t('mem.grow.where.chats')}</h4>
          {rows.length === 0 ? (
            <p className="text-caption text-muted-foreground">{t('mem.grow.where.noChats')}</p>
          ) : (
            <ul className="flex max-h-72 flex-col overflow-y-auto" data-testid="mem-grow-where-chats">
              {rows.map((c) => {
                const reach = growthReach(entry, c.id)
                const title = c.title || t('mem.untitled')
                const date = new Date(c.updatedAt).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' })
                return (
                  <li key={c.id} className="border-t border-border first:border-t-0" data-testid="mem-grow-where-chat">
                    <label className="flex min-h-10 items-start gap-3 py-1.5">
                      <Switch
                        checked={growthActs(reach)}
                        disabled={busy}
                        onCheckedChange={(v) => void act({ op: 'chat', id: entry.id, chatId: c.id, apply: v })}
                        aria-label={t('mem.grow.where.use', { title })}
                        className="mt-0.5 max-md:after:-inset-y-4"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-body">{title}</span>
                        <span className="block text-caption text-muted-foreground">{date} · {t(`mem.grow.where.note.${reach}` as MsgKey)}</span>
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
        <div className="flex justify-end">
          <Button size="sm" className="max-md:h-10" onClick={onClose}>{t('home.done')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
