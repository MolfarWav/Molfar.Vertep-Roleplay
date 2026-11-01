import type { ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Fold } from '@/components/ui/fold'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { NumControl, Segmented, SettingRow } from '@/components/ui/setting-row'
import { CharacterPicker, TagPicker } from '@/components/lore/entry-pickers'
import { KeyChips } from '@/components/lore/key-chips'
import { POSITION_CHOICES, POSITION_KEY, POSITION_SHORT_KEY, LOGIC_KEY, TRIGGER_TYPES, canonicalPosition } from '@/components/lore/lore-labels'
import { useT } from '@/hooks/use-t'
import {
  groupsSummary, hasChainLimits, matchSummary, onlyWhenSummary, staysSummary, triOf, triValue, waitsOf, waitsValue, whereSummary,
} from '@/lib/lore-entry'
import { useApp } from '@/lib/store'
import type { MsgKey } from '@/lib/i18n'
import type { EntryLogic, EntryPosition, LoreEntry } from '@/lib/types'

const GEN_KEY: Record<(typeof TRIGGER_TYPES)[number], MsgKey> = {
  normal: 'lore.ed.gen.normal',
  continue: 'lore.ed.gen.continue',
  impersonate: 'lore.ed.gen.impersonate',
  swipe: 'lore.ed.gen.swipe',
  regenerate: 'lore.ed.gen.regenerate',
  quiet: 'lore.ed.gen.quiet',
}

const SOURCE_KEY = {
  description: 'lore.ed.src.description',
  personality: 'lore.ed.src.personality',
  scenario: 'lore.ed.src.scenario',
  persona: 'lore.ed.src.persona',
} as const satisfies Record<string, MsgKey>
type SourceName = keyof typeof SOURCE_KEY
const SOURCES = Object.keys(SOURCE_KEY) as SourceName[]

const LOGICS: EntryLogic[] = ['AND_ANY', 'AND_ALL', 'NOT_ANY', 'NOT_ALL']

/**
 * The five folds under the always-visible part of the entry panel. Each is a sibling (no fold inside a fold), shows a
 * one-line summary while closed and remembers its own open state. Every setting of the old editor is here, grouped by
 * what it does for the player: where the entry goes, when it is allowed, how long it stays, how it chains with other
 * entries, and how its keys are matched.
 *
 * The row helpers are plain functions, not components: a component declared inside this one would be a new type on
 * every render and remount its input, so the field would lose focus while typing.
 */
export function EntryFolds({ entry: e, onChange }: { entry: LoreEntry; onChange: (p: Partial<LoreEntry>) => void }) {
  const t = useT()
  const characters = useApp((s) => s.characters)

  const position = canonicalPosition(e.position) as EntryPosition
  const atDepth = position === 'at_depth'
  const waits = waitsOf(e.delayUntilRecursion)
  const speakerNames = e.characterFilter.map((id) => characters.find((c) => c.id === id)?.name ?? id)
  const kinds = TRIGGER_TYPES.filter((g) => e.triggerFilters.includes(g)).map((g) => t(GEN_KEY[g]))
  const sources = SOURCES.filter((k) => e.matchSources[k]).map((k) => t(SOURCE_KEY[k]))
  const positionLabel = atDepth ? t('lore.posShort.at_depth', { n: e.depth }) : t(POSITION_SHORT_KEY[position] ?? 'lore.posShort.before_char')

  const numRow = (label: string, value: number, min: number, max: number, onCommit: (n: number) => void, status?: string): ReactNode => (
    <SettingRow label={label} status={status}>
      <NumControl label={label} value={value} min={min} max={max} onCommit={onCommit} />
    </SettingRow>
  )
  const swRow = (label: string, checked: boolean, set: (v: boolean) => void, status?: string): ReactNode => (
    <SettingRow label={label} status={status}>
      <Switch tone="cta" checked={checked} onCheckedChange={set} aria-label={label} />
    </SettingRow>
  )
  const triRow = (label: string, value: boolean | null, set: (v: boolean | null) => void): ReactNode => (
    <SettingRow label={label}>
      <Segmented
        label={label}
        value={triOf(value)}
        options={[
          { id: 'book', label: t('lore.ed.tri.book') },
          { id: 'on', label: t('lore.ed.tri.on') },
          { id: 'off', label: t('lore.ed.tri.off') },
        ]}
        onChange={(c) => set(triValue(c))}
      />
    </SettingRow>
  )
  const selectRow = (label: string, control: ReactNode): ReactNode => (
    <SettingRow label={label}>{control}</SettingRow>
  )
  const block = (label: string, children: ReactNode, hint?: string): ReactNode => (
    <div className="flex flex-col gap-1.5 px-4 py-3">
      <span className="text-body font-medium">{label}</span>
      {children}
      {hint && <p className="text-caption text-muted-foreground">{hint}</p>}
    </div>
  )

  return (
    <div className="flex flex-col gap-2">
      <Fold
        id="lore-entry-where"
        title={t('lore.ed.where')}
        tone="sky"
        summary={whereSummary({ positionLabel, roleLabel: atDepth ? t(`lore.ed.role.${e.role}` as MsgKey) : null, order: e.order, ignoreBudget: e.ignoreBudget }, t)}
      >
        {selectRow(t('lore.ed.position'),
          <Select value={position} onValueChange={(v) => v && onChange({ position: v as EntryPosition })}>
            <SelectTrigger className="h-8 w-56 max-w-full text-body max-md:h-10" aria-label={t('lore.ed.position')}><SelectValue /></SelectTrigger>
            <SelectContent>
              {POSITION_CHOICES.map((p) => <SelectItem key={p} value={p}>{t(POSITION_KEY[p]!)}</SelectItem>)}
            </SelectContent>
          </Select>,
        )}
        {atDepth && selectRow(t('lore.ed.role'),
          <Select value={e.role} onValueChange={(v) => v && onChange({ role: v as LoreEntry['role'] })}>
            <SelectTrigger className="h-8 w-56 max-w-full text-body max-md:h-10" aria-label={t('lore.ed.role')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="system">{t('lore.ed.role.system')}</SelectItem>
              <SelectItem value="user">{t('lore.ed.role.user')}</SelectItem>
              <SelectItem value="assistant">{t('lore.ed.role.assistant')}</SelectItem>
            </SelectContent>
          </Select>,
        )}
        {atDepth && numRow(t('lore.ed.depth'), e.depth, 0, 10000, (v) => onChange({ depth: v }))}
        {numRow(t('lore.ed.order'), e.order, 0, 1000000, (v) => onChange({ order: v }), t('lore.ed.orderHint'))}
        {swRow(t('lore.ed.ignoreBudget'), e.ignoreBudget, (v) => onChange({ ignoreBudget: v }), t('lore.ed.ignoreBudgetHint'))}
      </Fold>

      <Fold
        id="lore-entry-only-when"
        title={t('lore.ed.onlyWhen')}
        tone="violet"
        summary={onlyWhenSummary({
          secondaryCount: e.secondaryKeys.length,
          probability: e.probability,
          speakers: speakerNames,
          speakerExclude: e.characterFilterExclude,
          tags: e.tagFilter,
          kinds,
        }, t)}
      >
        {block(t('lore.ed.secondaryKeys'),
          <KeyChips
            id={`lore-second-${e.id}`}
            keys={e.secondaryKeys}
            onChange={(secondaryKeys) => onChange({ secondaryKeys })}
            label={t('lore.ed.secondaryKeys')}
            placeholder={t('lore.ed.keysPlaceholder')}
          />,
          t('lore.ed.secondaryHint'),
        )}
        {selectRow(t('lore.ed.logic'),
          <Select value={e.logic} onValueChange={(v) => v && onChange({ logic: v as EntryLogic })}>
            <SelectTrigger className="h-8 w-56 max-w-full text-body max-md:h-10" aria-label={t('lore.ed.logic')}><SelectValue /></SelectTrigger>
            <SelectContent>
              {LOGICS.map((l) => <SelectItem key={l} value={l}>{t(LOGIC_KEY[l])}</SelectItem>)}
            </SelectContent>
          </Select>,
        )}
        {numRow(t('lore.ed.trigger'), e.probability, 0, 100, (p) => onChange({ probability: p, useProbability: p < 100 }), t('lore.ed.triggerHint'))}
        {block(t('lore.ed.characters'),
          <CharacterPicker ids={e.characterFilter} onChange={(characterFilter) => onChange({ characterFilter })} />,
          t('lore.ed.charactersHint'),
        )}
        {e.characterFilter.length > 0 && swRow(t('lore.ed.exclude'), e.characterFilterExclude, (v) => onChange({ characterFilterExclude: v }))}
        {block(t('lore.ed.tags'),
          <TagPicker tags={e.tagFilter} onChange={(tagFilter) => onChange({ tagFilter })} />,
          t('lore.ed.tagsHint'),
        )}
        {block(t('lore.ed.triggers'),
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {TRIGGER_TYPES.map((g) => (
              <label key={g} className="flex min-h-10 items-center gap-2 text-body md:min-h-8">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={e.triggerFilters.includes(g)}
                  onChange={(ev) => onChange({ triggerFilters: ev.target.checked ? [...e.triggerFilters, g] : e.triggerFilters.filter((x) => x !== g) })}
                />
                {t(GEN_KEY[g])}
              </label>
            ))}
          </div>,
          t('lore.ed.triggersHint'),
        )}
      </Fold>

      <Fold
        id="lore-entry-stays"
        title={t('lore.ed.stays')}
        tone="teal"
        summary={staysSummary({ sticky: e.sticky, cooldown: e.cooldown, delay: e.delay }, t)}
      >
        {numRow(t('lore.ed.sticky'), e.sticky, 0, 10000, (v) => onChange({ sticky: v }), t('lore.ed.stickyHint'))}
        {numRow(t('lore.ed.cooldown'), e.cooldown, 0, 10000, (v) => onChange({ cooldown: v }), t('lore.ed.cooldownHint'))}
        {numRow(t('lore.ed.delay'), e.delay, 0, 10000, (v) => onChange({ delay: v }), t('lore.ed.delayHint'))}
      </Fold>

      <Fold
        id="lore-entry-groups"
        title={t('lore.ed.groupsChains')}
        tone="pink"
        summary={groupsSummary({ group: e.group, chainLimits: hasChainLimits(e) }, t)}
      >
        {block(t('lore.ed.groupName'),
          <Input value={e.group} onChange={(ev) => onChange({ group: ev.target.value })} aria-label={t('lore.ed.groupName')} className="h-8 text-body max-md:h-10" />,
          t('lore.ed.groupHint'),
        )}
        {numRow(t('lore.ed.groupWeight'), e.groupWeight, 0, 1000000, (v) => onChange({ groupWeight: v }))}
        {triRow(t('lore.ed.groupScoring'), e.groupScoringOverride, (v) => onChange({ groupScoringOverride: v }))}
        {swRow(t('lore.ed.groupPrioritize'), e.groupPrioritize, (v) => onChange({ groupPrioritize: v }))}
        {swRow(t('lore.ed.nonRecursable'), e.nonRecursable, (v) => onChange({ nonRecursable: v }))}
        {swRow(t('lore.ed.preventFurther'), e.preventFurtherRecursion, (v) => onChange({ preventFurtherRecursion: v }))}
        {numRow(t('lore.ed.waitsLevel'), waits, 0, 100, (v) => onChange({ delayUntilRecursion: waitsValue(v) }), t('lore.ed.waitsLevelHint'))}
      </Fold>

      <Fold
        id="lore-entry-match"
        title={t('lore.ed.matchKeys')}
        tone="slate"
        summary={matchSummary({
          caseSensitive: e.caseSensitiveOverride,
          wholeWords: e.wholeWordsOverride,
          wordForms: e.wordFormsOverride,
          scanDepth: e.scanDepthOverride,
          sources,
          automationId: e.automationId,
        }, t)}
      >
        {triRow(t('lore.set.caseSensitive'), e.caseSensitiveOverride, (v) => onChange({ caseSensitiveOverride: v }))}
        {triRow(t('lore.set.wholeWords'), e.wholeWordsOverride, (v) => onChange({ wholeWordsOverride: v }))}
        {triRow(t('lore.set.wordForms'), e.wordFormsOverride, (v) => onChange({ wordFormsOverride: v }))}
        {numRow(t('lore.ed.scanDepth'), e.scanDepthOverride ?? 0, 0, 100000, (v) => onChange({ scanDepthOverride: v > 0 ? v : null }), t('lore.ed.scanDepthHint'))}
        {block(t('lore.ed.alsoScan'),
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {SOURCES.map((k) => (
              <label key={k} className="flex min-h-10 items-center gap-2 text-body md:min-h-8">
                <input
                  type="checkbox"
                  checked={e.matchSources[k]}
                  onChange={(ev) => onChange({ matchSources: { ...e.matchSources, [k]: ev.target.checked } })}
                  className="size-4 accent-primary"
                />
                {t(SOURCE_KEY[k])}
              </label>
            ))}
          </div>,
        )}
        {block(t('lore.ed.automation'),
          <Input value={e.automationId} onChange={(ev) => onChange({ automationId: ev.target.value })} aria-label={t('lore.ed.automation')} className="h-8 text-body max-md:h-10" />,
        )}
      </Fold>
    </div>
  )
}
