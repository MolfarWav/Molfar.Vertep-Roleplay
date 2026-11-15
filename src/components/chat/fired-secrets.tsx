// "Secrets in this chat" (#416): the chat's secret lorebook entries and who knows each one, read from the chat at every scan.
// A knower can be removed and one added by hand; the engine plugin keeps that list (`lore-known/<chatId>.json`).
import { useId, useState } from 'react'
import { LockSimple, Plus, X } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Fold } from '@/components/ui/fold'
import { Input } from '@/components/ui/input'
import { j } from '@/lib/engine'
import type { T } from '@/components/memory/trace-parts'

/** One person who knows an entry, and how they came to: from the start, heard a reveal word, or added by hand. */
export interface LoreKnower {
  name: string
  how: 'start' | 'heard' | 'manual'
  word?: string
}
export interface LoreKnownEntry {
  /** "<bookId>#<uid>" */
  key: string
  bookId: string
  book: string
  title: string
  cover: boolean
  reveal: string[]
  knowers: LoreKnower[]
}
/** GET /lore-known: the chat's secret entries, and the names to suggest (the latest Dashboard scene and the player's character). */
export interface LoreKnown {
  chatId: string
  entries: LoreKnownEntry[]
  people: string[]
}

export const loadLoreKnown = (chatId: string) => j<LoreKnown>(`/lore-known?chatId=${encodeURIComponent(chatId)}`)

function EntryBlock({ entry, people, busy, onOp, t }: {
  entry: LoreKnownEntry
  people: string[]
  busy: boolean
  onOp: (entry: string, who: string, op: 'add' | 'remove') => Promise<void>
  t: T
}) {
  const listId = useId()
  const [draft, setDraft] = useState('')
  const suggestions = people.filter((p) => !entry.knowers.some((k) => k.name.toLowerCase() === p.toLowerCase()))
  const add = async () => {
    const who = draft.trim()
    if (!who) return
    await onOp(entry.key, who, 'add')
    setDraft('')
  }
  const how = (k: LoreKnower) => (k.how === 'start' ? t('fired.secrets.start') : k.how === 'heard' ? t('fired.secrets.heard', { word: k.word ?? '' }) : t('fired.secrets.manual'))
  return (
    <li className="flex flex-col gap-2 px-3 py-3" data-testid="fired-secret-entry">
      <div className="min-w-0">
        <p className="break-words text-body font-medium">{entry.title}</p>
        <p className="break-words text-caption text-muted-foreground">{entry.book}</p>
      </div>
      {entry.knowers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('fired.secrets.nobody')}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {entry.knowers.map((k) => (
            <Badge key={k.name} variant="secondary" className="h-auto max-w-full gap-0.5 py-0.5 text-caption" data-testid="fired-secret-knower">
              <span className="min-w-0 break-words">
                {k.name} <span className="text-muted-foreground">· {how(k)}</span>
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onOp(entry.key, k.name, 'remove')}
                aria-label={t('fired.secrets.remove', { name: k.name })}
                title={t('fired.secrets.remove', { name: k.name })}
                className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-full hover:text-destructive max-md:size-10 max-md:-my-2"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          list={listId}
          placeholder={t('fired.secrets.addPlaceholder')}
          aria-label={t('fired.secrets.add')}
          className="h-8 min-w-0 flex-1 text-body max-md:h-10"
        />
        <datalist id={listId}>
          {suggestions.map((p) => <option key={p} value={p} />)}
        </datalist>
        <Button type="submit" size="sm" variant="secondary" className="max-md:h-10" disabled={busy || !draft.trim()}>
          <Plus className="size-4" aria-hidden="true" />
          {t('fired.secrets.add')}
        </Button>
      </form>
    </li>
  )
}

/** The fold. Absent when the chat has no secret entry. `onChanged` reloads the panel after each add or remove. */
export function SecretsFold({ chatId, data, onChanged, t }: { chatId: string; data: LoreKnown | null; onChanged: () => Promise<void> | void; t: T }) {
  const [busy, setBusy] = useState(false)
  if (!data || data.entries.length === 0) return null
  const onOp = async (entry: string, who: string, op: 'add' | 'remove') => {
    setBusy(true)
    try {
      await j('/lore-known', { method: 'POST', body: JSON.stringify({ chatId, entry, who, op }) })
      await onChanged()
    } catch (e) {
      toast.error(t('fired.secrets.error', { message: String((e as Error)?.message ?? e) }))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Fold
      id="fired.secrets"
      title={t('fired.secrets.title')}
      icon={LockSimple}
      tone="violet"
      summary={t('fired.secrets.sum', { n: data.entries.length })}
      defaultOpen
    >
      <p className="px-3 pt-2 text-caption text-muted-foreground">{t('fired.secrets.hint')}</p>
      <ul className="divide-y divide-border">
        {data.entries.map((en) => <EntryBlock key={en.key} entry={en} people={data.people} busy={busy} onOp={onOp} t={t} />)}
      </ul>
    </Fold>
  )
}
