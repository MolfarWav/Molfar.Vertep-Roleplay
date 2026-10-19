import { describe, it, expect } from 'bun:test'
import type { BackgroundItem } from '../src/lib/types'

// the helpers import engine.ts, which reads the frame URL at load
;(globalThis as { location?: unknown }).location ??= { pathname: '/app/u/roleplay/', origin: 'http://localhost' }
const { addWords, convertCandidates, findByName, isSnake, looksUnnamed, parseTags, toSnake, uniqueName } = await import('../src/lib/world-backgrounds')

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
