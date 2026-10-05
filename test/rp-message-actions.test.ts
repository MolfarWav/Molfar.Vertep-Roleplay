import { describe, expect, test } from 'bun:test'
import {
  messageActions,
  type MessageActionCtx,
} from '../src/lib/message-actions'

function baseCtx(overrides: Partial<MessageActionCtx> = {}): MessageActionCtx {
  return {
    isUser: false,
    index: 1,
    count: 3,
    isCutoff: false,
    compactions: 0,
    hidden: false,
    bookmarked: false,
    translated: false,
    translating: false,
    speaking: false,
    ...overrides,
  }
}

function itemIds(groupId: string, ctx: MessageActionCtx) {
  const group = messageActions(ctx).find((g) => g.id === groupId)
  return group?.items.map((i) => i.id) ?? []
}

function findItem(ctx: MessageActionCtx, id: string) {
  for (const group of messageActions(ctx)) {
    const item = group.items.find((i) => i.id === id)
    if (item) return item
  }
  return undefined
}

describe('messageActions', () => {
  test('group order is message, story, delete', () => {
    const groups = messageActions(baseCtx())
    expect(groups.map((g) => g.id)).toEqual(['message', 'story', 'delete'])
  })

  test('empty groups are dropped', () => {
    const groups = messageActions(baseCtx())
    expect(groups.every((g) => g.items.length > 0)).toBe(true)
  })

  test('first message has no moveUp or summarize', () => {
    const ctx = baseCtx({ index: 0, count: 3 })
    expect(itemIds('story', ctx)).not.toContain('moveUp')
    expect(itemIds('story', ctx)).not.toContain('summarize')
  })

  test('last message has no moveDown or deleteBelow', () => {
    const ctx = baseCtx({ index: 2, count: 3 })
    expect(itemIds('story', ctx)).not.toContain('moveDown')
    expect(itemIds('delete', ctx)).not.toContain('deleteBelow')
  })

  test('cutoff row with compactions shows undoSummary and no summarize', () => {
    const ctx = baseCtx({ isCutoff: true, compactions: 2 })
    expect(itemIds('story', ctx)).toContain('undoSummary')
    expect(itemIds('story', ctx)).not.toContain('summarize')
  })

  test('cutoff row without compactions hides summary actions', () => {
    const ctx = baseCtx({ isCutoff: true, compactions: 0 })
    expect(itemIds('story', ctx)).not.toContain('undoSummary')
    expect(itemIds('story', ctx)).not.toContain('summarize')
  })

  test('index zero has no summarize', () => {
    const ctx = baseCtx({ index: 0, count: 3, isCutoff: false })
    expect(itemIds('story', ctx)).not.toContain('summarize')
  })

  test('toggled labels flip correctly', () => {
    expect(findItem(baseCtx({ hidden: true }), 'hide')?.labelKey).toBe(
      'msg.act.unhide',
    )
    expect(findItem(baseCtx({ bookmarked: true }), 'bookmark')?.labelKey).toBe(
      'msg.act.unbookmark',
    )
    expect(findItem(baseCtx({ translated: true }), 'translate')?.labelKey).toBe(
      'msg.act.untranslate',
    )
    const translating = findItem(baseCtx({ translating: true }), 'translate')
    expect(translating?.labelKey).toBe('msg.act.translating')
    expect(translating?.disabled).toBe(true)
    expect(findItem(baseCtx({ speaking: true }), 'speak')?.labelKey).toBe(
      'msg.act.stopSpeak',
    )
  })

  test('delete items are danger', () => {
    const ctx = baseCtx()
    const deleteGroup = messageActions(ctx).find((g) => g.id === 'delete')
    expect(deleteGroup?.items.every((i) => i.danger === true)).toBe(true)
  })
})
