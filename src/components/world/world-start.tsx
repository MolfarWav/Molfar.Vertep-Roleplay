// The Start tab: write the world before the story. The DM reads the cards (or an interview), drafts
// records, fronts and an events deck; the player removes what they do not want and accepts the rest.
// The draft lives in the plugin's state, so a reload or another device still shows it.

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ArrowCounterClockwise, Check, Eye, Play, Stop, Trash, X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useConfirm } from '@/components/ui/confirm'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/hooks/use-t'
import { ApiError } from '@/lib/engine'
import { resolveLanguage, type MsgKey } from '@/lib/i18n'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { acceptCount, draftTotal, dropOf, groupByKind, LANG_ENGLISH, noneRemoved, plannedCalls, type Removed } from '@/lib/world-start'
import { useWorldProfiles } from '@/lib/world-profiles'
import {
  beginWorldStart, buildWorldDraft, finishWorldDraft, listWorldRecipes, loadWorld, loadWorldConfig, newWorldDeck, useWorldLive,
  type WorldConfig, type WorldDraft, type WorldRecipe, type WorldView,
} from '@/lib/world'
import { FROM_KEY } from './world-common'
import { WorldErrorCard } from './world-controls'
import { KindChip } from './world-records'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** A recipe's name and description: the two built-in ones come from the app's strings, own recipes carry their own. */
function useRecipeText(): (r: WorldRecipe) => { name: string; description: string } {
  const t = useT()
  return (r) => (r.builtin && (r.id === 'from-cards' || r.id === 'interview')
    ? { name: t(`world.recipe.${r.id}` as MsgKey), description: t(`world.recipe.${r.id}.desc` as MsgKey) }
    : { name: r.name, description: r.description })
}

/** "Deck: N cards left" in Overview, or "used up" + a button to build a new one, for a profile that uses a deck. */
export function DeckLine({ chatId, view, where = 'start' }: { chatId: string; view: WorldView; where?: 'start' | 'overview' }) {
  const t = useT()
  const profiles = useWorldProfiles((s) => s.list)
  const profile = profiles?.find((p) => p.id === view.profile)
  const lang = resolveLanguage(useApp((s) => s.settings.language))
  const [busy, setBusy] = useState(false)
  const useDeck = !!profile?.options.deck
  if (view.deck > 0) return <p className="text-sm text-muted-foreground" data-testid="deck-left">{t('world.deck.left', { n: view.deck })}</p>
  if (!useDeck || where === 'overview') return null
  const make = async () => {
    setBusy(true)
    try {
      const r = await newWorldDeck(chatId, LANG_ENGLISH[lang])
      if (r.ok) toast.success(t('world.deck.made', { n: r.deck ?? 0 }))
      else toast.error(r.error || t('world.failed'))
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-3 text-sm" data-testid="deck-used">
      <span className="min-w-0 flex-1">{t('world.deck.used')}</span>
      <Button variant="outline" size="sm" className="max-md:h-10" disabled={busy} onClick={() => void make()}>{t('world.deck.new')}</Button>
    </div>
  )
}

function Origin({ view }: { view: WorldView }) {
  const t = useT()
  const recipes = useRecipes()
  const recipeText = useRecipeText()
  const lang = resolveLanguage(useApp((s) => s.settings.language))
  const o = view.origin
  if (!o) return null
  const when = (at: number) => new Date(at).toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-GB')
  let text = ''
  if (o.kind === 'library') text = t('world.start.origin.library', { name: o.name })
  else if (o.kind === 'chat') text = t('world.start.origin.chat', { name: o.title })
  else if (o.kind === 'cards') text = t('world.start.origin.cards', { when: when(o.at) })
  else {
    const r = recipes?.find((x) => x.id === o.recipe)
    text = t('world.start.origin.recipe', { name: r ? recipeText(r).name : o.recipe, when: when(o.at) })
  }
  return <p className="text-xs text-muted-foreground" data-testid="world-origin">{text}</p>
}

let recipeCache: WorldRecipe[] | null = null
function useRecipes(): WorldRecipe[] | null {
  const [list, setList] = useState<WorldRecipe[] | null>(recipeCache)
  useEffect(() => {
    if (recipeCache) return
    let live = true
    listWorldRecipes().then((r) => { recipeCache = r; if (live) setList(r) }).catch(() => { if (live) setList([]) })
    return () => { live = false }
  }, [])
  return list
}

/** The chat's cards as the DM can read them: the character, or a group's members. */
function useChatCards(chatId: string): { id: string; name: string }[] {
  const chat = useApp((s) => s.chats.find((c) => c.id === chatId))
  const characters = useApp((s) => s.characters)
  return useMemo(() => {
    const holder = characters.find((c) => c.id === chat?.characterId)
    if (!holder) return []
    const ids = holder.isGroup ? holder.members ?? [] : [holder.id]
    return ids.map((id) => ({ id, name: characters.find((c) => c.id === id)?.name ?? id }))
  }, [chat?.characterId, characters])
}

// ---------- the setup form ----------

function Setup({ chatId, view, onBegun, onOpenSettings }: { chatId: string; view: WorldView; onBegun: () => void; onOpenSettings: () => void }) {
  const t = useT()
  const appLang = resolveLanguage(useApp((s) => s.settings.language))
  const recipes = useRecipes()
  const recipeText = useRecipeText()
  const cards = useChatCards(chatId)
  const profiles = useWorldProfiles((s) => s.list)
  const profileDeck = !!profiles?.find((p) => p.id === view.profile)?.options.deck
  const [recipeId, setRecipeId] = useState('from-cards')
  const [ticked, setTicked] = useState<Set<string> | null>(null)
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [free, setFree] = useState<Record<string, string>>({})
  const [alsoCards, setAlsoCards] = useState(false)
  const [lang, setLang] = useState<string>('app')
  const [deck, setDeck] = useState<boolean | null>(null)
  const [config, setConfig] = useState<WorldConfig | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const cardTicks = ticked ?? new Set(cards.map((c) => c.id))
  const recipe = recipes?.find((r) => r.id === recipeId) ?? recipes?.[0]
  const usesCards = recipe?.id === 'from-cards' || alsoCards
  const withDeck = deck ?? profileDeck

  useEffect(() => {
    let live = true
    loadWorldConfig(chatId).then((c) => { if (live) setConfig(c) }).catch(() => {})
    return () => { live = false }
  }, [chatId])

  // an interview's defaults
  useEffect(() => {
    if (!recipe) return
    setPicked((cur) => {
      const next = { ...cur }
      for (const q of recipe.questions) if (next[q.id] === undefined && q.default) next[q.id] = q.default
      return next
    })
  }, [recipe])

  const otherLang = appLang === 'en' ? 'uk' : 'en'
  const langSent = lang === 'cards' ? undefined : LANG_ENGLISH[lang === 'app' ? appLang : lang]
  const noCards = usesCards && cardTicks.size === 0

  const begin = async () => {
    if (!recipe || busy) return
    setBusy(true)
    setErr('')
    const answers: Record<string, string> = {}
    for (const q of recipe.questions) {
      const a = (free[q.id] ?? '').trim() || picked[q.id] || ''
      if (a) answers[q.id] = a
    }
    try {
      await beginWorldStart(chatId, {
        recipe: recipe.id,
        ...(usesCards ? { cardIds: [...cardTicks] } : {}),
        ...(recipe.questions.length ? { answers } : {}),
        ...(recipe.id !== 'from-cards' && alsoCards ? { fromCards: true } : {}),
        ...(langSent ? { lang: langSent } : {}),
        deck: withDeck,
      })
      await loadWorld(chatId)
      onBegun()
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 409 ? t('world.start.noText') : t('world.start.fail', { message: errText(e) }))
      setBusy(false)
    }
  }

  if (!recipes) return <p className="text-sm text-muted-foreground">{t('chats.panel.loading')}</p>

  const calls = plannedCalls(recipe, view.settings.level !== 'chronicler', withDeck)
  const langLabel = (c: string) => t(`world.lang.${c}` as MsgKey)

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label={t('world.start.recipe')} className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{t('world.start.recipe')}</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {recipes.map((r) => {
            const text = recipeText(r)
            const on = recipe?.id === r.id
            return (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={on}
                data-testid="world-recipe"
                onClick={() => setRecipeId(r.id)}
                className={cn('flex min-h-14 flex-col items-start gap-0.5 rounded-md border p-3 text-left text-sm transition-colors', on ? 'border-primary bg-primary/5 ring-1 ring-primary/40' : 'border-border hover:bg-accent/50')}
              >
                <span className="font-medium">{text.name}</span>
                <span className="text-xs text-muted-foreground">{text.description}</span>
              </button>
            )
          })}
        </div>
      </div>

      {recipe && recipe.questions.length > 0 && (
        <div className="flex flex-col gap-4 rounded-md border border-border bg-card p-3" data-testid="interview">
          {recipe.questions.map((q) => (
            <div key={q.id} className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium" id={`q-${q.id}`}>{q.text}</span>
              {q.options && q.options.length > 0 && (
                <div role="group" aria-labelledby={`q-${q.id}`} className="flex flex-wrap gap-1.5">
                  {q.options.map((o) => (
                    <button
                      key={o}
                      type="button"
                      aria-pressed={picked[q.id] === o && !(free[q.id] ?? '').trim()}
                      onClick={() => { setPicked((c) => ({ ...c, [q.id]: c[q.id] === o ? '' : o })); setFree((c) => ({ ...c, [q.id]: '' })) }}
                      className={cn('inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors max-md:h-10', picked[q.id] === o && !(free[q.id] ?? '').trim() ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-accent')}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              )}
              {q.options && q.options.length > 0 ? (
                <Input value={free[q.id] ?? ''} onChange={(e) => setFree((c) => ({ ...c, [q.id]: e.target.value }))} placeholder={t('world.start.other')} aria-label={`${q.text}: ${t('world.start.other')}`} className="h-10 md:h-9" />
              ) : (
                <Textarea value={free[q.id] ?? ''} onChange={(e) => setFree((c) => ({ ...c, [q.id]: e.target.value }))} rows={2} aria-labelledby={`q-${q.id}`} />
              )}
            </div>
          ))}
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={alsoCards} onCheckedChange={(c) => setAlsoCards(c === true)} className="mt-0.5" />
            <span className="min-w-0">{t('world.start.fromCards')}<span className="block text-xs text-muted-foreground">{t('world.start.fromCardsHint')}</span></span>
          </label>
        </div>
      )}

      {usesCards && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3" data-testid="start-cards">
          <h3 className="text-sm font-medium">{t('world.start.cards')}</h3>
          <p className="text-xs text-muted-foreground">{t('world.start.cardsHint')}</p>
          {cards.map((c) => (
            <label key={c.id} className="flex min-h-9 items-center gap-2 text-sm max-md:min-h-11">
              <Checkbox
                checked={cardTicks.has(c.id)}
                onCheckedChange={(on) => {
                  const next = new Set(cardTicks)
                  if (on === true) next.add(c.id)
                  else next.delete(c.id)
                  setTicked(next)
                }}
              />
              <span className="min-w-0 truncate">{c.name}</span>
            </label>
          ))}
          {cards.length === 0 && <p className="text-xs text-muted-foreground">{t('world.start.noText')}</p>}
          {cards.length > 1 && <p className="text-xs text-muted-foreground">{t('world.start.members', { names: cards.map((c) => c.name).join(', ') })}</p>}
          {noCards && cards.length > 0 && <p className="text-xs text-destructive">{t('world.start.cardsNone')}</p>}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-3">
        <div className="flex flex-col gap-1.5 text-sm">
          <span id="start-lang" className="font-medium">{t('world.start.lang')}</span>
          <Select value={lang} onValueChange={(v) => v && setLang(v)}>
            <SelectTrigger aria-labelledby="start-lang" className="h-10 w-full md:h-9" data-testid="start-lang">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectItem value="app">{t('world.start.lang.app', { lang: langLabel(appLang) })}</SelectItem>
              <SelectItem value={otherLang}>{langLabel(otherLang)}</SelectItem>
              <SelectItem value="cards">{t('world.start.lang.cards')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="min-w-0">{t('world.start.deck')}<span className="block text-xs text-muted-foreground">{t('world.start.deckHint')}</span></span>
          <Switch checked={withDeck} onCheckedChange={setDeck} aria-label={t('world.start.deck')} data-testid="start-deck" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {config && (
          <p className="text-xs text-muted-foreground">
            {t('world.start.model', { model: config.build.model || t('world.chatModel'), from: t(FROM_KEY[config.build.from]) })}{' '}
            {usesCards ? t('world.start.calls', { n: calls }) : t('world.start.callsExact', { n: calls })}
            {' '}
            <button type="button" className="underline underline-offset-2" onClick={onOpenSettings}>{t('world.err.pickModel')}</button>
          </p>
        )}
        {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
        <Button className="self-start max-md:h-10" disabled={busy || noCards || !recipe || (recipe.id === 'from-cards' && cards.length === 0)} onClick={() => void begin()} data-testid="start-build">
          <Play className="size-4" aria-hidden="true" />{t('world.start.build')}
        </Button>
      </div>
    </div>
  )
}

// ---------- the draft ----------

function RemoveToggle({ removed, name, onToggle }: { removed: boolean; name: string; onToggle: () => void }) {
  const t = useT()
  return (
    <Button
      variant="ghost"
      size="sm"
      className="shrink-0 max-md:h-10"
      onClick={onToggle}
      aria-pressed={removed}
      aria-label={`${removed ? t('world.draft.putBack') : t('world.draft.remove')}: ${name}`}
      data-testid="draft-toggle"
    >
      {removed ? <ArrowCounterClockwise className="size-4" aria-hidden="true" /> : <X className="size-4" aria-hidden="true" />}
      <span className="max-sm:sr-only">{removed ? t('world.draft.putBack') : t('world.draft.remove')}</span>
    </Button>
  )
}

function DraftItem({ removed, onToggle, name, children }: { removed: boolean; onToggle: () => void; name: string; children: React.ReactNode }) {
  const t = useT()
  return (
    <li className={cn('flex items-start gap-2 rounded-md border border-border bg-card p-3 text-sm', removed && 'bg-muted/40')} data-testid="draft-item" data-removed={removed}>
      <div className={cn('min-w-0 flex-1', removed && 'line-through opacity-60')}>{children}</div>
      {removed && <span className="sr-only">{t('world.draft.removed')}</span>}
      <RemoveToggle removed={removed} name={name} onToggle={onToggle} />
    </li>
  )
}

function toggled(set: Set<string>, id: string): Set<string> {
  const next = new Set(set)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

function DraftPanel({ chatId, draft, busy, progress, onBuild, onStop, onAccepted, onOpenSettings }: {
  chatId: string
  draft: WorldDraft
  busy: boolean
  progress: boolean
  onBuild: () => void
  onStop: () => void
  onAccepted: () => void
  onOpenSettings: () => void
}) {
  const t = useT()
  const [confirm, confirmDialog] = useConfirm()
  const [shown, setShown] = useState(false)
  const [removed, setRemoved] = useState<Removed>(noneRemoved)
  const [working, setWorking] = useState(false)
  const unfinished = draft.done < draft.total
  const keep = acceptCount(draft, removed)
  const total = draftTotal(draft)

  const reveal = async () => {
    if (await confirm({ title: t('world.peekTitle'), description: t('world.peekWarn'), actionLabel: t('world.peekGo'), destructive: false })) setShown(true)
  }

  const accept = async () => {
    setWorking(true)
    try {
      const kept = draft.entities.filter((r) => !removed.entities.has(r.id)).length
      await finishWorldDraft(chatId, 'accept', dropOf(removed))
      toast.success(t('world.draft.added', { n: kept }))
      onAccepted()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setWorking(false)
    }
  }

  const discard = async () => {
    if (!(await confirm({ title: t('world.draft.discardTitle'), description: t('world.draft.discardWarn'), actionLabel: t('world.draft.discard') }))) return
    setWorking(true)
    try {
      await finishWorldDraft(chatId, 'discard')
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="world-draft">
      <div>
        <h3 className="text-sm font-medium">{t('world.draft.title')}</h3>
        {!progress && <p className="text-xs text-muted-foreground">{t('world.draft.lead', { n: total })}</p>}
      </div>

      {progress && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3" role="status" aria-live="polite" data-testid="start-progress">
          <p className="text-sm">{t('world.start.step', { done: Math.min(draft.done + 1, draft.total), total: draft.total })}</p>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className="h-full bg-primary transition-all" style={{ width: `${draft.total ? Math.round((draft.done / draft.total) * 100) : 0}%` }} />
          </div>
          <Button variant="outline" size="sm" className="self-start max-md:h-10" onClick={onStop}>
            <Stop className="size-4" aria-hidden="true" />{t('world.start.stop')}
          </Button>
        </div>
      )}

      {!progress && draft.error && (
        <WorldErrorCard error={draft.error} again={false} busy={busy} onRetry={onBuild} onPickModel={onOpenSettings} />
      )}

      {!progress && unfinished && !draft.error && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3 text-sm">
          <p>{t('world.draft.partial', { done: draft.done, total: draft.total })}</p>
          <Button size="sm" className="self-start max-md:h-10" disabled={busy} onClick={onBuild} data-testid="start-continue">
            <Play className="size-4" aria-hidden="true" />{t('world.start.continue')}
          </Button>
        </div>
      )}

      {total > 0 && !shown && (
        <div className="rounded-md border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">{t('world.runs.hidden')}</p>
          <Button variant="outline" size="sm" className="mt-2 max-md:h-10" onClick={() => void reveal()} data-testid="draft-show">
            <Eye className="size-4" aria-hidden="true" />{t('world.rec.show')}
          </Button>
        </div>
      )}

      {shown && (
        <div className="flex flex-col gap-4">
          {groupByKind(draft.entities).map((g) => (
            <section key={g.kind} className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('world.draft.records')} · {t(`world.kind.${g.kind}` as MsgKey)}</h4>
              <ul className="flex flex-col gap-2">
                {g.items.map((r) => (
                  <DraftItem key={r.id} name={r.name} removed={removed.entities.has(r.id)} onToggle={() => setRemoved((c) => ({ ...c, entities: toggled(c.entities, r.id) }))}>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="min-w-0 break-words font-medium">{r.name}</span>
                      <KindChip kind={r.kind} />
                    </div>
                    {r.aliases.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{r.aliases.join(', ')}</p>}
                    <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{r.text}</p>
                  </DraftItem>
                ))}
              </ul>
            </section>
          ))}
          {draft.fronts.length > 0 && (
            <section className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('world.draft.fronts')}</h4>
              <ul className="flex flex-col gap-2">
                {draft.fronts.map((f) => (
                  <DraftItem key={f.id} name={f.name} removed={removed.fronts.has(f.id)} onToggle={() => setRemoved((c) => ({ ...c, fronts: toggled(c.fronts, f.id) }))}>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="min-w-0 break-words font-medium">{f.name}</span>
                      <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground">{t('world.draft.clock', { n: `${f.clock}/${f.size}` })}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{f.goal}</p>
                  </DraftItem>
                ))}
              </ul>
            </section>
          )}
          {draft.deck.length > 0 && (
            <section className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('world.draft.deck')}</h4>
              <ul className="flex flex-col gap-2">
                {draft.deck.map((c) => (
                  <DraftItem key={c.id} name={c.text.slice(0, 40)} removed={removed.deck.has(c.id)} onToggle={() => setRemoved((cur) => ({ ...cur, deck: toggled(cur.deck, c.id) }))}>
                    <p className="whitespace-pre-wrap break-words text-muted-foreground">{c.text}</p>
                  </DraftItem>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {!progress && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Button disabled={working || keep <= 0 || busy} onClick={() => void accept()} className="max-md:h-10" data-testid="draft-accept">
            <Check className="size-4" aria-hidden="true" />
            {keep === total ? t('world.draft.acceptAll') : t('world.draft.accept', { n: keep })}
          </Button>
          <Button variant="outline" disabled={working || busy} onClick={() => void discard()} className="max-md:h-10" data-testid="draft-discard">
            <Trash className="size-4" aria-hidden="true" />{t('world.draft.discard')}
          </Button>
          {keep <= 0 && total > 0 && <span className="text-xs text-muted-foreground">{t('world.draft.nothing')}</span>}
        </div>
      )}
      {confirmDialog}
    </div>
  )
}

// ---------- the tab ----------

export function WorldStart({ chatId, onOpenSettings, onAccepted }: { chatId: string; onOpenSettings: () => void; onAccepted: () => void }) {
  const t = useT()
  const view = useWorldLive((s) => s.views[chatId])
  const [live, setLive] = useState<WorldDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const stopRef = useRef(false)
  const mounted = useRef(true)
  const openOpening = useApp((s) => s.openWorldOpening)

  useEffect(() => {
    mounted.current = true
    void loadWorld(chatId).catch(() => {})
    return () => { mounted.current = false; stopRef.current = true }
  }, [chatId])

  const build = async () => {
    if (busy) return
    setBusy(true)
    stopRef.current = false
    const r = await buildWorldDraft(chatId, (d) => { if (mounted.current) setLive(d) }, () => stopRef.current)
    if (!mounted.current) return
    setBusy(false)
    setLive(null)
    if (r.error && !r.draft?.error) toast.error(r.error)
    else if (stopRef.current) toast.info(t('world.start.stopped'))
  }

  if (!view) return <p className="text-sm text-muted-foreground">{t('chats.panel.loading')}</p>
  const draft = busy && live ? live : view.draft

  return (
    <div className="flex flex-col gap-4">
      <Origin view={view} />
      <p className="text-xs text-muted-foreground">{t('world.start.lead')}</p>
      {view.records + view.retired > 0 && !draft && <p className="text-xs text-muted-foreground">{t('world.start.hasWorld', { n: view.records })}</p>}
      <DeckLine chatId={chatId} view={view} />
      {draft ? (
        <DraftPanel chatId={chatId} draft={draft} busy={busy} progress={busy} onBuild={() => void build()} onStop={() => { stopRef.current = true }} onAccepted={onAccepted} onOpenSettings={onOpenSettings} />
      ) : (
        <Setup chatId={chatId} view={view} onOpenSettings={onOpenSettings} onBegun={() => void build()} />
      )}
      {!draft && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <Button variant="outline" size="sm" className="self-start max-md:h-10" onClick={() => openOpening(chatId, false)} data-testid="start-write-opening">
            {t('world.open.write')}
          </Button>
        </div>
      )}
    </div>
  )
}
