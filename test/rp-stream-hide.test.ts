import { describe, expect, test } from 'bun:test'
import { hideOpenBlocks } from '@/lib/display-scripts'
import { holdFallback } from '@/hooks/use-display-texts'

const hideThink = [{ find: '<think(?:ing)?>[\\s\\S]*?<\\/think(?:ing)?>' }]

describe('hideOpenBlocks', () => {
  test('an unclosed hidden block is cut at its opener', () => {
    expect(hideOpenBlocks('<thinking>She is', hideThink)).toBe('')
    expect(hideOpenBlocks('Before. <thinking>She is', hideThink)).toBe('Before. ')
  })
  test('a closed block is left for the script', () => {
    const t = '<thinking>plan</thinking>The door opens.'
    expect(hideOpenBlocks(t, hideThink)).toBe(t)
  })
  test('a closed block then a new unclosed one', () => {
    expect(hideOpenBlocks('<think>a</think>Story <think>b', hideThink)).toBe('<think>a</think>Story ')
  })
  test('a half-written opener at the end is held back', () => {
    expect(hideOpenBlocks('Story <', hideThink)).toBe('Story ')
    expect(hideOpenBlocks('Story <thi', hideThink)).toBe('Story ')
    expect(hideOpenBlocks('Story <thinking', hideThink)).toBe('Story ')
  })
  test('other tags and tag-free scripts are untouched', () => {
    expect(hideOpenBlocks('a <b>bold', hideThink)).toBe('a <b>bold')
    expect(hideOpenBlocks('<thinking>x', [{ find: 'foo' }])).toBe('<thinking>x')
    expect(hideOpenBlocks('a < b', hideThink)).toBe('a < b')
  })
  test('every prefix of a stream only grows once the opener is complete', () => {
    const full = '<thinking>one two three</thinking>The story begins here.'
    let prev = ''
    for (let i = 0; i <= full.length; i++) {
      const shown = hideOpenBlocks(full.slice(0, i), hideThink).replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/g, '')
      expect(shown.startsWith(prev)).toBe(true)
      prev = shown
    }
    expect(prev).toBe('The story begins here.')
  })
})

describe('holdFallback', () => {
  test('previous result stays while the next is pending', () => {
    expect(holdFallback(['abc'], ['ab'], true, true)).toEqual(['ab'])
  })
  test('no result yet for a held text: blank, not raw', () => {
    expect(holdFallback(['<x>'], null, true, true)).toEqual([''])
  })
  test('unheld and script-free text shows as is', () => {
    expect(holdFallback(['raw'], null, true, false)).toEqual(['raw'])
    expect(holdFallback(['raw'], ['old'], false, true)).toEqual(['raw'])
  })
})
