/**
 * Type-scale ratchet (docs/UI-CATALOG.md 2.1): hand-written pixel font sizes in src/ may only go
 * down. The five type tokens must exist in src/globals.css, each with its line-height sibling.
 */
import { describe, expect, it } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// a ratchet: the count may only go down; lower BASELINE when you remove literals; use the type
// tokens text-caption / text-body / text-heading / text-title / text-display instead (docs/UI-CATALOG.md 2.1)
const BASELINE = 599

const ROOT = join(import.meta.dir, '..')
const SRC = join(ROOT, 'src')
const LITERAL = /text-\[[0-9.]+px\]/g
const TOKENS = ['caption', 'body', 'heading', 'title', 'display'] as const

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, out)
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(path)
  }
  return out
}

describe('type scale ratchet', () => {
  it(`hand-written text-[Npx] literals in src/ do not exceed BASELINE (${BASELINE})`, () => {
    let total = 0
    for (const file of walk(SRC)) {
      total += readFileSync(file, 'utf8').match(LITERAL)?.length ?? 0
    }
    expect(total, `found ${total} text-[Npx] literals; the baseline is ${BASELINE}. Use the type tokens instead.`).toBeLessThanOrEqual(BASELINE)
  })

  it('the five type tokens exist in src/globals.css with a line-height sibling', () => {
    const css = readFileSync(join(SRC, 'globals.css'), 'utf8')
    for (const name of TOKENS) {
      expect(css, `missing --text-${name}`).toMatch(new RegExp(`--text-${name}:\\s*[^;]+;`))
      expect(css, `missing --text-${name}--line-height`).toMatch(new RegExp(`--text-${name}--line-height:\\s*[^;]+;`))
    }
  })
})

describe('cn and the type tokens', () => {
  it('keeps a type token next to a text colour (tailwind-merge knows the tokens are sizes)', async () => {
    const { cn } = await import('../src/lib/utils')
    for (const name of TOKENS) {
      expect(cn(`text-${name}`, 'text-muted-foreground')).toBe(`text-${name} text-muted-foreground`)
    }
    expect(cn('text-sm', 'text-caption')).toBe('text-caption')
  })
})
