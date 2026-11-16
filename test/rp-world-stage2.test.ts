import { describe, expect, it } from 'bun:test'
import { blockPatch, draftOf, dirtyBlocks, eventBlockOk, isDirty } from '../src/lib/world-profiles'
import { countByKind, filterRecords, parseAliases } from '../src/lib/world-records'
import type { WorldProfile, WorldRecord } from '../src/lib/world'

const profile = (over: Partial<WorldProfile> = {}): WorldProfile => ({
  id: 'p-slow', builtIn: false, base: 'director', name: 'Slow', description: 'd',
  defaults: { everyN: 5, stagnation: 6, onTransition: true, insert: true },
  options: { clocks: 'model', clockEvery: 6, eventByClock: false, deck: false, dice: 'off', diceStat: 'affection', diceChance: 25 },
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
  it('All lists the active records, newest first; the retired ones are in the Archive', () => {
    expect(filterRecords(list, 'all', '').map((r) => r.id)).toEqual(['c', 'a'])
    expect(filterRecords(list, 'archive', '').map((r) => r.id)).toEqual(['b'])
  })
  it('a tidied-up thing is in the Archive too', () => {
    const more = [...list, rec({ id: 'd', name: 'Cup', kind: 'thing', status: 'dormant', at: 2 })]
    expect(filterRecords(more, 'archive', '').map((r) => r.id)).toEqual(['b', 'd'])
    expect(filterRecords(more, 'thing', '')).toEqual([])
  })
  it('filters by kind and searches names, aliases and text', () => {
    expect(filterRecords(list, 'group', '').map((r) => r.id)).toEqual(['c'])
    expect(filterRecords(list, 'all', 'miller').map((r) => r.id)).toEqual(['a'])
    expect(filterRecords(list, 'all', 'GUILD').map((r) => r.id)).toEqual(['c'])
    // the text is searched too
    const texty = [rec({ id: 'x', name: 'Tavern', kind: 'place', text: 'Everybody pays a toll at the door.' })]
    expect(filterRecords(texty, 'all', 'toll').map((r) => r.id)).toEqual(['x'])
  })
  it('old notes: the longest first, so what cannot go to the Litopys as it is comes up at once', () => {
    const notes = [rec({ id: 'n1', name: 'A', kind: 'fact', text: 'short', at: 9 }), rec({ id: 'n2', name: 'B', kind: 'fact', text: 'a much longer note than the other', at: 1 })]
    expect(filterRecords(notes, 'fact', '').map((r) => r.id)).toEqual(['n2', 'n1'])
  })
  it('counts the active records per kind, and the Archive apart', () => {
    expect(countByKind(list)).toEqual({ all: 2, archive: 1, person: 1, place: 0, group: 1, thing: 0, fact: 0 })
  })
  it('parses aliases: trimmed, no empties, no repeats', () => {
    expect(parseAliases(' Mira, mira ,, the miller;Mirka\n')).toEqual(['Mira', 'the miller', 'Mirka'])
  })
})
