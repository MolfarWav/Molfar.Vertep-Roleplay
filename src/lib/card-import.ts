import { toast } from 'sonner'
import { j, fileToDataUrl, fileToRawBase64, downscaleRemoteImage } from '@/lib/engine'
import { extractCharaFromPng } from '@/lib/interop'

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

/** What one import call brought in: the new character ids and their names,
 *  and the per-file problems (also shown as toasts unless the call was quiet). */
export type ImportResult = { characters: string[]; names: string[]; errors: string[] }

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
 *  are shown as toasts and never thrown. */
export async function importCardFiles(files: FileList | File[] | null, hydrate: () => Promise<void>, opts?: { quiet?: boolean }): Promise<ImportResult> {
  const out: ImportResult = { characters: [], names: [], errors: [] }
  const quiet = opts?.quiet === true
  if (!files?.length) return out
  const cards: unknown[] = []
  const cardNames: string[] = []
  const errors: string[] = []
  for (const f of Array.from(files)) {
    try {
      const lower = f.name.toLowerCase()
      if (lower.endsWith('.png')) {
        const card = await extractCharaFromPng(f)
        if (!card) { errors.push(`${f.name}: no embedded card data`); continue }
        let avatar: string | undefined
        try { avatar = await fileToDataUrl(f, 512) } catch { /* keep card without avatar */ }
        cards.push({ card, ...(avatar ? { avatar } : {}) })
        cardNames.push(nameOfCard(card) || f.name.replace(/\.png$/i, ''))
      } else if (lower.endsWith('.charx')) {
        // a charx package IS a zip with card.json; the plugin unpacks it
        const bytes = new Uint8Array(await f.arrayBuffer())
        const start = zipStartOf(bytes)
        if (start < 0) { errors.push(`${f.name}: not a charx package (no zip inside)`); continue }
        const zip = start === 0 ? f : new Blob([bytes.subarray(start)])
        const r = await j<{ characters?: string[]; name?: string }>('/import/zip', {
          method: 'POST', body: JSON.stringify({ zipBase64: await fileToRawBase64(zip) }),
        })
        const got = r.characters ?? []
        if (!got.length) { errors.push(`${f.name}: no card.json in the package`); continue }
        out.characters.push(...got)
        out.names.push(r.name ?? f.name.replace(/\.charx$/i, ''))
        if (!quiet) toast.success(`Imported ${r.name ?? f.name}`)
      } else {
        const parsed: unknown = JSON.parse(await f.text())
        cards.push(parsed)
        cardNames.push(nameOfCard(parsed) || f.name.replace(/\.json$/i, ''))
      }
    } catch (e) {
      errors.push(`${f.name}: ${e instanceof SyntaxError ? 'could not parse' : String((e as Error).message ?? e)}`)
    }
  }
  if (cards.length) {
    try {
      const r = await j<{ characters: string[]; name?: string; errors?: string[] }>('/import/batch', {
        method: 'POST', body: JSON.stringify({ cards }),
      })
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
  if (!quiet) for (const e of errors) toast.error(e)
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

/** Install a card from a link on RisuRealm, CharaVault or a direct file link
 *  (GitHub raw, Hugging Face, Catbox, Discord). The plugin only downloads
 *  (POST /fetch/card); the bytes go through importCardFiles like a dropped
 *  file. Chub links keep their own route (POST /import/url) and are not
 *  handled here. Throws with the plugin's plain-words error. */
export async function importCardFromLink(url: string, hydrate: () => Promise<void>): Promise<ImportResult & { sourceLabel: string }> {
  const r = await j<{ sourceLabel: string; kind: 'png' | 'json' | 'charx'; fileName: string; base64: string }>('/fetch/card', {
    method: 'POST', body: JSON.stringify({ url: url.trim() }),
  })
  const bin = atob(r.base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  // quiet: the caller shows one result (success or the thrown message)
  const res = await importCardFiles([new File([bytes], r.fileName)], hydrate, { quiet: true })
  if (!res.characters.length) throw new Error(res.errors[0] ?? `The card from ${r.sourceLabel} could not be imported.`)
  return { ...res, sourceLabel: r.sourceLabel }
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
  | { status: 'imported'; characters: string[]; names: string[]; sourceLabel: string }

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
