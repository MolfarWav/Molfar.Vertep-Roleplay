import { describe, expect, test } from 'bun:test'
import { loadLock, saveLock } from '../src/lib/place-map-lock'

const fake = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), size: () => m.size }
}

describe('the places map lock', () => {
  test('is off until it is turned on, per chat', () => {
    const st = fake()
    expect(loadLock('c1', st)).toBe(false)
    saveLock('c1', true, st)
    expect(loadLock('c1', st)).toBe(true)
    expect(loadLock('c2', st)).toBe(false)
  })
  test('turning it off removes the key', () => {
    const st = fake()
    saveLock('c1', true, st)
    saveLock('c1', false, st)
    expect(loadLock('c1', st)).toBe(false)
    expect(st.size()).toBe(0)
  })
  test('works without storage and when storage throws', () => {
    expect(loadLock('c1', null)).toBe(false)
    expect(() => saveLock('c1', true, null)).not.toThrow()
    const bad = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') }, removeItem: () => { throw new Error('denied') } }
    expect(loadLock('c1', bad)).toBe(false)
    expect(() => saveLock('c1', true, bad)).not.toThrow()
    expect(() => saveLock('c1', false, bad)).not.toThrow()
  })
})
