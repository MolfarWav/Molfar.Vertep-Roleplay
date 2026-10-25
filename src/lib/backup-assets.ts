// Pictures in a studio backup (Molfar Vertep issue #89). Card gallery images, generated pictures and
// backgrounds live in the engine's asset store and the backup's files only point at them
// (`/v1/assets/<id>`). The plugin that builds the zip cannot read that store, so the app adds the bytes
// itself after export and puts them back before import. Ids are the SHA-256 of the bytes, so a picture
// restored on another install gets the id the files already carry: nothing to rewrite.
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

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

/** A chosen backup file as base64 for `/import/zip`, its pictures restored on the way. */
export async function backupFileForImport(file: File): Promise<{ zipBase64: string; restored: number; failed: number }> {
  const out = await restoreBackupAssets(new Uint8Array(await file.arrayBuffer()))
  return { zipBase64: bytesToB64(out.zip), restored: out.restored, failed: out.failed }
}
