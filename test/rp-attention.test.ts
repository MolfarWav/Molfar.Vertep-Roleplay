/**
 * "Needs you" (#55, src/lib/attention.ts): the counts behind the badges, the items a toast
 * says, the seen list that keeps a proposal from being toasted twice, and the switch.
 */
import { describe, expect, it } from 'bun:test'
import { attentionOn, inboxRows, litCounts, soulWaitingOf, takeNew, toastPlan, totalOf, waitingOf } from '../src/lib/attention-core'
import type { LitFact, LitProposal } from '../src/components/library/litopys-api'

const fact = (id: string, text: string) => ({ id, text } as LitFact)
const prop = (id: string, op: LitProposal['op'], targets: string[], extra: Partial<LitProposal> = {}): LitProposal =>
  ({ id, op, targets, status: 'pending', ...extra })

const chat = {
  chatId: 'c1',
  name: 'Vivian Stein',
  facts: [fact('f1', 'Vlad Kovalenko served six years in the army.'), fact('f2', 'Old fact')],
  proposals: [
    prop('p1', 'pin', ['f1'], { at: 1 }),
    prop('p2', 'rewrite', ['f2'], { text: 'New text', at: 2 }),
    prop('p3', 'retire', ['f2'], { status: 'accepted' }),
  ],
}

describe('needs you: Library proposals', () => {
  it('counts only chats with pending proposals', () => {
    const counts = litCounts([{ id: 'a', proposals: 2 }, { id: 'b', proposals: 0 }, { id: 'c', proposals: 1 }])
    expect(counts).toEqual({ a: 2, c: 1 })
    expect(totalOf(counts)).toBe(3)
    expect(totalOf({})).toBe(0)
  })

  it('lists pending proposals newest first, with the line the player decides on', () => {
    const items = waitingOf(chat)
    expect(items.map((p) => p.id)).toEqual(['p2', 'p1'])
    expect(items[0]!.text).toBe('New text')
    expect(items[1]!.text).toBe('Vlad Kovalenko served six years in the army.')
    expect(items[1]!.name).toBe('Vivian Stein')
  })

  it('toasts a proposal once', () => {
    const seen = new Set<string>()
    expect(takeNew(waitingOf(chat), seen).length).toBe(2)
    expect(takeNew(waitingOf(chat), seen).length).toBe(0)
    // the same proposal id in another chat is another item
    expect(takeNew(waitingOf({ ...chat, chatId: 'c2' }), seen).length).toBe(2)
  })

  it('one short proposal gets Accept / Reject in place', () => {
    const plan = toastPlan([waitingOf(chat)[1]!], 'en')
    expect(plan.inline).toBe(true)
    expect(plan.title).toContain('pinning')
    expect(plan.title).toContain('Vivian Stein')
    expect(plan.chatId).toBe('c1')
  })

  it('several proposals become one toast with Open', () => {
    const items = [...waitingOf(chat), ...waitingOf({ ...chat, chatId: 'c2', name: 'Other' })]
    const plan = toastPlan(items, 'en')
    expect(plan.inline).toBe(false)
    expect(plan.title).toBe('Library has 4 suggestions for you')
    expect(plan.description).toBe('Vivian Stein, Other')
    expect(toastPlan(items, 'uk').title).toBe('Бібліотека має для вас 4 пропозиції')
  })

  it('a long line is cut and opens the Library instead', () => {
    const long = 'x'.repeat(300)
    const plan = toastPlan([{ chatId: 'c', name: '', id: 'p', op: 'merge', text: long }], 'en')
    expect(plan.inline).toBe(false)
    expect(plan.description.length).toBe(160)
  })

  it('a kind is on unless switched off', () => {
    expect(attentionOn(undefined, 'litopys')).toBe(true)
    expect(attentionOn({ soul: false }, 'litopys')).toBe(true)
    expect(attentionOn({ soul: false }, 'soul')).toBe(false)
  })
})

describe('needs you: the inbox', () => {
  const names: Record<string, string> = { c1: 'Vivian Stein', c2: 'Group Night' }
  const base = {
    settings: undefined,
    litopys: { c1: 1, c2: 3 },
    soul: soulWaitingOf({ drafts: [{ characterId: 'k1', at: 5, n: 2, failed: false }, { characterId: 'k2', at: 9, n: 0, failed: true }] }),
    chatName: (id: string) => names[id] ?? '',
    cardName: (id: string) => ({ k1: 'Vivian', k2: 'Ola' })[id] ?? '',
  }

  it('lists Library chats (most waiting first), then cards (newest first), and totals them', () => {
    const { rows, total } = inboxRows(base)
    expect(rows.map((r) => r.key)).toEqual(['lit:c2', 'lit:c1', 'soul:k2', 'soul:k1'])
    expect(rows[0]).toMatchObject({ kind: 'litopys', name: 'Group Night', count: 3 })
    expect(rows[2]).toMatchObject({ kind: 'soul', name: 'Ola', failed: true })
    // 4 proposals + 2 cards
    expect(total).toBe(6)
  })

  it('a kind switched off is neither listed nor counted', () => {
    const noLib = inboxRows({ ...base, settings: { litopys: false } })
    expect(noLib.rows.map((r) => r.kind)).toEqual(['soul', 'soul'])
    expect(noLib.total).toBe(2)
    const noSoul = inboxRows({ ...base, settings: { soul: false } })
    expect(noSoul.rows.map((r) => r.kind)).toEqual(['litopys', 'litopys'])
    expect(noSoul.total).toBe(4)
    expect(inboxRows({ ...base, settings: { litopys: false, soul: false } })).toEqual({ rows: [], total: 0 })
  })

  it('is empty when nothing waits', () => {
    expect(inboxRows({ ...base, litopys: {}, soul: [] })).toEqual({ rows: [], total: 0 })
  })

  it('reads the soul-drafts body tolerantly: junk and empty drafts are dropped, newest first', () => {
    expect(soulWaitingOf(null)).toEqual([])
    expect(soulWaitingOf({})).toEqual([])
    expect(soulWaitingOf({ drafts: 'x' })).toEqual([])
    const list = soulWaitingOf({ drafts: [{ characterId: 'a', at: 1, n: 1 }, { at: 3, n: 4 }, { characterId: 'b', at: 2, n: 0, failed: false }, { characterId: 'c', at: 7, n: 0, failed: true }] })
    expect(list.map((d) => d.characterId)).toEqual(['c', 'a'])
  })
})
