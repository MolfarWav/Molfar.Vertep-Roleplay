// What the Direction bar and the member chips show, worked out from the state route's answer (plugins/direction).
// Pure functions, so the bar's states are tested without a browser.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Lang, MsgKey, Vars } from './i18n'
import {
  BEAT_PLACE_MAX, BEAT_REPLIES_MAX, BEAT_TEXT_MAX, DIRECTION_TAGS, loadDirection, needPercent, useDirectionLive, useDirectionMarks,
  type BeatDraft, type DirectionBeat, type DirectionBeatKind, type DirectionBeatWhen, type DirectionFire, type DirectionLogEntry, type DirectionNext, type DirectionNoteKind, type DirectionResult, type DirectionRoll, type DirectionRule, type DirectionScene, type DirectionState, type DirectionTag,
} from './direction'

/** How a member stands in the scene: `unknown` = nothing says (no report, no Dashboard), so no marks at all. */
export type Presence = 'unknown' | 'here' | 'away' | 'locked'

export function presenceOf(scene: DirectionScene | null | undefined, id: string): Presence {
  if (!scene || scene.source === 'none') return 'unknown'
  if (scene.present.includes(id)) return 'here'
  return scene.source === 'lock' ? 'locked' : 'away'
}

/** The bar's mode: no model, off for this chat, or working (with a report, with none yet, or with the last run failed). */
export type BarMode = 'no-model' | 'off' | 'error' | 'empty' | 'report'

/** The newest log entry that says how the director's last run went. */
export function lastRun(log: DirectionLogEntry[]): DirectionLogEntry | null {
  return log.find((e) => e.kind === 'report' || e.kind === 'error') ?? null
}

export function barMode(state: DirectionState): BarMode {
  if (!state.config.model) return 'no-model'
  if (!state.chat.on) return 'off'
  const run = lastRun(state.log)
  if (run?.kind === 'error' && (!state.report || run.at >= state.report.at)) return 'error'
  return state.report ? 'report' : 'empty'
}

export function nameOf(state: DirectionState, id: string): string {
  return state.members.find((m) => m.id === id)?.name ?? id
}

/** "Yuzu" for one, "Yuzu, Hana" for two, "Yuzu, Hana +2" beyond. */
export function namesOf(state: DirectionState, ids: string[], max = 2): string {
  const names = ids.map((id) => nameOf(state, id))
  return names.length <= max ? names.join(', ') : `${names.slice(0, max).join(', ')} +${names.length - max}`
}

export function tagKey(tag: DirectionTag | null): `dir.tag.${DirectionTag}` | 'dir.tag.none' {
  return tag ? `dir.tag.${tag}` : 'dir.tag.none'
}

/** The error of a failed run in words: the plugin's reason code, else its message. */
export function errorKey(reason?: string): 'dir.err.bad-reply' | 'dir.err.error' | 'dir.err.no-model' {
  return reason === 'bad-reply' ? 'dir.err.bad-reply' : reason === 'no-model' ? 'dir.err.no-model' : 'dir.err.error'
}

/**
 * The state of one chat, read again when a report, the switch or the lock changed (`useDirectionLive.stamp`) and when the
 * chat's messages changed (`messageSig`, for example the last message's id and swipe). `null` while it loads or when the
 * app has no Direction plugin.
 */
export function useDirectionState(chatId: string, messageSig: string): { state: DirectionState | null; reload: () => void } {
  const stamp = useDirectionLive((s) => s.stamp)
  const [state, setState] = useState<DirectionState | null>(null)
  const seq = useRef(0)
  const reload = useCallback(() => {
    const mine = ++seq.current
    loadDirection(chatId).then((s) => { if (mine === seq.current) { setState(s); publishMarks(chatId, s) } }).catch(() => {})
  }, [chatId])
  useEffect(() => { setState(null); publishMarks(chatId, null) }, [chatId])
  useEffect(() => { reload() }, [reload, stamp, messageSig])
  return { state, reload }
}

/** The loaded chat's firings and names go to a small store, so the mark under a reply reads them without a fetch per message. */
export function publishMarks(chatId: string, state: DirectionState | null): void {
  const fires = state?.fires ?? []
  if (!state || fires.length === 0) {
    if (useDirectionMarks.getState().chat?.chatId === chatId || !state) useDirectionMarks.setState({ chat: null })
    return
  }
  useDirectionMarks.setState({
    chat: {
      chatId,
      fires,
      rules: { ...Object.fromEntries((state.rules?.items ?? []).map((r) => [r.id, r.name])), ...Object.fromEntries((state.plan?.beats ?? []).map((b) => [beatRuleId(b.id), b.text])) },
      members: Object.fromEntries(state.members.map((m) => [m.id, m.name])),
    },
  })
}

// ---------- genre rules (phase 2): the words for the Rules tab, the log and the mark under a reply ----------

type Tr = (key: MsgKey, vars?: Vars) => string

/** "Kaito and Hana": names in the language's own list form. */
export function listNames(names: string[], lang: Lang): string {
  try {
    return new Intl.ListFormat(lang, { style: 'long', type: 'conjunction' }).format(names)
  } catch {
    return names.join(', ')
  }
}

export function ruleOf(state: DirectionState, id: string): DirectionRule | undefined {
  return state.rules?.items.find((r) => r.id === id)
}

export function ruleName(state: DirectionState, id: string): string {
  return ruleOf(state, id)?.name ?? id
}

// ---------- the beat plan (phase 3a) ----------

/** A beat's id in the ledger: `beat:<id>`. */
export const beatRuleId = (id: string): string => `beat:${id}`
export const isBeatRule = (rule: string): boolean => rule.startsWith('beat:')

export function beatOf(state: DirectionState, rule: string): DirectionBeat | undefined {
  return isBeatRule(rule) ? state.plan?.beats.find((b) => beatRuleId(b.id) === rule) : undefined
}

/** A beat's text cut to one line's worth ("Yuzu bursts in with news…"). */
export function beatShort(text: string, max = 48): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length <= max ? one : `${one.slice(0, max - 1).trimEnd()}…`
}

/** "Beat «text»" for a ledger id: a beat that is gone from the plan falls back to a plain word. */
function ruleLabel(t: Tr, state: DirectionState, rule: string): string {
  if (!isBeatRule(rule)) return ruleName(state, rule)
  const b = beatOf(state, rule)
  return b ? t('dir.beat.label', { text: beatShort(b.text, 60) }) : t('dir.beat.gone')
}

/** What a queued note says will happen: a rule's act with names, or the beat with who takes part. */
export function nextAct(t: Tr, state: DirectionState, next: Pick<DirectionNext, 'kind' | 'rule' | 'who' | 'with'>, lang: Lang): string {
  const names = (ids: string[]) => ids.map((id) => nameOf(state, id))
  if (next.kind === 'beat') {
    const text = beatShort(beatOf(state, next.rule)?.text ?? '', 70)
    return next.who.length ? t('dir.beat.actWho', { text, names: listNames(names(next.who), lang) }) : t('dir.beat.act', { text })
  }
  return actLine(t, next.kind, names(next.who), names(next.with), lang)
}

/** The name the callout puts in brackets: the rule's name, or "Plan" for a beat. */
export function nextSource(t: Tr, state: DirectionState, next: Pick<DirectionNext, 'kind' | 'rule'>): string {
  return next.kind === 'beat' ? t('dir.plan') : ruleName(state, next.rule)
}

/** What a rule does to the scene, with names: "Yuzu walks in on Kaito and Hana" (the mark leaves the `with` out). */
export function actLine(t: Tr, kind: Exclude<DirectionNoteKind, 'beat'>, who: string[], withNames: string[], lang: Lang): string {
  const w = listNames(who, lang)
  if (kind === 'interrupt') return withNames.length ? t('dir.act.interrupt', { who: w, with: listNames(withNames, lang) }) : t('dir.act.interruptBare', { who: w })
  if (kind === 'join') return withNames.length ? t('dir.act.join', { who: w, with: listNames(withNames, lang) }) : t('dir.act.joinBare', { who: w })
  return t('dir.act.return', { who: w })
}

/** The rule's one sentence in plain words: by its id, else by what it does. */
export function ruleSentenceKey(rule: Pick<DirectionRule, 'id' | 'kind'>): MsgKey {
  if (rule.id === 'interrupted') return 'dir.rule.interrupted'
  if (rule.id === 'nobody') return 'dir.rule.nobody'
  if (rule.id === 'crowd') return 'dir.rule.crowd'
  return rule.kind === 'interrupt' ? 'dir.rule.kind.interrupt' : rule.kind === 'join' ? 'dir.rule.kind.join' : 'dir.rule.kind.return'
}

/** The numbers a built-in rule starts with, to know when "Restore defaults" is worth showing (the state does not carry them). */
export const RULE_DEFAULTS: Record<string, { need: number; cooldown: number; k: number; m: number }> = {
  interrupted: { need: 8, cooldown: 5, k: 3, m: 4 },
  nobody: { need: 7, cooldown: 4, k: 0, m: 0 },
  crowd: { need: 9, cooldown: 6, k: 0, m: 0 },
}

export function ruleEdited(rule: DirectionRule): boolean {
  const d = RULE_DEFAULTS[rule.id]
  return !!d && (rule.need !== d.need || rule.cooldown !== d.cooldown || rule.k !== d.k || rule.m !== d.m)
}

/** "Ready", "Cooling down: 3 more replies", "Quiet for the payoff: 6 more replies", "Off"; with the tension when it builds. */
export function ruleStatusLine(t: Tr, rule: DirectionRule): string {
  const tension = rule.k > 0 && rule.tension > 0 ? t('dir.rule.tension', { n: rule.tension, k: rule.k }) : ''
  const head =
    rule.status === 'off' ? t('dir.rule.off')
    : rule.status === 'cooldown' ? t('dir.rule.cooldown', { n: rule.left })
    : rule.status === 'payoff' ? t('dir.rule.payoff', { n: rule.left })
    : t('dir.rule.ready')
  return [head, rule.status === 'off' ? '' : tension].filter(Boolean).join(' · ')
}

/** The chance of a roll in words: "2d6 at least 8: about 42% of rolls", "never" at 13. */
export function needText(t: Tr, need: number): string {
  if (need >= 13) return t('dir.rule.needNever')
  return t('dir.rule.needHint', { n: need, p: needPercent[need] ?? 0 })
}

/** Why "Fire now" cannot be used, as a message key, or null when it can. */
export function fireBlockedKey(state: DirectionState): MsgKey | null {
  if (!state.chat.on) return 'dir.fire.off'
  if (state.chat.lock) return 'dir.fire.locked'
  if (state.scene.source === 'none') return 'dir.fire.unknown'
  if (state.members.every((m) => state.scene.present.includes(m.id))) return 'dir.fire.everyone'
  return null
}

export function rollText(t: Tr, roll: DirectionRoll): string {
  return t('dir.roll', { total: roll.total, need: roll.need })
}

/** The word for how a firing ended. */
export function resultKey(r: DirectionResult): MsgKey {
  return r === 'came' ? 'dir.result.came' : r === 'mentioned' ? 'dir.result.mentioned' : r === 'missed' ? 'dir.result.missed' : r === 'sent' ? 'dir.result.sent' : 'dir.result.yielded'
}

/** The firing that rode this reply (`<message id>#<swipe>`), or null. */
export function fireFor(marks: { chatId: string; fires: DirectionFire[] } | null, chatId: string, messageId: string, swipe: number): DirectionFire | null {
  if (!marks || marks.chatId !== chatId) return null
  const key = `${messageId}#${swipe}`
  return marks.fires.find((f) => f.carrier === key) ?? null
}

/** The mark under a reply: "Direction: Yuzu walks in (Interrupted moment, 2d6 = 9, needed 8) · came". */
export function markText(t: Tr, fire: DirectionFire, ruleLabel: string, whoNames: string[], lang: Lang): string {
  if (fire.kind === 'beat') return `${t('dir.mark.beat', { text: beatShort(ruleLabel, 70) })}${fire.result ? ` · ${t(resultKey(fire.result))}` : ''}`
  const what = actLine(t, fire.kind, whoNames, [], lang)
  const how = fire.forced || !fire.roll ? t('dir.mark.byHand', { rule: ruleLabel }) : t('dir.mark.rolled', { rule: ruleLabel, roll: rollText(t, fire.roll) })
  return `${t('dir.mark.lead', { what, how })}${fire.result ? ` · ${t(resultKey(fire.result))}` : ''}`
}

/** One log entry in words: the line and a muted detail under it. */
export function logWords(t: Tr, state: DirectionState, e: DirectionLogEntry, lang: Lang): { line: string; detail: string } {
  const who = (ids: string[] = []) => listNames(ids.map((id) => nameOf(state, id)), lang)
  const rule = e.rule ? ruleLabel(t, state, e.rule) : ''
  if (e.kind === 'beat') {
    const text = beatShort(e.text ?? beatOf(state, beatRuleId(e.beat ?? ''))?.text ?? '', 60)
    const key = e.state === 'due' ? (e.why ? 'dir.log.beatDue' : 'dir.log.beatDueBare') : e.why ? 'dir.log.beatFired' : 'dir.log.beatFiredBare'
    return { line: t(key, { text, why: e.why ?? '' }), detail: e.state === 'fired' && e.who?.length ? t('dir.beat.who', { names: who(e.who) }) : '' }
  }
  if (e.kind === 'report') {
    return {
      line: `${t(tagKey(e.tag ?? null))}${e.present ? ` · ${namesOf(state, e.present, 4)}` : ''}`,
      detail: [e.ms ? `${e.ms} ms` : '', e.usage ? `${e.usage.input}+${e.usage.output} ${t('dir.log.tokens')}` : '', e.retried ? t('dir.log.retried') : ''].filter(Boolean).join(' · '),
    }
  }
  if (e.kind === 'error') return { line: `${t('dir.log.error')}: ${t(errorKey(e.reason))}`, detail: e.message ?? '' }
  if (e.kind === 'lock') return { line: t('dir.log.lock', { names: namesOf(state, e.ids ?? [], 4) }), detail: '' }
  if (e.kind === 'release') return { line: t('dir.log.release', { names: namesOf(state, e.ids ?? [], 4) }), detail: '' }
  if (e.kind === 'on') return { line: t('dir.log.on'), detail: '' }
  if (e.kind === 'off') return { line: t('dir.log.off'), detail: '' }
  if (e.kind === 'rule') {
    if (e.state === 'missed') return { line: t('dir.log.missed', { rule, roll: e.roll ? rollText(t, e.roll) : '' }), detail: e.why ?? '' }
    const act = actLine(t, ruleOf(state, e.rule ?? '')?.kind ?? 'interrupt', (e.who ?? []).map((id) => nameOf(state, id)), (e.with ?? []).map((id) => nameOf(state, id)), lang)
    if (e.forced || !e.roll) return { line: t('dir.log.firedByHand', { rule, act }), detail: '' }
    return { line: t('dir.log.fired', { rule, act }), detail: [e.why, rollText(t, e.roll), e.payoff ? t('dir.log.payoff') : ''].filter(Boolean).join('. ') }
  }
  if (e.kind === 'result') {
    if (e.result === 'yielded') return { line: t(e.by === 'world' ? 'dir.log.yieldWorld' : e.by === 'direction' ? 'dir.log.yieldLock' : 'dir.log.yieldNone', { rule }), detail: '' }
    const r: DirectionResult = e.result ?? 'missed'
    if (r === 'sent') return { line: t('dir.log.sent', { rule }), detail: '' }
    return { line: t(r === 'came' ? 'dir.log.came' : r === 'mentioned' ? 'dir.log.mentioned' : 'dir.log.missedCome', { rule, who: who(e.who) }), detail: '' }
  }
  if (e.kind === 'rules') {
    const set = state.rules?.sets.find((s) => s.id === e.set)?.name ?? e.set ?? ''
    return { line: !e.set ? t('dir.log.genreNone') : t(e.on ? 'dir.log.genreOn' : 'dir.log.genreOff', { genre: set }), detail: '' }
  }
  if (e.kind === 'skip') return { line: e.who?.length ? t('dir.log.skip', { rule, who: who(e.who) }) : t('dir.log.skipBare', { rule }), detail: '' }
  return { line: e.kind, detail: '' }
}

// ---------- the Plan tab: words, states and the list that goes back to the plugin ----------

/** The scene kinds a "scene" beat can wait for, in the order the plugin lists them (fallback: the app's own list). */
export function planTags(state: DirectionState): DirectionTag[] {
  return state.plan?.tags?.length ? state.plan.tags : [...DIRECTION_TAGS]
}

/** "After 3 replies", "At once", "When the scene is a break", "When the story is at «roof»", "When you fire it". */
export function beatWhenText(t: Tr, when: DirectionBeatWhen): string {
  if (when.kind === 'tag') return t('dir.beat.when.tag', { tag: t(tagKey(when.tag)) })
  if (when.kind === 'place') return t('dir.beat.when.place', { place: when.place })
  if (when.kind === 'manual') return t('dir.beat.when.manual')
  return when.n > 0 ? t('dir.beat.when.replies', { n: when.n }) : t('dir.beat.when.now')
}

/** The status line of a beat in words. */
export function beatStatusLine(t: Tr, beat: DirectionBeat, boundaryWait: number): string {
  const n = beat.left ?? 0
  switch (beat.status) {
    case 'waiting':
      if (beat.when.kind === 'replies') return beat.met || n <= 0 ? t('dir.beat.st.next') : t('dir.beat.st.waiting', { n })
      if (beat.when.kind === 'tag') return t('dir.beat.st.tag', { tag: t(tagKey(beat.when.tag)) })
      if (beat.when.kind === 'place') return t('dir.beat.st.place', { place: beat.when.place })
      return t('dir.beat.st.manual')
    case 'due':
      return n > 0 ? t('dir.beat.st.dueWait', { n }) : t('dir.beat.st.due', { max: boundaryWait })
    case 'queued': return t('dir.beat.st.queued')
    case 'delivered': return t(beat.result === 'mentioned' ? 'dir.beat.st.mentioned' : beat.result === 'sent' ? 'dir.beat.st.sent' : 'dir.beat.st.came')
    case 'skipped': return t('dir.beat.st.skipped')
    case 'failed': return t('dir.beat.st.failed')
    default: return t('dir.beat.st.behind')
  }
}

/** The hold reason of a beat in words, "" when it is not held. */
export function beatHoldText(t: Tr, beat: DirectionBeat): string {
  return beat.hold === 'off' ? t('dir.beat.hold.off') : beat.hold === 'lock' ? t('dir.beat.hold.lock') : beat.hold === 'explicit' ? t('dir.beat.hold.explicit') : ''
}

/** The colour of a status dot (a token class); the words beside it carry the meaning. */
export function beatDot(status: DirectionBeat['status']): string {
  return status === 'due' || status === 'queued' ? 'bg-cta' : status === 'delivered' ? 'bg-emerald-500' : status === 'failed' ? 'bg-destructive' : status === 'waiting' ? 'bg-muted-foreground' : 'bg-border'
}

/** Why "Fire now" cannot be used for a beat, as a message key, or null. A finished beat has no button at all. */
export function beatFireBlockedKey(state: DirectionState): MsgKey | null {
  if (!state.chat.on) return 'dir.fire.off'
  if (state.chat.lock) return 'dir.fire.locked'
  if (state.scene.source === 'none') return 'dir.fire.unknown'
  return null
}

export const BEAT_FINISHED: DirectionBeat['status'][] = ['delivered', 'failed', 'skipped']

export function blankDraft(): BeatDraft {
  return { text: '', who: [], when: { kind: 'replies', n: 3 }, wait: true, skipped: false }
}

/** A beat as the editor starts: the fields the plugin takes, none of its own. */
export function draftOf(beat: DirectionBeat): BeatDraft {
  return { id: beat.id, text: beat.text, who: [...beat.who], when: { ...beat.when } as DirectionBeatWhen, wait: beat.wait, skipped: beat.status === 'skipped' }
}

/** Changing the "When" kind gives the new kind its first value. */
export function draftWhenKind(d: BeatDraft, kind: DirectionBeatKind, tags: readonly DirectionTag[]): BeatDraft {
  if (d.when.kind === kind) return d
  const when: DirectionBeatWhen = kind === 'replies' ? { kind, n: 3 } : kind === 'tag' ? { kind, tag: tags[0] ?? 'break' } : kind === 'place' ? { kind, place: '' } : { kind }
  return { ...d, when }
}

/** Why the beat cannot be saved yet, as a message key, or null. */
export function draftIssue(d: BeatDraft): MsgKey | null {
  if (!d.text.trim()) return 'dir.beat.issue.text'
  if (d.when.kind === 'place' && !d.when.place.trim()) return 'dir.beat.issue.place'
  return null
}

/** The draft as the plugin takes it: trimmed, the number and the place kept inside the plugin's limits, no server fields. */
export function cleanDraft(d: BeatDraft): BeatDraft {
  const w = d.when
  const when: DirectionBeatWhen =
    w.kind === 'replies' ? { kind: 'replies', n: Math.min(BEAT_REPLIES_MAX, Math.max(0, Math.round(w.n) || 0)) }
    : w.kind === 'place' ? { kind: 'place', place: w.place.trim().slice(0, BEAT_PLACE_MAX) }
    : w.kind === 'tag' ? { kind: 'tag', tag: w.tag }
    : { kind: 'manual' }
  return { ...(d.id ? { id: d.id } : {}), text: d.text.trim().slice(0, BEAT_TEXT_MAX), who: d.who, when, wait: d.wait, skipped: d.skipped }
}

/** The whole list as drafts (what goes back with PUT). */
export function planDrafts(state: DirectionState): BeatDraft[] {
  return (state.plan?.beats ?? []).map(draftOf)
}

/** The list after a beat was saved: replaced when it has an id, else added at the end. */
export function planWithBeat(list: BeatDraft[], d: BeatDraft): BeatDraft[] {
  const c = cleanDraft(d)
  return c.id && list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c]
}

export function planWithout(list: BeatDraft[], id: string): BeatDraft[] {
  return list.filter((x) => x.id !== id)
}

export function planWithSkip(list: BeatDraft[], id: string, skipped: boolean): BeatDraft[] {
  return list.map((x) => (x.id === id ? { ...x, skipped } : x))
}

/** The list with a beat one place up (-1) or down (1); the ends stay. */
export function planMoved(list: BeatDraft[], id: string, delta: -1 | 1): BeatDraft[] {
  const i = list.findIndex((x) => x.id === id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= list.length) return list
  const out = list.filter((_, k) => k !== i)
  out.splice(j, 0, list[i] as BeatDraft)
  return out
}
