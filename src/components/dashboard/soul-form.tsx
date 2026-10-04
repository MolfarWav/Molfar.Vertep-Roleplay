// The form of one soul: attitude and traits on the left, spectra, rules and
// effects on the right (one column up to 640 px). All edits go through `onChange`,
// which edits the tab's working copy; nothing here saves.

import { Plus, X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useT } from '@/hooks/use-t'
import {
  CLASSES, DISPOSITION, MAX_ALIASES, MAX_COPING, MAX_TRIGGERS, PRONOUNS, RULE_X, SPECTRA, STATS, STAT_COLORS, TRAITS,
  spectrumBand, type DispositionStat, type Soul, type SoulClass, type SoulRule, type SpectrumId, type Stat, type TraitId,
} from '@/lib/soul'
import { RangeBar, Segmented, SoulCard, SubLabel } from './soul-controls'
import { effectText, fmtNum, mk, statLabel, type Effect } from './effect-text'
import { useLang } from './use-lang'

export interface VocabEvent { id: string; family: string; meaning?: string }

interface Props {
  soul: Soul
  /** traits and spectra are disabled */
  locked: boolean
  events: VocabEvent[] | null
  /** null while loading or when the plugin is not there */
  effects: Effect[] | null
  onChange: (fn: (s: Soul) => Soul) => void
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0')

export function SoulForm({ soul, locked, events, effects, onChange }: Props) {
  const t = useT()
  const lang = useLang()
  const cls: SoulClass = soul.class ?? 'neutral'

  const setStart = (stat: DispositionStat | 'hostility', v: number) => onChange((s) => ({ ...s, start: { ...s.start, [stat]: v } }))
  const setTrait = (id: TraitId, v: number) => onChange((s) => ({ ...s, traits: { ...s.traits, [id]: v } }))
  const setSpectrum = (id: SpectrumId, v: number) => onChange((s) => ({ ...s, spectra: { ...s.spectra, [id]: v } }))
  const setClass = (c: SoulClass) => onChange((s) => {
    const next: Soul = { ...s, class: c }
    if (c !== 'hostile' && next.start && 'hostility' in next.start) {
      const { hostility: _drop, ...rest } = next.start
      next.start = rest
    }
    return next
  })

  return (
    <div className="grid min-w-0 gap-3 min-[641px]:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-3">
        <SoulCard title={t('soul.attitude')} hint={t('soul.attitudeHint')}>
          <div className="flex flex-col gap-1.5">
            <SubLabel>{t('soul.class')}</SubLabel>
            <Segmented
              label={t('soul.class')}
              value={cls}
              onChange={setClass}
              options={CLASSES.map((id) => ({ id, label: t(mk(`soul.class.${id}`)) }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <SubLabel>{t('soul.pronouns')}</SubLabel>
            <Segmented
              label={t('soul.pronouns')}
              value={soul.pronouns ?? 'they'}
              onChange={(p) => onChange((s) => ({ ...s, pronouns: p }))}
              options={PRONOUNS.map((id) => ({ id, label: t(mk(`soul.pron.${id}`)) }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <SubLabel>{t('soul.startValues')}</SubLabel>
            {DISPOSITION.map((stat) => {
              const v = soul.start?.[stat] ?? 0
              return (
                <div key={stat} className="grid grid-cols-[5.5rem_minmax(0,1fr)_2.25rem] items-center gap-2 text-xs">
                  <span className="truncate">{statLabel(t, stat)}</span>
                  <RangeBar value={v} min={-20} max={20} fillFrom={0} color={STAT_COLORS[stat]} label={statLabel(t, stat)} onChange={(n) => setStart(stat, n)} />
                  <span className="text-right font-mono text-[11px]" aria-hidden="true">{signed(v)}</span>
                </div>
              )
            })}
            {cls === 'hostile' && (
              <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_2.25rem] items-center gap-2 text-xs">
                <span className="truncate">{t('soul.stat.hostility')}</span>
                <RangeBar value={soul.start?.hostility ?? 0} min={0} max={100} color={STAT_COLORS.hostility} label={t('soul.hostilityStart')} onChange={(n) => setStart('hostility', n)} />
                <span className="text-right font-mono text-[11px]" aria-hidden="true">{soul.start?.hostility ?? 0}</span>
              </div>
            )}
          </div>
        </SoulCard>

        <SoulCard title={t('soul.traits')} hint={t('soul.traitsHint')}>
          <div className="flex flex-col gap-1">
            {TRAITS.map((id) => {
              const v = soul.traits?.[id] ?? 50
              return (
                <div key={id} className="grid grid-cols-[6.5rem_minmax(0,1fr)_2.25rem] items-center gap-2 text-xs">
                  <span className="truncate" title={t(mk(`soul.trait.${id}`))}>{t(mk(`soul.trait.${id}`))}</span>
                  <RangeBar value={v} min={0} max={100} color="#8b8478" disabled={locked} label={t(mk(`soul.trait.${id}`))} onChange={(n) => setTrait(id, n)} />
                  <span className="text-right font-mono text-[11px]" aria-hidden="true">{v}</span>
                </div>
              )
            })}
          </div>
        </SoulCard>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <SoulCard title={t('soul.spectra')}>
          <div className="flex flex-col gap-3">
            {SPECTRA.map(([id, leftKey, rightKey]) => {
              const v = soul.spectra?.[id] ?? 50
              const left = t(mk(`soul.spec.${leftKey}`))
              const right = t(mk(`soul.spec.${rightKey}`))
              const band = spectrumBand(v)
              const side = band === 'farLeft' || band === 'left' ? left : right
              const word = band === 'middle'
                ? t('soul.band.middle')
                : t(band === 'farLeft' || band === 'farRight' ? 'soul.band.strong' : 'soul.band.rather', { side })
              return (
                <div key={id} className="flex flex-col gap-1">
                  <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                    <span className="min-w-0 break-words">{left}</span>
                    <span className="min-w-0 break-words text-right">{right}</span>
                  </div>
                  <RangeBar value={v} min={0} max={100} fillFrom={50} color="#8b8478" disabled={locked} label={`${left} ↔ ${right}`} onChange={(n) => setSpectrum(id, n)} />
                  <div className="pt-0.5 text-center text-[11px] text-foreground/80">{word}</div>
                </div>
              )
            })}
          </div>
        </SoulCard>

        <SoulCard title={t('soul.triggersValues')}>
          <RuleList kind="triggers" title={t('soul.triggers')} addLabel={t('soul.addTrigger')} soul={soul} events={events} onChange={onChange} />
          <RuleList kind="values" title={t('soul.values')} addLabel={t('soul.addValue')} soul={soul} events={events} onChange={onChange} />
          <div className="flex flex-col gap-1">
            <SubLabel>{t('soul.coping')} · {t('soul.copingHint')}</SubLabel>
            <Textarea
              value={soul.coping ?? ''}
              maxLength={MAX_COPING}
              rows={2}
              className="min-h-14 text-xs md:text-xs"
              aria-label={t('soul.coping')}
              onChange={(e) => onChange((s) => ({ ...s, coping: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <SubLabel>{t('soul.aliases')} · {t('soul.aliasesHint')}</SubLabel>
            <AliasInput aliases={soul.aliases ?? []} label={t('soul.aliases')} onChange={(aliases) => onChange((s) => ({ ...s, aliases }))} />
          </div>
        </SoulCard>

        <SoulCard title={t('soul.effects')}>
          {effects === null ? (
            <p className="text-xs text-muted-foreground">{t('soul.effectsOff')}</p>
          ) : effects.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('soul.effectsNone')}</p>
          ) : (
            <ul className="flex flex-col">
              {effects.map((e, i) => {
                const { tag, text } = effectText(e, t, lang)
                return (
                  <li key={i} className="flex gap-2 border-b border-dashed border-border py-1.5 text-xs last:border-b-0">
                    {tag && <b className="min-w-12 shrink-0 pt-px font-mono text-[11px] font-normal text-emerald-600 dark:text-emerald-400">{tag}</b>}
                    <span className="min-w-0 break-words">{text}</span>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="border border-border px-2.5 py-1.5 text-xs text-muted-foreground">{t('soul.lockNote')}</p>
        </SoulCard>
      </div>
    </div>
  )
}

/** Aliases are typed as a comma-separated line; the list is rebuilt on blur so
 *  a comma typed mid-word does not eat the cursor. */
function AliasInput({ aliases, onChange, label }: { aliases: string[]; onChange: (a: string[]) => void; label: string }) {
  return (
    <Input
      key={aliases.join('\u0001')}
      defaultValue={aliases.join(', ')}
      aria-label={label}
      className="h-8 text-xs md:text-xs"
      onBlur={(e) => {
        const next = e.target.value.split(',').map((a) => a.trim()).filter(Boolean).slice(0, MAX_ALIASES)
        if (next.join('\u0001') !== aliases.join('\u0001')) onChange(next)
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
    />
  )
}

function RuleList({ kind, title, addLabel, soul, events, onChange }: {
  kind: 'triggers' | 'values'
  title: string
  addLabel: string
  soul: Soul
  events: VocabEvent[] | null
  onChange: (fn: (s: Soul) => Soul) => void
}) {
  const t = useT()
  const rules: SoulRule[] = soul[kind] ?? []
  const setRules = (fn: (r: SoulRule[]) => SoulRule[]) => onChange((s) => ({ ...s, [kind]: fn(s[kind] ?? []) }))
  const firstEvent = events?.[0]?.id ?? ''
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <SubLabel>{title}</SubLabel>
        <Button
          variant="outline" size="xs" className="rounded-none"
          disabled={rules.length >= MAX_TRIGGERS}
          onClick={() => setRules((r) => [...r, { cue: '', event: firstEvent, stat: 'trust', x: 1.5 }])}
        >
          <Plus aria-hidden="true" />{addLabel}
        </Button>
      </div>
      {events === null && rules.length > 0 && <p className="text-[11px] text-muted-foreground">{t('soul.noEvents')}</p>}
      {rules.map((r, i) => (
        <RuleRow
          key={i}
          rule={r}
          events={events}
          onChange={(patch) => setRules((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x)))}
          onRemove={() => setRules((all) => all.filter((_, j) => j !== i))}
        />
      ))}
    </div>
  )
}

function RuleRow({ rule, events, onChange, onRemove }: {
  rule: SoulRule
  events: VocabEvent[] | null
  onChange: (patch: Partial<SoulRule>) => void
  onRemove: () => void
}) {
  const t = useT()
  const lang = useLang()
  const known = !events || events.some((e) => e.id === rule.event)
  const families = new Map<string, VocabEvent[]>()
  for (const e of events ?? []) families.set(e.family, [...(families.get(e.family) ?? []), e])
  const xs = RULE_X.includes(rule.x) ? RULE_X : [...RULE_X, rule.x]
  return (
    <div className="flex flex-col gap-1 border border-border p-1.5">
      <div className="flex items-center gap-1.5">
        <Input
          value={rule.cue}
          placeholder={t('soul.cue')}
          aria-label={t('soul.cue')}
          className="h-7 min-w-0 flex-1 text-xs md:text-xs"
          onChange={(e) => onChange({ cue: e.target.value })}
        />
        <Button variant="ghost" size="icon-xs" aria-label={t('soul.remove')} onClick={onRemove}><X aria-hidden="true" /></Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {events ? (
          <Select value={rule.event} onValueChange={(v) => v && onChange({ event: v })}>
            <SelectTrigger size="sm" className="min-w-0 max-w-full flex-1 text-xs" aria-label={t('soul.event')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {!known && <SelectItem value={rule.event}>{rule.event || '—'} ({t('soul.eventUnknown')})</SelectItem>}
              {[...families].map(([family, list]) => (
                <SelectGroup key={family}>
                  <SelectLabel>{family}</SelectLabel>
                  {list.map((e) => <SelectItem key={e.id} value={e.id}>{e.id}</SelectItem>)}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input value={rule.event} aria-label={t('soul.event')} className="h-7 min-w-0 flex-1 text-xs md:text-xs" onChange={(e) => onChange({ event: e.target.value })} />
        )}
        <Select value={rule.stat} onValueChange={(v) => v && onChange({ stat: v })}>
          <SelectTrigger size="sm" className="text-xs" aria-label={t('soul.stat')}><SelectValue /></SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {(STATS as readonly Stat[]).map((s) => (
              <SelectItem key={s} value={s}>
                <span className="inline-block size-2" style={{ background: STAT_COLORS[s] }} aria-hidden="true" />
                {statLabel(t, s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(rule.x)} onValueChange={(v) => v && onChange({ x: Number(v) })}>
          <SelectTrigger size="sm" className="text-xs" aria-label={t('soul.multiplier')}><SelectValue /></SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {xs.map((x) => <SelectItem key={x} value={String(x)}>×{fmtNum(x, lang)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {!known && <p className="text-[11px] text-amber-600 dark:text-amber-400">{t('soul.eventUnknown')}</p>}
    </div>
  )
}
