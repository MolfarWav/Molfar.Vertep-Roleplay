import { describe, expect, it } from 'bun:test'
import { dragItems, droppedItems, moveItem } from '../src/lib/forge'

describe('moving panels and widgets', () => {
  it('moveItem moves one place and leaves the list alone at the ends', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b'])
    const l = ['a', 'b']
    expect(moveItem(l, 0, -1)).toBe(l)
    expect(moveItem(l, 1, 1)).toBe(l)
    expect(moveItem(l, 5, -1)).toBe(l)
  })

  it('dragItems gives items without an id of their own an id by place, and keeps the objects', () => {
    const a = { w: 'meter' }, b = { w: 'text' }
    expect(dragItems([a, b])).toEqual([{ id: '0', item: a }, { id: '1', item: b }])
    expect(dragItems([a, b])[1]!.item).toBe(b)
    expect(dragItems([a, b], (_, i) => `x${i}`).map((x) => x.id)).toEqual(['x0', 'x1'])
  })

  it('droppedItems returns the new order, or the same list when nothing moved', () => {
    const a = { w: 'meter' }, b = { w: 'text' }, c = { w: 'list' }
    const list = [a, b, c]
    const d = dragItems(list)
    expect(droppedItems(list, d)).toBe(list)
    expect(droppedItems(list, [d[2]!, d[0]!, d[1]!])).toEqual([c, a, b])
    // ids follow the original place, so a row keeps its identity while it travels
    expect([d[2]!, d[0]!, d[1]!].map((x) => x.id)).toEqual(['2', '0', '1'])
  })
})
