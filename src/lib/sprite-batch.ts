import { DEFAULT_OUTFIT, outfitName, parseSpriteFile, spriteKey, type SpriteLike, type SpriteOwner } from '@/lib/expressions'

/**
 * Adding many sprite files at once (issue #170): the pure part. The dialog shows `BatchFile`s read from the
 * file names; the user fixes them; `planBatch` says what will land where and what it replaces; `mergeSprites`
 * puts the stored pictures into the card's list. Nothing here touches the DOM, the network or the store.
 */

export interface BatchFile {
  /** position in the drop; stays when the list is edited */
  id: number
  /** the file's name as dropped */
  name: string
  /** whose sprite: a voice's name, '' = the card itself / shared */
  character: string
  /** '' = default */
  outfit: string
  emotion: string
  skip: boolean
  /** the emotion word was recognized in the name */
  known: boolean
}

/** What to do with a file whose slot is taken, by the card or by an earlier file of the batch. */
export type ClashMode = 'replace' | 'both' | 'skip'

export function batchFromNames(names: readonly string[], owners: readonly SpriteOwner[]): BatchFile[] {
  return names.map((name, id) => {
    const p = parseSpriteFile(name, owners)
    return { id, name, character: p.character, outfit: p.outfit, emotion: p.emotion, skip: false, known: p.known }
  })
}

const keyOf = (f: Pick<BatchFile, 'character' | 'outfit' | 'emotion'>) => spriteKey({ name: f.emotion, character: f.character, outfit: f.outfit })

export interface BatchGroup {
  character: string
  outfit: string
  ids: number[]
  /** files not skipped */
  active: number
}

/** Files grouped by (character, outfit), in the order the groups first appear. */
export function batchGroups(files: readonly BatchFile[]): BatchGroup[] {
  const map = new Map<string, BatchGroup>()
  for (const f of files) {
    const key = `${f.character.toLowerCase()}\u0001${outfitName(f).toLowerCase()}`
    let g = map.get(key)
    if (!g) map.set(key, (g = { character: f.character, outfit: f.outfit, ids: [], active: 0 }))
    g.ids.push(f.id)
    if (!f.skip) g.active++
  }
  return [...map.values()]
}

/** Move every file of one group to another character and/or outfit (the group's header edit, or the bulk action). */
export function setGroup(files: readonly BatchFile[], ids: readonly number[], to: { character?: string; outfit?: string }): BatchFile[] {
  const set = new Set(ids)
  return files.map((f) => (set.has(f.id) ? { ...f, ...(to.character !== undefined ? { character: to.character } : {}), ...(to.outfit !== undefined ? { outfit: to.outfit.trim() } : {}) } : f))
}

export function setSkip(files: readonly BatchFile[], ids: readonly number[], skip: boolean): BatchFile[] {
  const set = new Set(ids)
  return files.map((f) => (set.has(f.id) ? { ...f, skip } : f))
}

export interface Clashes {
  /** distinct slots of the card that the batch would replace */
  replaces: number
  /** files that share a slot with an earlier file of the same batch */
  shared: number
}

/** How many sprites already on the card the batch replaces, and how many of its files share a slot among themselves. */
export function countClashes(files: readonly BatchFile[], existing: readonly SpriteLike[]): Clashes {
  const have = new Set(existing.map(spriteKey))
  const seen = new Set<string>()
  let shared = 0
  for (const f of files) {
    if (f.skip) continue
    const k = keyOf(f)
    if (seen.has(k)) shared++
    else seen.add(k)
  }
  let replaces = 0
  for (const k of seen) if (have.has(k)) replaces++
  return { replaces, shared }
}

export interface PlannedSprite { id: number; name: string; character: string; outfit: string }

export interface BatchPlan {
  adds: PlannedSprite[]
  /** card slots the new pictures take over */
  replaced: number
  /** files put aside in an outfit "<outfit> 2" (mode "both") */
  moved: number
  /** files left out because of a clash (mode "skip") or because a later file took their slot (mode "replace") */
  dropped: number
}

/**
 * What the batch will do. `replace`: for a slot used twice the LAST file wins, and it takes over the card's sprite.
 * `both`: the first file takes a free slot, a later one whose slot is taken (by the card or an earlier file) goes to the
 * outfit "<outfit> 2" (3, 4… while those are taken too). `skip`: a file whose slot is taken is left out.
 */
export function planBatch(files: readonly BatchFile[], existing: readonly SpriteLike[], mode: ClashMode): BatchPlan {
  const active = files.filter((f) => !f.skip)
  const have = new Set(existing.map(spriteKey))
  const plan = (f: BatchFile, outfit = f.outfit): PlannedSprite => ({ id: f.id, name: f.emotion, character: f.character, outfit })
  if (mode === 'replace') {
    const winner = new Map<string, BatchFile>()
    for (const f of active) winner.set(keyOf(f), f)
    const adds = active.filter((f) => winner.get(keyOf(f)) === f).map((f) => plan(f))
    return { adds, replaced: adds.filter((a) => have.has(spriteKey({ name: a.name, character: a.character, outfit: a.outfit }))).length, moved: 0, dropped: active.length - adds.length }
  }
  const taken = new Set(have)
  const adds: PlannedSprite[] = []
  let moved = 0
  let dropped = 0
  for (const f of active) {
    const k = keyOf(f)
    if (!taken.has(k)) { taken.add(k); adds.push(plan(f)); continue }
    if (mode === 'skip') { dropped++; continue }
    const base = outfitName(f)
    for (let n = 2; ; n++) {
      const outfit = `${base} ${n}`
      const k2 = spriteKey({ name: f.emotion, character: f.character, outfit })
      if (taken.has(k2)) continue
      taken.add(k2)
      adds.push(plan(f, outfit))
      moved++
      break
    }
  }
  return { adds, replaced: 0, moved, dropped }
}

/** Puts stored pictures into the card's list: a slot that exists takes the new picture in its place, a new one is added at the end. */
export function mergeSprites<T extends SpriteLike>(existing: readonly T[], added: readonly { name: string; character: string; outfit: string; url: string }[]): { list: (T | SpriteLike)[]; replaced: number } {
  const list: (T | SpriteLike)[] = [...existing]
  const at = new Map<string, number>()
  list.forEach((s, i) => at.set(spriteKey(s), i))
  const had = new Set(list.map(spriteKey))
  let replaced = 0
  const replacedKeys = new Set<string>()
  for (const a of added) {
    const sprite: SpriteLike = {
      name: a.name,
      url: a.url,
      ...(a.character ? { character: a.character } : {}),
      ...(a.outfit && a.outfit.toLowerCase() !== DEFAULT_OUTFIT ? { outfit: a.outfit } : {}),
    }
    const k = spriteKey(sprite)
    const i = at.get(k)
    if (i === undefined) { at.set(k, list.length); list.push(sprite) } else {
      // keep what the slot is called (its case) and any field the new entry does not carry
      list[i] = { ...list[i]!, url: a.url }
      if (had.has(k) && !replacedKeys.has(k)) { replacedKeys.add(k); replaced++ }
    }
  }
  return { list, replaced }
}
