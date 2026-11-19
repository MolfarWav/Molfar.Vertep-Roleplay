// What a place is, from its name, for the icon on the places map (Molfar.Vertep#454). Code only, no model.
// The kinds are the seed of the engine's shared icon set (M1): the same ids name the pictures later; until then a node
// shows the kind's emoji. English words match whole (plural too), words with `*` match as a prefix (Ukrainian and Russian
// stems). The first kind in this order that any word of the name matches wins, so the specific ones come before the general.

import { placeKey } from '@/lib/world-places'

export interface PlaceKind { id: string; emoji: string; words: string }

export const PLACE_KINDS: readonly PlaceKind[] = [
  { id: 'smithy', emoji: '⚒️', words: 'smithy forge blacksmith workshop кузн* ковал* майстерн* кузница*' },
  { id: 'bakery', emoji: '🥖', words: 'bakery bakehouse пекарн* булочн*' },
  { id: 'library', emoji: '📚', words: 'library archive бібліотек* архів* библиотек*' },
  { id: 'school', emoji: '🎓', words: 'school academy university classroom college школ* академі* університет* коледж* клас*' },
  { id: 'temple', emoji: '⛩️', words: 'temple shrine altar храм* святилищ* капищ*' },
  { id: 'church', emoji: '⛪', words: 'church chapel cathedral monastery церкв* церкви каплиц* собор* монастир*' },
  { id: 'graveyard', emoji: '🪦', words: 'graveyard cemetery crypt tomb кладовищ* цвинтар* крипт* гробниц* могил*' },
  { id: 'tavern', emoji: '🍺', words: 'tavern pub bar saloon cafe café restaurant canteen таверн* бар кафе ресторан* їдальн* столов*' },
  { id: 'inn', emoji: '🛏️', words: 'inn hostel motel hotel корчм* готел* постоял* хостел' },
  { id: 'shop', emoji: '🛒', words: 'shop store boutique pharmacy магазин* крамниц* лавк* аптек* бутик*' },
  { id: 'market', emoji: '🧺', words: 'market bazaar square ринок ринк* базар* площ*' },
  { id: 'mill', emoji: '🌾', words: 'mill windmill млин* мельниц*' },
  { id: 'farm', emoji: '🐄', words: 'farm barn ranch stable ферм* стайн* хлів* комор* ранчо' },
  { id: 'lighthouse', emoji: '🗼', words: 'lighthouse маяк*' },
  { id: 'ship', emoji: '⛵', words: 'ship boat vessel корабл* корабел* човн* судн*' },
  { id: 'port', emoji: '⚓', words: 'port harbor harbour dock pier порт порту гаван* пристан*' },
  { id: 'bridge', emoji: '🌉', words: 'bridge міст мост* мосту' },
  { id: 'gate', emoji: '🚪', words: 'gate gates entrance брам* ворот* вхід входу' },
  { id: 'castle', emoji: '🏰', words: 'castle замк* замок' },
  { id: 'fortress', emoji: '🛡️', words: 'fort fortress citadel фортец* форт цитадел*' },
  { id: 'tower', emoji: '🗼', words: 'tower веж* башт*' },
  { id: 'palace', emoji: '👑', words: 'palace manor mansion палац* особняк* маєток садиб*' },
  { id: 'dungeon', emoji: '⛓️', words: 'dungeon prison jail cell підземел* темниц* в\'язниц* тюрм* камер*' },
  { id: 'cellar', emoji: '🍷', words: 'cellar basement vault підвал* погріб* льох*' },
  { id: 'cave', emoji: '🕳️', words: 'cave cavern grotto печер* грот*' },
  { id: 'mine', emoji: '⛏️', words: 'mine quarry шахт* рудник* кар\'єр*' },
  { id: 'ruins', emoji: '🏚️', words: 'ruin ruins руїн* розвалин*' },
  { id: 'camp', emoji: '⛺', words: 'camp camping tent bivouac табір табор* намет* стоянк*' },
  { id: 'portal', emoji: '🌀', words: 'portal gateway rift портал* розлом*' },
  { id: 'street', emoji: '🛣️', words: 'street alley lane avenue boulevard вулиц* провулок провулк* алея алеї бульвар*' },
  { id: 'road', emoji: '🥾', words: 'road path trail highway crossroads доріг* дорож* шлях* стежк* тракт* роздоріж*' },
  { id: 'forest', emoji: '🌲', words: 'forest wood woods grove jungle ліс* лісі гай гаю джунгл* пущ*' },
  { id: 'meadow', emoji: '🌼', words: 'meadow clearing glade луг* галявин* пасовиськ*' },
  { id: 'field', emoji: '🌻', words: 'field fields поле поля полі ниви лан' },
  { id: 'mountain', emoji: '⛰️', words: 'mountain peak cliff гора гори горі горах скел* пік піку вершин* ущелин*' },
  { id: 'hills', emoji: '🏞️', words: 'hill hills valley canyon пагорб* узгір* долин* каньйон*' },
  { id: 'river', emoji: '🏞️', words: 'river stream creek waterfall річк* ріка ріки річці струмок струмк* водоспад*' },
  { id: 'lake', emoji: '💧', words: 'lake pond pool озер* ставок ставк* басейн*' },
  { id: 'sea', emoji: '🌊', words: 'sea ocean bay coast shore море моря морі океан* заток* узбереж* берег*' },
  { id: 'beach', emoji: '🏖️', words: 'beach пляж*' },
  { id: 'swamp', emoji: '🪷', words: 'swamp marsh bog болот* трясовин*' },
  { id: 'desert', emoji: '🏜️', words: 'desert dunes пустел* дюн*' },
  { id: 'snow', emoji: '❄️', words: 'snow glacier tundra ice сніг* льодовик* тундр*' },
  { id: 'garden', emoji: '🌳', words: 'garden orchard greenhouse vineyard сад саду садк* оранжере* виноградник*' },
  { id: 'park', emoji: '🌳', words: 'park playground парк*' },
  { id: 'cottage', emoji: '🛖', words: 'cottage cabin hut shack котедж* хатин* халуп* курін*' },
  { id: 'house', emoji: '🏠', words: 'house home apartment flat residence дім дому дом домі будинк* будинок квартир* хат*' },
  { id: 'village', emoji: '🏘️', words: 'village hamlet сел* село деревн* хутір хутор*' },
  { id: 'town', emoji: '🏘️', words: 'town містечк* городок' },
  { id: 'city', emoji: '🏙️', words: 'city capital місто* город города' },
  { id: 'room', emoji: '🚪', words: 'room kitchen bedroom bathroom hall attic office study corridor lobby balcony hallway кімнат* кухн* спальн* ванн* зал* горищ* кабінет* коридор* вітальн* балкон*' },
]

export const FALLBACK_KIND: PlaceKind = { id: 'place', emoji: '📍', words: '' }

const compiled = PLACE_KINDS.map((k) => ({
  kind: k,
  exact: new Set(k.words.split(' ').filter((w) => w && !w.endsWith('*'))),
  prefixes: k.words.split(' ').filter((w) => w.endsWith('*')).map((w) => w.slice(0, -1)),
}))

const hits = (token: string, c: (typeof compiled)[number]) =>
  c.exact.has(token) || (token.endsWith('s') && c.exact.has(token.slice(0, -1))) || (token.endsWith('es') && c.exact.has(token.slice(0, -2))) || c.prefixes.some((p) => token.startsWith(p))

/** The kind a place's name says it is (any of the names given), or the plain pin. */
export function placeKind(...names: (string | null | undefined)[]): PlaceKind {
  const tokens = names.flatMap((n) => placeKey(n).split(' ')).filter(Boolean)
  if (!tokens.length) return FALLBACK_KIND
  for (const c of compiled) if (tokens.some((t) => hits(t, c))) return c.kind
  return FALLBACK_KIND
}
