// Portraits for cards that have none. The description comes from the profile plugin (one text-model call that
// reads the card), the picture from the engine's image route (the picked model: a local ComfyUI or Forge, or an
// API model), and the result is kept as a light /v1/assets URL. Nothing here writes a card: the caller stores the
// URL. Bulk drawing runs one card after another (one image server serves them all) through the common progress card.

import { j } from '@/lib/engine'
import { buildImagePrompt, generateImage, type GeneratedImage, type ImageGenSettings, type ImageTarget } from '@/lib/image-gen'
import { forEachImport } from '@/lib/import-progress'

/** localStorage key of the model last picked for portraits ("" or absent = the app's image model). */
export const PORTRAIT_MODEL_KEY = 'rp.portrait.model'

export function readPortraitModel(): string {
  try { return localStorage.getItem(PORTRAIT_MODEL_KEY) ?? '' } catch { return '' }
}
export function writePortraitModel(ref: string): void {
  try {
    if (ref) localStorage.setItem(PORTRAIT_MODEL_KEY, ref)
    else localStorage.removeItem(PORTRAIT_MODEL_KEY)
  } catch { /* the pick lasts until the dialog closes */ }
}

/** A card without its own picture: nothing, or the default avatar PNG.
 *  `avatarLazy` means the portrait EXISTS and the list merely left it out: never redraw those. */
export function needsPortrait(x: { avatar?: string | null; avatarLazy?: true }): boolean {
  if (x.avatarLazy === true) return false
  return !x.avatar || x.avatar.endsWith('avatar-default.png')
}

/** The solo cards (not groups) with no portrait, in list order. */
export function missingPortraits<T extends { avatar?: string | null; avatarLazy?: true; isGroup?: boolean }>(items: readonly T[]): T[] {
  return items.filter((x) => !x.isGroup && needsPortrait(x))
}

/** The editor's working text, so a description reads what is on screen and not the last save. */
export interface CardText { name?: string; description?: string; personality?: string; scenario?: string }

/** The profile plugin describes the card visually: one line of tags for a tag-trained server, else a paragraph. */
export async function portraitPrompt(characterId: string, target: Pick<ImageTarget, 'style' | 'guide'>, card?: CardText): Promise<string> {
  const r = await j<{ ok?: boolean; prompt?: string; error?: string }>('/profile/portrait-prompt', {
    method: 'POST',
    body: JSON.stringify({
      characterId,
      style: target.style,
      ...(target.guide ? { guide: target.guide } : {}),
      ...(card ? { card } : {}),
    }),
  })
  const prompt = typeof r.prompt === 'string' ? r.prompt.trim() : ''
  if (!r.ok || !prompt) throw new Error(r.error || 'the model returned an empty description')
  return prompt
}

/** The picture for a finished prompt, on the picked model. */
export function drawPrompt(ig: ImageGenSettings, target: Pick<ImageTarget, 'model'>, prompt: string, signal?: AbortSignal): Promise<GeneratedImage> {
  return generateImage({ prompt: buildImagePrompt(ig, prompt), negativePrompt: ig.negativePrompt, model: target.model || undefined, ...(signal ? { signal } : {}) })
}

/** Describe, then draw: the picture of one card. */
export async function drawCardPortrait(characterId: string, ig: ImageGenSettings, target: ImageTarget, signal?: AbortSignal): Promise<GeneratedImage> {
  return drawPrompt(ig, target, await portraitPrompt(characterId, target), signal)
}

/**
 * Draw the portraits `items` are missing, one unit per card through the progress card (Cancel lands between cards).
 * `apply` stores a finished URL. A card that fails is listed with the reason and the run goes on.
 */
export async function drawCardPortraits(
  title: string,
  items: readonly { id: string; name?: string }[],
  ig: ImageGenSettings,
  target: ImageTarget,
  apply: (id: string, url: string) => void,
): Promise<{ done: number; failed: number }> {
  let done = 0
  let failed = 0
  await forEachImport(
    title,
    items,
    (x) => x.name?.trim() || x.id,
    async (x) => {
      try {
        const img = await drawCardPortrait(x.id, ig, target)
        apply(x.id, img.url)
        done++
        return true
      } catch (e) {
        failed++
        // rethrown: the progress card lists the card with WHY it failed, not just "not drawn"
        throw e
      }
    },
    { verb: 'draw' },
  )
  return { done, failed }
}
