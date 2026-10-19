import { describe, expect, it } from 'bun:test'
import { blockPatch, draftOf, dirtyBlocks, eventBlockOk, isDirty } from '../src/lib/world-profiles'
import { countByKind, filterRecords, parseAliases } from '../src/lib/world-records'
import type { WorldProfile, WorldRecord } from '../src/lib/world'

const profile = (over: Partial<WorldProfile> = {}): WorldProfile => ({
  id: 'p-slow', builtIn: false, base: 'director', name: 'Slow', description: 'd',
  defaults: { everyN: 5, stagnation: 6, onTransition: true, insert: true },
  options: { clocks: 'model', clockEvery: 6, eventByClock: false },
  blocks: [
    { key: 'keeper', text: 'KEEP', default: 'KEEP', changed: false },
    { key: 'event', text: 'Do {event} now', default: 'Do {event} now', changed: false },
  ],
  output: 'JSON', changed: false, chats: 0, ...over,
})
const rec = (o: Partial<WorldRecord>): WorldRecord => ({ id: 'n1', kind: 'person', name: 'Mira', aliases: [], text: 't', status: 'active', at: 1, ...o })

describe('world profiles: the draft', () => {
  it('options changes make a draft dirty', () => {
    const p = profile()
    const d = draftOf(p)
    expect(isDirty(p, { ...d, options: { ...d.options, clocks: 'code' } })).toBe(true)
    expect(isDirty(p, d)).toBe(false)
  })

  it('is clean until something differs; a trailing newline is not a change', () => {
    const p = profile()
    const d = draftOf(p)
    expect(isDirty(p, d)).toBe(false)
    d.blocks.keeper = 'KEEP\n'
    expect(isDirty(p, d)).toBe(false)
    d.blocks.keeper = 'KEEP more'
    expect(dirtyBlocks(p, d)).toEqual(['keeper'])
    expect(isDirty(p, d)).toBe(true)
  })
  it('own profiles are dirty by name; built-ins ignore the name', () => {
    const d = draftOf(profile())
    d.name = 'Other'
    expect(isDirty(profile(), d)).toBe(true)
    expect(isDirty(profile({ builtIn: true, name: '' }), { ...draftOf(profile({ builtIn: true, name: '' })), name: 'x' })).toBe(false)
  })
  it('defaults count', () => {
    const p = profile()
    const d = draftOf(p)
    d.defaults.everyN = 9
    expect(isDirty(p, d)).toBe(true)
  })
  it('an empty or default block is sent as null (back to the default)', () => {
    const p = profile()
    expect(blockPatch(p, 'keeper', '  ')).toBeNull()
    expect(blockPatch(p, 'keeper', 'KEEP')).toBeNull()
    expect(blockPatch(p, 'keeper', 'mine')).toBe('mine')
  })
  it('the event block must keep {event}', () => {
    expect(eventBlockOk('')).toBe(true)
    expect(eventBlockOk('Do {event}')).toBe(true)
    expect(eventBlockOk('Do it')).toBe(false)
  })
})

describe('world records: the list', () => {
  const list = [
    rec({ id: 'a', name: 'Mira', aliases: ['the miller'], at: 5 }),
    rec({ id: 'b', name: 'Old Mill', kind: 'place', status: 'past', at: 9 }),
    rec({ id: 'c', name: 'Guild', kind: 'group', at: 7 }),
  ]
  it('active first, newest first; retired last', () => {
    expect(filterRecords(list, 'all', '').map((r) => r.id)).toEqual(['c', 'a', 'b'])
  })
  it('filters by kind and searches names and aliases', () => {
    expect(filterRecords(list, 'place', '').map((r) => r.id)).toEqual(['b'])
    expect(filterRecords(list, 'all', 'miller').map((r) => r.id)).toEqual(['a'])
    expect(filterRecords(list, 'all', 'MILL').map((r) => r.id)).toEqual(['a', 'b'])
  })
  it('counts per kind', () => {
    expect(countByKind(list)).toEqual({ all: 3, person: 1, place: 1, group: 1, thing: 0, fact: 0 })
  })
  it('parses aliases: trimmed, no empties, no repeats', () => {
    expect(parseAliases(' Mira, mira ,, the miller;Mirka\n')).toEqual(['Mira', 'the miller', 'Mirka'])
  })
})
