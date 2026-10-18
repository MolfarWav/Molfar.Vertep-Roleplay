/**
 * Image generation plumbing. The chat's own model reads the scene and writes
 * the picture description (engine plugin route /chats/:id/image-prompt); the
 * engine's images bridge (POST /v1/images) draws it and keeps the file in its
 * asset store. Credentials live engine-side.
 */
import { j } from '@/lib/engine'
import type { ID } from '@/lib/types'

export interface ImageGenSettings {
  enabled: boolean
  /** engine image model, "provider/id" as listed by GET /v1/images/models */
  model: string
  promptPrefix: string
  negativePrompt: string
  interactive: boolean
  /** generated pictures also land in the speaking character's gallery */
  saveToGallery?: boolean
  /** how the picture prompt is written; undefined = 'auto' (follows the model's backend) */
  promptStyle?: 'auto' | 'description' | 'tags'
  /** `api` of the picked model as last listed by GET /v1/images/models; lets the
   *  plugins (which cannot ask for the list) pick the default style */
  modelApi?: string
  /** the picked model's prompt style and guidance as its image server in the engine says (engine 1.2.1+) */
  modelStyle?: PromptStyle
  modelInstructions?: string
}

export type PromptStyle = 'description' | 'tags'

/** An explicit choice wins, then the image server's own setting; otherwise
 *  tag-trained backends (ComfyUI, Forge/A1111) get tags. */
export function resolvePromptStyle(ig: Pick<ImageGenSettings, 'promptStyle' | 'modelApi' | 'modelStyle'> | undefined): PromptStyle {
  if (ig?.promptStyle === 'description' || ig?.promptStyle === 'tags') return ig.promptStyle
  if (ig?.modelStyle === 'description' || ig?.modelStyle === 'tags') return ig.modelStyle
  return ig?.modelApi === 'comfyui' || ig?.modelApi === 'a1111' ? 'tags' : 'description'
}

export interface GeneratedImage {
  url: string
  mimeType: string
  prompt: string
  model: string
}

/** What the chat model is asked to describe. */
export type ImageMode = 'scene' | 'character' | 'face' | 'user' | 'background'

export const IMAGE_MODES: { mode: ImageMode; label: string; words: string[] }[] = [
  { mode: 'scene', label: 'The scene', words: ['scene', 'now', 'last'] },
  { mode: 'character', label: 'Character', words: ['you', 'yourself', 'char'] },
  { mode: 'face', label: 'Portrait', words: ['face', 'portrait', 'selfie'] },
  { mode: 'user', label: 'Me', words: ['me', 'myself', 'user'] },
  { mode: 'background', label: 'Background', words: ['background', 'bg', 'place'] },
]

/** `/imagine` argument: a mode keyword asks the model to describe; anything
 *  else is the picture description itself. */
export function parseImagineArg(arg: string): { mode: ImageMode } | { text: string } {
  const t = arg.trim()
  if (!t) return { mode: 'scene' }
  const hit = IMAGE_MODES.find((m) => m.words.includes(t.toLowerCase()))
  return hit ? { mode: hit.mode } : { text: t }
}

/** Prefix + description, composed into the final positive prompt. */
export function buildImagePrompt(ig: Pick<ImageGenSettings, 'promptPrefix'>, subject: string): string {
  const prefix = ig.promptPrefix.trim()
  const s = subject.trim()
  if (!prefix) return s
  // The prefix conventionally ends in a comma; don't double it up.
  return `${prefix.replace(/,\s*$/, '')}, ${s}`
}

/** What the picked model's image server says, in the shape settings keep it. */
export function modelHints(m: { api?: string; style?: PromptStyle; instructions?: string } | undefined): Pick<ImageGenSettings, 'modelApi' | 'modelStyle' | 'modelInstructions'> {
  return { modelApi: m?.api, modelStyle: m?.style, modelInstructions: m?.instructions || undefined }
}

/** The chat model describes what to draw from the recent scene. */
export async function describeForImage(chatId: ID, mode: ImageMode, model?: string | null, style: PromptStyle = 'description', instructions?: string): Promise<string> {
  const r = await j<{ prompt: string }>(`/chats/${encodeURIComponent(chatId)}/image-prompt`, {
    method: 'POST',
    body: JSON.stringify({ mode, style, ...(model ? { model } : {}), ...(instructions?.trim() ? { instructions: instructions.trim() } : {}) }),
  })
  return r.prompt
}

export async function generateImage(opts: {
  prompt: string
  negativePrompt?: string
  model?: string
  signal?: AbortSignal
}): Promise<GeneratedImage> {
  // Most image models take a single positive prompt; the negative prompt is
  // appended as an explicit avoid-clause so it still has an effect.
  const prompt = opts.negativePrompt?.trim()
    ? `${opts.prompt}\n(Avoid: ${opts.negativePrompt.trim()})`
    : opts.prompt
  // Core engine route (not an app route) — absolute path, like fetchModels().
  const r = await fetch('/v1/images', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, ...(opts.model ? { model: opts.model } : {}) }),
    ...(opts.signal ? { signal: opts.signal } : {}),
  })
  const b = (await r.json().catch(() => ({}))) as { url?: string; mimeType?: string; model?: string; error?: string }
  if (!r.ok || !b.url) {
    if (r.status === 503) {
      throw new Error('No image model available. Add an OpenRouter or NanoGPT connection, or an image server, in the engine Settings')
    }
    throw new Error(b.error ?? 'image generation failed')
  }
  return { url: b.url, mimeType: b.mimeType ?? 'image/png', prompt: opts.prompt, model: b.model ?? '' }
}

/** Post a finished picture into the chat as the speaking character. It stays
 *  out of the model's prompt; the attachment name carries the prompt. */
export async function postPicture(chatId: ID, img: GeneratedImage, charId: ID | null): Promise<void> {
  await j(`/chats/${encodeURIComponent(chatId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      text: '',
      hidden: true,
      picture: true,
      ...(charId ? { charId } : {}),
      attachments: [{ id: `att_${Date.now().toString(36)}`, name: img.prompt.slice(0, 500), type: img.mimeType, url: img.url }],
    }),
  })
}

/**
 * Dominant color of an image (bucketed histogram, most-populated bucket's
 * average) — used by the character editor's “Extract from avatar”.
 */
export function dominantColor(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const size = 32
      const canvas = document.createElement('canvas')
      canvas.width = size; canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('canvas unavailable')); return }
      ctx.drawImage(img, 0, 0, size, size)
      const { data } = ctx.getImageData(0, 0, size, size)
      const buckets = new Map<string, { n: number; r: number; g: number; b: number }>()
      for (let i = 0; i < data.length; i += 4) {
        // skip near-transparent pixels
        if (data[i + 3]! < 128) continue
        const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!
        const key = `${r >> 5},${g >> 5},${b >> 5}` // 8-level buckets
        const cur = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
        cur.n++; cur.r += r; cur.g += g; cur.b += b
        buckets.set(key, cur)
      }
      let best: { n: number; r: number; g: number; b: number } | undefined
      for (const v of buckets.values()) if (!best || v.n > best.n) best = v
      if (!best || best.n === 0) { reject(new Error('no opaque pixels')); return }
      const to2 = (n: number) => Math.round(n / best!.n).toString(16).padStart(2, '0')
      resolve(`#${to2(best.r)}${to2(best.g)}${to2(best.b)}`)
    }
    img.onerror = () => reject(new Error('not an image'))
    img.src = url
  })
}
