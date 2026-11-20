// Drawing a map for the places map with the image model (Molfar.Vertep#475): the words of the prompt, by kind of map. Pure; the
// call itself is `generateImage` in image-gen.ts. The wording is the one the shipped packs were made with (the picture is only the
// ground, the player's places are icons laid on top), so a drawn map sits under the icons the way a ready one does.

import type { MapScale } from '@/lib/place-map'

/** The kinds the dialog offers, in order. The first group is what the ready-map gallery has; `continent` and `dungeon` have no ready map yet. */
export const MAP_GEN_KINDS = [
  'region', 'continent', 'city', 'port-town', 'village', 'wilds', 'coast', 'interior', 'dungeon', 'underground',
  'modern-downtown', 'modern-metropolis', 'modern-residential', 'modern-industrial', 'modern-campus', 'modern-waterfront', 'modern-airport', 'modern-small-town',
] as const
export type MapGenKind = (typeof MAP_GEN_KINDS)[number]

const SUBJECTS: Record<MapGenKind, string> = {
  region: 'a fantasy region: a forest in the north-west, a mountain range in the north, rolling hills and meadows in the middle, a river from the mountains to a lake and on to a sea coast in the south-east, a winding dirt road between clearings, plenty of open ground',
  continent: 'a fantasy continent seen from high above: a long irregular coastline with bays and a few islands, mountain ranges, great forests, a large river and a lake, plains and a desert in the south, wide open land between them where far-apart cities could stand',
  city: 'a medieval walled town plan: a ring wall with a gate on each side, a main street crossing in the middle to a central open square, narrow side streets in a loose grid, a river along one edge with a stone bridge, empty cobbled blocks and small green gardens between the streets where houses can stand',
  'port-town': 'a harbour town plan: a curved quay and wooden piers on the lower side, a market square behind the harbour, streets climbing in a fan to a hill with an empty plateau on top, a stream through the middle with one bridge, empty plots between the streets',
  village: 'a small village plan: one dirt road through the middle with a green common and a well in the centre, footpaths branching to empty plots, fenced gardens and fields around, a pond and a few round trees at the edge',
  wilds: 'wild country with no towns: dense forest with a few clearings, a stream with a ford, a rocky ridge, marsh patches and one old dirt track, a small lake, mostly open ground',
  coast: 'a coast and islands: a curved shoreline, a bay, three small islands, shallow turquoise water near the land and deep blue farther out, a sandy beach strip, cliffs on one side, no ships',
  interior: 'the floor plan of a large house or inn: wooden plank floors, rooms and a corridor and a hall divided by thin walls, a staircase, empty rooms with no furniture, seen straight from above',
  dungeon: 'a dungeon level seen from above: stone-walled corridors and square and round chambers, a few doors, a flight of steps down, an old well, damp flagstone floors, empty rooms with nothing in them, warm torch-lit tone, readable, not black',
  underground: 'an underground cavern system seen from above: winding tunnels and wider chambers cut into dark grey-brown rock, a small underground stream, empty floor space in the chambers, soft warm torch-lit tone, readable, not black',
  'modern-downtown': 'the centre of a modern city: a grid of streets with empty blocks, one wide avenue, a small square, a river with a bridge on one side, empty building plots, crossings and tram lines',
  'modern-metropolis': 'a dense modern metropolis plan: wide avenues crossing at a central plaza, ring road, empty tall-block plots, a river with several bridges, a park, rail line along one side',
  'modern-residential': 'a modern residential district: curving streets, cul-de-sacs, empty house plots with small lawns, a small park and a pond, a main road along one edge, a school-sized empty plot',
  'modern-industrial': 'a modern industrial zone: a rail spur and a main road, wide empty paved yards, empty large building plots, a canal along one edge, fences and loading yards',
  'modern-campus': 'a modern campus: lawns and paved paths crossing in the middle, empty building plots around a central quad, a sports field and running track, a small lake, parking areas at the edge',
  'modern-waterfront': 'a modern waterfront: a long quay and piers on the lower side, container yards, a promenade, a bridge over an inlet, empty plots behind the harbour, a main road along the shore',
  'modern-airport': 'a modern airport plan: two long runways and taxiways, empty apron areas, an empty terminal plot, a car park, an access road and a rail link at one edge, open fields around',
  'modern-small-town': 'a small modern town: a main street with empty plots along it, a crossroads with a small square, a few side streets, fields and a creek at the edge, a rail line on one side',
}

/** The kind a map of this scale starts from in the dialog: the same rule as the ready map's default. */
export const defaultGenKind = (scale: MapScale, fallback: MapGenKind = 'region'): MapGenKind => (scale === 'world' ? 'continent' : scale === 'region' ? 'region' : fallback)

const STYLE =
  'A top-down hand-painted fantasy map background in the style of an old illustrated game map: soft dark ink outlines, warm muted colours, gentle light from the top left, visible painted texture. Seen straight from above like a plan. It is only the ground: land, water, roads and open empty spaces where buildings could stand later, because small icons will be placed on top of it. Calm, low-contrast, mid-tone colours, no strong dark or white areas. No text, no letters, no labels, no compass, no scale bar, no border, no frame, no pins, no markers, no icons, no characters. Leave all building plots empty, no houses, no roofs. Wide landscape 16:9.'
const MODERN_STYLE = 'Same look, but the place is modern: asphalt roads, pavements, tram and rail lines, tidy lawns instead of fields.'

export const PROMPT_MAX = 1500

/**
 * The prompt the dialog starts with: the look, the kind's subject and, when the player has places on the map, their names so the
 * ground has room for them. The player edits it freely before anything is drawn.
 */
export function mapPrompt(kind: string, names: readonly string[] = [], mapName = ''): string {
  const k = (kind in SUBJECTS ? kind : 'region') as MapGenKind
  const parts = [STYLE]
  if (k.startsWith('modern-')) parts.push(MODERN_STYLE)
  parts.push(`Subject: ${SUBJECTS[k]}.`)
  const title = mapName.replace(/\s+/g, ' ').trim().slice(0, 40)
  if (title) parts.push(`The map is called "${title}" (the name is not written on it).`)
  const list = names.map((n) => n.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 12)
  if (list.length) parts.push(`Leave a clear empty spot for each of these places: ${list.join(', ')}.`)
  return parts.join('\n').slice(0, PROMPT_MAX + 400)
}
