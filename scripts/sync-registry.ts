/**
 * Pastes the entity registry (src/lib/entity-registry.js) into the plugins that need it.
 *
 *   bun scripts/sync-registry.ts          rewrite the generated block of each plugin
 *   bun scripts/sync-registry.ts --check  exit 1 when any copy is out of date (the tests do the same)
 *
 * The engine loads one file per plugin, with no imports, and no plugin may import another, so the plain-JS source
 * is carried inside each plugin.js between two marker lines. Edit the source, run this, commit all. Never edit a block by hand.
 */
import fs from 'node:fs'

const root = new URL('../', import.meta.url)
const read = (rel: string) => fs.readFileSync(new URL(rel, root), 'utf8')
const lf = (s: string) => s.replace(/\r\n/g, '\n')
export const SOURCE = 'src/lib/entity-registry.js'
export const PLUGINS = ['plugins/relations/plugin.js', 'plugins/world/plugin.js', 'plugins/litopys/plugin.js']
export const BEGIN = '// ==== BEGIN GENERATED: src/lib/entity-registry.js (bun scripts/sync-registry.ts) ===='
export const END = '// ==== END GENERATED: entity-registry ===='

/** The source as one block: `export` removed (a plugin exports what it needs itself), LF line endings. */
export function generatedBlock(): string {
  return [BEGIN, lf(read(SOURCE)).replace(/^export /gm, '').trimEnd(), END].join('\n')
}

/** `plugin` (LF) with its generated block replaced by `block`; null when the markers are missing. */
export function withBlock(plugin: string, block: string): string | null {
  const a = plugin.indexOf(BEGIN)
  const b = plugin.indexOf(END)
  if (a < 0 || b < a) return null
  return plugin.slice(0, a) + block + plugin.slice(b + END.length)
}

/** The plugin files whose copy differs from the source, or that have no markers. Line endings do not count. */
export function outOfDate(): string[] {
  const block = generatedBlock()
  return PLUGINS.filter((rel) => {
    const now = lf(read(rel))
    return withBlock(now, block) !== now
  })
}

if (import.meta.main) {
  const check = process.argv.includes('--check')
  const block = generatedBlock()
  let bad = 0
  for (const rel of PLUGINS) {
    const path = new URL(rel, root)
    const raw = fs.readFileSync(path, 'utf8')
    const next = withBlock(lf(raw), block)
    if (next === null) { console.error(`${rel} has no generated block markers`); bad++; continue }
    const out = raw.includes('\r\n') ? next.replace(/\n/g, '\r\n') : next
    if (out === raw) continue
    if (check) { console.error(`${rel} is out of date: run bun scripts/sync-registry.ts`); bad++ } else fs.writeFileSync(path, out)
  }
  if (bad) process.exit(1)
}
