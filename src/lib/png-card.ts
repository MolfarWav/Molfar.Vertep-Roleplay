import type { EngineCard } from './engine'
import { saveFile } from './export'

// PNG character-card EXPORT — the mirror of the tEXt 'chara' importer in
// engine.ts. Re-encodes the character's avatar as a PNG on a canvas, then
// splices a base64 JSON `chara` tEXt chunk in before IEND — the exact
// character-card V2 (chara_card_v2) format, so exported cards re-import anywhere.
const CRC_TABLE = (() => {
  const t = Array.from<number>({ length: 256 })
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function latin1Bytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff
  return out
}

function b64(s: string): string {
  // btoa throws on anything above U+00FF (CJK, emoji — routine in chub cards):
  // UTF-8 encode first, then base64 the bytes. Readers decode the tEXt chunk
  // as UTF-8 after base64, which is the V2 card convention.
  // Chunked: one call per 32k bytes — a single spread of a full card's bytes
  // exceeds the argument limit and dies with "max call stack size exceeded".
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

/** A 400x600 portrait with the name's first letter, for a card with no picture of its own. */
function plainPortrait(name: string): string {
  const canvas = document.createElement('canvas')
  canvas.width = 400
  canvas.height = 600
  const g = canvas.getContext('2d')!
  g.fillStyle = '#2a2633'
  g.fillRect(0, 0, 400, 600)
  g.fillStyle = '#d9d4e6'
  g.font = '200px serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText((name.trim()[0] ?? '?').toUpperCase(), 200, 300)
  return canvas.toDataURL('image/png')
}

/** Build the PNG bytes of `imageDataUrl` with `card` embedded as tEXt. */
export async function buildCardPng(imageDataUrl: string, card: EngineCard): Promise<Uint8Array> {
  // normalize to PNG via canvas (source may be jpeg/data-url/placeholder)
  const pngUrl: string = await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(64, img.width)
      canvas.height = Math.max(64, img.height)
      canvas.getContext('2d')!.drawImage(img, 0, 0)
      // the app runs in a sandboxed frame: its own files (the default avatar) count as
      // another origin and taint the canvas. A plain portrait then, never a silent stop.
      try { resolve(canvas.toDataURL('image/png')) } catch { resolve(plainPortrait(String((card as { name?: unknown }).name ?? ''))) }
    }
    img.onerror = () => reject(new Error('could not load avatar'))
    img.src = imageDataUrl
  })
  const base = Uint8Array.from(atob(pngUrl.slice(pngUrl.indexOf(',') + 1)), (c) => c.charCodeAt(0))

  const payload = b64(JSON.stringify(card))
  const text = latin1Bytes('chara\0' + payload)
  const chunk = new Uint8Array(12 + text.length)
  const dv = new DataView(chunk.buffer)
  dv.setUint32(0, text.length)
  chunk.set(latin1Bytes('tEXt'), 4)
  chunk.set(text, 8)
  dv.setUint32(8 + text.length, crc32(chunk.subarray(4, 8 + text.length)))

  // insert before IEND (last 12 bytes of the file)
  const out = new Uint8Array(base.length + chunk.length)
  out.set(base.subarray(0, base.length - 12), 0)
  out.set(chunk, base.length - 12)
  out.set(base.subarray(base.length - 12), base.length - 12 + chunk.length)
  return out
}

export function downloadCardPng(bytes: Uint8Array, name: string): void {
  saveFile(new Blob([bytes as BlobPart], { type: 'image/png' }), `${name.replace(/[^a-z0-9-]+/gi, '_').slice(0, 60) || 'character'}.card.png`)
}
