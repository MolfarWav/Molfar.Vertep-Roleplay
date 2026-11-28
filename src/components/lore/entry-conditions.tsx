// The two condition blocks of the lore entry editor added by Molfar.Vertep#547: the key blocks (secondary keys and the
// ones added with "+ Add condition") and the conditions on the scene (place, who is there, time of day, weather).
import { useEffect, useState } from 'react'
import { Plus, X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SettingRow } from '@/components/ui/setting-row'
import { Switch } from '@/components/ui/switch'
import { KeyChips } from '@/components/lore/key-chips'
import { LOGIC_KEY } from '@/components/lore/lore-labels'
import { useT } from '@/hooks/use-t'
import type { MsgKey } from '@/lib/i18n'
import { MORE_KEYS_MAX, SCENE_BANDS, patchScene, type SceneBand } from '@/lib/lore-conditions'
import { useApp } from '@/lib/store'
import type { EntryLogic, LoreEntry, LoreKeyBlock } from '@/lib/types'
import { cn } from '@/lib/utils'
import { loadWorldHere, peekWorld } from '@/lib/world'

const LOGICS: EntryLogic[] = ['AND_ANY', 'AND_ALL', 'NOT_ANY', 'NOT_ALL']

export const BAND_KEY: Record<SceneBand, MsgKey> = {
  dawn: 'lore.band.dawn',
  morning: 'lore.band.morning',
  'late morning': 'lore.band.lateMorning',
  day: 'lore.band.day',
  evening: 'lore.band.evening',
  night: 'lore.band.night',
}

/** The secondary keys and the extra blocks: each is "rule + words", and all of them must hold. */
export function KeyBlocks({ entry: e, onChange }: { entry: LoreEntry; onChange: (p: Partial<LoreEntry>) => void }) {
  const t = useT()
  const more = e.moreKeys ?? []
  const setMore = (next: LoreKeyBlock[]) => onChange({ moreKeys: next.length ? next : undefined })
  const patch = (i: number, p: Partial<LoreKeyBlock>) => setMore(more.map((b, n) => (n === i ? { ...b, ...p } : b)))

  const rule = (value: EntryLogic, set: (v: EntryLogic) => void, label: string) => (
    <Select value={value} onValueChange={(v) => v && set(v as EntryLogic)}>
      <SelectTrigger className="h-8 w-48 max-w-full text-body max-md:h-10" aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>
        {LOGICS.map((l) => <SelectItem key={l} value={l}>{t(LOGIC_KEY[l])}</SelectItem>)}
      </SelectContent>
    </Select>
  )

  return (
    <div className="flex flex-col gap-2 px-4 py-3" data-testid="key-blocks">
      <span className="text-body font-medium">{t('lore.ed.secondaryKeys')}</span>
      <p className="text-caption text-muted-foreground">{t('lore.ed.secondaryHint')}</p>
      <div className="flex flex-col gap-1.5">
        {rule(e.logic, (logic) => onChange({ logic }), t('lore.ed.logic'))}
        <KeyChips
          id={`lore-second-${e.id}`}
          keys={e.secondaryKeys}
          onChange={(secondaryKeys) => onChange({ secondaryKeys })}
          label={t('lore.ed.secondaryKeys')}
          placeholder={t('lore.ed.keysPlaceholder')}
        />
      </div>
      {more.map((b, i) => {
        const n = i + 2
        return (
          <div key={i} className="flex flex-col gap-1.5 border-t border-border pt-2" data-testid="key-block">
            <div className="flex items-center gap-2">
              {rule(b.logic, (logic) => patch(i, { logic }), t('lore.ed.conditionRule', { n }))}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ml-auto size-8 shrink-0 max-md:size-10"
                aria-label={t('lore.ed.removeCondition', { n })}
                title={t('lore.ed.removeCondition', { n })}
                onClick={() => setMore(more.filter((_, k) => k !== i))}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
            <KeyChips
              id={`lore-more-${e.id}-${i}`}
              keys={b.keys}
              onChange={(keys) => patch(i, { keys })}
              label={t('lore.ed.conditionKeys', { n })}
              placeholder={t('lore.ed.keysPlaceholder')}
            />
          </div>
        )
      })}
      {more.length < MORE_KEYS_MAX ? (
        <Button type="button" variant="outline" size="sm" className="self-start max-md:h-10" onClick={() => setMore([...more, { logic: 'NOT_ANY', keys: [] }])}>
          <Plus className="size-4" aria-hidden="true" />
          {t('lore.ed.addCondition')}
        </Button>
      ) : (
        <p className="text-caption text-muted-foreground">{t('lore.ed.conditionsFull', { n: MORE_KEYS_MAX + 1 })}</p>
      )}
      {more.length > 0 && <p className="text-caption text-muted-foreground">{t('lore.ed.conditionsAll')}</p>}
    </div>
  )
}

/** Names the open chat already knows, as one-tap suggestions. Only places the story has been to, so a world built
 *  ahead of the story gives nothing away. */
function useSceneNames(): { places: string[]; people: string[] } {
  const chatId = useApp((s) => s.activeChatId)
  const personas = useApp((s) => s.personas)
  const [names, setNames] = useState<{ places: string[]; people: string[] }>({ places: [], people: [] })
  useEffect(() => {
    let live = true
    setNames({ places: [], people: [] })
    if (!chatId) return
    void (async () => {
      const [here, records] = await Promise.all([
        loadWorldHere(chatId).catch(() => null),
        peekWorld({ chatId }).catch(() => []),
      ])
      if (!live) return
      const visited = records.filter((r) => r.kind === 'place' && r.status === 'active' && (r.visits ?? 0) > 0).map((r) => r.name)
      const places = [...new Set([here?.place?.name, here?.parent?.name, ...visited].filter((x): x is string => !!x))]
      setNames({ places: places.slice(0, 12), people: (here?.present ?? []).slice(0, 12) })
    })()
    return () => { live = false }
  }, [chatId])
  // the World list of who is there counts the player's own character in; a condition never matches it
  const own = new Set(['you', ...personas.map((p) => p.name.trim().toLowerCase())])
  return { places: names.places, people: names.people.filter((n) => !own.has(n.trim().toLowerCase())) }
}

function Suggestions({ names, taken, onPick, label }: { names: string[]; taken: string[]; onPick: (name: string) => void; label: string }) {
  const low = new Set(taken.map((x) => x.toLowerCase()))
  const left = names.filter((n) => !low.has(n.toLowerCase()))
  if (!left.length) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      <span className="text-caption text-muted-foreground">{label}</span>
      {left.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onPick(n)}
          className="inline-flex min-h-10 max-w-full items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-caption text-muted-foreground hover:bg-accent/50 md:min-h-7"
        >
          <Plus className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{n}</span>
        </button>
      ))}
    </div>
  )
}

/** Where and when: each filled condition must hold; inside one list, any of its words is enough. */
export function SceneConditions({ entry: e, onChange }: { entry: LoreEntry; onChange: (p: Partial<LoreEntry>) => void }) {
  const t = useT()
  const seen = useSceneNames()
  const f = e.sceneFilter
  const places = f?.places ?? []
  const present = f?.present ?? []
  const times = f?.times ?? []
  const weather = f?.weather ?? []
  const set = (p: Parameters<typeof patchScene>[1]) => onChange(patchScene(e, p))

  const except = (label: string, checked: boolean, change: (v: boolean) => void) => (
    <SettingRow label={label}>
      <Switch tone="cta" checked={checked} onCheckedChange={change} aria-label={label} />
    </SettingRow>
  )
  const list = (id: string, label: string, hint: string, keys: string[], change: (v: string[]) => void, placeholder: string, suggest?: { names: string[]; label: string }) => (
    <div className="flex flex-col gap-1.5 px-4 py-3">
      <span className="text-body font-medium">{label}</span>
      <KeyChips id={id} keys={keys} onChange={change} label={label} placeholder={placeholder} />
      {suggest && <Suggestions names={suggest.names} taken={keys} label={suggest.label} onPick={(n) => change([...keys, n])} />}
      <p className="text-caption text-muted-foreground">{hint}</p>
    </div>
  )

  return (
    <>
      <p className="px-4 py-3 text-caption text-muted-foreground">{t('lore.ed.sceneIntro')}</p>
      {list(`lore-scene-places-${e.id}`, t('lore.ed.places'), t('lore.ed.placesHint'), places, (v) => set({ places: v }), t('lore.ed.placesPlaceholder'), { names: seen.places, label: t('lore.ed.fromChat') })}
      {places.length > 0 && except(t('lore.ed.placesExclude'), !!f?.placesExclude, (v) => set({ placesExclude: v }))}
      {list(`lore-scene-present-${e.id}`, t('lore.ed.present'), t('lore.ed.presentHint'), present, (v) => set({ present: v }), t('lore.ed.presentPlaceholder'), { names: seen.people, label: t('lore.ed.fromChat') })}
      {present.length > 0 && except(t('lore.ed.presentExclude'), !!f?.presentExclude, (v) => set({ presentExclude: v }))}
      <div className="flex flex-col gap-1.5 px-4 py-3">
        <span className="text-body font-medium">{t('lore.ed.times')}</span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('lore.ed.times')}>
          {SCENE_BANDS.map((b) => {
            const on = times.includes(b)
            return (
              <button
                key={b}
                type="button"
                aria-pressed={on}
                onClick={() => set({ times: on ? times.filter((x) => x !== b) : SCENE_BANDS.filter((x) => x === b || times.includes(x)) })}
                className={cn(
                  'min-h-10 rounded-full border px-3 text-caption md:min-h-0 md:px-2.5 md:py-0.5',
                  on ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground hover:bg-accent/50',
                )}
              >
                {t(BAND_KEY[b])}
              </button>
            )
          })}
        </div>
        <p className="text-caption text-muted-foreground">{t('lore.ed.timesHint')}</p>
      </div>
      {list(`lore-scene-weather-${e.id}`, t('lore.ed.weather'), t('lore.ed.weatherHint'), weather, (v) => set({ weather: v }), t('lore.ed.weatherPlaceholder'))}
      {weather.length > 0 && except(t('lore.ed.weatherExclude'), !!f?.weatherExclude, (v) => set({ weatherExclude: v }))}
    </>
  )
}
