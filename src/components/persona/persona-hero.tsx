import { useId, useState, type ReactNode } from 'react'
import { CaretLeft, ChartBar, Copy, DotsThree, DownloadSimple, MagicWand, Plus, SealCheck, Trash, X } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useT } from '@/hooks/use-t'
import { formatTokens } from '@/lib/tokens'
import type { Persona, Tag } from '@/lib/types'
import { DEFAULT_AVATAR, cn } from '@/lib/utils'

/** What the hero and the phone header can do; the page owns every action. */
export interface HeroActions {
  inUse: boolean
  chats: number
  tokens: number
  fill: string
  /** persona-scope tags, for the suggestions and the chip colours */
  registry: Tag[]
  update: (patch: Partial<Persona>) => void
  setTags: (next: string[]) => void
  onBack: () => void
  onUse: () => void
  onGenerate: () => void
  onPickPortrait: () => void
  onChats: () => void
  onDuplicate: () => void
  onExport: () => void
  onDelete: () => void
  onUsage: () => void
  onOpenProfile: () => void
}

/** A text that is edited where it is read: a plain input dressed as the heading, the chip or the line. */
const inline = 'min-w-0 rounded-md border border-transparent bg-transparent outline-none transition-colors hover:border-border focus:border-ring focus:bg-background/60 focus-visible:ring-2 focus-visible:ring-ring/40'

/** This persona's tags as chips with a remove button, and "+ tag": an input with the persona tags as suggestions
 *  (Enter or a comma adds; a new name joins the tag list of the Personas section). */
export function TagEditor({ p, a, center }: { p: Persona; a: HeroActions; center?: boolean }) {
  const t = useT()
  const listId = useId()
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)
  const own = p.tags ?? []
  const meta = new Map(a.registry.map((x) => [x.name, x]))
  const commit = (raw = draft) => {
    const name = raw.trim().replace(/,$/, '').trim()
    setDraft('')
    if (name && !own.includes(name)) a.setTags([...own, name])
  }
  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-1.5', center && 'justify-center')} data-testid="persona-tags">
      {own.map((name) => {
        const m = meta.get(name)
        return (
          <span
            key={name}
            style={m ? { backgroundColor: m.color, color: m.textColor, borderColor: 'transparent' } : undefined}
            className={cn('flex max-w-full items-center gap-1 rounded-full border py-0.5 pr-1 pl-2.5 text-[11px] leading-4', !m && 'border-border text-muted-foreground')}
          >
            <span className="truncate">{name}</span>
            <button type="button" onClick={() => a.setTags(own.filter((x) => x !== name))} aria-label={t('personas.page.removeTag', { name })} className="flex size-5 items-center justify-center rounded-full hover:bg-foreground/15 max-md:size-6">
              <X className="size-3" aria-hidden="true" />
            </button>
          </span>
        )
      })}
      {adding ? (
        <>
          <input
            autoFocus
            list={listId}
            value={draft}
            onChange={(e) => { if (e.target.value.endsWith(',')) commit(e.target.value); else setDraft(e.target.value) }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              if (e.key === 'Enter') { e.preventDefault(); commit() }
              if (e.key === 'Escape') { setDraft(''); setAdding(false) }
            }}
            onBlur={() => { commit(); setAdding(false) }}
            placeholder={t('personas.page.tagName')}
            aria-label={t('personas.page.addTag')}
            className="h-7 w-32 rounded-full border border-border bg-background px-2.5 text-[11px] outline-none focus:border-ring max-md:h-9"
          />
          <datalist id={listId}>
            {a.registry.filter((x) => !own.includes(x.name)).map((x) => <option key={x.id} value={x.name} />)}
          </datalist>
        </>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="flex h-6 items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-[11px] text-muted-foreground hover:text-foreground max-md:h-9" data-testid="persona-add-tag">
          <Plus className="size-3" aria-hidden="true" />{t('personas.page.addTag')}
        </button>
      )}
    </div>
  )
}

function InUseBadge() {
  const t = useT()
  return (
    <Badge variant="secondary" className="h-7 gap-1 px-2 text-xs font-normal" data-testid="persona-in-use">
      <SealCheck className="size-3.5" aria-hidden="true" />{t('personas.inUse')}
    </Badge>
  )
}

function Portrait({ p, a, className }: { p: Persona; a: HeroActions; className: string }) {
  const t = useT()
  return (
    <button type="button" onClick={a.onPickPortrait} aria-label={t('personas.page.changePortrait')} title={t('personas.page.changePortrait')} className={cn('group relative shrink-0 overflow-hidden bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring', className)} data-testid="persona-portrait">
      <img src={p.avatar || DEFAULT_AVATAR} alt="" className="size-full object-cover" />
      <span className="absolute inset-x-0 bottom-0 bg-background/70 py-1 text-center text-[11px] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 max-md:opacity-100">{t('personas.page.change')}</span>
    </button>
  )
}

/** Desktop: the banner with the portrait overlapping its edge, the name, pronouns, title, tags and the two main buttons. */
export function PersonaHero({ p, a }: { p: Persona; a: HeroActions }) {
  const t = useT()
  const tool = (icon: ReactNode, label: string, onClick: () => void, extra?: string) => (
    <Button variant="outline" size="sm" className={cn('h-8 bg-background/60', extra)} onClick={onClick}>{icon}<span className="max-lg:sr-only">{label}</span></Button>
  )
  return (
    <div className="relative shrink-0 border-b border-border" data-testid="persona-hero">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/25 via-card to-background" aria-hidden="true" />
      <div className="relative flex min-h-[210px] flex-col justify-end gap-3 pt-14 pr-5 pb-4 pl-[188px]">
        <div className="absolute top-3 left-4 flex items-center gap-2">
          <button type="button" onClick={a.onBack} className="flex min-h-9 items-center gap-1.5 rounded-md pr-2 text-sm text-muted-foreground transition-colors hover:text-foreground" data-testid="persona-back">
            <CaretLeft className="size-5" aria-hidden="true" />{t('personas.page.back')}
          </button>
        </div>
        <div className="absolute top-3 right-4 flex items-center gap-2">
          {tool(<Copy className="size-4" aria-hidden="true" />, t('personas.duplicate'), a.onDuplicate)}
          {tool(<DownloadSimple className="size-4" aria-hidden="true" />, t('personas.export'), a.onExport)}
          {tool(<ChartBar className="size-4" aria-hidden="true" />, t('personas.page.usage'), a.onUsage)}
          {tool(<Trash className="size-4" aria-hidden="true" />, t('personas.delete'), a.onDelete, 'text-destructive')}
        </div>
        <Portrait p={p} a={a} className="absolute -bottom-9 left-5 h-[176px] w-[140px] rounded-2xl border-4 border-background shadow-md" />
        <div className="flex min-w-0 items-end gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <input value={p.name} onChange={(e) => a.update({ name: e.target.value })} aria-label={t('personas.page.nameAria')} style={{ width: `${Math.max(p.name.length, 6) + 3}ch` }} className={cn(inline, 'h-10 max-w-full flex-none px-2 font-heading text-[26px] leading-none font-bold')} data-testid="persona-name" />
              <input value={p.pronouns} onChange={(e) => a.update({ pronouns: e.target.value })} aria-label={t('personas.page.pronounsAria')} placeholder={t('personas.page.pronouns')} className={cn(inline, 'h-6 w-24 shrink-0 rounded-full border-sky-500/50 px-2.5 text-[11px] text-sky-700 dark:text-sky-300')} data-testid="persona-pronouns" />
              {a.inUse && <InUseBadge />}
            </div>
            <input value={p.title} onChange={(e) => a.update({ title: e.target.value })} aria-label={t('personas.page.titleAria')} placeholder={t('personas.page.titlePlaceholder')} className={cn(inline, 'h-8 w-full px-2 text-sm text-muted-foreground')} data-testid="persona-title" />
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <TagEditor p={p} a={a} />
              <button type="button" disabled={a.chats === 0} onClick={a.onChats} className="rounded-full border border-sky-500/50 px-2.5 py-0.5 text-[11px] text-sky-700 underline disabled:no-underline disabled:opacity-60 dark:text-sky-300" data-testid="persona-chats-chip">
                {t('personas.chatsLink', { n: a.chats })}
              </button>
              <span className="rounded-full border border-amber-500/50 px-2.5 py-0.5 text-[11px] text-amber-700 dark:text-amber-400">{t('personas.tokensN', { n: formatTokens(a.tokens) })}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" className="h-8 border-sky-500/50 text-sky-700 dark:text-sky-300" onClick={a.onGenerate} data-testid="persona-generate"><MagicWand className="size-4" aria-hidden="true" />{t('personas.image.title')}</Button>
            {a.inUse ? null : <Button className="h-8" onClick={a.onUse} data-testid="persona-use">{t('personas.useThis')}</Button>}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Phone: the top bar (back, title, ⋯) and the centred header with three stat buttons. */
export function PersonaPhoneHeader({ p, a }: { p: Persona; a: HeroActions }) {
  const t = useT()
  const stat = (label: string, cls: string, onClick?: () => void, disabled?: boolean) => (
    <button type="button" onClick={onClick} disabled={disabled || !onClick} className={cn('flex h-11 min-w-0 flex-1 items-center justify-center truncate rounded-xl border px-2 text-xs disabled:opacity-100', cls)}>{label}</button>
  )
  return (
    <div className="md:hidden" data-testid="persona-phone-header">
      <div className="flex items-center border-b border-border px-2 py-1.5">
        <Button variant="ghost" className="size-11 p-0" onClick={a.onBack} aria-label={t('personas.page.back')} data-testid="persona-back"><CaretLeft className="size-5" aria-hidden="true" /></Button>
        <span className="text-base font-bold">{t('personas.page.persona')}</span>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" className="ml-auto size-11 p-0" aria-label={t('personas.more')}><DotsThree className="size-6" aria-hidden="true" /></Button>} />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={a.onDuplicate}><Copy className="size-4" aria-hidden="true" />{t('personas.duplicate')}</DropdownMenuItem>
            <DropdownMenuItem onClick={a.onExport}><DownloadSimple className="size-4" aria-hidden="true" />{t('personas.export')}</DropdownMenuItem>
            <DropdownMenuItem onClick={a.onUsage}><ChartBar className="size-4" aria-hidden="true" />{t('personas.page.usage')}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={a.onDelete}><Trash className="size-4" aria-hidden="true" />{t('personas.delete')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex flex-col items-center gap-2 bg-gradient-to-b from-primary/20 to-background px-4 pt-4 pb-3">
        <Portrait p={p} a={a} className="h-[150px] w-[120px] rounded-2xl" />
        <div className="flex w-full min-w-0 items-center justify-center gap-2">
          <input value={p.name} onChange={(e) => a.update({ name: e.target.value })} aria-label={t('personas.page.nameAria')} className={cn(inline, 'h-11 min-w-0 flex-1 px-2 text-center font-heading text-[22px] font-bold')} data-testid="persona-name" />
          {a.inUse && <InUseBadge />}
        </div>
        <input value={p.pronouns} onChange={(e) => a.update({ pronouns: e.target.value })} aria-label={t('personas.page.pronounsAria')} placeholder={t('personas.page.pronouns')} className={cn(inline, 'h-9 w-32 rounded-full text-center text-xs')} data-testid="persona-pronouns" />
        <input value={p.title} onChange={(e) => a.update({ title: e.target.value })} aria-label={t('personas.page.titleAria')} placeholder={t('personas.page.titlePlaceholder')} className={cn(inline, 'h-11 w-full px-2 text-center text-sm text-muted-foreground')} data-testid="persona-title" />
        <TagEditor p={p} a={a} center />
        <div className="mt-1 flex w-full gap-2">
          {stat(t('personas.chatsLink', { n: a.chats }), 'border-sky-500/50 bg-sky-500/10 text-sky-700 underline dark:text-sky-300', a.onChats, a.chats === 0)}
          {stat(`${formatTokens(a.tokens)} ${t('personas.tokensLabel')}`, 'border-amber-500/50 text-amber-700 dark:text-amber-400')}
          {stat(`${t('personas.page.profileShort')} ${a.fill}`, 'border-emerald-500/50 text-emerald-700 dark:text-emerald-400', a.onOpenProfile)}
        </div>
      </div>
    </div>
  )
}
