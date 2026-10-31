import { CaretRight, Image as ImageIcon, MagicWand, Trash } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { InfoTip } from '@/components/ui/info-tip'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import type { useConfirm } from '@/components/ui/confirm'
import { MemorySection } from '@/components/character/memory-section'
import type { CardTasksState } from '@/components/character/use-card-tasks'
import { PersonaDescriptionField, PersonaProfilePanel, type PersonaProfileState } from '@/components/persona/persona-profile'
import { useT } from '@/hooks/use-t'
import { PERSONA_SECTIONS, SECTION_DOT, SECTION_TINT, removeGallery, type PersonaSection } from '@/lib/persona-page'
import { formatTokens } from '@/lib/tokens'
import type { Character, Lorebook, Persona } from '@/lib/types'
import { cn } from '@/lib/utils'

type Confirm = ReturnType<typeof useConfirm>[0]

/** The look of a tab button: the app's own tab look plus a tinted border (as the character editor's strip). */
const TAB_BUTTON = 'inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-3 text-xs font-medium whitespace-nowrap text-foreground transition-all hover:brightness-125 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring data-active:shadow-sm data-active:ring-2 data-active:ring-foreground/10'

export interface SectionCounts { profile: string; bindings: number; lorebooks: number; gallery: number }

const labelKey = (s: PersonaSection) => `personas.sec.${s}` as Parameters<ReturnType<typeof useT>>[0]

/** Desktop: the tab strip under the hero. Arrow keys move between tabs (one tab stop, roving). */
export function PersonaTabStrip({ value, onChange, counts }: { value: PersonaSection; onChange: (s: PersonaSection) => void; counts: SectionCounts }) {
  const t = useT()
  const count = (s: PersonaSection): string | number | null =>
    s === 'profile' ? counts.profile : s === 'bindings' ? counts.bindings || null : s === 'lorebooks' ? counts.lorebooks || null : s === 'gallery' ? counts.gallery || null : null
  return (
    <div
      role="tablist"
      aria-label={t('personas.page.tabs')}
      className="flex flex-wrap gap-2 pt-12 pr-5 pb-3 pl-[188px]"
      onKeyDown={(e) => {
        const i = PERSONA_SECTIONS.indexOf(value)
        const next = e.key === 'ArrowRight' ? PERSONA_SECTIONS[(i + 1) % PERSONA_SECTIONS.length] : e.key === 'ArrowLeft' ? PERSONA_SECTIONS[(i - 1 + PERSONA_SECTIONS.length) % PERSONA_SECTIONS.length] : e.key === 'Home' ? PERSONA_SECTIONS[0] : e.key === 'End' ? PERSONA_SECTIONS[PERSONA_SECTIONS.length - 1] : undefined
        if (!next) return
        e.preventDefault()
        onChange(next)
        requestAnimationFrame(() => e.currentTarget.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus())
      }}
    >
      {PERSONA_SECTIONS.map((s) => {
        const on = s === value
        const n = count(s)
        return (
          <button key={s} type="button" role="tab" data-tab={s} tabIndex={on ? 0 : -1} aria-selected={on} data-active={on || undefined} onClick={() => onChange(s)} className={cn(TAB_BUTTON, SECTION_TINT[s])}>
            {t(labelKey(s))}
            {n !== null && <span className="tabular-nums opacity-80">{n}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** Desktop: the narrow column beside the tab body (hidden under 1024 px). */
export function PersonaStatColumn({ chats, tokens, messages, goesWith, onChats }: { chats: number; tokens: number; messages: number; goesWith: string[]; onChats: () => void }) {
  const t = useT()
  return (
    <aside className="flex w-[150px] shrink-0 flex-col gap-3 pt-2 text-xs text-muted-foreground max-lg:hidden" aria-label={t('personas.page.stats')} data-testid="persona-stats">
      <div className="flex items-center justify-between">
        <button type="button" disabled={chats === 0} onClick={onChats} className="text-sky-700 underline disabled:no-underline disabled:opacity-60 dark:text-sky-300">{t('personas.page.chatsLink')}</button>
        <span className="tabular-nums text-foreground">{chats}</span>
      </div>
      <div className="flex items-center justify-between"><span>{t('personas.tokensLabel')}</span><span className="tabular-nums text-amber-700 dark:text-amber-400">{formatTokens(tokens)}</span></div>
      <div className="flex items-center justify-between"><span>{t('personas.page.messages')}</span><span className="tabular-nums text-foreground">{messages}</span></div>
      <div className="h-px bg-border" />
      <div>{t('personas.goesWith')}</div>
      {goesWith.length ? <ul className="flex flex-col gap-0.5 text-foreground">{goesWith.map((n) => <li key={n} className="truncate">{n}</li>)}</ul> : <span>{t('personas.page.goesWithNone')}</span>}
    </aside>
  )
}

/** Phone: one 56 px row per section (a coloured dot, the name, a short hint, a chevron). */
export function PersonaSectionList({ onOpen, hints }: { onOpen: (s: PersonaSection) => void; hints: Record<PersonaSection, string> }) {
  const t = useT()
  return (
    <ul className="flex flex-col pb-24" data-testid="persona-section-list">
      {PERSONA_SECTIONS.map((s) => (
        <li key={s} className="border-b border-border/60">
          <button type="button" onClick={() => onOpen(s)} className="flex min-h-14 w-full items-center gap-3 px-4 text-left" data-testid={`persona-row-${s}`}>
            <span className={cn('size-2.5 shrink-0 rounded-full', SECTION_DOT[s])} aria-hidden="true" />
            <span className="text-[15px] font-semibold">{t(labelKey(s))}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{hints[s]}</span>
            <CaretRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  )
}

export interface BodyProps {
  p: Persona
  update: (patch: Partial<Persona>) => void
  profile: PersonaProfileState
  tasks: CardTasksState
  characters: Character[]
  lorebooks: Lorebook[]
  confirm: Confirm
  onAsk: () => void
  onGenerate: () => void
  onUseAsPortrait: (url: string) => void
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <h2 className="text-xs font-semibold uppercase text-muted-foreground">{title}</h2>
      {children}
    </div>
  )
}

/** The body of one section; the same on desktop (beside the stat column) and on a phone (a page of its own). */
export function PersonaSectionBody({ section, b }: { section: PersonaSection; b: BodyProps }) {
  const t = useT()
  const { p, update } = b
  switch (section) {
    case 'core':
      return <PersonaDescriptionField p={p} update={update} />
    case 'profile':
      return <PersonaProfilePanel p={p} state={b.profile} tasks={b.tasks} onAsk={b.onAsk} />
    case 'bindings':
      return (
        <Block title={t('personas.sec.bindings')}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex w-28 items-center gap-1">
              <Label className="text-xs">Binding mode</Label>
              <InfoTip label="About binding mode">
                <p><strong>Default</strong>: nothing is bound; you pick the persona by hand.</p>
                <p><strong>Lock to character</strong>: a new chat with a character you tick below starts with this persona.</p>
                <p>Lock to chat is saved but does not change which persona a new chat starts with.</p>
              </InfoTip>
            </div>
            <Select value={p.binding} onValueChange={(v) => update({ binding: v as never })}>
              <SelectTrigger className="w-48 max-md:h-11" aria-label="Binding mode"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="character">Lock to character</SelectItem>
                <SelectItem value="chat">Lock to chat</SelectItem>
              </SelectContent>
            </Select>
            <label className="flex min-h-11 items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={p.autoLock} onCheckedChange={(v) => update({ autoLock: v })} aria-label="Auto-lock" />
              Auto-lock
            </label>
            <InfoTip label="About auto-lock">When two personas are bound to the same character, the auto-locked one is chosen for new chats with it.</InfoTip>
          </div>
          {p.binding === 'character' && (
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Bound characters</Label>
              <div className="flex flex-wrap gap-1.5">
                {b.characters.filter((c) => !c.isGroup).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={p.boundCharacterIds.includes(c.id)}
                    onClick={() => update({ boundCharacterIds: p.boundCharacterIds.includes(c.id) ? p.boundCharacterIds.filter((x) => x !== c.id) : [...p.boundCharacterIds, c.id] })}
                    className={cn('min-h-8 rounded-full border px-2.5 py-0.5 text-xs max-md:min-h-11', p.boundCharacterIds.includes(c.id) ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground')}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Block>
      )
    case 'lorebooks':
      return (
        <Block title="Bound lorebooks">
          {b.lorebooks.length === 0 && <p className="text-xs text-muted-foreground">{t('personas.page.noLorebooks')}</p>}
          {b.lorebooks.map((l) => (
            <label key={l.id} className="flex min-h-11 items-center gap-2 text-sm">
              <Switch
                checked={p.lorebookIds.includes(l.id)}
                onCheckedChange={(v) => update({ lorebookIds: v ? [...p.lorebookIds, l.id] : p.lorebookIds.filter((x) => x !== l.id) })}
                aria-label={`Bind ${l.name}`}
              />
              {l.name}
            </label>
          ))}
        </Block>
      )
    case 'memory':
      return <MemorySection key={`memory-${p.id}`} owner={{ kind: 'persona', id: p.id, name: p.name }} framed />
    case 'colours':
      return (
        <Block title={t('personas.sec.colours')}>
          <div className="flex flex-wrap items-center gap-3">
            <Label className="w-36 text-xs">Dialogue colour</Label>
            <input
              type="color"
              value={p.dialogueColor || '#888888'}
              onChange={(e) => update({ dialogueColor: e.target.value })}
              aria-label="Dialogue colour"
              className="size-10 cursor-pointer rounded border-0 bg-transparent p-0 md:size-8"
            />
            <span className="text-xs text-muted-foreground">{p.dialogueColor || 'the theme\'s quote colour'}</span>
            {p.dialogueColor && <Button variant="ghost" size="sm" className="max-md:h-11" onClick={() => update({ dialogueColor: '' })}>Reset</Button>}
            <InfoTip label="About dialogue colour">The colour of this persona&apos;s quoted speech in the chat. A message takes the colour of the persona it was sent under, so changing it repaints that persona&apos;s earlier messages too.</InfoTip>
          </div>
        </Block>
      )
    case 'gallery': {
      const gallery = p.gallery ?? []
      if (gallery.length === 0) {
        return (
          <Empty data-testid="persona-gallery-empty">
            <EmptyHeader>
              <EmptyMedia variant="icon"><ImageIcon aria-hidden="true" /></EmptyMedia>
              <EmptyTitle>{t('personas.gallery.emptyTitle')}</EmptyTitle>
              <EmptyDescription>{t('personas.gallery.emptyHint')}</EmptyDescription>
            </EmptyHeader>
            <Button className="h-11 md:h-8" onClick={b.onGenerate}><MagicWand className="size-4" aria-hidden="true" />{t('personas.image.title')}</Button>
          </Empty>
        )
      }
      return (
        <div className="flex flex-col gap-3" data-testid="persona-gallery">
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground">{t('personas.gallery.count', { n: gallery.length })}</p>
            <Button variant="outline" size="sm" className="ml-auto h-8 max-md:h-11" onClick={b.onGenerate}><MagicWand className="size-4" aria-hidden="true" />{t('personas.image.title')}</Button>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {gallery.map((url) => (
              <li key={url} className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-2" data-testid="persona-gallery-item">
                <img src={url} alt="" className="aspect-[4/5] w-full rounded-md bg-muted object-cover" />
                <div className="flex flex-wrap gap-1.5">
                  <Button variant="secondary" size="sm" className="h-8 min-w-0 flex-1 text-xs max-md:h-11" disabled={p.avatar === url} onClick={() => b.onUseAsPortrait(url)}>{t('personas.image.useAsPortrait')}</Button>
                  <Button
                    variant="ghost" size="sm" className="h-8 max-md:size-11" aria-label={t('personas.gallery.remove')} title={t('personas.gallery.remove')}
                    onClick={() => void b.confirm({ title: t('personas.gallery.removeTitle'), description: t('personas.gallery.removeDesc'), actionLabel: t('personas.gallery.remove') }).then((yes) => { if (yes) update({ gallery: removeGallery(gallery, url) }) })}
                  >
                    <Trash className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )
    }
  }
}
