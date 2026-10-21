import { describe, expect, it } from 'bun:test'
import { t } from '../src/lib/i18n'

describe('the kept-out notices of the dashboard (#97)', () => {
  it('read well in English for one and several facts', () => {
    expect(t('dash.keptUser', 'en', { n: 1 })).toBe('1 fact the sensor wrote for your own character was not kept: a notebook holds what the others know about you.')
    expect(t('dash.keptUser', 'en', { n: 3 })).toContain('3 facts the sensor wrote for your own character were not kept')
    expect(t('dash.keptAbsent', 'en', { n: 2 })).toBe('2 facts the sensor wrote for someone who is not in the scene were not kept.')
  })
  it('read the same for any count in Ukrainian', () => {
    for (const n of [1, 2, 5, 21]) {
      expect(t('dash.keptUser', 'uk', { n })).toContain('Не збережено фактів: ' + n + '.')
      expect(t('dash.keptAbsent', 'uk', { n })).toContain('Не збережено фактів: ' + n + '.')
    }
  })
})
