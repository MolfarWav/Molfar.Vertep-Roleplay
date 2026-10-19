import { describe, expect, it } from 'bun:test'
import { acceptCount, draftTotal, dropOf, groupByKind, noneRemoved, plannedCalls } from '../src/lib/world-start'
import type { WorldDraft, WorldRecipe, WorldRecord } from '../src/lib/world'

const rec = (id: string, kind: WorldRecord['kind']): WorldRecord => ({ id, kind, name: id, aliases: [], text: 't', status: 'active', at: 1 })
const draft = (): WorldDraft => ({
  recipe: 'from-cards', cardIds: [], lang: '', total: 4, done: 4, at: 1, error: null,
  entities: [rec('n1', 'place'), rec('n2', 'person'), rec('n3', 'person')],
  fronts: [{ id: 'f1', name: 'Frost', goal: 'g', clock: 0, size: 6 }],
  deck: [{ id: 'e1', text: 'A rider' }, { id: 'e2', text: 'A fire' }],
})

describe('world start: the draft', () => {
  it('counts what accepting adds, minus what was removed', () => {
    const d = draft()
    const r = noneRemoved()
    expect(draftTotal(d)).toBe(6)
    expect(acceptCount(d, r)).toBe(6)
    r.entities.add('n1')
    r.deck.add('e2')
    expect(acceptCount(d, r)).toBe(4)
  })

  it('sends a drop only when something was removed', () => {
    const r = noneRemoved()
    expect(dropOf(r)).toBeUndefined()
    r.fronts.add('f1')
    r.entities.add('n3')
    expect(dropOf(r)).toEqual({ entities: ['n3'], fronts: ['f1'] })
  })

  it('groups records in the order of the kind chips and leaves empty kinds out', () => {
    const g = groupByKind(draft().entities)
    expect(g.map((x) => x.kind)).toEqual(['person', 'place'])
    expect(g[0].items.map((x) => x.id)).toEqual(['n2', 'n3'])
  })

  it('plans the calls: sections, fronts above chronicler, one for a deck', () => {
    const recipe = { sections: [{}, {}, {}], fronts: { count: 3 } } as unknown as WorldRecipe
    expect(plannedCalls(recipe, false, false)).toBe(3)
    expect(plannedCalls(recipe, true, true)).toBe(5)
    expect(plannedCalls(undefined, true, true)).toBe(0)
  })
})
