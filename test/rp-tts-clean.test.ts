// TTS reads the message, not the markup: a card's HTML styling
// (<span style="color:#CC79A7">"Hi"</span>) must never be spoken, and with
// "only narrate quotes" on, the quoted attribute value must not be narrated
// as dialogue: tags leave the text before the quote pass (Molfar.Vertep#441).
import { describe, expect, it } from 'bun:test'
import { cleanedText } from '../src/lib/tts-clean'

type Tts = Parameters<typeof cleanedText>[1]
const all = { skipCodeblocks: true, skipAsterisks: true, onlyQuotes: true } as Tts
const noQuotes = { skipCodeblocks: true, skipAsterisks: true, onlyQuotes: false } as Tts
const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

describe('cleanedText (what TTS reads)', () => {
  it("narrates the quoted speech, never a tag's quoted attribute values", () => {
    const out = cleanedText('<span style="color:#CC79A7">"Stay," she whispered.</span>', all)
    expect(out).toBe('Stay,')
    expect(out).not.toContain('color')
  })

  it('strips tags with only-quotes off too, so markup itself is never spoken', () => {
    const out = cleanedText('<span style="color:#CC79A7">She whispered.</span>', noQuotes)
    expect(squash(out)).toBe('She whispered.')
    expect(out).not.toContain('span')
  })

  it('drops comments and style/script blocks with their bodies', () => {
    const out = cleanedText('<style>.a { color: red }</style>Hello <!-- note --><b>there</b>', noQuotes)
    expect(squash(out)).toBe('Hello there')
  })

  it('keeps the older rules working: fenced code skipped, asterisks skipped, no quotes reads in full', () => {
    expect(cleanedText('```\nstyle="color:#fff"\n```', all)).toBe('')
    expect(cleanedText('*smiles* "Hi."', all)).toBe('Hi.')
    expect(cleanedText('No quotes here.', all)).toBe('No quotes here.')
  })

  it('leaves ordinary angle brackets in prose alone', () => {
    expect(cleanedText('"5 < 6, right?" she asked.', all)).toBe('5 < 6, right?')
    expect(cleanedText('i <3 you', noQuotes)).toBe('i <3 you')
  })
})
