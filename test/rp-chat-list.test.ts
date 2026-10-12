import { describe, expect, it } from 'bun:test'
import { groupChats, sortChats, timeGroupOf } from '../src/lib/chat-list'

const now = new Date(2026, 9, 12, 15, 0).getTime()
const at = (d: number, h = 12) => new Date(2026, 9, 12 - d, h, 0).getTime()

describe('Chats page list', () => {
  it('puts a time into today, this week or earlier', () => {
    expect(timeGroupOf(at(0, 0), now)).toBe('today')
    expect(timeGroupOf(at(1, 23), now)).toBe('week')
    expect(timeGroupOf(at(6, 1), now)).toBe('week')
    expect(timeGroupOf(at(7, 23), now)).toBe('earlier')
  })

  it('pins first, then periods, empty periods left out', () => {
    const chats = [
      { id: 'a', title: 'A', updatedAt: at(0) },
      { id: 'b', title: 'B', updatedAt: at(20), pinned: true },
      { id: 'c', title: 'C', updatedAt: at(30) },
    ]
    expect(groupChats(chats, 'recent', now).map((g) => [g.key, g.chats.map((c) => c.id)])).toEqual([
      ['pinned', ['b']], ['today', ['a']], ['earlier', ['c']],
    ])
    expect(groupChats(chats, 'name', now).map((g) => g.key)).toEqual(['pinned', 'all'])
  })

  it('sorts by activity, size or name', () => {
    const chats = [
      { id: 'a', title: 'x', updatedAt: 1, n: 5, who: 'Odarka' },
      { id: 'b', title: 'y', updatedAt: 3, n: 9, who: 'Ivas' },
      { id: 'c', title: 'z', updatedAt: 2, n: 5, who: 'Chuh' },
    ]
    const ids = (s: 'recent' | 'messages' | 'name') => sortChats(chats, s, (c) => c.n, (c) => c.who).map((c) => c.id)
    expect(ids('recent')).toEqual(['b', 'c', 'a'])
    expect(ids('messages')).toEqual(['b', 'c', 'a'])
    expect(ids('name')).toEqual(['c', 'b', 'a'])
  })
})
