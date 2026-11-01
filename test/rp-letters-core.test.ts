/**
 * Letters from cards (#72, src/lib/letters-core.ts): who is due, in what order, and what the inbox does with a letter.
 */
import { describe, expect, it } from 'bun:test'
import { candidatesFor, lettersOf, type Letter } from '../src/lib/letters-core'
import { inboxRows } from '../src/lib/attention-core'

const DAY = 86_400_000
const now = 1_000 * DAY
const card = (id: string, extra: Record<string, unknown> = {}) => ({ id, isGroup: false, cardExtras: undefined, createdAt: now - 40 * DAY, lastChatAt: 0, ...extra }) as any
const chat = (id: string, characterId: string, ago: number) => ({ id, characterId, updatedAt: now - ago * DAY })
const base = { now, config: { idleDays: 14 }, skip: new Set<string>() }

describe('candidatesFor', () => {
  it('idle chats first (the longest idle first), then unplayed cards, then played cards without a Soul', () => {
    const out = candidatesFor({
      ...base,
      characters: [card('a', { lastChatAt: 1 }), card('b', { lastChatAt: 1 }), card('c'), card('d', { createdAt: now - 90 * DAY }), card('e', { lastChatAt: 1 })],
      chats: [chat('ca', 'a', 20), chat('cb', 'b', 60), chat('ce', 'e', 5)],
    })
    expect(out.map((c) => `${c.why}:${c.characterId}`)).toEqual(['idle:b', 'idle:a', 'unplayed:d', 'unplayed:c', 'nosoul:e'])
    expect(out[0]).toEqual({ characterId: 'b', chatId: 'cb', why: 'idle' })
  })
  it('one entry per card, from its newest chat', () => {
    const out = candidatesFor({ ...base, characters: [card('a', { lastChatAt: 1 })], chats: [chat('old', 'a', 50), chat('new', 'a', 20)] })
    expect(out).toEqual([{ characterId: 'a', chatId: 'new', why: 'idle' }])
  })
  it('a chat played within the threshold, a recent card and a card in the middle of play write nothing', () => {
    const out = candidatesFor({
      ...base,
      characters: [card('a', { lastChatAt: 1 }), card('b', { createdAt: now - 3 * DAY }), card('c', { lastChatAt: 1 })],
      chats: [chat('ca', 'a', 1), chat('cc', 'c', 2)],
    })
    expect(out).toEqual([])
  })
  it('leaves out groups, assistant cards, muted cards and cards with an unread letter', () => {
    const out = candidatesFor({
      ...base,
      characters: [
        card('g', { isGroup: true }),
        card('as', { cardExtras: { extensions: { molfar_card_type: 'assistant' } } }),
        card('m'),
        card('u'),
        card('ok'),
      ],
      chats: [],
      skip: new Set(['m', 'u']),
    })
    expect(out.map((c) => c.characterId)).toEqual(['ok'])
  })
  it('a card the app knows has a Soul is not asked for the Soul nudge, but can still write as idle', () => {
    const chars = [card('a', { lastChatAt: 1 }), card('b', { lastChatAt: 1 })]
    const out = candidatesFor({ ...base, characters: chars, chats: [chat('ca', 'a', 5), chat('cb', 'b', 30)], hasSoul: () => true })
    expect(out).toEqual([{ characterId: 'b', chatId: 'cb', why: 'idle' }])
  })
  it('follows the idle threshold', () => {
    const chars = [card('a', { lastChatAt: 1 })]
    expect(candidatesFor({ ...base, config: { idleDays: 30 }, characters: chars, chats: [chat('ca', 'a', 20)] }).map((c) => c.why)).toEqual(['nosoul'])
    expect(candidatesFor({ ...base, config: { idleDays: 7 }, characters: chars, chats: [chat('ca', 'a', 20)] }).map((c) => c.why)).toEqual(['idle'])
  })
})

describe('lettersOf', () => {
  it('keeps usable letters newest first and drops the rest', () => {
    const out = lettersOf({ letters: [{ id: 'x', characterId: 'a', why: 'idle', text: ' hi there ', at: 1 }, { id: 'y', characterId: 'b', why: 'weird', text: 'ok', at: 5, chatId: 'c1' }, { id: 'z', characterId: 'c', text: '   ' }, null, 4] })
    expect(out.map((l) => l.id)).toEqual(['y', 'x'])
    expect(out[0]!.why).toBe('idle')
    expect(out[0]!.chatId).toBe('c1')
    expect(out[1]!.text).toBe('hi there')
    expect(lettersOf(undefined)).toEqual([])
  })
})

describe('the inbox and letters', () => {
  const letter = (id: string, at: number): Letter => ({ id, characterId: 'a', why: 'idle', text: 'Where are you?', at })
  const input = { settings: undefined, litopys: {}, soul: [], chatName: () => '', cardName: (id: string) => (id === 'a' ? 'Ilsa' : '') }
  it('lists letters after the other kinds and counts each as one', () => {
    const r = inboxRows({ ...input, letters: [letter('l1', 1), letter('l2', 2)], litopys: { c1: 2 } })
    expect(r.rows.map((x) => x.kind)).toEqual(['litopys', 'letter', 'letter'])
    expect(r.total).toBe(4)
    const row = r.rows[1]!
    expect(row.kind === 'letter' && row.name).toBe('Ilsa')
  })
  it('never counts a letter as a failure: the badge stays calm', () => {
    const r = inboxRows({ ...input, letters: [letter('l1', 1)] })
    expect(r.failures).toBe(0)
    expect(r.total).toBe(1)
  })
})
