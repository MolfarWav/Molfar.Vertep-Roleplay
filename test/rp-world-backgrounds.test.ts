import { describe, it, expect } from 'bun:test'
import type { BackgroundItem } from '../src/lib/types'

// the helpers import engine.ts, which reads the frame URL at load
;(globalThis as { location?: unknown }).location ??= { pathname: '/app/u/roleplay/', origin: 'http://localhost' }
const { addWords, convertCandidates, findByName, isSnake, looksUnnamed, mergeTags, parseTags, pickerGroups, pictureOf, placeTags, sceneBackgroundId, toSnake, uniqueName } = await import('../src/lib/world-backgrounds')

const bg = (o: Partial<BackgroundItem>): BackgroundItem => ({ id: 'x', name: 'x', url: '', type: 'image', folderId: null, fitting: 'cover', ...o })

describe('world backgrounds helpers', () => {
  it('makes snake_case names', () => {
    expect(toSnake('Old Mill, at Night!')).toBe('old_mill_at_night')
    expect(toSnake('  --  ')).toBe('')
    expect(isSnake('old_mill')).toBe(true)
    expect(isSnake('Old Mill')).toBe(false)
    expect(looksUnnamed('IMG_2031')).toBe(true)
  })
  it('keeps names unique, case-insensitive', () => {
    expect(uniqueName('tavern', ['Tavern'])).toBe('tavern_2')
    expect(uniqueName('tavern', ['tavern', 'tavern_2'])).toBe('tavern_3')
    expect(uniqueName('mill', ['tavern'])).toBe('mill')
  })
  it('parses tags: lower case, no repeats, at most 8', () => {
    expect(parseTags('Night, rain,night , ,')).toEqual(['night', 'rain'])
    expect(parseTags('a,b,c,d,e,f,g,h,i,j')).toHaveLength(8)
  })
  it('adds style words once', () => {
    expect(addWords('', 'pixel art')).toBe('pixel art')
    expect(addWords('warm light', 'pixel art')).toBe('warm light, pixel art')
    expect(addWords('warm light, pixel art', 'pixel art')).toBe('warm light, pixel art')
  })
  it('finds a background by name in a folder', () => {
    const list = [bg({ id: 'a', name: 'Tavern_Night', folderId: 'f1' }), bg({ id: 'b', name: 'tavern_night', folderId: 'f2' })]
    expect(findByName(list, 'f2', 'TAVERN_NIGHT')?.id).toBe('b')
    expect(findByName(list, 'f1', 'castle')).toBeUndefined()
    expect(findByName(list, 'f1', '')).toBeUndefined()
  })
  it('picks the conversion candidates', () => {
    const list = [
      bg({ id: '1', url: 'data:image/png;base64,AAA' }),
      bg({ id: '2', url: 'data:image/webp;base64,AAA' }),
      bg({ id: '3', url: 'data:image/gif;base64,AAA' }),
      bg({ id: '4', url: '/v1/assets/abc' }),
      bg({ id: '5', url: 'https://example.com/a.png' }),
      bg({ id: '6', url: 'data:video/mp4;base64,AAA', type: 'video' }),
    ]
    expect(convertCandidates(list).map((b) => b.id)).toEqual(['1'])
  })
})

describe('add from existing', () => {
  const { existingGroups, copiesInto } = require('../src/lib/world-backgrounds') as typeof import('../src/lib/world-backgrounds')
  const folders = [{ id: 'fa', name: 'Zed', scope: 'backgrounds' }, { id: 'fb', name: 'Ava', scope: 'backgrounds' }, { id: 'ft', name: 'Target', scope: 'backgrounds' }, { id: 'fx', name: 'Chats', scope: 'chats' }]
  const all = [
    bg({ id: '1', name: 'tavern', url: '/u/1', folderId: 'fa', tags: ['inn'] }),
    bg({ id: '2', name: 'castle', url: '/u/2', folderId: 'fb' }),
    bg({ id: '3', name: 'loose', url: '/u/3', folderId: null }),
    bg({ id: '4', name: 'tavern', url: '/u/9', folderId: 'ft' }),
    bg({ id: '5', name: 'same_file', url: '/u/9', folderId: 'fa' }),
    bg({ id: '6', name: 'clip', url: '/u/6', folderId: 'fa', type: 'video' }),
  ]
  it('groups the other folders by name, no folder last, without what is already there or not an image', () => {
    const g = existingGroups(all, folders, 'ft', '', 'No folder')
    expect(g.map((x) => x.name)).toEqual(['Ava', 'Zed', 'No folder'])
    expect(g.flatMap((x) => x.items.map((i) => i.id))).toEqual(['2', '1', '3'])
  })
  it('searches by name and tag, and drops empty groups', () => {
    expect(existingGroups(all, folders, 'ft', 'inn', 'No folder').flatMap((x) => x.items.map((i) => i.id))).toEqual(['1'])
    expect(existingGroups(all, folders, 'ft', 'zzz', 'No folder')).toEqual([])
  })
  it('copies under free names and keeps tags, skipping a file the folder has', () => {
    const picked = [all[0]!, all[4]!, all[1]!]
    const out = copiesInto(picked, all, 'ft')
    expect(out.map((o) => o.name)).toEqual(['tavern_2', 'castle'])
    expect(out[0]!.tags).toEqual(['inn'])
    expect(out.map((o) => o.url)).toEqual(['/u/1', '/u/2'])
  })
})

describe('background search', () => {
  const { backgroundMatches, searchBackgrounds } = require('../src/lib/world-backgrounds') as typeof import('../src/lib/world-backgrounds')
  const folders = [{ id: 'fa', name: 'Ava Mir' }, { id: 'fb', name: 'New Dawn' }]
  const all = [
    bg({ id: '1', name: 'avas_house', folderId: 'fa', tags: ['living room', 'day'] }),
    bg({ id: '2', name: 'harbour', folderId: 'fb', tags: ['night'] }),
    bg({ id: '3', name: 'loose_cafe', folderId: null }),
  ]
  it('reads the name, the tags and the folder name', () => {
    expect(searchBackgrounds(all, folders, 'house').map((b) => b.id)).toEqual(['1'])
    expect(searchBackgrounds(all, folders, 'NIGHT').map((b) => b.id)).toEqual(['2'])
    expect(searchBackgrounds(all, folders, 'dawn').map((b) => b.id)).toEqual(['2'])
    expect(searchBackgrounds(all, folders, 'cafe').map((b) => b.id)).toEqual(['3'])
  })
  it('needs every word, and an empty search shows everything', () => {
    expect(searchBackgrounds(all, folders, 'ava day').map((b) => b.id)).toEqual(['1'])
    expect(searchBackgrounds(all, folders, 'ava night')).toEqual([])
    expect(searchBackgrounds(all, folders, '  ').length).toBe(3)
    expect(backgroundMatches(all[2]!, undefined, 'x')).toBe(false)
  })
})

// pictures bound to places (issue 176)
const pbg = (id: string, name: string, folderId: string | null, extra: Partial<BackgroundItem> = {}): BackgroundItem => ({ id, name, url: `/v1/assets/${id}`, type: "image", folderId, fitting: "cover", ...extra });

describe("place pictures", () => {
  it("tags a picture with the place's name and aliases first, lower case, no repeats, at most 8", () => {
    expect(placeTags("Mei's Apartment", ["Home", "home", " Mei apartment "])).toEqual(["mei's apartment", "home", "mei apartment"]);
    expect(mergeTags(["a", "b"], ["B", "c"])).toEqual(["a", "b", "c"]);
    const many = mergeTags(["one", "two", "three", "four", "five", "six"], ["seven", "eight", "nine", "ten"]);
    expect(many).toHaveLength(8);
    expect(many.at(-1)).toBe("eight");
    expect(placeTags("", [])).toEqual([]);
  });

  it("finds the bound picture, and ignores one that was deleted from the library", () => {
    const lib = [pbg("b1", "living", "w"), pbg("b2", "clip", "w", { type: "video" })];
    expect(pictureOf("b1", lib)?.name).toBe("living");
    expect(pictureOf("gone", lib)).toBeNull();
    expect(pictureOf("b2", lib)).toBeNull();
    expect(pictureOf("", lib)).toBeNull();
    expect(pictureOf(undefined, lib)).toBeNull();
  });

  it("picks the scene's background id only when the library still has it", () => {
    const lib = [pbg("b1", "living", "w")];
    expect(sceneBackgroundId({ background: "b1" }, lib)).toBe("b1");
    expect(sceneBackgroundId({ background: "gone" }, lib)).toBeNull();
    expect(sceneBackgroundId({ background: null }, lib)).toBeNull();
    expect(sceneBackgroundId(null, lib)).toBeNull();
  });

  it("offers the world's folder first, then the others, narrowed by name or tag", () => {
    const lib = [pbg("a", "kitchen", "w", { tags: ["cosy"] }), pbg("b", "tavern", "f2"), pbg("c", "loose_hall", null), pbg("d", "kitchen_copy", "f2", { url: "/v1/assets/a" })];
    const folders = [{ id: "w", name: "Mei apartment" }, { id: "f2", name: "Fantasy" }];
    const all = pickerGroups(lib, folders, "w", "This world", "", "No folder");
    expect(all.map((g) => g.name)).toEqual(["This world", "Fantasy", "No folder"]);
    // the same file in another folder is not offered twice
    expect(all[1]!.items.map((b) => b.id)).toEqual(["b"]);
    expect(pickerGroups(lib, folders, "w", "This world", "cosy", "No folder").map((g) => g.name)).toEqual(["This world"]);
    expect(pickerGroups(lib, folders, "w", "This world", "zzz", "No folder")).toEqual([]);
    // no world folder: every folder is an "other" one
    expect(pickerGroups(lib, folders, null, "This world", "", "No folder").map((g) => g.name)).toEqual(["Fantasy", "Mei apartment", "No folder"]);
  });
});
