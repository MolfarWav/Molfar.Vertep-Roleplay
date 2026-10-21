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

/** Names that open a group: a heavy rule first, a run of rule characters, or "pick one ..." words. */
export function isHeaderName(name: string): boolean {
  const n = name.trim()
  if (!n) return false
  if (/^[━═─▬]/.test(n)) return true
  if (/[=━═─▬_*#-]{3,}/.test(n)) return true
  if (/\((?:pick|choose|select)\s+(?:one|any|up to|\d)[^)]*\)/i.test(n)) return true
  return /^[^\p{L}\p{N}]*(?:pick|choose|select)\b/iu.test(n)
}

/** The title of a header without its decoration: "━📜 Directives (PICK ONE)" -> "Directives". */
export function cleanTitle(name: string): string {
  const t = name
    .replace(/\((?:pick|choose|select)\b[^)]*\)/gi, ' ')
    .replace(/[=━═─▬_*#◆◇▶▷►👇🔻👆]+/gu, ' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N})]+$/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/^(?:pick|choose|select)(?:\s+one)?\s*[:-]?\s*/i, '')
    .trim()
  return t || name.trim()
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

/** The `{{// WHAT IT DOES: ... }}` comment authors put on top of a prompt, as one plain line. */
export function commentHint(content: string): string | undefined {
  const m = /\{\{\s*\/\/\s*(?:WHAT IT DOES:|DESCRIPTION:|NOTE:)?\s*([\s\S]*?)\}\}/i.exec(content)
  const t = m?.[1]?.replace(/\s+/g, ' ').trim()
  return t && t.length >= 8 ? (t.length > 160 ? `${t.slice(0, 157).trimEnd()}...` : t) : undefined
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
}

const SINGLE_NAME = /\b(?:pick|choose|select)\b(?!\s+(?:any|several|multiple|many))/i
const MULTI_TEXT = /\b(?:multiple|several|any number|any of|as many|combine|stack)\b/i
const SINGLE_TEXT = /\b(?:exactly one|only one|enable one|pick one|choose one|select one)\b/i
/** A group is a choice when the author says "pick one", or when most of it is off by default. */
const PLAIN_SHARE = 0.6

export function structurePreset(entries: RawEntry[], report: ImportReport): Structured {
  const variables: PromptVariable[] = []
  const taken = new Set<string>()
  const kept: RawEntry[] = []

  // 1. prompts of nothing but {{setvar}} become text variables (a {{getvar::x}} reads the variable)
  for (const e of entries) {
    const vars = !e.header && !e.section.marker ? varsOnly(e.section.content) : null
    if (!vars) { kept.push(e); continue }
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

  // 2. headers open groups; a real marker (card, history ...) closes one
  type Group = { header: RawEntry; members: RawEntry[] }
  const slots: (RawEntry | Group)[] = []
  let open: Group | null = null
  for (const e of kept) {
    if (e.header) {
      open = { header: e, members: [] }
      slots.push(open)
    } else if (e.section.marker) {
      open = null
      slots.push(e)
    } else if (open) open.members.push(e)
    else slots.push(e)
  }

  const sections: PromptSection[] = []
  const groups: SectionGroup[] = []
  const guessedMulti: string[] = []
  const guessedOne: string[] = []
  const pickedNames: string[] = []
  let choiceOptions = 0
  const push = (s: PromptSection) => sections.push({ ...s, order: sections.length })

  for (const slot of slots) {
    if (!('members' in slot)) { push(slot.section); continue }
    const { header, members } = slot
    if (!members.length) { push(header.section); continue }
    const title = cleanTitle(header.section.name)
    const group: SectionGroup = { id: uid('grp'), name: title, wrapFormat: 'none' }
    groups.push(group)
    push({ ...header.section, groupId: group.id })

    const on = members.filter((m) => m.section.enabled).length
    const explicit = SINGLE_NAME.test(header.section.name) || SINGLE_TEXT.test(header.section.content)
    const isChoice = members.length >= 2 && (explicit || on / members.length < PLAIN_SHARE)
    if (!isChoice) {
      for (const m of members) push({ ...m.section, groupId: group.id })
      continue
    }

    // one when the author says so, or when exactly one is on (the usual way to build a pick-one list);
    // "several / any number" in the header says the opposite
    const named = SINGLE_NAME.test(header.section.name)
    const many = MULTI_TEXT.test(`${header.section.name} ${header.section.content}`)
    const single = named || (!many && (explicit || on === 1))
    const name = uniqueName(slug(title), taken)
    const used = new Set<string>()
    const choices: PromptVariableChoice[] = members.map((m) => {
      const label = cleanTitle(m.section.name)
      let value = slug(label) || 'option'
      for (let i = 2; used.has(value); i++) value = `${slug(label) || 'option'}_${i}`
      used.add(value)
      const hint = commentHint(m.section.content)
      return { id: uid('opt'), label, value, ...(hint ? { hint } : {}) }
    })
    const defaults = members.flatMap((m, i) => (m.section.enabled ? [choices[i]!.id] : []))
    // a pick-one list with nothing on is "off" by default: say so, or the first option would switch on
    const none: PromptVariableChoice | null = single && !defaults.length ? { id: uid('opt'), label: 'None', value: 'none' } : null
    if (none) defaults.push(none.id)
    const question = commentHint(header.section.content)
    variables.push({
      id: uid('var'),
      name,
      label: title,
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
      const base = { ...m.section, enabled: true, groupId: group.id }
      push(single
        ? { ...base, condition: `${name}==${choice.value}` }
        : { ...base, content: `{{#if ${name} contains "${choice.value}"}}\n${m.section.content}\n{{/if}}` })
    })
    choiceOptions += choices.length
    pickedNames.push(title)
    if (!single) guessedMulti.push(title)
    else if (!named && !SINGLE_TEXT.test(header.section.content)) guessedOne.push(title)
  }

  if (groups.length) note(report, 'came', 'groups', groups.length)
  if (pickedNames.length) note(report, 'came', 'choices', pickedNames.length, pickedNames)
  if (choiceOptions) note(report, 'came', 'options', choiceOptions)
  // what the file does not say, guessed from the defaults: the editor can flip either guess
  note(report, 'approx', 'assumedOne', guessedOne.length, guessedOne)
  note(report, 'approx', 'severalAllowed', guessedMulti.length, guessedMulti)
  return { sections, groups, variables }
}
