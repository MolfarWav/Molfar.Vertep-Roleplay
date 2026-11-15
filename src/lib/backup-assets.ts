// Pictures in a studio backup (Molfar Vertep issue #89). Card gallery images, generated pictures and
// backgrounds live in the engine's asset store and the backup's files only point at them
// (`/v1/assets/<id>`). The plugin that builds the zip cannot read that store, so the app adds the bytes
// itself after export and puts them back before import. Ids are the SHA-256 of the bytes, so a picture
// restored on another install gets the id the files already carry: nothing to rewrite.
import { deflateSync, strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

const ASSET_URL = /\/v1\/assets\/([a-f0-9]{64})(?![a-f0-9])/gi
const TEXT_ENTRY = /\.(json|jsonl)$/i
const DIR = 'assets/'
const INDEX = 'assets/index.json'

export type AssetMeta = { mime: string; name: string | null }
export type AssetBytes = { bytes: Uint8Array; mime: string; name: string | null }

const b64ToBytes = (b64: string): Uint8Array => {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const bytesToB64 = (bytes: Uint8Array): string => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[])
  return btoa(s)
}

/** Asset ids the backup's JSON files point at, in the order first met. */
export function referencedAssetIds(files: Record<string, Uint8Array>): string[] {
  const ids = new Set<string>()
  for (const [name, data] of Object.entries(files)) {
    if (!TEXT_ENTRY.test(name) || name.startsWith(DIR)) continue
    for (const m of strFromU8(data).matchAll(ASSET_URL)) ids.add(m[1]!.toLowerCase())
  }
  return [...ids]
}

/** Reads one stored picture from the engine; null when it is gone. */
export async function fetchAsset(id: string): Promise<AssetBytes | null> {
  const r = await fetch(`/v1/assets/${id}`)
  if (!r.ok) return null
  const disposition = r.headers.get('content-disposition') ?? ''
  return {
    bytes: new Uint8Array(await r.arrayBuffer()),
    mime: r.headers.get('content-type') || 'application/octet-stream',
    name: /filename="([^"]*)"/.exec(disposition)?.[1] || null,
  }
}

/** Stores one picture in the engine; false when the engine refused it. */
export async function putAsset(a: AssetBytes): Promise<boolean> {
  const r = await fetch(`/v1/assets${a.name ? `?name=${encodeURIComponent(a.name.slice(0, 120))}` : ''}`, {
    method: 'PUT', headers: { 'content-type': a.mime }, body: a.bytes as unknown as BodyInit,
  })
  return r.ok
}

/** Runs `job` over `items`, a few at a time. */
async function pool<T>(items: T[], size: number, job: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) await job(items[next++]!)
  }))
}

/** The backup zip (base64, as the plugin returns it) with every picture its files point at added under
 *  `assets/<id>` and an `assets/index.json` that keeps their types and names. `missing` counts pictures
 *  the files point at but the store no longer has. */
export async function addAssetsToBackup(
  zipBase64: string,
  fetchOne: (id: string) => Promise<AssetBytes | null> = fetchAsset,
): Promise<{ base64: string; included: number; missing: number }> {
  const files: Record<string, Uint8Array> = unzipSync(b64ToBytes(zipBase64))
  const ids = referencedAssetIds(files)
  if (!ids.length) return { base64: zipBase64, included: 0, missing: 0 }
  const index: Record<string, AssetMeta> = {}
  let missing = 0
  await pool(ids, 4, async (id) => {
    const got = await fetchOne(id).catch(() => null)
    if (!got) { missing++; return }
    files[DIR + id] = got.bytes
    index[id] = { mime: got.mime, name: got.name }
  })
  const included = Object.keys(index).length
  if (!included) return { base64: zipBase64, included: 0, missing }
  files[INDEX] = strToU8(JSON.stringify(index))
  // level 0: pictures are already compressed and the plugin's own entries are stored too
  return { base64: bytesToB64(zipSync(files, { level: 0 })), included, missing }
}

/** Puts the pictures of a backup file back into the engine and returns the zip without them (what the
 *  import plugin reads). A zip with no `assets/` folder comes back untouched. */
export async function restoreBackupAssets(
  zip: Uint8Array,
  putOne: (a: AssetBytes) => Promise<boolean> = putAsset,
): Promise<{ zip: Uint8Array; restored: number; failed: number }> {
  let pictures: Record<string, Uint8Array>
  try {
    pictures = unzipSync(zip, { filter: (f) => f.name.startsWith(DIR) && !f.name.endsWith('/') })
  } catch {
    return { zip, restored: 0, failed: 0 } // not a zip we can read: the import reports it
  }
  if (!Object.keys(pictures).length) return { zip, restored: 0, failed: 0 }
  let index: Record<string, AssetMeta> = {}
  try { index = JSON.parse(strFromU8(pictures[INDEX] ?? strToU8('{}'))) as Record<string, AssetMeta> } catch { /* types fall back below */ }
  const ids = Object.keys(pictures).filter((n) => n !== INDEX).map((n) => n.slice(DIR.length)).filter((id) => /^[a-f0-9]{64}$/.test(id))
  let restored = 0
  let failed = 0
  await pool(ids, 4, async (id) => {
    const meta = index[id]
    const ok = await putOne({ bytes: pictures[DIR + id]!, mime: meta?.mime || 'application/octet-stream', name: meta?.name ?? null }).catch(() => false)
    if (ok) restored++; else failed++
  })
  const rest = unzipSync(zip, { filter: (f) => !f.name.startsWith(DIR) })
  return { zip: zipSync(rest, { level: 0 }), restored, failed }
}

/** SillyTavern keeps a character's expression pictures in `characters/<Name>/<emotion>.png`. */
const SPRITE_ENTRY = /^(?:.*\/)?characters\/([^/]+)\/([^/]+)\.(png|webp|jpe?g|gif)$/i
const SPRITE_MIME: Record<string, string> = { png: 'image/png', webp: 'image/webp', gif: 'image/gif', jpg: 'image/jpeg', jpeg: 'image/jpeg' }

/** { folder: { emotion: url } }: what `/import/zip` takes as `sprites`. */
export type SpriteMap = Record<string, Record<string, string>>

/** Takes the character sprite folders out of a library zip, stores each picture in the engine's asset store
 *  (`store` maps `folder/emotion` to a URL) and returns the zip without them plus the folders' URLs. The
 *  plugin cannot reach the store, and these pictures would otherwise be read as cards that failed. A zip with
 *  no sprite folder comes back untouched. */
export async function extractSprites(
  zip: Uint8Array,
  store: (blobs: [string, Blob][]) => Promise<Record<string, string>>,
): Promise<{ zip: Uint8Array; sprites: SpriteMap; count: number }> {
  let found: Record<string, Uint8Array>
  try {
    found = unzipSync(zip, { filter: (f) => SPRITE_ENTRY.test(f.name) })
  } catch {
    return { zip, sprites: {}, count: 0 } // not a zip we can read: the import reports it
  }
  const names = Object.keys(found)
  if (!names.length) return { zip, sprites: {}, count: 0 }
  const blobs: [string, Blob][] = []
  for (const n of names) {
    const m = SPRITE_ENTRY.exec(n)!
    blobs.push([`${m[1]}\u0000${m[2]}`, new Blob([found[n] as unknown as BlobPart], { type: SPRITE_MIME[m[3]!.toLowerCase()] ?? 'image/png' })])
  }
  const urls = await store(blobs)
  const sprites: SpriteMap = {}
  let count = 0
  for (const [key, url] of Object.entries(urls)) {
    const [folder, emotion] = key.split('\u0000')
    if (!folder || !emotion) continue
    ;(sprites[folder] ??= {})[emotion] = url
    count++
  }
  const rest = unzipSync(zip, { filter: (f) => !SPRITE_ENTRY.test(f.name) })
  return { zip: zipSync(rest, { level: 0 }), sprites, count }
}

/** What the import plugin never reads: pictures, audio and video outside `characters/` (a library zip of another
 *  app carries backgrounds, thumbnails and the like). The card pictures themselves stay. */
const MEDIA = /\.(png|jpe?g|webp|gif|avif|bmp|svg|ico|mp3|wav|ogg|flac|m4a|mp4|webm|mov|mkv)$/i
const CARD_ENTRY = /^(?:.*\/)?characters\/[^/]+\.(png|json)$/i
const CHAT_ENTRY = /(?:^|\/)chats\//i
const TEXT_ENTRY_ANY = /\.(json|jsonl|txt|md)$/i
/** A request body reaches the engine through the app bridge, which refuses over 32 MB, and base64 adds a third:
 *  a part stays well under that. */
export const PART_BUDGET = 18 * 1024 * 1024

export type LibraryPart = { zip: Uint8Array; names: string[] }

/** A library zip cut into requests the bridge accepts, in the order the plugin needs: character cards first,
 *  then everything that is not a chat (books, presets, personas, settings: small, kept in one part so the names
 *  they point at resolve), then the chats, each with its sidecars. Media the plugin does not read is dropped
 *  (`dropped` counts them). A zip that fits comes back as one part. A single file over the budget gets a part
 *  of its own. */
export function splitLibrary(zip: Uint8Array, budget = PART_BUDGET): { parts: LibraryPart[]; dropped: number } {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(zip, { filter: (f) => !f.name.endsWith('/') })
  } catch {
    return { parts: [{ zip, names: [] }], dropped: 0 } // not a zip we can read: the import reports it
  }
  let dropped = 0
  type Unit = { names: string[]; size: number }
  const cards: Unit[] = []
  const small: Unit = { names: [], size: 0 }
  const chats = new Map<string, Unit>()
  for (const [name, data] of Object.entries(files)) {
    if (MEDIA.test(name) && !CARD_ENTRY.test(name)) { dropped++; continue }
    // text compresses; a part is measured as the zip will hold it
    const size = TEXT_ENTRY_ANY.test(name) && data.length > 4096 ? deflateSync(data).length : data.length
    if (CARD_ENTRY.test(name)) cards.push({ names: [name], size })
    else if (CHAT_ENTRY.test(name)) {
      const stem = name.replace(/\.(jsonl|meta\.json|memories\.json)$/i, '')
      const u = chats.get(stem) ?? { names: [], size: 0 }
      u.names.push(name); u.size += size
      chats.set(stem, u)
    } else { small.names.push(name); small.size += size }
  }
  cards.sort((a, b) => (a.names[0]! < b.names[0]! ? -1 : 1))
  const units = [...cards, ...(small.names.length ? [small] : []), ...[...chats.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, u]) => u)]
  const groups: string[][] = []
  let cur: string[] = []
  let used = 0
  for (const u of units) {
    if (cur.length && used + u.size > budget) { groups.push(cur); cur = []; used = 0 }
    cur.push(...u.names); used += u.size
  }
  if (cur.length) groups.push(cur)
  if (!groups.length) return { parts: [{ zip, names: [] }], dropped }
  // nothing dropped and nothing to split: the zip goes as it came
  if (groups.length === 1 && !dropped) return { parts: [{ zip, names: groups[0]! }], dropped }
  const parts = groups.map((names) => {
    const entries: Record<string, [Uint8Array, { level: 0 | 6 }]> = {}
    for (const n of names) entries[n] = [files[n]!, { level: TEXT_ENTRY_ANY.test(n) ? 6 : 0 }]
    return { zip: zipSync(entries), names }
  })
  return { parts, dropped }
}

export type ImportSummary = Record<string, unknown>

/** Imports a chosen backup or library zip through `post` (one `/import/zip` request per part) and returns the
 *  summaries merged. Its pictures go back into the engine first, and the character sprite folders of a library
 *  are stored and sent beside the part that holds that character's card. A failing part stops the import; the
 *  earlier parts stay imported, and the message says so. */
export async function importBackupFile(
  file: File,
  post: (body: { zipBase64: string; sprites?: SpriteMap }) => Promise<ImportSummary>,
  onPart?: (done: number, total: number) => void,
  budget = PART_BUDGET,
): Promise<{ summary: ImportSummary; restored: number; failed: number; spriteCount: number; parts: number; dropped: number }> {
  const out = await restoreBackupAssets(new Uint8Array(await file.arrayBuffer()))
  const { storeEmotions } = await import('@/lib/card-import')
  const sp = await extractSprites(out.zip, storeEmotions)
  const { parts, dropped } = splitLibrary(sp.zip, budget)
  // a sprite folder rides with the part whose card file carries its name, else with the first part
  const withSprites = parts.map(() => ({}) as SpriteMap)
  for (const [folder, pics] of Object.entries(sp.sprites)) {
    const at = parts.findIndex((p) => p.names.some((n) => CARD_ENTRY.test(n) && n.split('/').pop()!.replace(/\.(png|json)$/i, '').toLowerCase() === folder.toLowerCase()))
    withSprites[at >= 0 ? at : 0]![folder] = pics
  }
  const summary: ImportSummary = {}
  const merge = (r: ImportSummary) => {
    for (const [k, v] of Object.entries(r)) {
      if (!Array.isArray(v)) continue
      summary[k] = [...((summary[k] as unknown[] | undefined) ?? []), ...v]
    }
  }
  for (let i = 0; i < parts.length; i++) {
    onPart?.(i, parts.length)
    try {
      const sprites = withSprites[i]!
      merge(await post({ zipBase64: bytesToB64(parts[i]!.zip), ...(Object.keys(sprites).length ? { sprites } : {}) }))
    } catch (e) {
      const why = String((e as Error).message ?? e)
      const done = i === 1 ? 'the earlier part was imported' : `the ${i} earlier parts were imported`
      throw new Error(parts.length > 1 ? `part ${i + 1} of ${parts.length}: ${why}${i ? ` (${done})` : ''}` : why)
    }
  }
  return { summary, restored: out.restored, failed: out.failed, spriteCount: sp.count, parts: parts.length, dropped }
}
