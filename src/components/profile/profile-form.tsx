import { useId, useState, type ComponentType, type ReactNode } from 'react'
import {
  Brain,
  Check,
  Fire,
  HandWaving,
  Heart,
  HeartBreak,
  House,
  IdentificationCard,
  MagicWand,
  NotePencil,
  PersonSimple,
  Plus,
  Target,
  Trash,
  UsersThree,
  X,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { estimateTokens, formatTokens } from '@/lib/tokens'
import { cn } from '@/lib/utils'
import {
  APPEARANCE,
  BACKGROUND,
  BEHAVIORS,
  CIRCLES,
  GOALS,
  LISTS,
  SECTION_FIELDS,
  SEXUALITY,
  compileProfile,
  emptyFields,
  sectionOn,
  type Profile,
  type SectionId,
} from '@/lib/profile'

// The profile's field form, shared by the character Profile tab and the persona
// editor. Every field helper lives at MODULE level: one defined inside a render
// would be a new component type each time, and each keystroke would remount the
// input and lose focus.

export type SectionKey = keyof typeof SECTION_FIELDS
type FormId = 'identity' | SectionId | 'notes'
type Mode = 'character' | 'persona'
export interface FillControl { busy: boolean; run: (section?: SectionKey) => void }

const MAX_ITEMS = 12
const MAX_ITEM_LEN = 120

const ACCENTS = {
  sky: { border: 'border-l-sky-500', chip: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
  pink: { border: 'border-l-pink-500', chip: 'bg-pink-500/15 text-pink-600 dark:text-pink-400' },
  violet: { border: 'border-l-violet-500', chip: 'bg-violet-500/15 text-violet-600 dark:text-violet-400' },
  amber: { border: 'border-l-amber-500', chip: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  emerald: { border: 'border-l-emerald-500', chip: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  orange: { border: 'border-l-orange-500', chip: 'bg-orange-500/15 text-orange-600 dark:text-orange-400' },
  teal: { border: 'border-l-teal-500', chip: 'bg-teal-500/15 text-teal-600 dark:text-teal-400' },
  red: { border: 'border-l-red-500', chip: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  rose: { border: 'border-l-rose-500', chip: 'bg-rose-500/15 text-rose-600 dark:text-rose-400' },
  fuchsia: { border: 'border-l-fuchsia-500', chip: 'bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400' },
  slate: { border: 'border-l-slate-500', chip: 'bg-slate-500/15 text-slate-600 dark:text-slate-400' },
} as const

type IconType = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>
interface SectionMeta { id: FormId; title: string; Icon: IconType; accent: keyof typeof ACCENTS; switchable: boolean; hint?: string }

const SECTIONS: readonly SectionMeta[] = [
  { id: 'identity', title: 'Identity', Icon: IdentificationCard, accent: 'sky', switchable: false },
  { id: 'appearance', title: 'Appearance', Icon: PersonSimple, accent: 'pink', switchable: true },
  { id: 'personality', title: 'Personality', Icon: Brain, accent: 'violet', switchable: true },
  { id: 'behaviors', title: 'Behaviors', Icon: HandWaving, accent: 'amber', switchable: true },
  { id: 'goals', title: 'Goals', Icon: Target, accent: 'emerald', switchable: true },
  { id: 'background', title: 'Background', Icon: House, accent: 'orange', switchable: true },
  { id: 'circles', title: 'Circles', Icon: UsersThree, accent: 'teal', switchable: true },
  { id: 'trauma', title: 'Trauma', Icon: HeartBreak, accent: 'red', switchable: true },
  { id: 'relationships', title: 'Relationships', Icon: Heart, accent: 'rose', switchable: true },
  { id: 'sexuality', title: 'Sexuality', Icon: Fire, accent: 'fuchsia', switchable: true, hint: 'Only for adult characters.' },
  { id: 'notes', title: 'Notes', Icon: NotePencil, accent: 'slate', switchable: false, hint: 'Text that fits no field; it follows the fields in the text.' },
]

/** Field labels by profile key, for the form and for the "Fill empty" draft list. */
const IDENTITY_LABELS: Record<string, string> = {
  title: 'Title', first: 'First name', family: 'Family name', occupation: 'Occupation', age: 'Age',
  birthday: 'Birthday', gender: 'Gender', pronouns: 'Pronouns', nicknames: 'Nicknames', comment: 'Private comment',
}
const IDENTITY_ROWS = ['title', 'first', 'family', 'occupation', 'age', 'birthday', 'gender', 'pronouns'].map((k) => [k, IDENTITY_LABELS[k] ?? k] as const)
const EXTRA_LABELS: Record<string, Record<string, string>> = {
  background: { summary: 'Backstory', affiliations: 'Affiliations' },
  trauma: { experiences: 'Experiences', triggers: 'Triggers', coping: 'Coping' },
  sexuality: { turnOns: 'Turn-ons', turnOffs: 'Turn-offs', kinks: 'Kinks', boundaries: 'Boundaries', notes: 'Intimacy notes' },
}
const ROWS: Record<string, readonly (readonly [string, string])[]> = {
  appearance: APPEARANCE, lists: LISTS, behaviors: BEHAVIORS, goals: GOALS, background: [...BACKGROUND, ...CIRCLES], sexuality: SEXUALITY,
}
const CIRCLE_KEYS = new Set(['affiliations', ...CIRCLES.map(([k]) => k)])

/** "Section · Field" for a profile key and field id. */
export function fieldLabel(key: string, field: string): string {
  const label = key === 'identity'
    ? IDENTITY_LABELS[field]
    : (EXTRA_LABELS[key]?.[field] ?? ROWS[key]?.find(([k]) => k === field)?.[1])
  const section = key === 'background' && CIRCLE_KEYS.has(field)
    ? 'Circles'
    : (SECTIONS.find((s) => (s.id === 'personality' ? 'lists' : s.id) === key)?.title ?? key)
  return `${section} · ${label ?? field}`
}

const LONG = new Set(['marks', 'attire', 'other', 'summary', 'coping', 'boundaries', 'notes', ...BEHAVIORS.map(([k]) => k), ...GOALS.map(([k]) => k)])
const SUGGEST: Record<string, string[]> = {
  orientation: ['Heterosexual', 'Homosexual', 'Bisexual', 'Pansexual', 'Asexual'],
  romantic: ['Heteroromantic', 'Homoromantic', 'Biromantic', 'Panromantic', 'Demiromantic', 'Aromantic'],
  relationshipStyle: ['Monogamous', 'Polyamorous', 'Open'],
  libido: ['Low', 'Average', 'High'],
  position: ['Dominant', 'Submissive', 'Switch'],
  experience: ['None', 'Little', 'Some experience', 'Experienced'],
}
const PLACEHOLDER: Record<string, string> = { measurements: 'bust-waist-hips, e.g. 90-60-90' }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const bagOf = (p: Profile, key: string): Record<string, unknown> => (isObj(p[key]) ? (p[key] as Record<string, unknown>) : {})
const isFilled = (v: unknown): boolean => (Array.isArray(v) ? v.some((x) => typeof x === 'string' && x.trim()) : typeof v === 'string' && v.trim() !== '')
const tok = (text: string) => `${formatTokens(estimateTokens(text))} tok`

/** The text one section adds (both halves), for its token badge. */
function sectionText(p: Profile, id: FormId): string {
  const pick = (keys: Set<string>): NonNullable<Profile['background']> => Object.fromEntries(Object.entries(p.background ?? {}).filter(([k]) => keys.has(k)))
  const part: Profile = id === 'identity' ? { identity: p.identity }
    : id === 'notes' ? { notes: p.notes }
    : id === 'personality' ? { lists: p.lists }
    : id === 'background' ? { background: pick(new Set([...BACKGROUND.map(([k]) => k), 'summary'])) }
    : id === 'circles' ? { background: pick(CIRCLE_KEYS) }
    : { [id]: p[id] }
  const r = compileProfile({ ...part, sections: p.sections })
  return [r.description, r.personality].filter(Boolean).join('\n')
}

/** [filled, total] for a section's counter; null when there is nothing to count. */
function counts(p: Profile, id: FormId, mode: Mode): [number, number] | null {
  if (id === 'relationships') {
    const rows = p.relationships ?? []
    return rows.length ? [rows.filter((r) => r.name.trim()).length, rows.length] : null
  }
  if (id === 'notes') {
    const n = bagOf(p, 'notes')
    return mode === 'persona' ? [isFilled(n.description) ? 1 : 0, 1] : [['description', 'personality'].filter((k) => isFilled(n[k])).length, 2]
  }
  const { key, fields } = SECTION_FIELDS[id]
  const bag = bagOf(p, key)
  return [fields.filter((f) => isFilled(bag[f])).length, fields.length]
}

const fillable = (id: FormId): id is SectionKey => id in SECTION_FIELDS

// ── field helpers (module level) ────────────────────────────────────────────

function TextField({ label, value, onChange, placeholder, options }: { label: string; value?: string; onChange: (v: string) => void; placeholder?: string; options?: string[] }) {
  const id = useId()
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input id={id} aria-label={label} value={value ?? ''} placeholder={placeholder} list={options ? `${id}-list` : undefined} onChange={(e) => onChange(e.target.value)} />
      {options && (
        <datalist id={`${id}-list`}>
          {options.map((o) => <option key={o} value={o} />)}
        </datalist>
      )}
    </div>
  )
}

function AreaField({ label, value, onChange, rows = 2 }: { label: string; value?: string; onChange: (v: string) => void; rows?: number }) {
  const id = useId()
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Textarea id={id} aria-label={label} rows={rows} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className="text-sm" />
    </div>
  )
}

/** A list as chips: Enter, a comma or leaving the field adds; Backspace in an
 *  empty input removes the last one. At most 12 items of 120 characters. */
function ChipField({ label, value, onChange }: { label: string; value?: string[]; onChange: (v: string[]) => void }) {
  const id = useId()
  const [draft, setDraft] = useState('')
  const items = (value ?? []).filter((x) => typeof x === 'string' && x.trim())
  const full = items.length >= MAX_ITEMS
  const add = (raw: string) => {
    const next = [...items]
    for (const part of raw.split(',')) {
      const v = part.trim().slice(0, MAX_ITEM_LEN)
      if (v && !next.includes(v) && next.length < MAX_ITEMS) next.push(v)
    }
    if (next.length !== items.length) onChange(next)
  }
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-xs">{label}</Label>
        <span className={cn('text-[10px] tabular-nums text-muted-foreground', full && 'text-amber-600 dark:text-amber-400')}>{items.length}/{MAX_ITEMS}</span>
      </div>
      <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-2 py-1 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
        {items.map((item, i) => (
          <span key={item} className="inline-flex max-w-full items-center gap-0.5 rounded-full bg-muted py-0.5 pr-0.5 pl-2 text-xs">
            <span className="truncate">{item}</span>
            <button
              type="button"
              aria-label={`Remove ${item}`}
              className="rounded-full p-0.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          id={id}
          aria-label={label}
          value={draft}
          disabled={full}
          placeholder={full ? 'Full' : items.length ? '' : 'Type, then Enter'}
          className="min-w-24 flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          onChange={(e) => {
            const v = e.target.value
            if (!v.includes(',')) return setDraft(v)
            const cut = v.lastIndexOf(',')
            add(v.slice(0, cut))
            setDraft(v.slice(cut + 1).trimStart())
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add(draft)
              setDraft('')
            } else if (e.key === 'Backspace' && !draft && items.length) {
              onChange(items.slice(0, -1))
            }
          }}
          onBlur={() => { add(draft); setDraft('') }}
        />
      </div>
    </div>
  )
}

type Save = (next: Profile) => void

/** A grid of text fields from a [id, label] list: short ones two per row on sm+, long ones full width. */
function RowsGrid({ p, save, pkey, rows }: { p: Profile; save: Save; pkey: string; rows: readonly (readonly [string, string])[] }) {
  const bag = bagOf(p, pkey)
  const set = (field: string, v: string) => save({ ...p, [pkey]: { ...bag, [field]: v } })
  return (
    <>
      {rows.map(([field, label]) => (
        <div key={field} className={cn('min-w-0', LONG.has(field) && '@md:col-span-2')}>
          {LONG.has(field)
            ? <AreaField label={label} value={bag[field] as string | undefined} onChange={(v) => set(field, v)} rows={field === 'summary' ? 5 : 2} />
            : <TextField label={label} value={bag[field] as string | undefined} placeholder={PLACEHOLDER[field]} options={pkey === 'sexuality' ? SUGGEST[field] : undefined} onChange={(v) => set(field, v)} />}
        </div>
      ))}
    </>
  )
}

function Chips({ p, save, pkey, field, label }: { p: Profile; save: Save; pkey: string; field: string; label: string }) {
  const bag = bagOf(p, pkey)
  return (
    <div className="min-w-0 @md:col-span-2">
      <ChipField label={label} value={bag[field] as string[] | undefined} onChange={(v) => save({ ...p, [pkey]: { ...bag, [field]: v } })} />
    </div>
  )
}

function RelationshipsEditor({ p, save }: { p: Profile; save: Save }) {
  const rows = p.relationships ?? []
  const set = (i: number, patch: Partial<(typeof rows)[number]>) =>
    save({ ...p, relationships: rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) })
  return (
    <div className="flex flex-col gap-2">
      {rows.map((rel, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows have no id; the index is their identity
        <div key={i} className="grid gap-2 @lg:grid-cols-[1fr_1fr_2fr_auto]">
          <Input aria-label="Name" placeholder="Name" value={rel.name} onChange={(e) => set(i, { name: e.target.value })} />
          <Input aria-label="Relation" placeholder="Relation" value={rel.relation} onChange={(e) => set(i, { relation: e.target.value })} />
          <Textarea aria-label="Notes" placeholder="Notes" rows={1} value={rel.notes} onChange={(e) => set(i, { notes: e.target.value })} className="text-sm" />
          <Button variant="ghost" size="sm" aria-label="Remove relationship" onClick={() => save({ ...p, relationships: rows.filter((_, j) => j !== i) })}>
            <Trash className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-fit" onClick={() => save({ ...p, relationships: [...rows, { name: '', relation: '', notes: '' }] })}>
        <Plus className="size-4" aria-hidden="true" /> Add relationship
      </Button>
    </div>
  )
}

function SectionFields({ id, p, save, mode }: { id: FormId; p: Profile; save: Save; mode: Mode }) {
  const grid = (children: ReactNode) => <div className="grid gap-3 @md:grid-cols-2">{children}</div>
  switch (id) {
    case 'identity': {
      const rows = IDENTITY_ROWS
      const bag = bagOf(p, 'identity')
      return grid(
        <>
          <RowsGrid p={p} save={save} pkey="identity" rows={rows} />
          <Chips p={p} save={save} pkey="identity" field="nicknames" label="Nicknames" />
          <div className="min-w-0 @md:col-span-2">
            <AreaField label="Private comment (never sent to the model)" value={bag.comment as string | undefined} onChange={(comment) => save({ ...p, identity: { ...p.identity, comment } })} />
          </div>
        </>,
      )
    }
    case 'appearance':
      return grid(<RowsGrid p={p} save={save} pkey="appearance" rows={APPEARANCE} />)
    case 'personality':
      return grid(LISTS.map(([field, label]) => (
        <div key={field} className="min-w-0">
          <ChipField label={label} value={p.lists?.[field]} onChange={(v) => save({ ...p, lists: { ...p.lists, [field]: v } })} />
        </div>
      )))
    case 'behaviors':
      return grid(<RowsGrid p={p} save={save} pkey="behaviors" rows={BEHAVIORS} />)
    case 'goals':
      return grid(<RowsGrid p={p} save={save} pkey="goals" rows={GOALS} />)
    case 'background':
      return grid(<RowsGrid p={p} save={save} pkey="background" rows={[...BACKGROUND, ['summary', 'Backstory']]} />)
    case 'circles':
      return grid(
        <>
          <Chips p={p} save={save} pkey="background" field="affiliations" label="Affiliations" />
          <RowsGrid p={p} save={save} pkey="background" rows={CIRCLES} />
        </>,
      )
    case 'trauma':
      return grid(
        <>
          <Chips p={p} save={save} pkey="trauma" field="experiences" label="Experiences" />
          <Chips p={p} save={save} pkey="trauma" field="triggers" label="Triggers" />
          <RowsGrid p={p} save={save} pkey="trauma" rows={[['coping', 'Coping']]} />
        </>,
      )
    case 'relationships':
      return <RelationshipsEditor p={p} save={save} />
    case 'sexuality':
      return grid(
        <>
          <RowsGrid p={p} save={save} pkey="sexuality" rows={SEXUALITY} />
          <Chips p={p} save={save} pkey="sexuality" field="turnOns" label="Turn-ons" />
          <Chips p={p} save={save} pkey="sexuality" field="turnOffs" label="Turn-offs" />
          <Chips p={p} save={save} pkey="sexuality" field="kinks" label="Kinks" />
          <RowsGrid p={p} save={save} pkey="sexuality" rows={[['boundaries', 'Boundaries'], ['notes', 'Intimacy notes']]} />
        </>,
      )
    case 'notes':
      return mode === 'persona'
        ? <AreaField label="Other text" rows={4} value={p.notes?.description} onChange={(v) => save({ ...p, notes: { ...p.notes, description: v } })} />
        : (
          <div className="flex flex-col gap-3">
            <AreaField label="Other description text" rows={4} value={p.notes?.description} onChange={(v) => save({ ...p, notes: { ...p.notes, description: v } })} />
            <AreaField label="Other personality text" rows={4} value={p.notes?.personality} onChange={(v) => save({ ...p, notes: { ...p.notes, personality: v } })} />
          </div>
        )
  }
}

function SectionCard({ s, p, save, mode, fill, anchor, on, count }: {
  s: SectionMeta; p: Profile; save: Save; mode: Mode; fill?: FillControl; anchor: string; on: boolean; count: [number, number] | null
}) {
  const accent = ACCENTS[s.accent]
  const canFill = !!fill && on && fillable(s.id) && Object.keys(emptyFields(p, s.id)).length > 0
  return (
    <section id={anchor} aria-label={s.title} className={cn('flex scroll-mt-14 flex-col gap-3 rounded-lg border border-l-4 border-border p-3 @2xl:scroll-mt-2', accent.border)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-md', accent.chip)}>
          <s.Icon className="size-4" aria-hidden="true" />
        </span>
        <h2 className={cn('text-sm font-semibold', !on && 'text-muted-foreground')}>{s.title}</h2>
        <Badge variant="outline" className="text-[10px]">{tok(on ? sectionText(p, s.id) : '')}</Badge>
        {count && <span className="text-xs tabular-nums text-muted-foreground">filled {count[0]}/{count[1]}</span>}
        <div className="ml-auto flex items-center gap-2">
          {canFill && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={fill.busy} onClick={() => fill.run(s.id as SectionKey)} title="A model proposes values for this section's empty fields; you review before anything changes">
              <MagicWand className="size-3.5" aria-hidden="true" />Fill empty
            </Button>
          )}
          {s.switchable && (
            <Switch
              checked={on}
              onCheckedChange={(v) => save({ ...p, sections: { ...p.sections, [s.id]: v } })}
              aria-label={`${s.title} section`}
            />
          )}
        </div>
      </div>
      {s.hint && <p className="text-xs text-muted-foreground">{s.hint}</p>}
      {on ? <SectionFields id={s.id} p={p} save={save} mode={mode} /> : <p className="text-xs text-muted-foreground">Off: kept, but nothing from it goes into the text.</p>}
    </section>
  )
}

function scrollToSection(anchor: string) {
  let reduce = false
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { /* old browser */ }
  document.getElementById(anchor)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
}

export function ProfileForm({ p, save, mode, fill }: { p: Profile; save: Save; mode: Mode; fill?: FillControl }) {
  const uid = useId()
  const anchor = (id: FormId) => `${uid}-section-${id}`
  const meta = SECTIONS.map((s) => {
    const count = counts(p, s.id, mode)
    return { s, on: !s.switchable || sectionOn(p, s.id as SectionId), count, done: !!count && count[0] > 0 }
  })
  return (
    // container queries: the form sits in panes of very different widths (the
    // character editor, the narrow persona pane), so it follows its own width
    <div className="@container min-w-0">
    <div className="flex min-w-0 flex-col gap-3 @2xl:grid @2xl:grid-cols-[170px_minmax(0,1fr)] @2xl:items-start @2xl:gap-4">
      <nav aria-label="Profile sections" className="hidden @2xl:sticky @2xl:top-2 @2xl:flex @2xl:flex-col @2xl:gap-0.5">
        {meta.map(({ s, on, done }) => (
          <button
            key={s.id}
            type="button"
            onClick={() => scrollToSection(anchor(s.id))}
            className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent', !on && 'opacity-50')}
          >
            <span className={cn('flex size-5 shrink-0 items-center justify-center rounded', ACCENTS[s.accent].chip)}>
              <s.Icon className="size-3.5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 truncate">{s.title}</span>
            {done && <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Has filled fields" />}
          </button>
        ))}
      </nav>
      <nav aria-label="Profile sections" className="no-scrollbar sticky top-0 z-10 -mx-1 flex min-w-0 max-w-full gap-1.5 overflow-x-auto bg-background px-1 py-1.5 @2xl:hidden">
        {meta.map(({ s, on, done }) => (
          <button
            key={s.id}
            type="button"
            onClick={() => scrollToSection(anchor(s.id))}
            className={cn('flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs', !on && 'opacity-50')}
          >
            <s.Icon className={cn('size-3.5 rounded-sm', ACCENTS[s.accent].chip, 'bg-transparent')} aria-hidden="true" />
            {s.title}
            {done && <Check className="size-3 text-emerald-600 dark:text-emerald-400" aria-label="Has filled fields" />}
          </button>
        ))}
      </nav>
      <div className="flex min-w-0 flex-col gap-3">
        {meta.map(({ s, on, count }) => (
          <SectionCard key={s.id} s={s} p={p} save={save} mode={mode} fill={fill} anchor={anchor(s.id)} on={on} count={count} />
        ))}
      </div>
    </div>
    </div>
  )
}
