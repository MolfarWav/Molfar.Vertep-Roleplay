#!/usr/bin/env node
// Checks a Help articles file against the schema in HELP-FORMAT.md and against the repo it was written from.
// v2 adds a plain-words lint (no code terms in user-facing text) on top of v1.
// Usage: node scripts/validate-help.mjs <articles.json> --repo <path to the repo checkout> [--fix-lines]
// --fix-lines: a source whose quote is not at its stated lines gets the lines where the quote now is
// (a quote that is nowhere in the file stays an error); the file is rewritten. Run it after other work
// moved lines in the files the articles cite.
// Exit code 0 = no errors (warnings are allowed), 1 = errors.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, normalize, isAbsolute } from 'node:path'

const args = process.argv.slice(2)
const file = args[0]
const repoIdx = args.indexOf('--repo')
const repo = repoIdx >= 0 ? args[repoIdx + 1] : undefined
if (!file || !repo) {
  console.error('Usage: node validate-help-v2.mjs <articles.json> --repo <repo checkout>')
  process.exit(2)
}

const SURFACES = {
  roleplay: {
    groups: ['chat', 'story', 'characters', 'world', 'canvas', 'setup', 'help'],
    tips: 'src/lib/guide-tips.ts',
  },
  shell: {
    groups: ['start', 'apps', 'models', 'molfar', 'updates', 'help'],
    tips: 'client/src/guide/tips.ts',
  },
  agent: {
    groups: ['chat', 'safety', 'context', 'memory', 'projects', 'help'],
    tips: 'client-agent/src/guide/tips.ts',
  },
}
const LIMITS = { title: 60, short: 260, details: 1500, aliases: 300, quote: 160 }

const errors = []
const warnings = []
const err = (id, msg) => errors.push(`${id}: ${msg}`)
const warn = (id, msg) => warnings.push(`${id}: ${msg}`)

let doc
try {
  doc = JSON.parse(readFileSync(file, 'utf8'))
} catch (e) {
  console.error(`Not valid JSON: ${e.message}`)
  process.exit(1)
}

if (args.includes('--fix-lines') && Array.isArray(doc.entries)) {
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let moved = 0
  for (const e of doc.entries)
    for (const s of e?.sources ?? []) {
      if (typeof s?.path !== 'string' || typeof s.quote !== 'string' || !existsSync(join(repo, s.path))) continue
      const text = readFileSync(join(repo, s.path), 'utf8')
      const m = new RegExp(s.quote.trim().split(/\s+/).map(esc).join('\\s+')).exec(text)
      if (!m) continue
      const lines = `${text.slice(0, m.index).split('\n').length}-${text.slice(0, m.index + m[0].length).split('\n').length}`
      if (lines !== s.lines) {
        s.lines = lines
        moved++
      }
    }
  writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`)
  console.log(`fix-lines: ${moved} sources moved`)
}

if (doc.format !== 1) err('file', 'format must be 1')
const surface = SURFACES[doc.surface]
if (!surface) {
  err('file', `surface must be one of ${Object.keys(SURFACES).join(', ')}`)
  report()
}
if (!doc.source || typeof doc.source.commit !== 'string' || !/^[0-9a-f]{7,40}$/.test(doc.source.commit))
  err('file', 'source.commit must be the git commit hash (7-40 hex characters) the entries were read from')
if (!Array.isArray(doc.entries) || doc.entries.length === 0) {
  err('file', 'entries must be a non-empty array')
  report()
}

// ids of the tips that already exist (for `extends` and `related`)
const tipsPath = join(repo, surface.tips)
const existingTips = new Set()
if (!existsSync(tipsPath)) err('file', `tips registry not found at ${tipsPath}: is --repo the right checkout?`)
else for (const m of readFileSync(tipsPath, 'utf8').matchAll(/\bid:\s*['"]([^'"]+)['"]/g)) existingTips.add(m[1])

const cyr = /[Ѐ-ӿ]/
const norm = (s) => s.replace(/\s+/g, ' ').trim()
const ids = new Set(doc.entries.map((e) => e?.id))
const seenIds = new Set()
const seenTitles = new Set()
const fileCache = new Map()
const readRepoFile = (rel) => {
  if (!fileCache.has(rel)) fileCache.set(rel, readFileSync(join(repo, rel), 'utf8'))
  return fileCache.get(rel)
}

function text(id, e, field, { required, max }) {
  const v = e[field]
  if (v === undefined) {
    if (required) err(id, `${field} is missing`)
    return
  }
  if (typeof v !== 'object' || typeof v.en !== 'string' || typeof v.uk !== 'string') {
    err(id, `${field} must be {"en": "...", "uk": "..."}`)
    return
  }
  if (!v.en.trim() || !v.uk.trim()) err(id, `${field}: en and uk must both be non-empty`)
  if (cyr.test(v.en)) err(id, `${field}.en contains Cyrillic letters (languages swapped?)`)
  if (v.uk.trim() && !cyr.test(v.uk)) err(id, `${field}.uk has no Cyrillic letters`)
  if (max && v.en.length > max) err(id, `${field}.en is ${v.en.length} characters, the limit is ${max}`)
  if (max && v.uk.length > max * 1.25) err(id, `${field}.uk is ${v.uk.length} characters, the limit is ${Math.round(max * 1.25)}`)
  if (/todo|tbd|lorem|\?\?\?/i.test(v.en + v.uk)) err(id, `${field} contains a placeholder (TODO/TBD/???)`)
  if (field !== 'aliases') lintPlain(id, field, v)
}

// v2: plain-words lint. The reader is a roleplayer, so no code terms in user-facing text.
// {{macros}} such as {{char}} are real things the user types, so they are allowed.
function lintPlain(id, field, v) {
  const rules = [
    [/`/, 'backticks (code formatting)'],
    [/\b(?:data|characters|chats|personas|groups|lorebooks|litopys|dashboard)\/[\w<>{}.-]+/i, 'a file path'],
    [/\.(?:json|ts|tsx|mjs)\b/, 'a file name or extension'],
    [/\b[a-z]+_[a-z_]+\b/, 'a snake_case identifier'],
    [/\b[a-z]+[A-Z][A-Za-z]+\b/, 'a camelCase identifier'],
    [/\bextensions\.[a-z]/i, 'a JSON key path'],
    [/\b(?:GET|POST|PUT|DELETE) \/|\/api\//, 'an HTTP route'],
  ]
  for (const lang of ['en', 'uk']) {
    const t = v[lang].replace(/\{\{[^}]*\}\}/g, '')
    for (const [re, what] of rules) {
      const m = re.exec(t)
      if (m) err(id, `${field}.${lang} has ${what}: "${m[0]}" (plain-words rule)`)
    }
  }
  const warnRules = [
    ['en', /\b(?:API|endpoint|payload|schema|tEXt chunk)\b/, 'a developer word; explain it once in plain words or drop it'],
    ['uk', /\b(?:API|endpoint|payload|schema)\b/, 'a developer word; explain it once in plain words or drop it'],
    ['uk', /Навич/, 'old name "Навички" (the Ukrainian UI says "Звички" for Habits)'],
    ['uk', /Пастка/, '"Пастка" reads as a calque of "Gotcha"; use "Увага"'],
    ['en', /\bGotcha\b/, '"Gotcha" is slang; use "Watch out"'],
  ]
  for (const [lang, re, what] of warnRules) if (re.test(v[lang])) warn(id, `${field}.${lang}: ${what}`)
  for (const s of v.uk.split(/(?<=[.!?])\s+/)) {
    const n = s.trim().split(/\s+/).length
    if (n > 20) warn(id, `${field}.uk: sentence of ${n} words (limit 20): "${s.slice(0, 60)}..."`)
  }
}

for (const [n, e] of doc.entries.entries()) {
  const id = e?.id ?? `entries[${n}]`
  if (typeof e?.id !== 'string' || !/^kb\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(e.id)) {
    err(id, 'id must look like "kb.profile" (lowercase, digits, dots and dashes)')
    continue
  }
  if (seenIds.has(e.id)) err(id, 'duplicate id')
  seenIds.add(e.id)

  if (!surface.groups.includes(e.group)) err(id, `group must be one of: ${surface.groups.join(', ')}`)
  text(id, e, 'title', { required: true, max: LIMITS.title })
  text(id, e, 'short', { required: true, max: LIMITS.short })
  text(id, e, 'details', { required: true, max: LIMITS.details })
  text(id, e, 'aliases', { required: true, max: LIMITS.aliases })
  text(id, e, 'where', { required: false, max: 200 })
  if (e.title?.en) {
    const t = e.title.en.toLowerCase()
    if (seenTitles.has(t)) err(id, `title "${e.title.en}" is used twice`)
    seenTitles.add(t)
  }

  if (e.extends !== undefined) {
    if (typeof e.extends !== 'string' || !existingTips.has(e.extends))
      err(id, `extends "${e.extends}" is not a tip id in ${surface.tips}`)
  }

  if (e.related !== undefined) {
    if (!Array.isArray(e.related)) err(id, 'related must be an array of entry ids')
    else
      for (const r of e.related) {
        if (r === e.id) err(id, 'related lists the entry itself')
        else if (!ids.has(r) && !existingTips.has(r)) err(id, `related "${r}" is neither an entry of this file nor an existing tip`)
      }
  }

  if (!Array.isArray(e.sources) || e.sources.length === 0) {
    err(id, 'sources must list at least one {path, lines, quote}')
  } else {
    for (const [k, s] of e.sources.entries()) {
      const at = `${id} sources[${k}]`
      if (typeof s?.path !== 'string' || isAbsolute(s.path) || normalize(s.path).startsWith('..')) {
        err(at, 'path must be relative to the repo root')
        continue
      }
      if (!existsSync(join(repo, s.path))) {
        err(at, `file not found: ${s.path}`)
        continue
      }
      const lines = readRepoFile(s.path).split('\n')
      const m = /^(\d+)-(\d+)$/.exec(String(s.lines ?? ''))
      if (!m) {
        err(at, 'lines must look like "120-160"')
        continue
      }
      const [from, to] = [Number(m[1]), Number(m[2])]
      if (from < 1 || to < from || to > lines.length) err(at, `lines ${s.lines} are outside the file (${lines.length} lines)`)
      if (to - from > 200) warn(at, 'range is wider than 200 lines; point at the exact place')
      if (typeof s.quote !== 'string' || s.quote.trim().length < 8 || s.quote.length > LIMITS.quote) {
        err(at, `quote must be 8-${LIMITS.quote} characters copied from the file`)
        continue
      }
      // The quote must appear inside the stated range (small slack for off-by-a-few line numbers).
      const slice = lines.slice(Math.max(0, from - 1 - 5), Math.min(lines.length, to + 5)).join('\n')
      if (!norm(slice).includes(norm(s.quote))) err(at, `quote not found in ${s.path} lines ${s.lines} (copy it exactly from the file)`)
    }
  }
}

report()

function report() {
  for (const w of warnings) console.log(`warning  ${w}`)
  for (const e of errors) console.log(`ERROR    ${e}`)
  const count = Array.isArray(doc?.entries) ? doc.entries.length : 0
  console.log(`\n${count} entries, ${errors.length} errors, ${warnings.length} warnings`)
  process.exit(errors.length ? 1 : 0)
}
