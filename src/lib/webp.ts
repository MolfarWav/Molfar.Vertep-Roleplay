// Backgrounds are kept as WebP (user, 2026-10-19): generated, uploaded and renamed images are converted
// on save, in the browser (canvas, no new dependency). A GIF or another animated image stays as it is
// (a canvas would keep only its first frame), and so does an image the conversion would make bigger.


export const WEBP_QUALITY = 0.85
/** the longest side of a stored background; bigger images are scaled down */
export const BACKGROUND_MAX_SIDE = 1920

let webpEncodes: boolean | null = null
/** Can this browser write WebP? (Old Safari writes PNG instead.) Kept here: engine.ts reads the frame URL on import. */
function canEncodeWebp(): boolean {
  if (webpEncodes === null) {
    try {
      webpEncodes = document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp')
    } catch {
      webpEncodes = false
    }
  }
  return webpEncodes
}

const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n))

/**
 * Does this image move? GIF always counts (its frame count needs a full parse; the user's rule keeps
 * every GIF as it is), an APNG has an `acTL` chunk before its image data, an animated WebP an `ANIM`
 * chunk. Reads the bytes, never the file name.
 */
export function isAnimated(bytes: Uint8Array): boolean {
  if (bytes.length >= 6 && ascii(bytes, 0, 3) === 'GIF') return true
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG') {
    for (let at = 8; at + 8 <= bytes.length; ) {
      const len = ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!) >>> 0
      const type = ascii(bytes, at + 4, 4)
      if (type === 'acTL') return true
      if (type === 'IDAT' || type === 'IEND') return false
      at += 12 + len
    }
    return false
  }
  if (bytes.length >= 16 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    for (let at = 12; at + 8 <= bytes.length; ) {
      const type = ascii(bytes, at, 4)
      if (type === 'ANIM' || type === 'ANMF') return true
      if (type === 'VP8 ' || type === 'VP8L') return false
      const len = (bytes[at + 4]! | (bytes[at + 5]! << 8) | (bytes[at + 6]! << 16) | (bytes[at + 7]! << 24)) >>> 0
      at += 8 + len + (len & 1)
    }
  }
  return false
}

/** What a conversion decided: keep the original, or use the WebP it made. */
export type WebpOutcome = { blob: Blob; converted: true; before: number } | { blob: Blob; converted: false; reason: 'animated' | 'not-image' | 'no-webp' | 'bigger' }

/** The pure decision after the canvas ran: the WebP only when it is a WebP and smaller. */
export function pickSmaller(original: Blob, webp: Blob | null): WebpOutcome {
  if (!webp || webp.type !== 'image/webp') return { blob: original, converted: false, reason: 'no-webp' }
  if (webp.size >= original.size) return { blob: original, converted: false, reason: 'bigger' }
  return { blob: webp, converted: true, before: original.size }
}

/** The image as WebP, scaled so its longest side is at most maxSide; the original when that is better. */
export async function toWebp(src: Blob, maxSide = BACKGROUND_MAX_SIDE, quality = WEBP_QUALITY): Promise<WebpOutcome> {
  if (!src.type.startsWith('image/')) return { blob: src, converted: false, reason: 'not-image' }
  const head = new Uint8Array(await src.slice(0, 256 * 1024).arrayBuffer())
  if (isAnimated(head)) return { blob: src, converted: false, reason: 'animated' }
  if (!canEncodeWebp()) return { blob: src, converted: false, reason: 'no-webp' }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(src)
  } catch {
    return { blob: src, converted: false, reason: 'not-image' }
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const webp = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
  // a smaller original wins, unless it was too big to keep: then the scaled WebP is still the better file
  const out = pickSmaller(src, webp)
  if (!out.converted && out.reason === 'bigger' && scale < 1 && webp) return { blob: webp, converted: true, before: src.size }
  return out
}

/**
 * A background into the engine's asset store as WebP (when that is better), returning its URL
 * `/v1/assets/<id>`. Backgrounds no longer go into library.json as data URLs: the app loads and
 * saves that file whole, and a set of images would make it megabytes (as card galleries did, #17).
 */
export async function storeBackground(src: Blob, name?: string): Promise<{ url: string; converted: boolean; size: number; before: number }> {
  const out = await toWebp(src)
  const r = await fetch(`/v1/assets${name ? `?name=${encodeURIComponent(name.slice(0, 120))}` : ''}`, {
    method: 'PUT', headers: { 'content-type': out.blob.type || 'application/octet-stream' }, body: out.blob,
  })
  const got = (await r.json().catch(() => ({}))) as { id?: string; error?: string }
  if (!r.ok || !got.id) throw new Error(got.error || `could not store the image (${r.status})`)
  return { url: `/v1/assets/${got.id}`, converted: out.converted, size: out.blob.size, before: src.size }
}

/** The bytes behind a background's URL (a data URL, an asset, or the app's own path). */
export async function backgroundBlob(url: string): Promise<Blob> {
  // the frame's fetch only reaches the engine: a data URL cannot be fetched, it is decoded here
  if (url.startsWith('data:')) {
    const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url)
    if (!m) throw new Error('not a data URL')
    const raw = m[2] ? atob(m[3]!) : decodeURIComponent(m[3]!)
    const bytes = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
    return new Blob([bytes], { type: m[1] || 'application/octet-stream' })
  }
  const r = await fetch(url)
  if (!r.ok) throw new Error(`could not read the image (${r.status})`)
  return r.blob()
}
