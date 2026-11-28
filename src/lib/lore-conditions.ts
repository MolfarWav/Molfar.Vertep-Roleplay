// More conditions on a lorebook entry (Molfar.Vertep#547): extra key blocks and conditions on the scene. The engine
// plugin reads the same shapes (`wiKeyBlocks`, `wiSceneFilter`); the caps here mirror it.
import type { EntryLogic, LoreEntry, LoreKeyBlock, LoreSceneFilter } from '@/lib/types'

/** Key blocks an entry may carry besides its secondary keys (the plugin's WI_MORE_MAX). */
export const MORE_KEYS_MAX = 4

/** The Dashboard's parts of the day (the plugin's WI_BANDS). */
export const SCENE_BANDS = ['dawn', 'morning', 'late morning', 'day', 'evening', 'night'] as const
export type SceneBand = (typeof SCENE_BANDS)[number]

const LOGICS: EntryLogic[] = ['AND_ANY', 'AND_ALL', 'NOT_ANY', 'NOT_ALL']
const words = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean) : [])

export const emptySceneFilter = (): LoreSceneFilter => ({
  places: [], placesExclude: false, present: [], presentExclude: false, times: [], weather: [], weatherExclude: false,
})

/** True when no condition says anything (an "except" switch alone says nothing). */
export const sceneFilterEmpty = (f: LoreSceneFilter | undefined): boolean =>
  !f || !(f.places.length || f.present.length || f.times.length || f.weather.length)

/** The entry's extra key blocks as stored, cleaned; a block with no keys yet is kept (the editor is filling it). */
export function cleanMoreKeys(v: unknown): LoreKeyBlock[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out = v
    .filter((b): b is Record<string, unknown> => !!b && typeof b === 'object' && !Array.isArray(b))
    .slice(0, MORE_KEYS_MAX)
    .map((b) => ({ logic: LOGICS.includes(b.logic as EntryLogic) ? (b.logic as EntryLogic) : 'AND_ANY', keys: words(b.keys) }))
  return out.length ? out : undefined
}

/** The entry's scene conditions as stored, cleaned; undefined when there are none. */
export function cleanSceneFilter(v: unknown): LoreSceneFilter | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  const o = v as Record<string, unknown>
  const f: LoreSceneFilter = {
    places: words(o.places), placesExclude: o.placesExclude === true,
    present: words(o.present), presentExclude: o.presentExclude === true,
    times: SCENE_BANDS.filter((b) => words(o.times).some((x) => x.toLowerCase() === b)),
    weather: words(o.weather), weatherExclude: o.weatherExclude === true,
  }
  return sceneFilterEmpty(f) ? undefined : f
}

/** The patch for one change to the scene conditions: the field goes away with its last condition. */
export function patchScene(entry: Pick<LoreEntry, 'sceneFilter'>, p: Partial<LoreSceneFilter>): Pick<LoreEntry, 'sceneFilter'> {
  const next = { ...emptySceneFilter(), ...entry.sceneFilter, ...p }
  // an "except" switch goes off with its list, so a list filled later starts as "only"
  if (!next.places.length) next.placesExclude = false
  if (!next.present.length) next.presentExclude = false
  if (!next.weather.length) next.weatherExclude = false
  return { sceneFilter: sceneFilterEmpty(next) ? undefined : next }
}
