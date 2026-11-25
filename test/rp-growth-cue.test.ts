/**
 * When the story has probably changed a character (src/lib/growth-cue-core.ts, #450): a new turning point, a relation class
 * that moved, a pivotal event (at most one look in eight replies). The first look at a chat only learns what is there; a cue is
 * told once; the player's own character is never the subject; a group's cue goes to the member it names.
 */
import { describe, expect, it } from 'bun:test'
import { cleanMemory, cuesByCard, detectCues, emptyMemory, PIVOTAL_GAP, type CueInput } from '../src/lib/growth-cue-core'

const view = (turn: number, over: Partial<NonNullable<CueInput['view']>> = {}) => ({ key: `m${turn}#0`, turn, events: [], chars: {}, ...over })
const input = (over: Partial<CueInput> = {}): CueInput => ({ turns: [], view: view(10), mem: emptyMemory(), ...over })
const pivotal = (id: string, from: string | null, to: string | null, quote = 'a vow') => ({ id, weight: 'pivotal', from, to, quote })

describe('the first look', () => {
  it('learns what is already there and says nothing', () => {
    const r = detectCues(input({ mem: null, turns: [{ id: 't1', text: 'A betrayal.', cast: ['Ada'] }], view: view(30, { chars: { Ada: { cls: 'friend' } } }) }))
    expect(r.cues).toEqual([])
    expect(r.mem.told).toContain('turn:t1')
    expect(r.mem.cls).toEqual({ Ada: 'friend' })
    expect(r.mem.lastTurn).toBe(30)
    // the next look finds nothing new in it
    expect(detectCues(input({ mem: r.mem, turns: [{ id: 't1', text: 'A betrayal.', cast: ['Ada'] }], view: view(31, { chars: { Ada: { cls: 'friend' } } }) })).cues).toEqual([])
  })
})

describe('turning points', () => {
  it('a new one is a cue about its cast, told once', () => {
    const a = detectCues(input({ turns: [{ id: 't2', text: 'Bram swore a vow in the chapel.', cast: ['Bram', 'Ada'] }] }))
    expect(a.cues).toHaveLength(1)
    expect(a.cues[0]).toMatchObject({ id: 'turn:t2', kind: 'turn', names: ['Bram', 'Ada'], text: 'Bram swore a vow in the chapel.' })
    const b = detectCues(input({ mem: a.mem, turns: [{ id: 't2', text: 'Bram swore a vow in the chapel.', cast: ['Bram', 'Ada'] }] }))
    expect(b.cues).toEqual([])
  })
  it('leaves the player out of the names', () => {
    const r = detectCues(input({ turns: [{ id: 't3', text: 'x', cast: ['User', 'Ada'] }] }))
    expect(r.cues[0]!.names).toEqual(['Ada'])
    expect(detectCues(input({ turns: [{ id: 't4', text: 'x', cast: ['Mira'] }], userNames: ['Mira'] })).cues[0]!.names).toEqual([])
  })
})

describe('relation classes', () => {
  it('a class that moved is a cue, a new character is not, an unchanged one is not', () => {
    const mem = { ...emptyMemory(), cls: { Ada: 'stranger', Bram: 'friend' } }
    const r = detectCues(input({ mem, view: view(12, { chars: { Ada: { cls: 'friend' }, Bram: { cls: 'friend' }, Cora: { cls: 'romantic' } } }) }))
    expect(r.cues.map((c) => c.id)).toEqual(['rel:Ada:stranger>friend'])
    expect(r.cues[0]).toMatchObject({ kind: 'relation', names: ['Ada'], text: 'stranger → friend' })
    expect(r.mem.cls).toEqual({ Ada: 'friend', Bram: 'friend', Cora: 'romantic' })
  })
})

describe('pivotal events', () => {
  const events = [pivotal('e1', 'user', 'Ada', 'I will never leave you'), pivotal('e2', 'user', 'user')]
  it('are a cue about the character, not about the player', () => {
    const r = detectCues(input({ mem: { ...emptyMemory(), lastTurn: 0 }, view: view(20, { events }) }))
    expect(r.cues).toHaveLength(1)
    expect(r.cues[0]).toMatchObject({ kind: 'pivotal', names: ['Ada'], text: 'I will never leave you' })
    expect(r.mem.lastTurn).toBe(20)
  })
  it(`wait ${PIVOTAL_GAP} replies after the last cue`, () => {
    const mem = { ...emptyMemory(), lastTurn: 20 }
    expect(detectCues(input({ mem, view: view(20 + PIVOTAL_GAP - 1, { events }) })).cues).toEqual([])
    expect(detectCues(input({ mem, view: view(20 + PIVOTAL_GAP, { events }) })).cues).toHaveLength(1)
  })
  it('a turning point does not wait, and covers a character once per look, strongest first', () => {
    const mem = { ...emptyMemory(), lastTurn: 19, cls: { Ada: 'friend' } }
    const r = detectCues(input({
      mem,
      turns: [{ id: 't9', text: 'The bridge burned.', cast: ['Ada'] }],
      view: view(20, { events, chars: { Ada: { cls: 'rival' } } }),
    }))
    expect(r.cues.map((c) => c.kind)).toEqual(['turn'])
  })
  it('tells at most three', () => {
    const turns = ['A', 'B', 'C', 'D', 'E'].map((n, i) => ({ id: `t${i}`, text: n, cast: [n] }))
    expect(detectCues(input({ turns })).cues).toHaveLength(3)
  })
})

describe('memory', () => {
  it('reads back what it wrote and refuses what is broken', () => {
    const m = { v: 1, told: ['turn:t1'], cls: { Ada: 'friend' }, lastTurn: 4 }
    expect(cleanMemory(m)).toEqual(m)
    expect(cleanMemory({ v: 2 })).toBeNull()
    expect(cleanMemory(null)).toBeNull()
    expect(cleanMemory({ v: 1, told: [1, 'x'], cls: { a: 3, b: 'c' }, lastTurn: 'q' })).toEqual({ v: 1, told: ['x'], cls: { b: 'c' }, lastTurn: 0 })
    expect(cleanMemory({ v: 1, told: Array.from({ length: 300 }, (_, i) => `x${i}`), cls: {}, lastTurn: 0 })!.told).toHaveLength(200)
  })
})

describe('which card a cue is about', () => {
  const cue = (names: string[]) => ({ id: 'x', kind: 'turn' as const, names, text: 't' })
  it('a chat of one card is about that card, whatever names the story used', () => {
    expect(cuesByCard([cue(['Someone else'])], [{ id: 'c1', name: 'Narrator' }])).toEqual([{ cardId: 'c1', name: 'Narrator', cues: [cue(['Someone else'])] }])
    expect(cuesByCard([], [{ id: 'c1', name: 'Narrator' }])).toEqual([])
  })
  it('a group goes to the members the names point at, exactly or by the start of the name', () => {
    const cards = [{ id: 'c1', name: "Shiori - The President's Favorite" }, { id: 'c2', name: 'Chihiro' }, { id: 'c3', name: 'Koharu' }]
    const r = cuesByCard([cue(['Shiori']), cue(['chihiro', 'Nobody'])], cards)
    expect(r.map((x) => x.cardId)).toEqual(['c1', 'c2'])
    expect(cuesByCard([cue(['Nobody'])], cards)).toEqual([])
  })
})
