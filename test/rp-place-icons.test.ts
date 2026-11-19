import { describe, expect, test } from 'bun:test'
import { cleanIconIndex, hashId, placeIconPath, placeIconVariants, variantOf } from '../src/lib/place-icons'
import { PLACE_KINDS, FALLBACK_KIND } from '../src/lib/place-kinds'

const INDEX = { tavern: 4, inn: 4, place: 4, forest: 3 }

describe('place icons: which picture a place gets', () => {
  test('the same place always gets the same variant, in range', () => {
    for (let i = 0; i < 200; i++) {
      const v = variantOf(`n${i}`, 4)
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(4)
      expect(variantOf(`n${i}`, 4)).toBe(v)
    }
    expect(variantOf('n1', 0)).toBe(0)
  })

  test('places spread over all the variants, so two taverns can look different', () => {
    const seen = new Set<number>()
    for (let i = 1; i <= 40; i++) seen.add(variantOf(`n${i}`, 4))
    expect([...seen].sort()).toEqual([1, 2, 3, 4])
    expect(hashId('n1')).not.toBe(hashId('n2'))
  })

  test('the path names the kind and the variant', () => {
    const p = placeIconPath('tavern', 'n7', INDEX)!
    expect(p).toMatch(/^\/v1\/place-icons\/tavern-[1-4]\.webp$/)
    expect(placeIconPath('forest', 'n7', INDEX)).toMatch(/^\/v1\/place-icons\/forest-[1-3]\.webp$/)
  })

  test('no icon when the engine has no set or not this kind: the emoji stays', () => {
    expect(placeIconPath('tavern', 'n1', null)).toBeNull()
    expect(placeIconPath('tavern', 'n1', undefined)).toBeNull()
    expect(placeIconPath('tavern', 'n1', {})).toBeNull()
    expect(placeIconPath('castle', 'n1', INDEX)).toBeNull()
  })

  test('lists every variant of a kind', () => {
    expect(placeIconVariants('forest', INDEX)).toEqual(['/v1/place-icons/forest-1.webp', '/v1/place-icons/forest-2.webp', '/v1/place-icons/forest-3.webp'])
    expect(placeIconVariants('castle', INDEX)).toEqual([])
  })

  test('the engine answer is cleaned: bad kinds and counts are dropped', () => {
    expect(cleanIconIndex({ icons: { tavern: 4, 'Bad Kind': 2, castle: 0, keep: 100, ok: 2.5, fine: 99, 'a-b': 2, x: '3' } })).toEqual({ tavern: 4, fine: 99, 'a-b': 2 })
    expect(cleanIconIndex(null)).toEqual({})
    expect(cleanIconIndex({ error: 'not found' })).toEqual({})
    expect(cleanIconIndex({ icons: [1, 2] })).toEqual({})
  })

  test('every kind the map can name is one the engine set is made for', () => {
    // the engine's own test lists the same ids against its files; keep the two lists in step
    const ids = [...PLACE_KINDS.map((k) => k.id), FALLBACK_KIND.id].sort()
    expect(ids.length).toBe(52)
    expect(new Set(ids).size).toBe(52)
    for (const id of ids) expect(id).toMatch(/^[a-z]+$/)
  })
})
