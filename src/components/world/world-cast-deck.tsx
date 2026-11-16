// "Cast deck" (#424, step 4): cards of people the story has not met. Two parts: the chat's World DM card (the switch, how many cards are
// left, when the next new person can start, "Add new people now", and the log of every draw and every refill: who, why, the dice, the
// tie) and the list behind the book's Cast deck chip (the cards themselves, hidden behind "Show the cards" because they spoil what is
// coming; edit, remove). The DM never sees a card: code draws one when the story has been quiet long enough.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Cards, CircleNotch, Eye, PencilSimple, Trash } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm'
import { Fold } from '@/components/ui/fold'
import { Input } from '@/components/ui/input'
import { Section } from '@/components/ui/section'
import { SettingRow } from '@/components/ui/setting-row'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useRelativeTime, useT } from '@/hooks/use-t'
import { ApiError } from '@/lib/engine'
import type { MsgKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { parseAliases } from '@/lib/world-records'
import {
  deleteCastCard,
  editCastCard,
  loadCastCards,
  loadWorldCast,
  loadWorldDice,
  refillWorldCast,
  type WorldCast,
  type WorldCastCard,
  type WorldCastLogLine,
  type WorldDiceRoll,
  type WorldView,
} from '@/lib/world'
import { castLine } from './world-cast'

type T = ReturnType<typeof useT>
const SHOWN = 12

/** The chip's colour in the book: the cast deck's own hue. */
export const CAST_DECK_TONE = 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'

/** One line of the refill log: how many cards for which factions, or why the call failed, and whether the player asked. */
export function refillLine(t: T, l: WorldCastLogLine): string {
  const factions = l.factions.join(', ')
  const who = l.forced ? ` · ${t('world.castdeck.line.byYou')}` : ''
  if (l.error) return t('world.castdeck.line.failed', { code: l.error, factions }) + who
  return (l.added > 0 ? t('world.castdeck.line.refill', { n: l.added, factions }) : t('world.castdeck.line.refillNone', { factions })) + who
}

/** What a refill answered, as a toast. */
function useRefill(chatId: string) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const run = useCallback(async () => {
    setBusy(true)
    try {
      const r = await refillWorldCast(chatId, true)
      if (r.skipped === 'full') toast(t('world.castdeck.full'))
      else if (!r.ok) toast.error(r.code === 'no-factions' ? t('world.castdeck.noFactions') : (r.error ?? t('world.castdeck.failed')))
      else if (r.none) toast(t('world.castdeck.none'))
      else toast.success(t('world.castdeck.added', { n: r.added ?? 0 }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [chatId, t])
  return { busy, run }
}

// ---------- the card in the chat's World DM sheet ----------

export function CastDeckCard({ chatId, view, save, on }: {
  chatId: string
  view: WorldView
  save: (patch: Partial<WorldView['settings']>) => Promise<unknown>
  /** the DM is on for this chat (off = the card says so and its controls are disabled) */
  on: boolean
}) {
  const t = useT()
  const relativeTime = useRelativeTime()
  const [cast, setCast] = useState<WorldCast | null>(null)
  const [rolls, setRolls] = useState<WorldDiceRoll[]>([])
  const refill = useRefill(chatId)
  // anything that can change the deck: a run, a save, a refill, a draw
  const stamp = `${view.lastRunAt ?? 0}|${view.settings.castDeck}|${view.settings.cast}|${view.cast}|${view.usage.runs}`
  const load = useCallback(() => {
    loadWorldCast(chatId).then(setCast).catch(() => setCast(null))
    loadWorldDice(chatId).then((r) => setRolls(r.rolls.filter((x) => x.kind === 'cast' && x.src === 'deck'))).catch(() => setRolls([]))
  }, [chatId])
  useEffect(() => { load() }, [load, stamp])

  const deck = cast?.deck
  const log = useMemo(() => {
    const lines = [
      ...rolls.map((r) => ({ at: r.at, text: castLine(t, r) })),
      ...(deck?.log ?? []).map((l) => ({ at: l.at, text: refillLine(t, l) })),
    ]
    return lines.sort((a, b) => b.at - a.at).slice(0, SHOWN)
  }, [rolls, deck, t])

  const enabled = view.settings.castDeck === true
  const left = view.cast
  const timing = !deck
    ? ''
    : !enabled
      ? t('world.castdeck.off')
      : view.settings.cast === 'off'
        ? t('world.castdeck.castOff')
        : deck.wait > 0
          ? t('world.castdeck.wait', { n: deck.wait })
          : deck.silence >= deck.threshold
            ? t('world.castdeck.due')
            : t('world.castdeck.silent', { silence: deck.silence, threshold: deck.threshold })

  return (
    <Section
      variant="tinted"
      tone="emerald"
      icon={Cards}
      id="deck"
      title={t('world.card.deck')}
      chips={[t('world.castdeck.left', { n: left })]}
      dimmed={!on}
      note={on ? undefined : t('world.castdeck.offNote')}
    >
      <SettingRow label={t('world.castdeck.switch')} info={t('world.castdeck.hint')}>
        <Switch checked={enabled} disabled={!on} onCheckedChange={(v) => void save({ castDeck: v })} aria-label={t('world.castdeck.switch')} data-testid="deck-switch" />
      </SettingRow>
      <div className="flex flex-col gap-2 px-4 py-3" data-testid="deck-status">
        {deck && (
          <>
            {deck.left === 0 ? (
              <p className="text-caption text-muted-foreground" data-testid="deck-empty">{t('world.castdeck.empty')}</p>
            ) : (
              <p className="text-caption text-foreground" data-testid="deck-counts">
                {t('world.castdeck.leftBy', { n: deck.left, list: deck.factions.map((f) => `${f.name || '—'} ${f.n}`).join(', ') })}
              </p>
            )}
            {deck.loose > 0 && <p className="text-caption text-muted-foreground">{t('world.castdeck.loose', { n: deck.loose })}</p>}
            {cast?.entrance?.src === 'deck' && (
              <p className="text-caption text-foreground" data-testid="deck-entrance">
                {t(cast.entrance.sent > 0 ? 'world.cast.sent' : 'world.cast.queued', { name: cast.entrance.name, band: t(`world.cast.band.${cast.entrance.band}` as MsgKey) })}
              </p>
            )}
            {timing && <p className="text-caption text-muted-foreground" aria-live="polite" data-testid="deck-next">{timing}</p>}
          </>
        )}
        <Button variant="outline" className="w-full max-md:h-11" onClick={() => void refill.run().then(load)} disabled={!on || refill.busy} data-testid="deck-refill">
          {refill.busy && <CircleNotch className="size-4 animate-spin" aria-hidden="true" />}
          {refill.busy ? t('world.castdeck.refilling') : t('world.castdeck.refill')}
        </Button>
        <p className="text-caption text-muted-foreground">{t('world.castdeck.refillHint', { per: view.settings.castPer })}</p>
      </div>
      <div data-testid="deck-log">
        <Fold id="deck-log" title={t('world.castdeck.log')} summary={log.length ? log[0]!.text : t('world.castdeck.log.empty')} flat>
          <div className="flex flex-col gap-1 px-4 py-2">
            {log.length === 0 && <p className="text-caption text-muted-foreground">{t('world.castdeck.log.empty')}</p>}
            {log.length > 0 && (
              <ul className="flex flex-col gap-1 text-caption">
                {log.map((l, i) => (
                  <li key={`${l.at}-${i}`} className="text-foreground">
                    {l.text} <span className="text-muted-foreground">· {relativeTime(l.at)}</span>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={load} className="self-start text-caption text-primary underline-offset-2 hover:underline max-md:min-h-10">
              {t('world.dice.log.refresh')}
            </button>
          </div>
        </Fold>
      </div>
    </Section>
  )
}

// ---------- the list behind the book's Cast deck chip ----------

/** Chats whose cards the player has already chosen to see in this session. */
const shownCards = new Set<string>()

function CardForm({ card, busy, onSave, onCancel }: { card: WorldCastCard; busy: boolean; onSave: (patch: { name: string; aliases: string[]; tie: string; want: string; text: string }) => void; onCancel: () => void }) {
  const t = useT()
  const [name, setName] = useState(card.name)
  const [aliases, setAliases] = useState(card.aliases.join(', '))
  const [tie, setTie] = useState(card.tie)
  const [want, setWant] = useState(card.want)
  const [text, setText] = useState(card.text)
  const ok = name.trim() !== '' && text.trim() !== ''
  return (
    <form
      className="flex flex-col gap-3 rounded-md border border-emerald-500/40 bg-card p-3 text-sm"
      data-testid="deck-form"
      onSubmit={(e) => { e.preventDefault(); if (ok) onSave({ name: name.trim(), aliases: parseAliases(aliases), tie: tie.trim(), want: want.trim(), text: text.trim() }) }}
    >
      <label className="flex flex-col gap-1">
        <span className="font-medium">{t('world.rec.name')}</span>
        <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="h-10 md:h-9" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">{t('world.castdeck.f.aliases')}</span>
        <Input value={aliases} onChange={(e) => setAliases(e.target.value)} className="h-10 md:h-9" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">{t('world.castdeck.f.tie')}</span>
        <Input value={tie} maxLength={80} placeholder={t('world.castdeck.f.tiePh')} onChange={(e) => setTie(e.target.value)} className="h-10 md:h-9" />
        <span className="text-xs text-muted-foreground">{t('world.castdeck.f.tieHint')}</span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">{t('world.castdeck.f.want')}</span>
        <Input value={want} maxLength={200} onChange={(e) => setWant(e.target.value)} className="h-10 md:h-9" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">{t('world.castdeck.f.text')}</span>
        <Textarea value={text} maxLength={1200} rows={7} onChange={(e) => setText(e.target.value)} />
        <span className="text-xs text-muted-foreground">{t('world.rec.len', { n: text.length, max: 1200 })}</span>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!ok || busy} className="max-md:h-10">{t('world.rec.save')}</Button>
        <Button type="button" variant="ghost" onClick={onCancel} className="max-md:h-10">{t('home.cancel')}</Button>
      </div>
    </form>
  )
}

function DeckCard({ card, busy, editing, onEdit, onCancel, onSave, onDelete }: {
  card: WorldCastCard
  busy: boolean
  editing: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: (patch: { name: string; aliases: string[]; tie: string; want: string; text: string }) => void
  onDelete: () => void
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  if (editing) return <li><CardForm card={card} busy={busy} onSave={onSave} onCancel={onCancel} /></li>
  return (
    <li className="rounded-md border border-l-4 border-border border-l-emerald-500 bg-card p-3 text-sm" data-testid="deck-card">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 break-words font-medium">{card.name}</span>
        {card.faction && <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-1.5 py-0.5 text-caption leading-none text-violet-700 dark:text-violet-300">{card.faction}</span>}
        {card.tie
          ? <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-caption leading-none text-muted-foreground" data-testid="deck-card-tie">{t('world.castdeck.tie', { name: card.tie })}</span>
          : <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-caption leading-none text-amber-700 dark:text-amber-300" data-testid="deck-card-loose">{t('world.castdeck.loose.tag')}</span>}
      </div>
      {card.aliases.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{card.aliases.join(', ')}</p>}
      {card.want && <p className="mt-1 break-words text-xs text-muted-foreground">{t('world.castdeck.wants', { want: card.want })}</p>}
      <p className={cn('mt-1.5 whitespace-pre-wrap break-words text-muted-foreground', !open && 'line-clamp-2')}>{card.text}</p>
      {card.text.length > 140 && (
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="mt-0.5 text-caption text-primary underline-offset-2 hover:underline max-md:min-h-10">
          {open ? t('world.rec.less') : t('world.rec.more')}
        </button>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button variant="outline" size="sm" className="max-md:h-10" disabled={busy} onClick={onEdit}>
          <PencilSimple className="size-4" aria-hidden="true" />{t('world.rec.edit')}
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive max-md:h-10" disabled={busy} onClick={onDelete}>
          <Trash className="size-4" aria-hidden="true" />{t('world.rec.delete')}
        </Button>
      </div>
    </li>
  )
}

/** The cast deck as a list, for the book's chip. The count is always visible; the cards wait behind "Show the cards" (they are people who have not appeared yet). */
export function CastDeckList({ chatId, left }: { chatId: string; /** cards left (the chat's view says; a draw or a refill changes it, and the list reads again) */ left: number }) {
  const t = useT()
  const [confirm, confirmDialog] = useConfirm()
  const [cards, setCards] = useState<WorldCastCard[] | null>(null)
  const [shown, setShown] = useState(() => shownCards.has(chatId))
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const refill = useRefill(chatId)

  useEffect(() => {
    if (!shown) return
    let live = true
    loadCastCards(chatId).then((c) => { if (live) setCards(c) }).catch((e: unknown) => { if (live) toast.error(e instanceof Error ? e.message : String(e)) })
    return () => { live = false }
    // the count changes when a card is drawn or the deck is refilled: read again
  }, [chatId, shown, left])

  const reveal = () => { shownCards.add(chatId); setShown(true) }
  const fail = (e: unknown) => {
    if (e instanceof ApiError && e.code === 'clash') toast.error(t('world.castdeck.err.clash'))
    else if (e instanceof ApiError && e.code === 'tie') toast.error(t('world.castdeck.err.tie'))
    else toast.error(e instanceof Error ? e.message : String(e))
  }
  const save = async (id: string, patch: { name: string; aliases: string[]; tie: string; want: string; text: string }) => {
    setBusy(true)
    try {
      setCards(await editCastCard(chatId, id, patch))
      setEditing(null)
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }
  const remove = async (c: WorldCastCard) => {
    if (!(await confirm({ title: t('world.castdeck.deleteTitle', { name: c.name }), description: t('world.castdeck.deleteWarn'), actionLabel: t('world.rec.delete') }))) return
    setBusy(true)
    try {
      setCards(await deleteCastCard(chatId, c.id))
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="deck-list">
      <p className="text-xs text-muted-foreground">{t('world.castdeck.lead')}</p>
      {!shown && left > 0 && (
        <div className="rounded-md border border-border bg-card p-3" data-testid="deck-gate">
          <p className="text-sm">{t('world.castdeck.hidden', { n: left })}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('world.castdeck.spoil')}</p>
          <Button variant="outline" size="sm" className="mt-2 max-md:h-10" onClick={reveal} data-testid="deck-show">
            <Eye className="size-4" aria-hidden="true" />{t('world.castdeck.show')}
          </Button>
        </div>
      )}
      {left === 0 && <p className="py-4 text-center text-sm text-muted-foreground" data-testid="deck-list-empty">{t('world.castdeck.empty')}</p>}
      {shown && left > 0 && cards === null && <p className="text-sm text-muted-foreground" role="status">…</p>}
      {shown && left > 0 && cards && cards.length > 0 && (
        <ul className="flex flex-col gap-2">
          {cards.map((c) => (
            <DeckCard key={c.id} card={c} busy={busy} editing={editing === c.id} onEdit={() => setEditing(c.id)} onCancel={() => setEditing(null)} onSave={(p) => void save(c.id, p)} onDelete={() => void remove(c)} />
          ))}
        </ul>
      )}
      <Button variant="outline" size="sm" className="self-start max-md:h-10" onClick={() => void refill.run()} disabled={refill.busy} data-testid="deck-list-refill">
        {refill.busy && <CircleNotch className="size-4 animate-spin" aria-hidden="true" />}
        {refill.busy ? t('world.castdeck.refilling') : t('world.castdeck.refill')}
      </Button>
      {confirmDialog}
    </div>
  )
}
