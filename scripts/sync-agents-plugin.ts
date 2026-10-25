/**
 * Pastes the agent checker and executor into the runner plugin.
 *
 *   bun scripts/sync-agents-plugin.ts          rewrite the generated block of plugins/agents/plugin.js
 *   bun scripts/sync-agents-plugin.ts --check  exit 1 when the block is out of date (the tests do the same)
 *
 * The engine loads one file per plugin, with no imports, so the two plain-JS sources
 * (src/canvas-kit/boards/agent-check.js and agent-run.js) are carried inside plugin.js between two marker lines.
 * Edit the sources, run this, commit both. Never edit the block by hand.
 */
import fs from 'node:fs'

const root = new URL('../', import.meta.url)
const read = (rel: string) => fs.readFileSync(new URL(rel, root), 'utf8')
export const BEGIN = '// ==== BEGIN GENERATED: src/canvas-kit/boards/agent-check.js + agent-run.js (bun scripts/sync-agents-plugin.ts) ===='
export const END = '// ==== END GENERATED ===='

/** The two sources as one block: `export` removed (the plugin exports what it needs itself), the sibling import dropped. */
export function generatedBlock(): string {
  const check = read('src/canvas-kit/boards/agent-check.js')
  const run = read('src/canvas-kit/boards/agent-run.js').replace(/^import .*$/gm, '')
  return [BEGIN, check.replace(/^export /gm, '').trimEnd(), '', run.replace(/^export /gm, '').trimEnd(), END].join('\n')
}

/** `plugin` with its generated block replaced by `block`; null when the markers are missing. */
export function withBlock(plugin: string, block: string): string | null {
  const a = plugin.indexOf(BEGIN)
  const b = plugin.indexOf(END)
  if (a < 0 || b < a) return null
  return plugin.slice(0, a) + block + plugin.slice(b + END.length)
}

if (import.meta.main) {
  const path = new URL('plugins/agents/plugin.js', root)
  const now = fs.readFileSync(path, 'utf8')
  const next = withBlock(now, generatedBlock())
  if (next === null) { console.error('plugins/agents/plugin.js has no generated block markers'); process.exit(1) }
  if (process.argv.includes('--check')) {
    if (next !== now) { console.error('plugins/agents/plugin.js is out of date: run bun scripts/sync-agents-plugin.ts'); process.exit(1) }
  } else if (next !== now) fs.writeFileSync(path, next)
}
