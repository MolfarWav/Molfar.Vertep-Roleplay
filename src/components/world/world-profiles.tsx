// The hub's Profiles tab: the five built-in DM profiles (the levels: open, change, roll back) and the
// player's own. Prompts are shared by every chat that uses the profile. One Save for the page
// (with an "unsaved" mark and a warning before leaving); a block resets to its default on its own.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Copy, Eye, EyeSlash, FloppyDisk, Lock, Plus, Trash, ArrowCounterClockwise } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/hooks/use-t'
import type { MsgKey } from '@/lib/i18n'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import {
  createProfile, draftOf, eventBlockOk, isDirty, refreshWorldProfiles, removeProfile, resetProfileBlock, saveProfileDraft, useWorldProfiles,
  type ProfileDraft,
} from '@/lib/world-profiles'
import { type WorldBlockKey, type WorldLevel, type WorldProfile, type WorldProfileDefaults, type WorldProfileOptions } from '@/lib/world'
import { LEVEL_ICON, LEVEL_TONE, LevelChip, useProfileHint, useProfileName } from './world-common'
import { OwnMark } from './world-profile-picker'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const EVENT_LEVELS: WorldLevel[] = ['living', 'director', 'antagonist', 'chaos']
const BASES: WorldProfile['base'][] = ['chronicler', 'living', 'director', 'antagonist', 'chaos']
export const NEW_PROFILE = '__new__'

const BLOCK_TITLE: Record<WorldBlockKey, MsgKey> = { keeper: 'world.block.keeper', level: 'world.block.level', shared: 'world.block.shared', event: 'world.block.event' }
const BLOCK_HINT: Record<WorldBlockKey, MsgKey> = { keeper: 'world.block.keeper.hint', level: 'world.block.level.hint', shared: 'world.block.shared.hint', event: 'world.block.event.hint' }

// ---------- the list (left pane) ----------

export function ProfileList({ selectedId, onSelect, onNew }: { selectedId: string | null; onSelect: (id: string) => void; onNew: () => void }) {
  const t = useT()
  const list = useWorldProfiles((s) => s.list)
  const error = useWorldProfiles((s) => s.error)
  const nameOf = useProfileName()
  useEffect(() => { void refreshWorldProfiles() }, [])
  const row = (p: WorldProfile) => {
    const Icon = LEVEL_ICON[p.base]
    return (
      <li key={p.id}>
        <button
          type="button"
          onClick={() => onSelect(p.id)}
          aria-current={p.id === selectedId ? 'true' : undefined}
          data-testid="world-profile"
          className={cn('relative flex min-h-12 w-full flex-col justify-center gap-0.5 rounded-md px-2 py-1.5 text-left text-sm', p.id === selectedId ? 'bg-accent' : 'hover:bg-accent/50')}
        >
          <span className="flex min-w-0 items-center gap-1.5 font-medium">
            <Icon className={cn('size-4 shrink-0', LEVEL_TONE[p.base].icon)} aria-hidden="true" />
            <span className="min-w-0 truncate">{nameOf(p)}</span>
            {!p.builtIn && <OwnMark />}
            {p.changed && <span className="ml-auto shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 text-[10px] font-medium leading-4 text-amber-700 dark:text-amber-300">{t('world.block.changed')}</span>}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {!p.builtIn && <LevelChip level={p.base} />}
            <span>{t('world.prof.chats', { n: p.chats })}</span>
          </span>
        </button>
      </li>
    )
  }
  const builtIn = list?.filter((p) => p.builtIn) ?? []
  const own = list?.filter((p) => !p.builtIn) ?? []
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="p-1.5">
        {error && <p className="p-2 text-xs text-destructive">{t('world.list.loadError', { error })}</p>}
        {!list && !error && <p className="p-2 text-xs text-muted-foreground">{t('chats.panel.loading')}</p>}
        <Button variant="outline" size="sm" className="mb-1 w-full max-md:h-10" onClick={onNew} aria-current={selectedId === NEW_PROFILE ? 'true' : undefined}>
          <Plus className="size-4" aria-hidden="true" />{t('world.prof.new')}
        </Button>
        {list && <h3 className="px-2 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('world.prof.builtIn')}</h3>}
        <ul className="flex flex-col">{builtIn.map(row)}</ul>
        {list && <h3 className="px-2 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('world.prof.mine')}</h3>}
        {list && own.length === 0 && <p className="px-2 pb-2 text-xs text-muted-foreground">{t('world.prof.noOwn')}</p>}
        <ul className="flex flex-col">{own.map(row)}</ul>
      </div>
    </ScrollArea>
  )
}

// ---------- pieces of the editor ----------

function AutoTextarea({ value, onChange, label, className }: { value: string; onChange: (v: string) => void; label: string; className?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  // grows with its text, to about 20 lines; then it scrolls
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [value])
  return (
    <Textarea
      ref={ref}
      value={value}
      aria-label={label}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      className={cn('max-h-[27rem] min-h-20 resize-none overflow-y-auto font-mono text-xs leading-[1.35rem]', className)}
    />
  )
}

function NumField({ label, value, min, max, onCommit }: { label: string; value: number; min: number; max: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const commit = () => {
    const n = Math.round(Number(text))
    if (!Number.isFinite(n)) { setText(String(value)); return }
    const c = Math.min(max, Math.max(min, n))
    setText(String(c))
    if (c !== value) onCommit(c)
  }
  return (
    <Input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={text}
      aria-label={label}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
      className="h-10 w-20 shrink-0 text-right md:h-8"
    />
  )
}

function DefaultsSection({ base, defaults, onChange }: { base: WorldLevel; defaults: WorldProfileDefaults; onChange: (d: WorldProfileDefaults) => void }) {
  const t = useT()
  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-card p-3">
      <div>
        <h3 className="text-sm font-medium">{t('world.prof.defaults')}</h3>
        <p className="text-xs text-muted-foreground">{t('world.prof.defaultsHint')}</p>
      </div>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>{t('world.everyN')}</span>
        <NumField label={t('world.everyN')} value={defaults.everyN} min={1} max={50} onCommit={(n) => onChange({ ...defaults, everyN: n })} />
      </label>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0">{t('world.still')}<span className="block text-xs text-muted-foreground">{t('world.stillHint')}</span></span>
        <NumField label={t('world.still')} value={defaults.stagnation} min={0} max={50} onCommit={(n) => onChange({ ...defaults, stagnation: n })} />
      </label>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0">{t('world.transition')}<span className="block text-xs text-muted-foreground">{t('world.transitionHint')}</span></span>
        <Switch checked={defaults.onTransition} onCheckedChange={(v) => onChange({ ...defaults, onTransition: v })} aria-label={t('world.transition')} />
      </div>
      {EVENT_LEVELS.includes(base) && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="min-w-0">{t('world.insert')}<span className="block text-xs text-muted-foreground">{t('world.insertHint')}</span></span>
          <Switch checked={defaults.insert} onCheckedChange={(v) => onChange({ ...defaults, insert: v })} aria-label={t('world.insert')} />
        </div>
      )}
    </section>
  )
}

const CLOCK_MIN = 2
const CLOCK_MAX = 50

/** Who moves the fronts' clocks, and whether news follows the clock; for levels above chronicler. */
function OptionsSection({ options, onChange }: { options: WorldProfileOptions; onChange: (o: WorldProfileOptions) => void }) {
  const t = useT()
  const code = options.clocks === 'code'
  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-card p-3" data-testid="profile-options">
      <div>
        <h3 className="text-sm font-medium">{t('world.opt.title')}</h3>
        <p className="text-xs text-muted-foreground">{t('world.opt.hint')}</p>
      </div>
      <div role="radiogroup" aria-label={t('world.opt.clocks')} className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">{t('world.opt.clocks')}</span>
        {(['model', 'code'] as const).map((v) => (
          <label key={v} className={cn('flex cursor-pointer items-start gap-2 rounded-md border p-2 max-md:min-h-11', options.clocks === v ? 'border-primary bg-primary/5' : 'border-border')}>
            <input type="radio" name="clocks" checked={options.clocks === v} onChange={() => onChange({ ...options, clocks: v })} className="mt-1 accent-primary" />
            <span className="min-w-0">
              {t(`world.opt.clocks.${v}` as MsgKey)}
              <span className="block text-xs text-muted-foreground">{t(`world.opt.clocks.${v}.hint` as MsgKey)}</span>
            </span>
          </label>
        ))}
      </div>
      {code && (
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="min-w-0">{t('world.opt.every')}<span className="block text-xs text-muted-foreground">{t('world.opt.everyHint')}</span></span>
          <NumField label={t('world.opt.every')} value={options.clockEvery} min={CLOCK_MIN} max={CLOCK_MAX} onCommit={(n) => onChange({ ...options, clockEvery: n })} />
        </label>
      )}
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0">{t('world.opt.news')}<span className="block text-xs text-muted-foreground">{t('world.opt.newsHint')}</span></span>
        <Switch checked={options.eventByClock} onCheckedChange={(v) => onChange({ ...options, eventByClock: v })} aria-label={t('world.opt.news')} />
      </div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0">{t('world.prof.opt.deck')}<span className="block text-xs text-muted-foreground">{t('world.prof.opt.deckHint')}</span></span>
        <Switch checked={options.deck} onCheckedChange={(v) => onChange({ ...options, deck: v })} aria-label={t('world.prof.opt.deck')} />
      </div>
    </section>
  )
}

function BlockCard({ k, text, dflt, changed, onChange, onReset }: {
  k: WorldBlockKey
  text: string
  dflt: string
  changed: boolean
  onChange: (v: string) => void
  /** absent while a profile is being made: nothing to roll back to on the server */
  onReset?: () => void
}) {
  const t = useT()
  const [showDefault, setShowDefault] = useState(false)
  const bad = k === 'event' && !eventBlockOk(text)
  const differs = text.replace(/\r\n/g, '\n').trim() !== dflt.trim()
  return (
    <section className="flex flex-col gap-2 rounded-md border border-border bg-card p-3" data-testid={`block-${k}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">{t(BLOCK_TITLE[k])}</h3>
        {(changed || differs) && <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 text-[10px] font-medium leading-4 text-amber-700 dark:text-amber-300">{t('world.block.changed')}</span>}
      </div>
      <p className="text-xs text-muted-foreground">{t(BLOCK_HINT[k], { event: '{event}' })}</p>
      <AutoTextarea value={text} onChange={onChange} label={t(BLOCK_TITLE[k])} className={bad ? 'border-destructive' : ''} />
      {bad && <p className="text-xs text-destructive">{t('world.block.needEvent', { event: '{event}' })}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="outline" size="sm" className="max-md:h-10" onClick={() => setShowDefault((v) => !v)} aria-expanded={showDefault}>
          {showDefault ? <EyeSlash className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          {showDefault ? t('world.block.hideDefault') : t('world.block.showDefault')}
        </Button>
        {(changed || differs) && (
          <Button variant="outline" size="sm" className="max-md:h-10" onClick={onReset ?? (() => onChange(dflt))}>
            <ArrowCounterClockwise className="size-4" aria-hidden="true" />{t('world.block.reset')}
          </Button>
        )}
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{t('world.block.len', { n: text.length, max: 6000 })}</span>
      </div>
      {showDefault && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">{t('world.block.defaultLabel')}</p>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-2 font-mono text-xs leading-[1.35rem]">{dflt}</pre>
        </div>
      )}
    </section>
  )
}

function OutputCard({ text }: { text: string }) {
  const t = useT()
  return (
    <section className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-muted/30 p-3" data-testid="block-output">
      <h3 className="flex items-center gap-1.5 text-sm font-medium"><Lock className="size-4 text-muted-foreground" aria-hidden="true" />{t('world.prof.output')}</h3>
      <p className="text-xs text-muted-foreground">{t('world.prof.outputWhy')}</p>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background/60 p-2 font-mono text-xs leading-[1.35rem] text-muted-foreground">{text}</pre>
    </section>
  )
}

// ---------- the editor of an existing profile ----------

export function ProfileEditor({ profile, onDirty, onGone, onOpenProfile }: { profile: WorldProfile; onDirty: (d: boolean) => void; onGone: () => void; onOpenProfile: (id: string) => void }) {
  const t = useT()
  const nameOf = useProfileName()
  const hintOf = useProfileHint()
  const [confirm, confirmDialog] = useConfirm()
  const [draft, setDraft] = useState<ProfileDraft>(() => draftOf(profile))
  const [busy, setBusy] = useState(false)
  const dirty = isDirty(profile, draft)
  const eventBad = profile.blocks.some((b) => b.key === 'event' && !eventBlockOk(draft.blocks.event ?? ''))
  const nameBad = !profile.builtIn && !draft.name.trim()
  useEffect(() => { onDirty(dirty) }, [dirty, onDirty])
  useEffect(() => () => onDirty(false), [onDirty])

  const save = async () => {
    setBusy(true)
    try {
      await saveProfileDraft(profile, draft)
      toast.success(t('world.prof.saved'))
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const resetBlock = async (key: WorldBlockKey) => {
    if (!(await confirm({ title: t('world.block.resetTitle', { block: t(BLOCK_TITLE[key]) }), description: t('world.block.resetWarn'), actionLabel: t('world.block.reset') }))) return
    const dflt = profile.blocks.find((b) => b.key === key)?.default ?? ''
    try {
      await resetProfileBlock(profile, key)
      setDraft((d) => ({ ...d, blocks: { ...d.blocks, [key]: dflt } }))
    } catch (e) {
      toast.error(errText(e))
    }
  }

  const duplicate = async () => {
    setBusy(true)
    try {
      const dflt = Object.fromEntries(profile.blocks.map((b) => [b.key, b.default]))
      const res = await createProfile({
        name: t('world.prof.copy', { name: nameOf(profile) }),
        description: profile.builtIn ? hintOf(profile) : profile.description,
        base: profile.base,
        defaults: profile.defaults,
        options: profile.options,
        blocks: Object.fromEntries(profile.blocks.map((b) => [b.key, b.text])),
        levelDefaults: dflt,
      })
      toast.success(t('world.prof.created'))
      onOpenProfile(res.id)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    const level = t(`world.level.${profile.base}` as MsgKey)
    const warn = profile.chats > 0 ? t('world.prof.deleteWarn', { n: profile.chats, level }) : t('world.prof.deleteWarn0')
    if (!(await confirm({ title: t('world.prof.deleteTitle', { name: profile.name }), description: warn, actionLabel: t('world.prof.delete') }))) return
    try {
      await removeProfile(profile.id)
      toast.success(t('world.prof.deleted'))
      onDirty(false)
      onGone()
    } catch (e) {
      toast.error(errText(e))
    }
  }

  const Icon = LEVEL_ICON[profile.base]
  return (
    <div className="flex flex-col gap-4" data-testid="profile-editor">
      <div className="sticky top-0 z-10 -mx-3 -mt-3 flex flex-wrap items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur md:-mx-5 md:-mt-5 md:px-5">
        <Icon className={cn('size-5 shrink-0', LEVEL_TONE[profile.base].icon)} aria-hidden="true" />
        <h2 className="min-w-0 flex-1 truncate font-heading text-lg">{nameOf(profile)}</h2>
        {dirty && <span className="text-xs font-medium text-amber-700 dark:text-amber-300" role="status">{t('world.prof.dirty')}</span>}
        {dirty && (
          <Button variant="ghost" size="sm" className="max-md:h-10" disabled={busy} onClick={() => setDraft(draftOf(profile))}>{t('world.prof.discard')}</Button>
        )}
        <Button size="sm" className="max-md:h-10" disabled={!dirty || busy || eventBad || nameBad} onClick={() => void save()}>
          <FloppyDisk className="size-4" aria-hidden="true" />{t('world.prof.save')}
        </Button>
      </div>

      {profile.builtIn ? (
        <p className="text-sm text-muted-foreground">{hintOf(profile)}</p>
      ) : (
        <section className="flex flex-col gap-3 rounded-md border border-border bg-card p-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t('world.prof.name')}</span>
            <Input value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-10 md:h-9" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t('world.prof.desc')}</span>
            <Textarea value={draft.description} maxLength={300} rows={2} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </label>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{t('world.prof.base')}</span>
            <LevelChip level={profile.base} />
            <span className="w-full text-xs text-muted-foreground">{t('world.prof.baseHint')}</span>
          </div>
        </section>
      )}

      <DefaultsSection base={profile.base} defaults={draft.defaults} onChange={(defaults) => setDraft({ ...draft, defaults })} />
      {profile.base !== 'chronicler' && <OptionsSection options={draft.options} onChange={(options) => setDraft({ ...draft, options })} />}

      <div>
        <h3 className="text-sm font-medium">{t('world.prof.blocks')}</h3>
        <p className="text-xs text-muted-foreground">{t('world.prof.blocksHint')}</p>
      </div>
      {profile.blocks.map((b) => (
        <BlockCard
          key={b.key}
          k={b.key}
          text={draft.blocks[b.key] ?? ''}
          dflt={b.default}
          changed={b.changed}
          onChange={(v) => setDraft((d) => ({ ...d, blocks: { ...d.blocks, [b.key]: v } }))}
          onReset={() => void resetBlock(b.key)}
        />
      ))}
      <OutputCard text={profile.output} />

      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <Button variant="outline" className="max-md:h-10" disabled={busy} onClick={() => void duplicate()}>
          <Copy className="size-4" aria-hidden="true" />{t('world.prof.duplicate')}
        </Button>
        {!profile.builtIn && (
          <Button variant="outline" className="text-destructive hover:text-destructive max-md:h-10" disabled={busy} onClick={() => void remove()}>
            <Trash className="size-4" aria-hidden="true" />{t('world.prof.delete')}
          </Button>
        )}
      </div>
      {confirmDialog}
    </div>
  )
}

// ---------- making a profile ----------

export function NewProfileEditor({ onDirty, onCreated, onCancel }: { onDirty: (d: boolean) => void; onCreated: (id: string) => void; onCancel: () => void }) {
  const t = useT()
  const list = useWorldProfiles((s) => s.list)
  const [base, setBase] = useState<WorldProfile['base']>('living')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const builtIn = list?.find((p) => p.id === base)
  const levelDefaults = useMemo(() => Object.fromEntries((builtIn?.blocks ?? []).map((b) => [b.key, b.default])), [builtIn])
  const [defaults, setDefaults] = useState<WorldProfileDefaults>({ everyN: 5, stagnation: 6, onTransition: true, insert: true })
  const [options, setOptions] = useState<WorldProfileOptions>({ clocks: 'model', clockEvery: 6, eventByClock: false, deck: false })
  const [blocks, setBlocks] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  // a new base starts from that level's texts and numbers
  useEffect(() => {
    if (!builtIn) return
    setBlocks(Object.fromEntries(builtIn.blocks.map((b) => [b.key, b.text])))
    setDefaults({ ...builtIn.defaults })
    setOptions({ ...builtIn.options })
  }, [builtIn?.id, !!builtIn])
  const touched = name.trim() !== '' || description.trim() !== ''
  useEffect(() => { onDirty(touched) }, [touched, onDirty])
  useEffect(() => () => onDirty(false), [onDirty])
  const eventBad = !eventBlockOk(blocks.event ?? '')
  const keys = (builtIn?.blocks ?? []).map((b) => b.key)

  const create = async () => {
    setBusy(true)
    try {
      const res = await createProfile({ name, description, base, defaults, options, blocks, levelDefaults })
      toast.success(t('world.prof.created'))
      onDirty(false)
      onCreated(res.id)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="profile-editor-new">
      <div className="sticky top-0 z-10 -mx-3 -mt-3 flex flex-wrap items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur md:-mx-5 md:-mt-5 md:px-5">
        <h2 className="min-w-0 flex-1 truncate font-heading text-lg max-md:basis-full">{t('world.prof.new')}</h2>
        <Button variant="ghost" size="sm" className="max-md:h-10" onClick={onCancel}>{t('home.cancel')}</Button>
        <Button size="sm" className="max-md:h-10" disabled={!name.trim() || busy || eventBad || !builtIn} onClick={() => void create()}>
          <FloppyDisk className="size-4" aria-hidden="true" />{t('world.prof.create')}
        </Button>
      </div>

      <section className="flex flex-col gap-3 rounded-md border border-border bg-card p-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t('world.prof.name')}</span>
          <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={t('world.prof.namePh')} className="h-10 md:h-9" autoFocus />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t('world.prof.desc')}</span>
          <Textarea value={description} maxLength={300} rows={2} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="flex flex-col gap-1.5 text-sm">
          <span id="new-profile-base" className="font-medium">{t('world.prof.base')}</span>
          <Select value={base} onValueChange={(v) => { if (v) setBase(v as WorldProfile['base']) }}>
            <SelectTrigger aria-labelledby="new-profile-base" className="h-10 w-full md:h-9">
              <SelectValue>
                {(v: string) => {
                  const l = BASES.find((x) => x === v)
                  if (!l) return null
                  const Icon = LEVEL_ICON[l]
                  return (
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon className={cn('size-4 shrink-0', LEVEL_TONE[l].icon)} aria-hidden="true" />
                      <span className="truncate">{t(`world.level.${l}` as MsgKey)}</span>
                    </span>
                  )
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} className="w-auto min-w-(--anchor-width) max-w-[min(26rem,calc(100vw-2rem))]">
              {BASES.map((l) => {
                const Icon = LEVEL_ICON[l]
                return (
                  <SelectItem key={l} value={l} className="items-start py-1.5 max-md:min-h-11">
                    <Icon className={cn('mt-0.5 size-4 shrink-0', LEVEL_TONE[l].icon)} aria-hidden="true" />
                    <span className="flex min-w-0 flex-col whitespace-normal">
                      <span className="font-medium">{t(`world.level.${l}` as MsgKey)}</span>
                      <span className="text-xs font-normal text-muted-foreground">{t(`world.level.${l}.hint` as MsgKey)}</span>
                    </span>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t('world.level.' + base + '.hint' as MsgKey)}</p>
          <p className="text-xs text-muted-foreground">{t('world.prof.baseHint')}</p>
        </div>
      </section>

      <DefaultsSection base={base} defaults={defaults} onChange={setDefaults} />
      {base !== 'chronicler' && <OptionsSection options={options} onChange={setOptions} />}

      <div>
        <h3 className="text-sm font-medium">{t('world.prof.blocks')}</h3>
        <p className="text-xs text-muted-foreground">{t('world.prof.blocksHint')}</p>
      </div>
      {builtIn && keys.map((k) => (
        <BlockCard key={`${base}-${k}`} k={k} text={blocks[k] ?? ''} dflt={levelDefaults[k] ?? ''} changed={false} onChange={(v) => setBlocks((b) => ({ ...b, [k]: v }))} />
      ))}
      {builtIn && <OutputCard text={builtIn.output} />}
    </div>
  )
}

/** Used by the hub to jump to a profile after "Edit profile" (focusWorldProfileId). */
export function useFocusedProfile(onFocus: (id: string) => void) {
  const focus = useApp((s) => s.focusWorldProfileId)
  useEffect(() => {
    if (!focus) return
    useApp.setState({ focusWorldProfileId: null })
    onFocus(focus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus])
}

