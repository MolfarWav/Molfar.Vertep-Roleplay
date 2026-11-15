/**
 * What the story proposed in the open chat (src/lib/proposal-core.ts): a portrait block, a habit, a quest. The colour of each
 * kind is the colour of its block, a proposal is told once, one toast per colour, and the inbox lists the same things.
 */
import { describe, expect, it } from 'bun:test'
import type { GrowthEntry } from '../src/components/character/memory-api'
import type { LitHabit } from '../src/components/library/litopys-api'
import type { QuestProposal } from '../src/lib/dashboard'
import { inboxRows } from '../src/lib/attention-core'
import { byKind, growthItems, habitItems, PROPOSAL_TONE, proposalKey, proposalPlan, questItems, takeNewItems } from '../src/lib/proposal-core'

const block = (id: string, state: GrowthEntry['state'], at: number, extra: Partial<GrowthEntry> = {}) =>
  ({ id, section: 'personality', kind: 'changed', text: `text ${id}`, on: true, state, origin: 'agent', at, ...extra } as GrowthEntry)
const habit = (id: string, status: LitHabit['status'], who = 'Aria') => ({ id, who, name: `habit ${id}`, rule: 'r', when: '', status, on: true, seen: 1, chapters: [], evidence: [], origin: 'chapter' } as LitHabit)
const quest = (id: string, type: QuestProposal['type'], text = 'Find the key') => ({ id, type, why: type === 'close' ? 'stale' : 'limit', text, kind: 'side', turn: 3 } as QuestProposal)

describe('proposal items', () => {
  it('lists only the portrait blocks that wait for a yes, newest first', () => {
    const items = growthItems('c1', 'card1', 'Aria', [block('a', 'accepted', 1), block('b', 'proposed', 2), block('c', 'proposed', 5, { title: 'Trust' })])
    expect(items.map((i) => i.id)).toEqual(['c', 'b'])
    expect(items[0]).toMatchObject({ kind: 'growth', cardId: 'card1', name: 'Aria', text: 'Trust: text c' })
  })

  it('lists only the habits that are proposed, not the earned ones', () => {
    expect(habitItems('c1', [habit('h1', 'proposed'), habit('h2', 'active')]).map((i) => i.id)).toEqual(['h1'])
    expect(habitItems('c1', undefined)).toEqual([])
  })

  it('carries the quest proposal and whether it closes or opens', () => {
    const items = questItems('c1', [quest('q1', 'close'), quest('q2', 'open')])
    expect(items.map((i) => i.op)).toEqual(['close', 'open'])
    expect(items.every((i) => i.kind === 'quests')).toBe(true)
  })
})

describe('proposal colours and grouping', () => {
  it('gives each kind the hue of its block', () => {
    expect(PROPOSAL_TONE).toEqual({ growth: 'sky', habits: 'violet', quests: 'amber', litopys: 'emerald' })
  })

  it('groups by kind in a fixed order and leaves out an empty kind', () => {
    const items = [...questItems('c1', [quest('q1', 'close')]), ...growthItems('c1', 'k', 'Aria', [block('b', 'proposed', 1)])]
    expect(byKind(items).map((g) => g.kind)).toEqual(['growth', 'quests'])
  })
})

describe('told once', () => {
  it('returns an item the first time and never again, and the key tells the kinds and chats apart', () => {
    const seen = new Set<string>()
    const items = growthItems('c1', 'k', 'Aria', [block('b', 'proposed', 1)])
    expect(takeNewItems(items, seen)).toHaveLength(1)
    expect(takeNewItems(items, seen)).toHaveLength(0)
    expect(proposalKey(items[0]!)).not.toBe(proposalKey({ ...items[0]!, chatId: 'c2' }))
    expect(proposalKey(items[0]!)).not.toBe(proposalKey({ ...items[0]!, kind: 'habits' }))
  })
})

describe('what a toast says', () => {
  it('one short portrait block: its line, and Accept / Reject in place', () => {
    const plan = proposalPlan('growth', growthItems('c1', 'k', 'Aria', [block('b', 'proposed', 1)]), 'en')
    expect(plan).toMatchObject({ inline: true, description: 'text b' })
    expect(plan.title).toContain('Aria')
  })

  it('a long block is read in the card, not in the toast', () => {
    const plan = proposalPlan('growth', growthItems('c1', 'k', 'Aria', [block('b', 'proposed', 1, { text: 'x'.repeat(400) })]), 'en')
    expect(plan.inline).toBe(false)
    expect(plan.description.length).toBeLessThanOrEqual(160)
  })

  it('closing a quest is answered in the toast, a new quest with no room is answered in the Dashboard', () => {
    expect(proposalPlan('quests', questItems('c1', [quest('q1', 'close')]), 'en').inline).toBe(true)
    expect(proposalPlan('quests', questItems('c1', [quest('q2', 'open')]), 'en').inline).toBe(false)
  })

  it('several of one colour become one count with the names', () => {
    const plan = proposalPlan('habits', habitItems('c1', [habit('h1', 'proposed', 'Aria'), habit('h2', 'proposed', 'Bram')]), 'en')
    expect(plan).toMatchObject({ inline: false, description: 'Aria, Bram' })
    expect(plan.title).toContain('2')
  })

  it('reads in Ukrainian too', () => {
    expect(proposalPlan('quests', questItems('c1', [quest('q1', 'close')]), 'uk').title).toContain('Квест')
  })
})

describe('inbox', () => {
  const base = { settings: undefined, litopys: {}, soul: [], chatName: () => 'The mill', cardName: () => 'Aria' }
  const waiting = [...growthItems('c1', 'k', 'Aria', [block('b', 'proposed', 1)]), ...habitItems('c1', [habit('h1', 'proposed'), habit('h2', 'proposed')]), ...questItems('c1', [quest('q1', 'close')])]

  it('one row per kind with its count, and the badge counts every proposal', () => {
    const { rows, total } = inboxRows({ ...base, waiting })
    expect(rows.map((r) => (r.kind === 'proposal' ? `${r.what}:${r.count}` : r.kind))).toEqual(['growth:1', 'habits:2', 'quests:1'])
    expect(total).toBe(4)
  })

  it('a kind switched off is neither listed nor counted', () => {
    const { rows, total } = inboxRows({ ...base, waiting, settings: { habits: false, quests: false } })
    expect(rows).toHaveLength(1)
    expect(total).toBe(1)
  })
})
