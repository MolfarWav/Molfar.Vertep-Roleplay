import { describe, expect, it } from 'bun:test'
import { allowedCount, groupNeeds, groupOfNeed, nextGranted } from '../src/lib/agent-permissions'

const NEEDS = ['read:lastReply', 'read:history', 'llm', 'write:own.mood', 'show:note', 'read:preGenInjections']

describe('groupNeeds', () => {
  it('sorts the needs into reads, changes, shows and model calls, and leaves out what this runner cannot give', () => {
    const g = groupNeeds(NEEDS, ['read:preGenInjections'])
    expect(g.map((x) => x.group)).toEqual(['read', 'write', 'show', 'model'])
    expect(g[0].tokens).toEqual(['read:lastReply', 'read:history'])
    expect(g.flatMap((x) => x.tokens)).not.toContain('read:preGenInjections')
  })
  it('an unknown token lands in Other, never lost', () => {
    expect(groupOfNeed('weird')).toBe('other')
    expect(groupNeeds(['weird'], [])).toEqual([{ group: 'other', tokens: ['weird'] }])
  })
  it('follows the needs it is given: a changed list gives changed rows (no stale preview after a model change)', () => {
    const before = groupNeeds(['llm', 'show:note'], [])
    const after = groupNeeds(['llm', 'show:note', 'read:lorebook'], [])
    expect(after.flatMap((x) => x.tokens)).toContain('read:lorebook')
    expect(before.flatMap((x) => x.tokens)).not.toContain('read:lorebook')
  })
})

describe('nextGranted', () => {
  it('adds one token to what is allowed', () => {
    expect(nextGranted(['llm'], NEEDS, 'show:note', true)).toEqual(['llm', 'show:note'])
  })
  it('takes one token away and keeps the rest', () => {
    expect(nextGranted(['llm', 'show:note'], NEEDS, 'llm', false)).toEqual(['show:note'])
  })
  it('drops an old grant the agent does not ask for any more, and never grants an unasked token', () => {
    expect(nextGranted(['gone', 'llm'], NEEDS, 'show:note', true)).toEqual(['llm', 'show:note'])
    expect(nextGranted([], NEEDS, 'write:everything', true)).toEqual([])
  })
  it('does not list a token twice', () => {
    expect(nextGranted(['llm'], NEEDS, 'llm', true)).toEqual(['llm'])
  })
})

describe('allowedCount', () => {
  it('counts only needs the runner can give', () => {
    expect(allowedCount(NEEDS, ['read:preGenInjections'], ['llm', 'show:note'])).toEqual({ done: 2, n: 5 })
  })
})
