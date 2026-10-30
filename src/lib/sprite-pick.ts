import { leadVoiceIn, type DialogueVoice } from '@/lib/dialogue-voices'
import { detectExpressionLabels, outfitsIn, pickOutfit, resolveSprite, spritePool, type SpriteLike } from '@/lib/expressions'

/** The parts of a card the sprite pick reads. */
export interface SpriteCard {
  expressions: readonly SpriteLike[]
  defaultExpression?: string
  /** the card's default outfit (`studio.outfit`) */
  outfit?: string
}

export interface PickedSprite {
  sprite: SpriteLike & { url: string }
  /** whose sprite: the voice's name, '' = the card itself (or shared sprites) */
  character: string
  /** the outfits this speaker has, and the one shown */
  outfits: string[]
  outfit: string
}

const low = (s: string) => s.trim().toLowerCase()

/**
 * Who speaks in a Narrator card's message, for the sprite: lines are split, a line opening with a voice's label
 * ("Aria: ...") belongs to that voice, and the speaker is the voice that speaks LAST among those that own sprites.
 * Returns the voice's name and what its own lines say, or null when no line is attributable.
 */
export function lastSpeaker(text: string, voices: readonly DialogueVoice[], sprites: readonly SpriteLike[]): { name: string; text: string } | null {
  if (!voices.length) return null
  const owners = new Set(sprites.filter((s) => s.url && s.character?.trim()).map((s) => low(s.character!)))
  const mine = voices.filter((v) => owners.has(low(v.name)))
  if (!mine.length) return null
  const own = new Map<string, string[]>()
  let last: DialogueVoice | null = null
  for (const line of text.split(/\r?\n/)) {
    const v = leadVoiceIn(line, mine)
    if (!v) continue
    last = v
    own.set(v.name, [...(own.get(v.name) ?? []), line])
  }
  return last ? { name: last.name, text: (own.get(last.name) ?? []).join('\n') } : null
}

/**
 * The sprite a message shows. A card without characters or outfits behaves as it always did; a Narrator card
 * with sprites per voice shows the voice that speaks last, and its emotion comes from that voice's own lines
 * (the whole message when they say nothing). `outfits` is the chat's choice per speaker (key: the voice's name,
 * '' for the card itself); a card's `outfit` is the default for everyone who has it.
 */
export function pickSprite(
  text: string,
  card: SpriteCard,
  voices: readonly DialogueVoice[] = [],
  outfits?: Record<string, string>,
): PickedSprite | null {
  const sprites = card.expressions
  if (!sprites.some((s) => s.url)) return null
  const who = lastSpeaker(text, voices, sprites)
  const character = who?.name ?? ''
  const own = who ? detectExpressionLabels(who.text) : []
  const labels = own.length ? own : detectExpressionLabels(text)
  const pool = spritePool(sprites, character)
  if (!pool.length) return null
  const list = outfitsIn(pool)
  const wanted = outfits?.[character] ?? card.outfit
  const outfit = pickOutfit(list, wanted) ?? ''
  const sprite = resolveSprite(labels, sprites, { character, outfit, defaultExpression: card.defaultExpression })
  return sprite ? { sprite, character, outfits: list, outfit } : null
}
