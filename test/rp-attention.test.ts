/**
 * "Needs you" (#55, src/lib/attention.ts): the counts behind the badges, the items a toast
 * says, the seen list that keeps a proposal from being toasted twice, and the switch.
 */
import { describe, expect, it } from 'bun:test'
import { attentionOn, failKey, inboxClosesOn, failReason, inboxRows, litCounts, litDismissKey, rowDismissKey, litopysFailures, soulWaitingOf, takeNew, takeNewFailures, toastPlan, totalOf, waitingOf, worldFailures } from '../src/lib/attention-core'
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

  it('lists failures first, then Library chats (most waiting first), then cards, and totals them', () => {
    const { rows, total, failures } = inboxRows(base)
    expect(rows.map((r) => r.key)).toEqual([`failed:soul:k2:9`, 'lit:c2', 'lit:c1', 'soul:k1'])
    expect(rows[0]).toMatchObject({ kind: 'failed', name: 'Ola' })
    expect(rows[1]).toMatchObject({ kind: 'litopys', name: 'Group Night', count: 3 })
    // 4 proposals + 1 card + 1 failure
    expect(total).toBe(6)
    expect(failures).toBe(1)
  })

  it('a kind switched off is neither listed nor counted', () => {
    const noLib = inboxRows({ ...base, settings: { litopys: false } })
    expect(noLib.rows.map((r) => r.kind)).toEqual(['failed', 'soul'])
    expect(noLib.total).toBe(2)
    const noSoul = inboxRows({ ...base, settings: { soul: false } })
    expect(noSoul.rows.map((r) => r.kind)).toEqual(['failed', 'litopys', 'litopys'])
    expect(noSoul.total).toBe(5)
    const noFail = inboxRows({ ...base, settings: { failed: false } })
    expect(noFail.rows.map((r) => r.kind)).toEqual(['litopys', 'litopys', 'soul'])
    expect(noFail.failures).toBe(0)
    expect(inboxRows({ ...base, settings: { litopys: false, soul: false, failed: false } })).toEqual({ rows: [], total: 0, failures: 0 })
  })

  it('failures from every source are listed newest first; a dismissed one is gone', () => {
    const failed = [
      ...worldFailures([{ chatId: 'w1', title: 'Harbour', error: 'rate', errorAt: 100 }, { chatId: 'w2', title: 'Fine', error: null }]),
      ...litopysFailures([{ id: 'c1', title: 'Chat one', name: 'Vivian', worker: { ok: false, error: 'HTTP 500', lastRunAt: 300 } }, { id: 'c2', title: 'ok', name: '', worker: { ok: true, lastRunAt: 1 } }]),
    ]
    const r = inboxRows({ ...base, soul: [], litopys: {}, failed })
    expect(r.rows.map((x) => x.key)).toEqual(['failed:litopys:c1:300', 'failed:world:w1:100'])
    expect(r.rows[1]).toMatchObject({ name: 'Harbour', reason: 'The provider is busy (rate limit). Try again in a minute.' })
    expect(inboxRows({ ...base, soul: [], litopys: {}, failed, dismissed: new Set([failKey(failed[0]!)]) }).total).toBe(1)
  })

  it("a dismissed Library row is gone until that chat's pending count changes", () => {
    const gone = inboxRows({ ...base, dismissed: new Set([litDismissKey('c2', 3)]) })
    expect(gone.rows.map((r) => r.key)).toEqual(['failed:soul:k2:9', 'lit:c1', 'soul:k1'])
    expect(gone.total).toBe(3)
    // a new proposal arrived (3 -> 4): the row is back
    const back = inboxRows({ ...base, litopys: { ...base.litopys, c2: 4 }, dismissed: new Set([litDismissKey('c2', 3)]) })
    expect(back.rows.map((r) => r.key)).toContain('lit:c2')
  })

  it('names the local key a row is dismissed by; a Soul review has none (the engine dismisses it)', () => {
    const rows = inboxRows(base).rows
    const failedRow = rows[0] as Extract<(typeof rows)[number], { kind: 'failed' }>
    expect(rows.map(rowDismissKey)).toEqual([failKey(failedRow.item), litDismissKey('c2', 3), litDismissKey('c1', 1), null])
  })

  it('says a failure in plain words', () => {
    const w = worldFailures([{ chatId: 'w', title: 't', error: 'auth', errorAt: 1 }])[0]!
    expect(failReason(w, 'en')).toMatch(/refused the key/)
    expect(failReason({ ...w, code: 'weird', message: 'boom' }, 'en')).toBe('boom')
    expect(failReason({ worker: 'litopys', ref: 'c', title: '', code: '', message: '  a\n b ', at: 1 }, 'en')).toBe('a b')
    expect(failReason({ worker: 'dashboard', ref: 'c', title: '', code: '', message: 'the sensor spent its whole reply limit thinking', at: 1 }, 'uk')).toMatch(/міркування/)
  })

  it('toasts a failure once: a new `at` is a new failure, a dismissed one stays quiet', () => {
    const seen = new Set<string>()
    const f = worldFailures([{ chatId: 'w1', title: 'x', error: 'rate', errorAt: 5 }])
    expect(takeNewFailures(f, seen, new Set())).toHaveLength(1)
    expect(takeNewFailures(f, seen, new Set())).toHaveLength(0)
    const again = worldFailures([{ chatId: 'w1', title: 'x', error: 'rate', errorAt: 6 }])
    expect(takeNewFailures(again, seen, new Set([failKey(again[0]!)]))).toHaveLength(0)
    expect(takeNewFailures(again, new Set(), new Set())).toHaveLength(1)
  })

  it('is empty when nothing waits', () => {
    expect(inboxRows({ ...base, litopys: {}, soul: [] })).toEqual({ rows: [], total: 0, failures: 0 })
  })

  it('reads the soul-drafts body tolerantly: junk and empty drafts are dropped, newest first', () => {
    expect(soulWaitingOf(null)).toEqual([])
    expect(soulWaitingOf({})).toEqual([])
    expect(soulWaitingOf({ drafts: 'x' })).toEqual([])
    const list = soulWaitingOf({ drafts: [{ characterId: 'a', at: 1, n: 1 }, { at: 3, n: 4 }, { characterId: 'b', at: 2, n: 0, failed: false }, { characterId: 'c', at: 7, n: 0, failed: true }] })
    expect(list.map((d) => d.characterId)).toEqual(['c', 'a'])
  })
})

describe('inboxClosesOn', () => {
  it('stays open when the rail button closes the open section just before opening the inbox', () => {
    expect(inboxClosesOn({ view: 'characters', drawer: 'characters' }, { view: 'characters', drawer: null })).toBe(false)
  })
  it('closes when another section opens or the view changes', () => {
    expect(inboxClosesOn({ view: 'home', drawer: null }, { view: 'home', drawer: 'presets' })).toBe(true)
    expect(inboxClosesOn({ view: 'home', drawer: null }, { view: 'chat', drawer: null })).toBe(true)
    expect(inboxClosesOn({ view: 'chat', drawer: 'presets' }, { view: 'canvas', drawer: null })).toBe(true)
  })
  it('does nothing when nothing changed', () => {
    expect(inboxClosesOn({ view: 'home', drawer: null }, { view: 'home', drawer: null })).toBe(false)
  })
})
