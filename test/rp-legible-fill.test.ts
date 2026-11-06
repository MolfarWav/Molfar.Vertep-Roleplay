import { describe, expect, it } from 'bun:test'
import { contrastRatio, legibleFill } from '../src/lib/utils'

describe('legibleFill (the solid button of a theme)', () => {
  it('darkens a light accent under a light page until the text reads', () => {
    expect(contrastRatio('#2eaf5a', '#fafafa')).toBeLessThan(3)
    const c = legibleFill('#2eaf5a', '#fafafa')
    expect(contrastRatio(c, '#fafafa')).toBeGreaterThanOrEqual(4.5)
    expect(c).not.toBe('#2eaf5a')
  })
  it('leaves an accent that already reads as it was (a dark theme)', () => {
    expect(legibleFill('#39d5ff', '#07080b')).toBe('#39d5ff')
  })
  it('lightens a dark accent under dark text, and passes anything that is not #rrggbb through', () => {
    const c = legibleFill('#1a3a24', '#0d1f14')
    expect(contrastRatio(c, '#0d1f14')).toBeGreaterThanOrEqual(4.5)
    expect(legibleFill('rgb(1,2,3)', '#ffffff')).toBe('rgb(1,2,3)')
  })
})
