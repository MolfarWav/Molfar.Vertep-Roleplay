// The same rule lives in plugins/engine/plugin.js (talkativeness, guessTalkativeness): the engine
// picks who speaks with it, the group editor shows it. Plugins are plain JS and cannot import from
// src/, so keep the two in step (test/rp-talkativeness.test.ts compares them).

/** Word starts that make a character speak up more (en, uk, ru). A word counts when it STARTS with
 *  one, so "unsociable" or "необщительный" never count as sociable. */
export const TALK_UP = [
  'talkative', 'chatty', 'outgoing', 'extrovert', 'loud', 'bubbly', 'energetic', 'cheerful', 'boisterous', 'sociable',
  'gossip', 'witty', 'playful', 'flirt', 'bold', 'brash', 'confident', 'impulsive', 'hyperactive', 'enthusiastic',
  'балакуч', 'говірк', 'галасл', 'весел', 'енергійн', 'товариськ', 'комунікабел', 'зухвал', 'жартівлив', 'грайлив', 'запальн',
  'болтлив', 'разговорчив', 'общительн', 'громк', 'шумн', 'энергичн', 'жизнерадост', 'дерзк', 'кокетлив', 'игрив', 'вспыльчив',
]
/** Word starts that make a character hold back. */
export const TALK_DOWN = [
  'shy', 'quiet', 'reserved', 'introvert', 'silent', 'taciturn', 'timid', 'aloof', 'stoic', 'withdrawn', 'laconic',
  'reticent', 'unsociable', 'soft-spoken', 'mute', 'brooding', 'cold',
  'мовчазн', 'сором', 'тих', 'стриман', 'замкнут', 'небагатослів', 'лаконічн', 'нетовариськ', 'відсторонен', 'похмур',
  'застенчив', 'молчалив', 'сдержан', 'нелюдим', 'робк', 'неразговорчив', 'необщительн', 'отстранен', 'угрюм', 'немногослов',
]

/** How talkative the card's text makes a character, 0.15..0.9: 0.5, plus 0.1 for every different
 *  outgoing word, minus 0.1 for every different reserved one. */
export function guessTalkativeness(text: string): number {
  const words = String(text ?? '').toLowerCase().replace(/[’ʼ']/g, '').split(/[^\p{L}\p{N}-]+/u).filter(Boolean)
  const hits = (stems: string[]) => new Set(stems.filter((s) => words.some((w) => w.startsWith(s.replace(/'/g, ''))))).size
  const n = 0.5 + 0.1 * (hits(TALK_UP) - hits(TALK_DOWN))
  return Math.round(Math.min(0.9, Math.max(0.15, n)) * 100) / 100
}

/** The card's own talkativeness, or null when it has none. 0.5 counts as none: SillyTavern writes
 *  0.5 into every card it exports, so it says nothing about the character. */
export function cardTalkativeness(raw: unknown): number | null {
  const n = Number(raw)
  if (raw == null || raw === '' || !Number.isFinite(n) || n === 0.5) return null
  return Math.min(1, Math.max(0, n))
}
