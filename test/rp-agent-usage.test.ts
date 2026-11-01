import { describe, expect, it } from 'bun:test'
import { followOf, lastSetFor, usageBySet } from '../src/lib/agent-usage'
import type { ChatAgents } from '../src/lib/agents'

type C = Parameters<typeof usageBySet>[0][number]
const chat = (id: string, characterId: string, updatedAt: number, agents?: C['agents']): C => ({ id, characterId, updatedAt, agents })
const live = (presetId: string | null, followsPreset: boolean, n = 1): ChatAgents => ({
  presetId, presetMissing: false, followsPreset, items: Array.from({ length: n }, (_, i) => ({ agent: `a${i}`, on: true, show: null })),
})

describe('followOf', () => {
  it('a chat with no binding follows the default set', () => {
    expect(followOf(chat('c', 'x', 1), undefined, 'rp')).toEqual({ setId: 'rp', own: false, empty: false })
  })
  it('a chat with a preset and an own copy started from the set but no longer follows it', () => {
    expect(followOf(chat('c', 'x', 1, { preset: 'rp', own: [{ agent: 'mood-tracker' }] }), undefined, null)).toEqual({ setId: 'rp', own: true, empty: false })
  })
  it('the plugin\'s resolved list wins over the binding read at start', () => {
    const c = chat('c', 'x', 1, { preset: 'old' })
    expect(followOf(c, live('new', true), null)).toEqual({ setId: 'new', own: false, empty: false })
    expect(followOf(c, live('new', false, 0), null).empty).toBe(true)
  })
})

describe('usageBySet', () => {
  it('counts the chats that follow a set live, the default included, and skips own copies', () => {
    const chats = [
      chat('1', 'x', 1, { preset: 'rp' }),
      chat('2', 'x', 2), // follows the default
      chat('3', 'y', 3, { preset: 'rp', own: [{ agent: 'a' }] }), // own copy: not counted
      chat('4', 'y', 4, { preset: 'quiet' }),
    ]
    const u = usageBySet(chats, {}, 'rp')
    expect(u.get('rp')).toBe(2)
    expect(u.get('quiet')).toBe(1)
  })
  it('counts nothing for a chat that follows no set', () => {
    expect(usageBySet([chat('1', 'x', 1)], {}, null).size).toBe(0)
  })
  it('uses the live list for a chat opened this session', () => {
    const u = usageBySet([chat('1', 'x', 1, { preset: 'rp' })], { '1': live('quiet', true) }, null)
    expect(u.get('rp')).toBeUndefined()
    expect(u.get('quiet')).toBe(1)
  })
})

describe('lastSetFor', () => {
  const ids = new Set(['rp', 'quiet'])
  it('is the default when the character has no chat yet', () => {
    expect(lastSetFor([], {}, 'x', 'rp', ids)).toEqual({ pick: 'default', from: null })
  })
  it('takes the set of the newest chat with this character, not another character\'s', () => {
    const chats = [chat('old', 'x', 1, { preset: 'rp' }), chat('new', 'x', 5, { preset: 'quiet' }), chat('other', 'y', 9, { preset: 'rp' })]
    expect(lastSetFor(chats, {}, 'x', 'rp', ids)).toEqual({ pick: 'quiet', from: 'new' })
  })
  it('says nothing when the last chat used the default anyway', () => {
    expect(lastSetFor([chat('a', 'x', 1, { preset: 'rp' })], {}, 'x', 'rp', ids)).toEqual({ pick: 'default', from: null })
  })
  it('an emptied chat starts the next one with no agents', () => {
    expect(lastSetFor([chat('a', 'x', 1, { preset: 'rp', own: [] })], {}, 'x', 'rp', ids)).toEqual({ pick: 'none', from: 'a' })
  })
  it('a set that is gone falls back to the default', () => {
    expect(lastSetFor([chat('a', 'x', 1, { preset: 'deleted' })], {}, 'x', 'rp', ids)).toEqual({ pick: 'default', from: null })
  })
  it('an own copy that still has agents starts from the set it came from', () => {
    expect(lastSetFor([chat('a', 'x', 1, { preset: 'quiet', own: [{ agent: 'a' }] })], {}, 'x', 'rp', ids)).toEqual({ pick: 'quiet', from: 'a' })
  })
})
