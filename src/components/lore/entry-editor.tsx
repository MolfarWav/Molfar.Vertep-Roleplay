import { useMemo, useState, type ReactNode } from 'react'
import { CaretDown, CaretRight, Trash, X } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import { estimateTokens, formatTokens } from '@/lib/tokens'
import type { EntryLogic, EntryStatus, LoreEntry } from '@/lib/types'
import {
  LOGIC_KEY, POSITION_CHOICES, POSITION_KEY, STATUS_KEY, TRIGGER_TYPES, canonicalPosition,
} from '@/components/lore/lore-labels'

/** "More options" remembers open/closed for the rest of the session. */
const MORE_KEY = 'rp-lore-more-open'
let moreMemo = false
function readMore(): boolean {
  try { const v = sessionStorage.getItem(MORE_KEY); if (v != null) return v === '1' } catch { /* storage blocked */ }
  return moreMemo
}
function writeMore(v: boolean) {
  moreMemo = v
  try { sessionStorage.setItem(MORE_KEY, v ? '1' : '0') } catch { /* storage blocked */ }
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-[11px] text-muted-foreground">{children}</p>
}

function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className ?? 'flex flex-col gap-1'}>
      <Label className="text-[11px]">{label}</Label>
      {children}
      {hint && <Hint>{hint}</Hint>}
    </div>
  )
}

function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-border pt-2.5">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </section>
  )
}

function NumField({ label, hint, value, onChange, min = 0, max, placeholder }: {
  label: string; hint?: string; value: number | ''; onChange: (v: number | null) => void; min?: number; max?: number; placeholder?: string
}) {
  // the raw text stays while the field is focused, so clearing it to retype a
  // number does not snap back to the default under the cursor
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        min={min}
        max={max}
        value={draft ?? value}
        placeholder={placeholder}
        onChange={(e) => {
          setDraft(e.target.value)
          if (e.target.value === '') { onChange(null); return }
          let n = Number(e.target.value)
          if (!Number.isFinite(n)) return
          if (max != null) n = Math.min(max, n)
          onChange(Math.max(min, n))
        }}
        onBlur={() => setDraft(null)}
        className="h-7 text-xs"
        aria-label={label}
      />
    </Field>
  )
}

function SwitchField({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="flex items-center gap-2 text-xs">
        <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
        {label}
      </label>
      {hint && <Hint>{hint}</Hint>}
    </div>
  )
}

/** book default / on / off */
function TriState({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean | null) => void }) {
  const t = useT()
  return (
    <Field label={label}>
      <Select value={value == null ? 'book' : value ? 'on' : 'off'} onValueChange={(v) => v && onChange(v === 'book' ? null : v === 'on')}>
        <SelectTrigger className="h-7 w-full text-xs" aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="book">{t('lore.ed.tri.book')}</SelectItem>
          <SelectItem value="on">{t('lore.ed.tri.on')}</SelectItem>
          <SelectItem value="off">{t('lore.ed.tri.off')}</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  )
}

function KeyListInput({ keys, label, onChange }: { keys: string[]; label: string; onChange: (keys: string[]) => void }) {
  // Local draft holds the RAW text so delimiters survive keystrokes (a
  // controlled `value={keys.join(', ')}` would eat the comma mid-typing);
  // parsed keys still commit on every change: the engine stays live.
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? keys.join(', ')
  return (
    <Input
      value={shown}
      onChange={(ev) => {
        setDraft(ev.target.value)
        onChange(ev.target.value.split(',').map((k) => k.trim()).filter(Boolean))
      }}
      onBlur={() => setDraft(null)}
      className="h-7 font-mono text-xs"
      aria-label={label}
    />
  )
}

/** Speakers the entry is limited to: stored as the cards' ids, shown by name. */
function CharacterPicker({ ids, onChange }: { ids: string[]; onChange: (ids: string[]) => void }) {
  const t = useT()
  const characters = useApp((s) => s.characters)
  const nameOf = (id: string) => characters.find((c) => c.id === id)?.name ?? id
  const toggle = (id: string) => onChange(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ids.map((id) => (
        <Badge key={id} variant="secondary" className="gap-1 text-[10px]">
          <span className="max-w-32 truncate">{nameOf(id)}</span>
          <button type="button" onClick={() => toggle(id)} aria-label={t('lore.ed.removeNamed', { name: nameOf(id) })} title={t('lore.ed.removeNamed', { name: nameOf(id) })} className="rounded-full hover:text-destructive">
            <X className="size-3" aria-hidden="true" />
          </button>
        </Badge>
      ))}
      <Popover>
        <PopoverTrigger render={<Button variant="outline" size="sm" className="h-6 text-[11px]">{t('lore.ed.pickCharacters')}</Button>} />
        <PopoverContent align="start" className="max-h-72 w-64">
          {characters.length === 0 && <Hint>{t('lore.ed.noCharacters')}</Hint>}
          <ul className="flex flex-col gap-0.5">
            {characters.map((c) => (
              <li key={c.id}>
                <label className="flex min-h-8 items-center gap-2 rounded px-1.5 text-xs hover:bg-accent/50">
                  <input type="checkbox" className="size-3.5 accent-primary" checked={ids.includes(c.id)} onChange={() => toggle(c.id)} />
                  <span className="truncate">{c.name}</span>
                </label>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function TagPicker({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const t = useT()
  const characters = useApp((s) => s.characters)
  const all = useMemo(() => Array.from(new Set([...characters.flatMap((c) => c.tags), ...tags])).sort((a, b) => a.localeCompare(b)), [characters, tags])
  if (all.length === 0) return <Hint>{t('lore.ed.noTags')}</Hint>
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('lore.ed.tags')}>
      {all.map((tag) => {
        const on = tags.includes(tag)
        return (
          <button
            key={tag}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? tags.filter((x) => x !== tag) : [...tags, tag])}
            className={`rounded-full border px-2 py-0.5 text-[11px] ${on ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground hover:bg-accent/50'}`}
          >
            {tag}
          </button>
        )
      })}
    </div>
  )
}

export function EntryEditor({ entry: e, onChange, onDelete, onDuplicate, onCopyToBook }: {
  entry: LoreEntry
  onChange: (p: Partial<LoreEntry>) => void
  onDelete: () => void
  onDuplicate: () => void
  onCopyToBook: () => void
}) {
  const t = useT()
  const [more, setMore] = useState(readMore)
  const toggleMore = () => { const v = !more; setMore(v); writeMore(v) }
  const waits = typeof e.delayUntilRecursion === 'number' ? e.delayUntilRecursion : e.delayUntilRecursion ? 1 : 0
  const position = canonicalPosition(e.position) as LoreEntry['position']

  return (
    <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
      {/* basics: always visible */}
      <div className="grid grid-cols-1 gap-2 @[26rem]:grid-cols-2">
        <Field label={t('lore.ed.title')}>
          <Input value={e.title} onChange={(ev) => onChange({ title: ev.target.value })} className="h-7 text-xs" aria-label={t('lore.ed.title')} />
        </Field>
        <Field label={t('lore.ed.status')}>
          <Select value={e.status} onValueChange={(v) => v && onChange({ status: v as EntryStatus })}>
            <SelectTrigger className="h-7 w-full text-xs" aria-label={t('lore.ed.status')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">{t(STATUS_KEY.normal)}</SelectItem>
              <SelectItem value="constant">{t(STATUS_KEY.constant)}</SelectItem>
              <SelectItem value="vectorized">{t(STATUS_KEY.vectorized)}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-[11px]">{t('lore.ed.keys')}</Label>
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Switch checked={e.keysRegex} onCheckedChange={(v) => onChange({ keysRegex: v })} aria-label={t('lore.ed.regex')} />
            {t('lore.ed.regex')}
          </label>
        </div>
        <KeyListInput keys={e.keys} label={t('lore.ed.keys')} onChange={(keys) => onChange({ keys })} />
        <Hint>{t('lore.ed.keysHint')}</Hint>
        {e.status === 'normal' && e.keys.length === 0 && <p className="text-[11px] text-destructive">{t('lore.ed.noKeysWarn')}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <Label className="flex items-center gap-2 text-[11px]">
          {t('lore.ed.content')}
          <Badge variant="outline" className="text-[10px]">{formatTokens(estimateTokens(e.content))} tok</Badge>
        </Label>
        <Textarea value={e.content} rows={5} onChange={(ev) => onChange({ content: ev.target.value })} aria-label={t('lore.ed.content')} className="min-h-28 text-xs" />
      </div>

      <div className="grid grid-cols-2 gap-2 @[34rem]:grid-cols-4">
        <Field label={t('lore.ed.position')} className="col-span-2 flex flex-col gap-1">
          <Select value={position} onValueChange={(v) => v && onChange({ position: v as LoreEntry['position'] })}>
            <SelectTrigger className="h-7 w-full text-xs" aria-label={t('lore.ed.position')}><SelectValue /></SelectTrigger>
            <SelectContent>
              {POSITION_CHOICES.map((p) => <SelectItem key={p} value={p}>{t(POSITION_KEY[p]!)}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        {position === 'at_depth' && (
          <>
            <NumField label={t('lore.ed.depth')} value={e.depth} onChange={(v) => onChange({ depth: v ?? 0 })} />
            <Field label={t('lore.ed.role')}>
              <Select value={e.role} onValueChange={(v) => v && onChange({ role: v as LoreEntry['role'] })}>
                <SelectTrigger className="h-7 w-full text-xs" aria-label={t('lore.ed.role')}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">{t('lore.ed.role.system')}</SelectItem>
                  <SelectItem value="user">{t('lore.ed.role.user')}</SelectItem>
                  <SelectItem value="assistant">{t('lore.ed.role.assistant')}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </>
        )}
        <NumField label={t('lore.ed.order')} hint={t('lore.ed.orderHint')} value={e.order} onChange={(v) => onChange({ order: v ?? 0 })} />
      </div>

      {/* more options */}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={toggleMore}
          aria-expanded={more}
          className="flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {more ? <CaretDown className="size-3.5" aria-hidden="true" /> : <CaretRight className="size-3.5" aria-hidden="true" />}
          {t('lore.ed.more')}
        </button>
        {more && (
          <div className="flex flex-col gap-3" data-testid="entry-more">
            <Sub title={t('lore.ed.secondary')}>
              <div className="grid grid-cols-1 gap-2 @[26rem]:grid-cols-[1fr_11rem]">
                <Field label={t('lore.ed.secondaryKeys')}>
                  <KeyListInput keys={e.secondaryKeys} label={t('lore.ed.secondaryKeys')} onChange={(secondaryKeys) => onChange({ secondaryKeys })} />
                </Field>
                <Field label={t('lore.ed.logic')}>
                  <Select value={e.logic} onValueChange={(v) => v && onChange({ logic: v as EntryLogic })}>
                    <SelectTrigger className="h-7 w-full text-xs" aria-label={t('lore.ed.logic')}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['AND_ANY', 'AND_ALL', 'NOT_ANY', 'NOT_ALL'] as const).map((l) => <SelectItem key={l} value={l}>{t(LOGIC_KEY[l])}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Hint>{t('lore.ed.secondaryHint')}</Hint>
            </Sub>

            <Sub title={t('lore.ed.chance')}>
              <div className="grid grid-cols-1 gap-2 @[26rem]:grid-cols-3">
                <NumField
                  label={t('lore.ed.trigger')}
                  hint={t('lore.ed.triggerHint')}
                  value={e.probability}
                  min={0}
                  max={100}
                  onChange={(v) => { const p = v ?? 100; onChange({ probability: p, useProbability: p < 100 }) }}
                />
              </div>
            </Sub>

            <Sub title={t('lore.ed.timed')}>
              <div className="grid grid-cols-1 gap-2 @[26rem]:grid-cols-3">
                <NumField label={t('lore.ed.sticky')} hint={t('lore.ed.stickyHint')} value={e.sticky} onChange={(v) => onChange({ sticky: v ?? 0 })} />
                <NumField label={t('lore.ed.cooldown')} hint={t('lore.ed.cooldownHint')} value={e.cooldown} onChange={(v) => onChange({ cooldown: v ?? 0 })} />
                <NumField label={t('lore.ed.delay')} hint={t('lore.ed.delayHint')} value={e.delay} onChange={(v) => onChange({ delay: v ?? 0 })} />
              </div>
            </Sub>

            <Sub title={t('lore.ed.groupTitle')}>
              <div className="grid grid-cols-1 gap-2 @[26rem]:grid-cols-3">
                <Field label={t('lore.ed.groupName')} hint={t('lore.ed.groupHint')}>
                  <Input value={e.group} onChange={(ev) => onChange({ group: ev.target.value })} className="h-7 text-xs" aria-label={t('lore.ed.groupName')} />
                </Field>
                <NumField label={t('lore.ed.groupWeight')} value={e.groupWeight} onChange={(v) => onChange({ groupWeight: v ?? 0 })} />
                <TriState label={t('lore.ed.groupScoring')} value={e.groupScoringOverride} onChange={(v) => onChange({ groupScoringOverride: v })} />
              </div>
              <SwitchField label={t('lore.ed.groupPrioritize')} checked={e.groupPrioritize} onChange={(v) => onChange({ groupPrioritize: v })} />
            </Sub>

            <Sub title={t('lore.ed.recursion')}>
              <div className="flex flex-col gap-2">
                <SwitchField label={t('lore.ed.nonRecursable')} checked={e.nonRecursable} onChange={(v) => onChange({ nonRecursable: v })} />
                <SwitchField label={t('lore.ed.preventFurther')} checked={e.preventFurtherRecursion} onChange={(v) => onChange({ preventFurtherRecursion: v })} />
                <div className="max-w-40">
                  <NumField
                    label={t('lore.ed.waitsLevel')}
                    hint={t('lore.ed.waitsLevelHint')}
                    value={waits}
                    onChange={(v) => onChange({ delayUntilRecursion: v && v > 0 ? v : false })}
                  />
                </div>
              </div>
            </Sub>

            <Sub title={t('lore.ed.matching')}>
              <div className="grid grid-cols-1 gap-2 @[26rem]:grid-cols-2 @[48rem]:grid-cols-4">
                <TriState label={t('lore.set.caseSensitive')} value={e.caseSensitiveOverride} onChange={(v) => onChange({ caseSensitiveOverride: v })} />
                <TriState label={t('lore.set.wholeWords')} value={e.wholeWordsOverride} onChange={(v) => onChange({ wholeWordsOverride: v })} />
                <TriState label={t('lore.set.wordForms')} value={e.wordFormsOverride} onChange={(v) => onChange({ wordFormsOverride: v })} />
                <NumField
                  label={t('lore.ed.scanDepth')}
                  value={e.scanDepthOverride ?? ''}
                  placeholder={t('lore.ed.fromBook')}
                  min={1}
                  onChange={(v) => onChange({ scanDepthOverride: v && v > 0 ? v : null })}
                />
              </div>
            </Sub>

            <Sub title={t('lore.ed.filters')}>
              <div className="flex flex-col gap-2">
                <Field label={t('lore.ed.characters')} hint={t('lore.ed.charactersHint')}>
                  <CharacterPicker ids={e.characterFilter} onChange={(characterFilter) => onChange({ characterFilter })} />
                </Field>
                {e.characterFilter.length > 0 && (
                  <SwitchField label={t('lore.ed.exclude')} checked={e.characterFilterExclude} onChange={(v) => onChange({ characterFilterExclude: v })} />
                )}
                <Field label={t('lore.ed.tags')} hint={t('lore.ed.tagsHint')}>
                  <TagPicker tags={e.tagFilter} onChange={(tagFilter) => onChange({ tagFilter })} />
                </Field>
                <Field label={t('lore.ed.triggers')} hint={t('lore.ed.triggersHint')}>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {TRIGGER_TYPES.map((g) => (
                      <label key={g} className="flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          className="size-3.5 accent-primary"
                          checked={e.triggerFilters.includes(g)}
                          onChange={(ev) => onChange({ triggerFilters: ev.target.checked ? [...e.triggerFilters, g] : e.triggerFilters.filter((x) => x !== g) })}
                          aria-label={t(`lore.ed.gen.${g}` as never)}
                        />
                        {t(`lore.ed.gen.${g}` as never)}
                      </label>
                    ))}
                  </div>
                </Field>
              </div>
            </Sub>

            <Sub title={t('lore.ed.alsoScan')}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                {(['description', 'personality', 'scenario', 'persona'] as const).map((k) => (
                  <label key={k} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={e.matchSources[k]}
                      onChange={(ev) => onChange({ matchSources: { ...e.matchSources, [k]: ev.target.checked } })}
                      aria-label={t(`lore.ed.src.${k}` as never)}
                      className="size-3.5 accent-primary"
                    />
                    {t(`lore.ed.src.${k}` as never)}
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-1 items-end gap-2 @[26rem]:grid-cols-2">
                <SwitchField label={t('lore.ed.ignoreBudget')} hint={t('lore.ed.ignoreBudgetHint')} checked={e.ignoreBudget} onChange={(v) => onChange({ ignoreBudget: v })} />
                <Field label={t('lore.ed.automation')}>
                  <Input value={e.automationId} onChange={(ev) => onChange({ automationId: ev.target.value })} className="h-7 text-xs" aria-label={t('lore.ed.automation')} />
                </Field>
              </div>
            </Sub>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onCopyToBook}>{t('lore.ed.copyToBook')}</Button>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onDuplicate}>{t('lore.ed.duplicate')}</Button>
        <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs text-destructive" onClick={onDelete}>
          <Trash className="size-3.5" aria-hidden="true" />{t('lore.ed.deleteEntry')}
        </Button>
      </div>
    </div>
  )
}
