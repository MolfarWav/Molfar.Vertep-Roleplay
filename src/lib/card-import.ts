import { toast } from 'sonner'
import { API, j, fileToDataUrl, fileToRawBase64, downscaleRemoteImage } from '@/lib/engine'
import { extractCharaFromPng } from '@/lib/interop'
import { unzipSync, zipSync } from 'fflate'

/** Ask the dashboard plugin to rate each imported card, one after another and
 *  without waiting: the plugin decides whether to (its setting, an existing soul),
 *  and a missing plugin or a failed rating must never disturb the import. */
function rateImported(ids: unknown): void {
  const list = (Array.isArray(ids) ? ids : []).filter((id): id is string => typeof id === 'string' && id !== '')
  if (!list.length) return
  void (async () => {
    for (const id of list) {
      try {
        await j('/dashboard/soul/rate', { method: 'POST', body: JSON.stringify({ characterId: id, auto: true }) })
      } catch { /* swallowed on purpose */ }
    }
  })()
}

/** Where the zip inside a charx starts. RisuRealm serves some charx files as a
 *  JPEG cover with the zip appended; the zip's end record tells where the zip
 *  begins (end record - directory size - directory offset). 0 for a plain zip,
 *  -1 when there is no zip at all. */
export function zipStartOf(b: Uint8Array): number {
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return 0
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) {
      const u32 = (o: number) => (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0
      const start = i - u32(i + 12) - u32(i + 16)
      return start >= 0 && start < i ? start : -1
    }
  }
  return -1
}

type CardAsset = { type?: unknown; name?: unknown; uri?: unknown }
const assetsOf = (card: unknown): CardAsset[] => {
  const c = (card && typeof card === 'object' ? card : {}) as { data?: { assets?: unknown }; assets?: unknown }
  return (Array.isArray(c.data?.assets) ? c.data.assets : Array.isArray(c.assets) ? c.assets : []) as CardAsset[]
}
/** Emotion images: "emotion" in the V3 spec, "x-risu-asset" in RisuAI packs. */
const isEmotionAsset = (a: CardAsset) => !!a && (a.type === 'emotion' || a.type === 'x-risu-asset') && typeof a.uri === 'string'
/** Expressions are stored inside card.json (the plugin writes at most 4 MB a
 *  file, and keeps a pack under 3 MB), so the browser downscales them: as
 *  large as the pack allows, from 768 px down (a pack of 20-30 stays around
 *  512-640 px, 80+ images go near 320). A stopgap until plugins can write
 *  image files of their own. */
const EMOTION_BUDGET = 2.8 * 1024 * 1024
async function fitEmotions(blobs: [string, Blob][]): Promise<Record<string, string>> {
  let px = 768
  let out: Record<string, string> = {}
  for (let pass = 0; pass < 4; pass++) {
    out = {}
    let total = 0
    for (const [key, blob] of blobs) {
      try { out[key] = await fileToDataUrl(blob, px, { alpha: true }); total += out[key]!.length } catch { /* not an image: skip */ }
    }
    if (total <= EMOTION_BUDGET || px <= 192) break
    // size grows with the area: scale the edge by the square root
    px = Math.max(192, Math.floor(px * Math.sqrt(EMOTION_BUDGET / total) * 0.95))
  }
  return out
}
const imageType = (path: string) => (/\.png$/i.test(path) ? 'image/png' : /\.webp$/i.test(path) ? 'image/webp' : /\.gif$/i.test(path) ? 'image/gif' : 'image/jpeg')

/** A charx package's portrait and emotion images, ready for /import/zip:
 *  `avatar` is the main icon (else the first icon, else the first image in
 *  assets/) at 512 px; the plugin keeps the package's own icon when it fits
 *  the avatar field and uses this one otherwise (a large main.png, or icons
 *  with other names). `assets` maps each emotion's package path to a
 *  downscaled data URL. Never throws. */
async function charxExtras(zipBytes: Uint8Array): Promise<{ avatar?: string; assets?: Record<string, string>; slim?: Uint8Array }> {
  const out: { avatar?: string; assets?: Record<string, string>; slim?: Uint8Array } = {}
  try {
    const IMG = /\.(png|jpe?g|webp|gif)$/i
    const files = unzipSync(zipBytes, { filter: (f) => f.name === 'card.json' || (f.name.startsWith('assets/') && IMG.test(f.name)) })
    let list: CardAsset[] = []
    try { list = assetsOf(JSON.parse(new TextDecoder().decode(files['card.json']))) } catch { /* no readable card.json */ }
    const pathOf = (a: CardAsset) => String(a.uri).replace(/^(?:embeded|embedded):\/\//, '')
    const icons = list.filter((a) => a && a.type === 'icon' && typeof a.uri === 'string')
    const pick = icons.find((a) => a.name === 'main') ?? icons[0]
    let path = pick ? pathOf(pick) : undefined
    if (!path || !files[path]) path = Object.keys(files).filter((n) => n !== 'card.json').sort()[0]
    if (path && files[path]) {
      try { out.avatar = await fileToDataUrl(new Blob([files[path]!], { type: imageType(path) }), 512) } catch { /* no portrait */ }
    }
    const blobs = new Map<string, Blob>()
    for (const a of list.filter(isEmotionAsset)) {
      const p = pathOf(a)
      if (files[p] && !blobs.has(p)) blobs.set(p, new Blob([files[p]!], { type: imageType(p) }))
    }
    const assets = await fitEmotions([...blobs])
    if (Object.keys(assets).length) out.assets = assets
    // the plugin gets card.json alone: its pictures came above, downscaled,
    // and the package itself can be 100 MB+ (a request is capped well below)
    if (files['card.json']) out.slim = zipSync({ 'card.json': files['card.json']! })
  } catch { /* not a readable zip: the plugin reports it */ }
  return out
}

/** The emotion images a V3 PNG card points at with "__asset:N" uris (RisuAI
 *  stores them in tEXt chunks named "chara-ext-asset_:N"), downscaled, as
 *  { N: data URL } for /import/batch; undefined when there are none. */
async function pngCardAssets(file: File, card: unknown): Promise<Record<string, string> | undefined> {
  const wanted = new Set(assetsOf(card).filter(isEmotionAsset).map((a) => String(a.uri)).filter((u) => u.startsWith('__asset:')).map((u) => u.slice(8)))
  if (!wanted.size) return undefined
  try {
    const b = new Uint8Array(await file.arrayBuffer())
    const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
    const ascii = (from: number, to: number) => {
      const parts: string[] = []
      for (let i = from; i < to; i += 8192) parts.push(String.fromCharCode(...b.subarray(i, Math.min(to, i + 8192))))
      return parts.join('')
    }
    const blobs = new Map<string, Blob>()
    let off = 8
    while (off + 12 <= b.length) {
      const len = view.getUint32(off)
      const type = ascii(off + 4, off + 8)
      if (type === 'IEND') break
      if (type === 'tEXt') {
        const end = off + 8 + len
        let nul = off + 8
        while (nul < end && nul < off + 8 + 80 && b[nul] !== 0) nul++
        const key = /^chara-ext-asset_:?(.+)$/.exec(ascii(off + 8, nul))?.[1]
        if (key && wanted.has(key) && !blobs.has(key)) {
          try {
            const bin = atob(ascii(nul + 1, end).replace(/[^A-Za-z0-9+/=]/g, ''))
            const bytes = new Uint8Array(bin.length)
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
            blobs.set(key, new Blob([bytes]))
          } catch { /* not base64: skip */ }
        }
      }
      off += 12 + len
    }
    const out = await fitEmotions([...blobs])
    return Object.keys(out).length ? out : undefined
  } catch {
    return undefined
  }
}

/** What one import call brought in: the new character ids and their names,
 *  and the per-file problems (also shown as toasts unless the call was quiet). */
export type ImportResult = { characters: string[]; names: string[]; errors: string[]; notes: string[] }

/** The name inside a card object (V1/V2 flat, V2/V3 under `data`). */
function nameOfCard(card: unknown): string {
  const c = (card && typeof card === 'object' ? card : {}) as { name?: unknown; data?: { name?: unknown } }
  const n = typeof c.data?.name === 'string' && c.data.name ? c.data.name : c.name
  return typeof n === 'string' ? n.trim() : ''
}

/** Real import: PNG cards (tEXt 'chara' / 'ccv3'), JSON cards and charx
 *  packages, single or bulk, through the studio-import plugin routes. Shared by
 *  the Characters page, Home and the Store (dropped files and downloaded
 *  cards alike). `hydrate` refreshes the store once the cards are in. Errors
 *  are shown as toasts and never thrown. `quiet` leaves the toasts to the
 *  caller (the problems stay in the result); `avatars` maps a file name to a
 *  data URL, for JSON cards (they have no picture of their own). */
export async function importCardFiles(files: FileList | File[] | null, hydrate: () => Promise<void>, opts?: { quiet?: boolean; avatars?: Record<string, string> }): Promise<ImportResult> {
  const out: ImportResult = { characters: [], names: [], errors: [], notes: [] }
  const quiet = opts?.quiet === true
  if (!files?.length) return out
  const cards: unknown[] = []
  const cardNames: string[] = []
  const errors: string[] = []
  const notes: string[] = []
  for (const f of Array.from(files)) {
    try {
      const lower = f.name.toLowerCase()
      if (lower.endsWith('.png')) {
        const card = await extractCharaFromPng(f)
        if (!card) { errors.push(`${f.name}: no embedded card data`); continue }
        let avatar: string | undefined
        try { avatar = await fileToDataUrl(f, 512) } catch { /* keep card without avatar */ }
        const assets = await pngCardAssets(f, card)
        cards.push({ card, ...(avatar ? { avatar } : {}), ...(assets ? { assets } : {}) })
        cardNames.push(nameOfCard(card) || f.name.replace(/\.png$/i, ''))
      } else if (lower.endsWith('.charx')) {
        // a charx package IS a zip with card.json; the plugin unpacks it
        const bytes = new Uint8Array(await f.arrayBuffer())
        const start = zipStartOf(bytes)
        if (start < 0) { errors.push(`${f.name}: not a charx package (no zip inside)`); continue }
        const zipBytes = start === 0 ? bytes : bytes.subarray(start)
        const zip = start === 0 ? f : new Blob([zipBytes])
        const { avatar, assets, slim } = await charxExtras(zipBytes)
        const r = await j<{ characters?: string[]; name?: string; notes?: string[] }>('/import/zip', {
          method: 'POST', body: JSON.stringify({ zipBase64: await fileToRawBase64(slim ? new Blob([slim as Uint8Array<ArrayBuffer>]) : zip), ...(avatar ? { avatar } : {}), ...(assets ? { assets } : {}) }),
        })
        notes.push(...(r.notes ?? []))
        const got = r.characters ?? []
        if (!got.length) { errors.push(`${f.name}: no card.json in the package`); continue }
        out.characters.push(...got)
        out.names.push(r.name ?? f.name.replace(/\.charx$/i, ''))
        if (!quiet) toast.success(`Imported ${r.name ?? f.name}`)
      } else {
        const parsed: unknown = JSON.parse(await f.text())
        // a JSON card has no picture of its own: the caller may bring one
        const avatar = opts?.avatars?.[f.name]
        cards.push(avatar ? { card: parsed, avatar } : parsed)
        cardNames.push(nameOfCard(parsed) || f.name.replace(/\.json$/i, ''))
      }
    } catch (e) {
      errors.push(`${f.name}: ${e instanceof SyntaxError ? 'could not parse' : String((e as Error).message ?? e)}`)
    }
  }
  if (cards.length) {
    try {
      const r = await j<{ characters: string[]; name?: string; errors?: string[]; notes?: string[] }>('/import/batch', {
        method: 'POST', body: JSON.stringify({ cards }),
      })
      notes.push(...(r.notes ?? []))
      out.characters.push(...r.characters)
      // the plugin names a single card only; the files carry the names
      if (r.characters.length === cardNames.length) out.names.push(...cardNames)
      else if (r.name) out.names.push(r.name)
      if (!quiet) toast.success(`Imported ${r.characters.length} character${r.characters.length === 1 ? '' : 's'}`)
    } catch (e) {
      errors.push(String((e as Error).message ?? e))
    }
  }
  if (out.characters.length) {
    await hydrate()
    rateImported(out.characters)
  }
  out.errors = errors
  out.notes = notes
  if (!quiet) for (const e of errors) toast.error(e)
  if (!quiet) for (const n of notes) toast.info(n)
  return out
}

/** Links the app must not download itself (a browser check guards them): the
 *  user opens the page, downloads the card and drops the file. Returns the
 *  page to open, or null. */
export function browserOnlyLink(url: string): string | null {
  try {
    const u = new URL(url.trim())
    return /(^|\.)(jannyai\.com|janitorai\.com)$/i.test(u.hostname) ? u.href : null
  } catch { return null }
}

export const isChubLink = (url: string): boolean =>
  /^https:\/\/(?:www\.)?(?:chub\.ai|characterhub\.(?:ai|org))\/characters\//i.test(url.trim())
  || /^https:\/\/api\.chub\.ai\/api\/characters\//i.test(url.trim())

/** What a downloaded card file is, from its first bytes: the extension the
 *  importer reads it by, or the reason it is not a card. */
export function cardFileKind(b: Uint8Array): { ext: 'png' | 'charx' | 'json' } | { error: string } {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: 'png' }
  if (zipStartOf(b) >= 0) return { ext: 'charx' } // a zip, or RisuRealm's JPEG cover + zip
  if (b[0] === 0xff && b[1] === 0xd8) return { error: 'This JPEG is a plain image with no character card inside.' }
  const lead = new TextDecoder().decode(b.subarray(0, 64)).replace(/^﻿/, '').trimStart()
  if (lead.startsWith('<')) return { error: 'The link opens a web page, not a card file. Use the link of the file itself (on GitHub: Raw; on Hugging Face: download).' }
  if (lead.startsWith('{')) return { ext: 'json' }
  return { error: 'This file is not a character card (PNG, JSON or charx).' }
}

/** Plain words for the engine's file route refusing or failing. */
async function fileRouteError(res: Response, label: string): Promise<string> {
  const said = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? ''
  if (res.status === 413) return `The card on ${label} is larger than 200 MB, the most the app downloads.`
  // the route answers "upstream 404" for a missing card; any other 404 means
  // the engine has no file route yet (older than 0.9.3)
  if (res.status === 404 && /^upstream/.test(said)) return `${label} has no card at this link.`
  if (res.status === 404) return 'The engine is older than this version of the app needs (0.9.3 or newer): update or restart the engine, then try again.'
  if (res.status === 429) return `${label} asks to slow down. Wait a minute, then try again.`
  if (res.status === 403) return `${said || 'The link leads to a site the app may not contact'}. Download the file in your browser and drop it into the Store.`
  return `Download from ${label} failed (${said || res.status}).`
}

/** Install a card from a link on RisuRealm, CharaVault, Wyvern, Pygmalion or
 *  a direct file link (GitHub raw, Hugging Face, Catbox, Discord). The plugin
 *  says where the file is (POST /fetch/card {resolve}); the file itself comes
 *  through the engine's file route (GET <api>/file, any size up to 200 MB,
 *  the plugins' host allowlist) and goes through importCardFiles like a
 *  dropped file. Wyvern and Pygmalion have no file: the plugin builds a JSON
 *  card from their fields. Chub links keep their own route (POST /import/url)
 *  and are not handled here. Throws with a plain-words message. */
export async function importCardFromLink(url: string, hydrate: () => Promise<void>): Promise<ImportResult & { sourceLabel: string; skippedBooks?: number }> {
  const where = await j<{ sourceLabel: string; api?: boolean; downloadUrl?: string; fileBase?: string }>('/fetch/card', {
    method: 'POST', body: JSON.stringify({ url: url.trim(), resolve: true }),
  })
  if (where.api || !where.downloadUrl) {
    const r = await j<{ sourceLabel: string; fileName: string; base64: string; avatarUrl?: string; skippedBooks?: number }>('/fetch/card', {
      method: 'POST', body: JSON.stringify({ url: url.trim() }),
    })
    // a portrait that cannot be fetched never fails the import
    let avatars: Record<string, string> | undefined
    if (r.avatarUrl) {
      try { avatars = { [r.fileName]: await downscaleRemoteImage(r.avatarUrl, 512) } } catch { /* import without a portrait */ }
    }
    const bin = atob(r.base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    // quiet: the caller shows one result (success or the thrown message)
    const res = await importCardFiles([new File([bytes], r.fileName)], hydrate, { quiet: true, ...(avatars ? { avatars } : {}) })
    if (!res.characters.length) throw new Error(res.errors[0] ?? `The card from ${r.sourceLabel} could not be imported.`)
    return { ...res, sourceLabel: r.sourceLabel, ...(r.skippedBooks ? { skippedBooks: r.skippedBooks } : {}) }
  }
  let res: Response
  try {
    res = await fetch(`${API}/file?url=${encodeURIComponent(where.downloadUrl)}`)
  } catch {
    throw new Error('Connection lost. Is the engine running?')
  }
  if (!res.ok) throw new Error(await fileRouteError(res, where.sourceLabel))
  const bytes = new Uint8Array(await res.arrayBuffer())
  const kind = cardFileKind(bytes)
  if ('error' in kind) throw new Error(kind.error)
  const name = `${where.fileBase || 'card'}.${kind.ext}`
  const out = await importCardFiles([new File([bytes], name)], hydrate, { quiet: true })
  if (!out.characters.length) throw new Error(out.errors[0] ?? `The card from ${where.sourceLabel} could not be imported.`)
  return { ...out, sourceLabel: where.sourceLabel }
}

/** The inline/toast text for a JannyAI or JanitorAI link. */
export const JANNY_MESSAGE = 'JannyAI cards must be downloaded in the browser: open the page, download the card, then drop it in the JannyAI tab.'

/** chub card links map to the full-resolution card image; the app's img
 *  route streams it through the engine (the sandboxed frame cannot fetch
 *  other hosts). Returns a downscaled data URL, or undefined when the link
 *  is not a card link or the image cannot be fetched — the importer then
 *  keeps its own 200px listing thumbnail. */
const CHUB_CARD = /^https:\/\/(?:www\.)?(?:chub\.ai|characterhub\.(?:ai|org))\/characters\/([^/\s?#]+)\/([^/\s?#]+)/i
const CHUB_API_CARD = /^https:\/\/api\.chub\.ai\/api\/characters\/([^/\s?#]+)\/([^/\s?#]+)/i
export async function fullSizeAvatar(pageUrl: string): Promise<string | undefined> {
  const m = CHUB_CARD.exec(pageUrl) ?? CHUB_API_CARD.exec(pageUrl)
  if (!m) return undefined
  const src = `https://avatars.charhub.io/avatars/${encodeURIComponent(m[1]!)}/${encodeURIComponent(m[2]!)}/chara_card_v2.png`
  try {
    return await downscaleRemoteImage(src, 512)
  } catch {
    return undefined
  }
}

export type LinkImport =
  | { status: 'browser-only'; openUrl: string }
  | { status: 'imported'; characters: string[]; names: string[]; sourceLabel: string; skippedBooks?: number; notes?: string[] }

/** One entry for every card link, used by the Store and the Characters page:
 *  JannyAI/JanitorAI pages are never fetched ('browser-only', with the page to
 *  open); chub links keep their own route (POST /import/url, full-size
 *  portrait first); anything else (RisuRealm, CharaVault, direct file links)
 *  goes through importCardFromLink. Throws with a plain-words message. */
export async function importAnyCardLink(url: string, hydrate: () => Promise<void>): Promise<LinkImport> {
  const link = url.trim()
  const openUrl = browserOnlyLink(link)
  if (openUrl) return { status: 'browser-only', openUrl }
  if (isChubLink(link)) {
    const avatar = await fullSizeAvatar(link)
    const r = await j<{ characters: string[]; name?: string }>('/import/url', {
      method: 'POST', body: JSON.stringify({ url: link, ...(avatar ? { avatar } : {}) }),
    })
    await hydrate()
    return { status: 'imported', characters: r.characters ?? [], names: r.name ? [r.name] : [], sourceLabel: 'Chub' }
  }
  const r = await importCardFromLink(link, hydrate)
  return { status: 'imported', ...r }
}
