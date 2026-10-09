/**
 * Expression detection for character sprites — keyword rules over the latest
 * character message (the classifier-free approach: offline, no token spend).
 *
 * Labels are the sprite-pack naming convention (sprite files are named for
 * the emotion they show), so a pack dropped in unchanged resolves. Each rule
 * also carries synonym stems, which is how informally named sprites
 * ("happy.png", "angry.png") still resolve to the label that fired.
 *
 * Order is priority: the resolver walks matched labels in this order and
 * takes the first that the character actually has a sprite for, so narrow
 * emotions come before the broad ones they would otherwise be swallowed by.
 */
const RULES: [string, RegExp, string][] = [
  ['grief', /\b(grief|griev|mourn|bereav|anguish)/i, 'grieving mourning'],
  ['remorse', /\b(remorse|regret|guilt|guilty|apolog|ashamed|shame)/i, 'regret guilt sorry'],
  ['amusement', /\b(haha|lol|chuckl|cackl|snicker|giggl|amused|amusement)/i, 'amused laugh laughing'],
  ['embarrassment', /\b(embarrass|blush|fluster|sheepish|bashful|shy)/i, 'embarrassed blush shy flustered'],
  ['excitement', /\b(excit|thrill|eager|ecstatic|elated|giddy)/i, 'excited thrilled'],
  ['nervousness', /\b(nervous|anxious|uneasy|fret|jitter|fidget|worr)/i, 'nervous worried anxious'],
  ['confusion', /\b(confus|puzzl|bewilder|baffl|perplex)/i, 'confused puzzled'],
  ['curiosity', /\b(curio|intrigu|inquisit|wonder)/i, 'curious intrigued'],
  ['realization', /\b(realiz|realis|dawn(?:s|ed)? on|it clicks)/i, 'realize realization'],
  ['relief', /\b(relief|reliev|unclench|tension (?:leaves|drains|eases))/i, 'relieved'],
  ['gratitude', /\b(thank|grateful|gratitude|appreciat)/i, 'thankful grateful'],
  ['admiration', /\b(admir|awe|awed|impress|marvel)/i, 'awe impressed'],
  ['pride', /\b(proud|pride|smug|boast|preen)/i, 'proud smug smirk'],
  ['desire', /\b(desire|lust|crave|yearn|long for|hunger for)/i, 'lust craving'],
  ['disappointment', /\b(disappoint|let down|dishearten|deflat)/i, 'disappointed'],
  ['disapproval', /\b(disapprov|scowl|glare|tsk)/i, 'disapproving frown'],
  ['annoyance', /\b(annoy|irritat|exasperat|huff|scoff)/i, 'annoyed irritated'],
  ['disgust', /\b(disgust|repuls|revolt|nausea|sicken)/i, 'disgusted'],
  ['approval', /\b(approv|nods|nodded|well done)/i, 'approving agree nod'],
  ['caring', /\b(caring|tender|comfort|soothe|nurtur)/i, 'tender comfort'],
  ['optimism', /\b(optimis|hopeful|upbeat|bright side)/i, 'hopeful'],
  ['anger', /\b(anger|angry|furious|rage|yells?|shouts?|snarls?|growls?|seeth)/i, 'angry mad rage furious'],
  ['fear', /\b(scare|fear|afraid|terrif|frighten|tremble|trembling|shiver|panic|dread)/i, 'scared afraid terror'],
  ['surprise', /\b(surpris|shock|astonish|gasps?|wide.?eye|startle|stun)/i, 'surprised shock startled stunned'],
  ['sadness', /\b(sad|sorrow|cry|cries|crying|tears|weep|sob|melanchol)/i, 'sad sorrow crying tears'],
  ['love', /\b(love|adore|affection|kiss|embrace|cherish)/i, 'affection heart'],
  ['joy', /\b(happy|joy|smiles?|grins?|cheer|delight|beam|beaming)/i, 'happy smile cheerful delight grin'],
  // outside the common pack naming, but frequently authored by hand
  ['thinking', /\b(think|ponder|consider|contemplat|muse|hmm)/i, 'thoughtful ponder'],
  ['determined', /\b(determin|resolv|steadfast|unwaver|resolute)/i, 'resolve determination'],
  ['hurt', /\b(hurt|pain|wound|wince|grimace|ache|suffer)/i, 'pain wounded'],
]

/** Ukrainian and Russian stems for the same labels: a stem matches the START
 *  of a word (`\b` does not see Cyrillic letters, so the start is checked
 *  with \p{L}). Each stem sits under one label only, and short or ambiguous
 *  stems are spelled out ("злий", not "зл", which also starts "злива"). */
const CYRILLIC: Record<string, string> = {
  grief: 'скорбот скорб оплак втрат горе траур утрат погребальн',
  remorse: 'каятт розкаян провин винн перепрош вибач раская виноват винов совест извин прости сожале угрыз позор',
  amusement: 'хаха хихи смішн смішк смію регоч регіт жартів забавн смешн смеюсь смеёт смеет хохоч шутл забавн',
  embarrassment: 'сором ніяков почервон червоніє зашарі соромл збентеж смущ стыдл краснее покрасн застенч неловк робко конфуз',
  excitement: 'захопл збудж схвильов піднесен ентузіаз нетерпляч трепет возбужд взволнов восторг энтузиаз нетерпел воодушев трепещ',
  nervousness: 'нервов нервув тривож хвилю занепоко метушл нервн тревож волнует волнуюсь беспоко суетл',
  confusion: 'розгубл спантел заплута непорозум розгублен растерян озадач запутан недоуме сконфуж',
  curiosity: 'цікав заінтриг допитл розпиту любопыт заинтриг пытлив интересу расспраш',
  realization: 'усвідом осяян осінил раптом зрозум прозрі здогада осозна озарен осенил прозре догада внезапно понял',
  relief: 'полегш відлягл розслаб видихн облегч отлегл расслаб выдохн',
  gratitude: 'дякую дякує вдячн подяк ціную благодар спасиб признательн ценю',
  admiration: 'захоплен вражен благогов замилув восхищ впечатл благогов любуется любуясь',
  pride: 'пишаю пишає горд зарозум хвальк чванл самовдоволен горж хваст зазна тщеслав самодовол чван важнича',
  desire: 'жадан жадає пристрасн пожадл хтив прагне жажд страстн похот вожделе томлен',
  disappointment: 'розчаров пригнічен пригноб зневір засмуч похмур прикро разочаров удруч отчаян расстро опустош мрачн',
  disapproval: 'несхвальн осуд насуп нахмур зневажл докірл неодобр осужда хмур презрит укоризн',
  annoyance: 'дратує дратуєт роздрат подразн бурч фирк обурю незадовол раздраж досад бурч фырк возмущ недовол',
  disgust: 'огид відраз нудот мерзен мерзот бридк гидлив отвращ омерз брезг тошнот противн гадк мерзк',
  approval: 'схвальн схвал погодж кива кивну згодн молодець одобр соглаша кивает кивнул кивну согласн похвал молодец',
  caring: 'турбот заспокоює втіша пестл піклу забот утеша успокаива ласков опека опекает жалеет',
  optimism: 'оптиміст надія надію сподіва вірю оптимист надежд надеюсь верю',
  anger: 'гнів злий зліст злюс розлюч лют лютує крич гарч скажен гнев злой злоб злост ярост бешен кричит рычит взбешен злюсь разозл',
  fear: 'страх боюс боїт боязк жах лякає ляка переляк тремт тряс паніку панік ужас испуг боюсь боит пуга дрож паник',
  surprise: 'здивов подив шок ахну ошелеш приголомш вражено удивл изумл шок ахну остолбен ошелом вздрогн поражен',
  sadness: 'сумн сумує сумом журб сльоз схлип плач рида печал меланхол груст печал плач слез слёз всхлип рыда тоск уныл уныни смутн',
  love: 'любл коха ніжн обійм поцілу цілує прихильн любим нежн обним поцелу целует привязан',
  joy: 'щаст радісн радіє радий радо усміх усміш посміх весел сміх счаст радост радуе обрадов улыб усмех весел смех',
  thinking: 'дума обдум роздум розмірков замисл прикида размышл задум обдум раздум',
  determined: 'рішуч наполегл твердо непохитн цілеспрям решит решимост настойчив твёрдо непоколеб целеустрем',
  hurt: 'біль болить боля поранен рана скавч стогн мучу стражда гримас боль больно ранен ранит скул стон страда',
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const CYRILLIC_RE: Record<string, RegExp> = Object.fromEntries(
  Object.entries(CYRILLIC).map(([label, stems]) => [
    label,
    new RegExp(`(?<!\\p{L})(?:${[...new Set(stems.split(/\s+/).filter(Boolean))].map(escapeRe).join('|')})`, 'iu'),
  ]),
)

/** The pack naming a sprite set is expected to use. Offered as the starting
 *  slot list in the editor so a pack drops in without hand-typing names. */
export const STANDARD_EXPRESSIONS: string[] = [...RULES.map(([label]) => label), 'neutral']

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** All matching expression labels from message text, strongest-first (the
 *  resolver walks the list until one label actually has a sprite). */
export function detectExpressionLabels(text: string): string[] {
  const out: string[] = []
  for (const [label, re] of RULES) if (re.test(text) || CYRILLIC_RE[label]?.test(text)) out.push(label)
  return out
}

const stemsOf = (label: string): string[] => {
  const rule = RULES.find(([l]) => l === label)
  return [label, ...(rule ? rule[2].split(/\s+/) : [])].map(norm).filter((s) => s.length >= 3)
}

/** Resolve matched labels against the sprites that exist: for each label,
 *  exact/synonym stem match (either direction) → then the next label; when
 *  nothing matches → default → neutral → first sprite. */
export function resolveExpressionSprite(
  labels: string[] | null,
  sprites: { name: string; url: string | null }[],
  defaultExpression?: string,
): { name: string; url: string } | null {
  const have = sprites.filter((s): s is { name: string; url: string } => Boolean(s.url))
  if (!have.length) return null
  const byName = (n: string) => have.find((s) => norm(s.name) === norm(n))
  for (const label of labels ?? []) {
    for (const stem of stemsOf(label)) {
      const exact = have.find((s) => norm(s.name) === stem)
      if (exact) return exact
    }
    for (const stem of stemsOf(label)) {
      const fuzzy = have.find((s) => norm(s.name).includes(stem) || stem.includes(norm(s.name)))
      if (fuzzy) return fuzzy
    }
  }
  const fallback = (defaultExpression && byName(defaultExpression)) || byName('neutral') || have[0]!
  return fallback
}

/** The expression a sprite FILE is for, from its name: "joy.png" → "joy",
 *  "Aria-joy.png" → "joy", "expressions/joy (1).png" → "joy". Sprite packs
 *  ship one file per emotion, and matching on the name is what lets a whole
 *  folder be dropped in at once. Returns the cleaned stem when nothing is
 *  recognized, so unnamed emotions still become slots the user can rename. */
export function expressionNameFromFile(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, '').replace(/\s*\(\d+\)$/, '')
  const parts = stem.split(/[^a-zA-Z0-9]+/).filter(Boolean)
  const known = [...STANDARD_EXPRESSIONS]
  // last segment first: packs prefix with the character name, never suffix
  for (const part of [...parts].reverse()) {
    const n = norm(part)
    const hit = known.find((k) => norm(k) === n)
    if (hit) return hit
  }
  for (const part of [...parts].reverse()) {
    const n = norm(part)
    if (n.length < 3) continue
    const hit = known.find((k) => norm(k).startsWith(n) || n.startsWith(norm(k)))
    if (hit) return hit
  }
  return (parts[parts.length - 1] ?? stem).toLowerCase()
}
