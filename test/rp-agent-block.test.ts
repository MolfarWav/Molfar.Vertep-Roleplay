import { describe, expect, test } from 'bun:test'
import { writeLine } from '../src/components/chat/agent-block'

describe('writeLine', () => {
  test('puts a staged write on one short line', () => {
    expect(writeLine({ op: 'own.set', field: 'mood', value: 'calm' })).toBe('mood = calm')
    expect(writeLine({ op: 'dash.set', field: 'trust', value: 7 })).toBe('trust = 7')
    expect(writeLine({ op: 'own.add', field: 'hp', by: 2 })).toBe('hp +2')
    expect(writeLine({ op: 'own.add', field: 'hp', by: -3 })).toBe('hp −3')
    expect(writeLine({ op: 'list.add', field: 'bag', item: { name: 'rope', qty: 1 } })).toBe('bag + rope · 1')
    expect(writeLine({ op: 'list.remove', field: 'bag', key: 'name', id: 'rope' })).toBe('bag − rope')
  })
  test('gives nothing for a write it does not know', () => {
    expect(writeLine({ op: 'boom', field: 'x' })).toBe('')
    expect(writeLine(null)).toBe('')
  })
})
