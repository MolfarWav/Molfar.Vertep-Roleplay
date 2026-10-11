import { zipSync } from 'fflate'
import { characterToExportCard } from './engine'
import type { Character, Lorebook } from './types'

/** CHARX export: a zip with `card.json` (character card V3) and the pictures
 *  as files under `assets/`, the package RisuAI writes and this app's own
 *  importer reads (src/lib/card-import.ts `charxExtras`). The portrait is the
 *  `icon` named `main`, each expression an `emotion`, gallery images `other`.
 *  URIs use RisuAI's own spelling, `embeded://`. */

export interface CharxAsset { type: 'icon' | 'emotion' | 'other'; name: string; uri: string; ext: string }

/** Bytes and extension of an image URL; null when it cannot be read (skipped, never faked). */
export type ImageReader = (url: string) => Promise<{ bytes: Uint8Array; ext: string } | null>

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp', 'image/gif': 'gif' }

/** Reads data URLs in place and anything else (stored media) with fetch. */
export const readImage: ImageReader = async (url) => {
  try {
    const m = /^data:(image\/[a-z]+);base64,(.*)$/i.exec(url)
    if (m) {
      const ext = EXT[m[1]!.toLowerCase()]
      return ext ? { bytes: Uint8Array.from(atob(m[2]!), (ch) => ch.charCodeAt(0)), ext } : null
    }
    const res = await fetch(url)
    if (!res.ok) return null
    const ext = EXT[(res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()]
    return ext ? { bytes: new Uint8Array(await res.arrayBuffer()), ext } : null
  } catch {
    return null
  }
}

/** A file name inside the package: letters, digits, `_` and `-` (any script), unique. */
function fileName(name: string, taken: Set<string>): string {
  const base = name.trim().replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'image'
  let n = base
  for (let i = 2; taken.has(n.toLowerCase()); i++) n = `${base}_${i}`
  taken.add(n.toLowerCase())
  return n
}

/** The pictures go into assets/, so card.json does not carry them twice. */
const HEAVY_STUDIO = ['avatar', 'altAvatars', 'gallery', 'expressions', 'versions'] as const

export async function buildCharx(c: Character, books: Lorebook[], read: ImageReader = readImage): Promise<Uint8Array> {
  const v2 = characterToExportCard(c, books) as unknown as { data: Record<string, unknown> }
  const { avatar: _avatar, studio, ...data } = v2.data
  const slimStudio = studio && typeof studio === 'object' ? { ...(studio as Record<string, unknown>) } : undefined
  if (slimStudio) for (const k of HEAVY_STUDIO) delete slimStudio[k]

  const files: Record<string, Uint8Array> = {}
  const assets: CharxAsset[] = []
  const add = async (type: CharxAsset['type'], dir: string, name: string, url: string, taken: Set<string>) => {
    const img = url ? await read(url) : null
    if (!img) return
    const file = `${dir}/${fileName(name, taken)}.${img.ext}`
    files[file] = img.bytes
    assets.push({ type, name, uri: `embeded://${file}`, ext: img.ext })
  }
  await add('icon', 'assets/icon/images', 'main', c.avatar, new Set())
  const emotions = new Set<string>()
  for (const e of c.expressions) await add('emotion', 'assets/emotion/images', e.name, e.url ?? '', emotions)
  const others = new Set<string>()
  for (const g of c.gallery) if (g.type === 'image') await add('other', 'assets/other/images', g.caption || g.id, g.url ?? '', others)

  const card = {
    spec: 'chara_card_v3',
    spec_version: '3.0',
    data: { ...data, ...(slimStudio ? { studio: slimStudio } : {}), assets },
  }
  files['card.json'] = new TextEncoder().encode(JSON.stringify(card))
  // the images are compressed already: store them, deflate only the JSON
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [v, { level: k === 'card.json' ? 6 : 0 }]])))
}

/** The plain JSON card (V2, the same as inside the PNG). */
export function cardJson(c: Character, books: Lorebook[]): string {
  return JSON.stringify(characterToExportCard(c, books), null, 2)
}
