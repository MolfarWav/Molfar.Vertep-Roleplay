// SillyTavern presets have no groups and no choices: a preset author fakes them with header prompts
// ("━ Point-of-View", "=Pick one POV 👇 ====", "🔻PICK: AGENCY🔻") followed by toggles. This reads that
// convention and builds the native shape: section groups, choice variables with options and hints,
// and text variables from the "Prompt Variables" prompt full of {{setvar::name::value}}.
// Pure: no browser APIs (the engine-side test suite typechecks it).
import type { PromptSection, PromptVariable, PromptVariableChoice, SectionGroup } from './types.js'
import { uid } from './tokens.js'
import { note, type ImportReport } from './preset-report.js'

export interface RawEntry {
  section: PromptSection
  /** a prompt that only heads the toggles after it (empty custom marker, or a name drawn as a rule) */
  header: boolean
}

/** `[PICK 1: MIND]`, `[PICK 2: STYLE]`, `[PICK 1: ↓]` anywhere in a toggle's name: the author's own pick tag. */
const PICK_TAG = /\[\s*pick\s*(\d+)?\s*[:：]\s*([^\]]*?)\s*\]/i
const PICK_TAG_G = new RegExp(PICK_TAG.source, 'gi')

export interface PickTag {
  /** how many may be on: 1 = pick one */
  n: number
  /** the tag ("MIND"), or the arrow of a pair: '↑' (pair with the toggle above), '↓' (with the one below) */
  tag: string
}

export function pickTag(name: string): PickTag | null {
  const m = PICK_TAG.exec(name)
  if (!m) return null
  const raw = (m[2] ?? '').trim()
  const tag = /^[↑⬆^]$/u.test(raw) ? '↑' : /^[↓⬇v]$/iu.test(raw) ? '↓' : raw
  return tag ? { n: Math.max(1, Number(m[1] ?? 1) || 1), tag } : null
}

/** Names that open a group: a heavy rule first, a run of rule characters, or "pick one ..." words.
 *  A pick tag on a toggle (`[PICK 1: ↓] Agency-Lite`) never makes a header. */
export function isHeaderName(name: string): boolean {
  const n = name.trim()
  if (!n || PICK_TAG.test(n)) return false
  if (/^[━═─▬]/.test(n)) return true
  if (/[=━═─▬_*#-]{3,}/.test(n)) return true
  if (/\((?:pick|choose|select)\s+(?:one|any|up to|\d)[^)]*\)/i.test(n)) return true
  return /^[^\p{L}\p{N}]*(?:pick|choose|select)\b/iu.test(n)
}

/** The title of a header without its decoration: "━📜 Directives (PICK ONE)" -> "Directives". */
export function cleanTitle(name: string): string {
  const t = name
    .replace(PICK_TAG_G, ' ')
    .replace(/🚫[^🚫]*🚫/gu, ' ')
    .replace(/\((?:pick|choose|select)\b[^)]*\)/gi, ' ')
    .replace(/[=━═─▬_*#◆◇▶▷►👇🔻👆🚫]+/gu, ' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N})]+$/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/^(?:pick|choose|select)(?:\s+one)?\s*[:-]?\s*/i, '')
    .trim()
  return t || name.replace(PICK_TAG_G, ' ').trim() || name.trim()
}

// ─── the authors' own words ───
/** Every `{{// ... }}` comment of a prompt, as plain lines, in order. */
export function comments(content: string): string[] {
  return [...content.matchAll(/\{\{\s*\/\/([\s\S]*?)\}\}/g)]
    .map((m) => (m[1] ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

const LABEL_PREFIX = /^(?:WHAT IT DOES|DESCRIPTION|NOTE|INFO|HOW TO USE|USAGE)\s*:\s*/i
/** A comment that explains something to a person, not a macro note ("Macro state zeroing", "v2"). */
function isProse(t: string): boolean {
  const words = t.replace(LABEL_PREFIX, '').split(/\s+/).filter((w) => /\p{L}{2,}/u.test(w))
  return words.length >= 4 && !LOCK_ANY.test(t)
}

const firstSentence = (t: string): string => {
  const s = /^[\s\S]{8,}?[.!?](?=\s|$)/.exec(t)?.[0] ?? t
  return s.length > 160 ? `${s.slice(0, 157).trimEnd()}...` : s
}

/** The first prose comment of a prompt, its first sentence, as the option's one-line hint. */
export function commentHint(content: string): string | undefined {
  const t = comments(content).map((c) => c.replace(LABEL_PREFIX, '')).find((c) => c.length >= 8 && isProse(c))
  return t ? firstSentence(t) : undefined
}

/** Every prose comment of a prompt, whole: the section's note in the editor (never sent to the model). */
export function commentNote(content: string): string | undefined {
  const all = comments(content).filter(isProse)
  return all.length ? all.join('\n\n') : undefined
}

/** The plain words of a header prompt (comments, macros and rules out), for a choice's question. */
function plainWords(content: string): string | undefined {
  const t = content.replace(/\{\{[\s\S]*?\}\}/g, ' ').replace(/[=━═─▬_*#<>]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!/\p{L}{3,}/u.test(t) || t.length < 8) return undefined
  return t.length > 200 ? `${t.slice(0, 197).trimEnd()}...` : t
}

// ─── locked blocks ───
/** "DO NOT TOUCH", "DO NOT TURN OFF OR DELETE": the block must stay as it is. */
const LOCK_KEEP = /\bdo\s*n[o']?t\s+(?:touch|turn\s+(?:it\s+|this\s+)?off|disable|delete|remove|edit|change|move)\b/i
/** "DO NOT ENABLE": the block must stay off. */
const LOCK_OFF = /\bdo\s*n[o']?t\s+(?:enable|turn\s+(?:it\s+|this\s+)?on|activate|use)\b/i
const LOCK_ANY = new RegExp(`${LOCK_KEEP.source}|${LOCK_OFF.source}`, 'i')

/** 'keep' when the author says the block must stay as it is, 'off' when it must never be on. Only the name and
 *  the first comment count: an instruction to the model further down ("do not touch {{user}}") is not a lock. */
export function lockOf(name: string, content: string): 'keep' | 'off' | null {
  const head = `${name} ${comments(content)[0] ?? ''}`
  if (LOCK_OFF.test(head)) return 'off'
  if (LOCK_KEEP.test(head)) return 'keep'
  return null
}

/** A prompt that is nothing but prose comments: a README the author ships inside the preset. */
function readmeText(e: RawEntry): string | undefined {
  const c = e.section.content
  if (e.header || e.section.marker || /\{\{\s*setvar::/i.test(c)) return undefined
  const rest = c.replace(/\{\{\s*\/\/[\s\S]*?\}\}/g, '').replace(/\{\{\s*trim\s*\}\}/gi, '').trim()
  if (rest) return undefined
  const text = comments(c).filter((x) => x.length >= 8).join('\n\n')
  const named = /\b(?:read\s*me|readme|info|about|guide|how to|instructions?|credits?)\b/i.test(e.section.name)
  return text && (named || text.length >= 200) ? text : undefined
}

const slug = (s: string): string =>
  s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 40)

/** Names a bare {{name}} must never read as a preset variable (the engine's own macros). */
const RESERVED = new Set([
  'user', 'char', 'persona', 'description', 'personality', 'scenario', 'time', 'isotime', 'date', 'isodate', 'weekday',
  'lastmessage', 'lastusermessage', 'lastcharmessage', 'idle_duration', 'summary', 'words', 'limit', 'trim', 'newline',
])
const uniqueName = (base: string, taken: Set<string>): string => {
  let name = /^[\w.-]+$/.test(base) && base ? base : 'choice'
  if (/^\d/.test(name)) name = `g_${name}`
  if (RESERVED.has(name)) name = `${name}_choice`
  for (let i = 2; taken.has(name); i++) name = `${base || 'choice'}_${i}`
  taken.add(name)
  return name
}

// ─── text variables from setvar prompts ───
/** A prompt that does nothing but set variables (comments and {{trim}} aside), or null. */
function varsOnly(content: string): { name: string; value: string; question?: string }[] | null {
  const body = content.replace(/\{\{\s*trim\s*\}\}/gi, '')
  const out: { name: string; value: string; question?: string }[] = []
  let question: string | undefined
  let rest = body
  for (const m of body.matchAll(/\{\{\s*\/\/[^{}]*\}\}|\{\{\s*setvar::([^:{}]+)::([^{}]*)\}\}/g)) {
    if (m[1] === undefined) {
      question = commentHint(m[0])
    } else {
      const name = m[1].trim()
      if (!/^[\w.-]+$/.test(name)) return null
      out.push({ name, value: (m[2] ?? '').trim(), ...(question ? { question } : {}) })
      question = undefined
    }
    rest = rest.replace(m[0], '')
  }
  return out.length && !rest.trim() ? out : null
}

const humanize = (name: string): string => name.replace(/[_.-]+/g, ' ').replace(/^./, (c) => c.toUpperCase())

// ─── the structure pass ───
export interface Structured {
  sections: PromptSection[]
  groups: SectionGroup[]
  variables: PromptVariable[]
  /** the text of a README prompt the author ships inside the preset */
  description?: string
}

const SINGLE_NAME = /\b(?:pick|choose|select)\b(?!\s+(?:any|several|multiple|many))/i
const MULTI_TEXT = /\b(?:multiple|several|any number|any of|as many|combine|stack)\b/i
const SINGLE_TEXT = /\b(?:exactly one|only one|enable one|pick one|choose one|select one)\b/i
/** A group is a choice when the author says "pick one", or when most of it is off by default. */
const PLAIN_SHARE = 0.6

/** The words labels share from the start: "Anti-Slop Full" + "Anti-Slop Lite" -> "Anti-Slop". */
function commonHead(labels: string[]): string {
  const split = labels.map((l) => l.split(/\s+/))
  const out: string[] = []
  for (let i = 0; split.every((w) => w[i] !== undefined && w[i]!.toLowerCase() === split[0]![i]!.toLowerCase()); i++) out.push(split[0]![i]!)
  return out.join(' ').replace(/[^\p{L}\p{N})]+$/u, '')
}

/**
 * Turns SillyTavern's flat prompt list into groups, Choices and text variables. The rule the whole pass keeps:
 * with its default picks the imported preset sends what the file sends with its own on/off state.
 */
export function structurePreset(entries: RawEntry[], report: ImportReport): Structured {
  const variables: PromptVariable[] = []
  const taken = new Set<string>()
  // what each prompt becomes; filled step by step, written out in the file's order at the end
  const out = new Map<RawEntry, PromptSection>(entries.map((e) => [e, { ...e.section }]))
  const dropped = new Set<RawEntry>()
  const tags = new Map<RawEntry, PickTag>()
  const locks = new Map<RawEntry, 'keep' | 'off'>()
  const notes: string[] = []
  for (const e of entries) {
    if (e.section.marker) continue
    const tag = e.header ? null : pickTag(e.section.name)
    if (tag) tags.set(e, tag)
    const lock = lockOf(e.section.name, e.section.content)
    if (lock) locks.set(e, lock)
    const n = e.header ? undefined : commentNote(e.section.content)
    if (n) { out.get(e)!.note = n; notes.push(e.section.name) }
  }

  // 1. headers open groups; a real marker (card, history ...) closes one
  type Group = { header: RawEntry; members: RawEntry[] }
  const groupsOf: Group[] = []
  const inGroup = new Set<RawEntry>()
  let open: Group | null = null
  for (const e of entries) {
    if (e.header) {
      open = { header: e, members: [] }
      groupsOf.push(open)
    } else if (e.section.marker) open = null
    else if (open) { open.members.push(e); inGroup.add(e) }
  }

  // 2. a prompt of nothing but {{setvar}} becomes a text variable only when it is on and nothing switches it:
  // an off one stays an off section (its {{getvar}} reads empty, as in SillyTavern), one in a group or with a
  // pick tag stays a section its switch drives, one that sets a name another prompt sets too stays a section
  const setters = new Map<string, number>()
  const varsOf = new Map<RawEntry, ReturnType<typeof varsOnly>>()
  for (const e of entries) {
    const vars = !e.header && !e.section.marker ? varsOnly(e.section.content) : null
    if (!vars) continue
    varsOf.set(e, vars)
    for (const v of new Set(vars.map((x) => x.name))) setters.set(v, (setters.get(v) ?? 0) + 1)
  }
  const keptOff: string[] = []
  for (const [e, vars] of varsOf) {
    if (!vars) continue
    const free = !inGroup.has(e) && !tags.has(e) && !locks.has(e) && vars.every((v) => setters.get(v.name) === 1)
    if (!e.section.enabled) { if (free) keptOff.push(e.section.name); continue }
    if (!free) continue
    dropped.add(e)
    for (const v of vars) {
      if (taken.has(v.name)) continue
      taken.add(v.name)
      variables.push({
        id: uid('var'),
        name: v.name,
        label: humanize(v.name),
        type: /^-?\d+(?:\.\d+)?$/.test(v.value) ? 'number' : 'text',
        defaultValue: v.value,
        ...(v.question ? { question: v.question } : {}),
      })
    }
  }
  if (variables.length) note(report, 'came', 'settingVars', variables.length, variables.map((v) => v.name))
  note(report, 'came', 'keptOff', keptOff.length, keptOff)
  // a setvar name both a variable and a choice would read: the choice must not take it
  for (const n of setters.keys()) taken.add(n)

  // 3. locked blocks: as in the file, never an option; a "do not enable" header locks its whole group off
  const locked: string[] = []
  const hidden: string[] = []
  for (const g of groupsOf) {
    const lock = locks.get(g.header)
    if (lock) for (const m of g.members) if (!locks.has(m)) locks.set(m, lock)
  }
  for (const [e, lock] of locks) {
    if (e.header) continue
    const s = out.get(e)!
    s.locked = true
    if (lock === 'off') { s.enabled = false; hidden.push(e.section.name) } else locked.push(e.section.name)
    tags.delete(e)
  }

  // 4. pick tags: the same TAG anywhere makes one choice; an arrow pairs a toggle with its neighbour
  const plain = entries.filter((e) => !e.header && !e.section.marker && !dropped.has(e) && !locks.has(e))
  const sets = new Map<string, RawEntry[]>()
  const setOf = new Map<RawEntry, string>()
  const join = (a: RawEntry, b: RawEntry) => {
    const ka = setOf.get(a)
    const kb = setOf.get(b)
    if (ka && kb && ka === kb) return
    const key = ka ?? kb ?? `pair:${plain.indexOf(a)}`
    const members = [...new Set([...(ka ? sets.get(ka)! : [a]), ...(kb ? sets.get(kb)! : [b])])]
    if (ka && ka !== key) sets.delete(ka)
    if (kb && kb !== key) sets.delete(kb)
    sets.set(key, members.sort((x, y) => plain.indexOf(x) - plain.indexOf(y)))
    for (const m of members) setOf.set(m, key)
  }
  for (const [e, tag] of tags) {
    if (tag.tag === '↑' || tag.tag === '↓') {
      const i = plain.indexOf(e)
      const other = plain[tag.tag === '↑' ? i - 1 : i + 1]
      if (i >= 0 && other) join(e, other)
      continue
    }
    const key = `tag:${tag.tag.toLowerCase()}`
    const list = sets.get(key) ?? []
    if (!list.includes(e)) list.push(e)
    sets.set(key, list)
    setOf.set(e, key)
  }

  const groups: SectionGroup[] = []
  const guessedMulti: string[] = []
  const guessedOne: string[] = []
  const pickedNames: string[] = []
  const tagNames: string[] = []
  let choiceOptions = 0

  /** One choice over `members`: the sections stay where they are, each gated by its option. */
  const makeChoice = (label: string, members: RawEntry[], single: boolean, question?: string): void => {
    const name = uniqueName(slug(label), taken)
    const used = new Set<string>()
    const choices: PromptVariableChoice[] = members.map((m) => {
      const optLabel = cleanTitle(m.section.name)
      let value = slug(optLabel) || 'option'
      for (let i = 2; used.has(value); i++) value = `${slug(optLabel) || 'option'}_${i}`
      used.add(value)
      const hint = commentHint(m.section.content)
      return { id: uid('opt'), label: optLabel, value, ...(hint ? { hint } : {}) }
    })
    const defaults = members.flatMap((m, i) => (m.section.enabled ? [choices[i]!.id] : []))
    // a pick-one list with nothing on is "off" by default: say so, or the first option would switch on
    const none: PromptVariableChoice | null = single && !defaults.length ? { id: uid('opt'), label: 'None', value: 'none' } : null
    if (none) defaults.push(none.id)
    variables.push({
      id: uid('var'),
      name,
      label,
      type: 'choice',
      defaultValue: '',
      ...(question ? { question } : {}),
      choices: none ? [none, ...choices] : choices,
      multi: !single,
      separator: ', ',
      display: choices.length > 6 ? 'list' : 'buttons',
      // a single choice keeps only its first enabled option
      defaults: single ? defaults.slice(0, 1) : defaults,
    })
    members.forEach((m, i) => {
      const choice = choices[i]!
      const s = out.get(m)!
      s.enabled = true
      if (single) s.condition = `${name}==${choice.value}`
      else s.content = `{{#if ${name} contains "${choice.value}"}}\n${m.section.content}\n{{/if}}`
    })
    choiceOptions += choices.length
  }

  for (const [key, members] of sets) {
    if (members.length < 2) continue
    const pair = key.startsWith('pair:')
    const n = Math.max(...members.map((m) => tags.get(m)?.n ?? 1))
    const on = members.filter((m) => m.section.enabled).length
    // the file wins over the tag: two on in a "pick 1" set would lose one of them
    const single = n === 1 && on <= 1
    const labels = members.map((m) => cleanTitle(m.section.name))
    const label = pair ? (commonHead(labels) || labels.join(' / ')) : (tags.get(members[0]!)?.tag ?? labels[0]!)
    makeChoice(label, members, single)
    tagNames.push(label)
    if (!single) guessedMulti.push(label)
  }
  const pairs = [...sets.entries()].filter(([k, m]) => k.startsWith('pair:') && m.length >= 2).length
  const tagged = new Set([...sets.values()].filter((m) => m.length >= 2).flat())

  // 5. header groups: a group of plain toggles is a choice when the author says "pick one" or most are off;
  // a group that holds pick tags keeps its other toggles as plain switches
  for (const { header, members } of groupsOf) {
    if (!members.length) continue
    const title = cleanTitle(header.section.name)
    const group: SectionGroup = { id: uid('grp'), name: title, wrapFormat: 'none' }
    groups.push(group)
    out.get(header)!.groupId = group.id
    if (locks.get(header) === 'off') { out.get(header)!.locked = true; out.get(header)!.enabled = false }
    for (const m of members) if (!dropped.has(m)) out.get(m)!.groupId = group.id
    const free = members.filter((m) => !dropped.has(m) && !locks.has(m) && !tagged.has(m))
    if (free.length < members.length && members.some((m) => tagged.has(m))) continue
    const on = free.filter((m) => m.section.enabled).length
    const explicit = SINGLE_NAME.test(header.section.name) || SINGLE_TEXT.test(header.section.content)
    const isChoice = free.length >= 2 && (explicit || on / free.length < PLAIN_SHARE)
    if (!isChoice) continue

    // one when the author says so, or when exactly one is on (the usual way to build a pick-one list);
    // "several / any number" in the header says the opposite
    const named = SINGLE_NAME.test(header.section.name)
    const many = MULTI_TEXT.test(`${header.section.name} ${header.section.content}`)
    const single = named || (!many && (explicit || on === 1))
    const question = commentHint(header.section.content) ?? plainWords(header.section.content)
    makeChoice(title, free, single, question)
    pickedNames.push(title)
    if (!single) guessedMulti.push(title)
    else if (!named && !SINGLE_TEXT.test(header.section.content)) guessedOne.push(title)
  }

  const sections: PromptSection[] = []
  for (const e of entries) if (!dropped.has(e)) sections.push({ ...out.get(e)!, order: sections.length })
  const description = entries.map(readmeText).find(Boolean)

  if (groups.length) note(report, 'came', 'groups', groups.length)
  if (pickedNames.length) note(report, 'came', 'choices', pickedNames.length, pickedNames)
  note(report, 'came', 'pickTags', tagNames.length, tagNames)
  note(report, 'came', 'pairedPicks', pairs)
  if (choiceOptions) note(report, 'came', 'options', choiceOptions)
  note(report, 'came', 'notes', notes.length)
  note(report, 'came', 'locked', locked.length, locked)
  note(report, 'came', 'lockedOff', hidden.length, hidden)
  if (description) note(report, 'came', 'readme', 1)
  // what the file does not say, guessed from the defaults: the editor can flip either guess
  note(report, 'approx', 'assumedOne', guessedOne.length, guessedOne)
  note(report, 'approx', 'severalAllowed', guessedMulti.length, guessedMulti)
  return { sections, groups, variables, ...(description ? { description } : {}) }
}
