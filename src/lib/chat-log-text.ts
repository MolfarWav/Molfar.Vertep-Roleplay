/**
 * A chat log kept as plain text (an old campaign, a transcript from another app) read into messages (Molfar.Vertep#291).
 *
 * The shape it understands is `Name: what they said`, one message from the label to the next label; a line without a label
 * continues the message above it. A label may carry a time before it (`[12:30] Ada: ...`, `12:30 - Ada: ...`, `(12:30) Ada:`)
 * and may be bold (`**Ada:** ...`). A line is taken for a label only when the name appears often enough to be a speaker
 * (at least twice, or it is one of two names the text has), so a sentence like "Note: bring a lamp" inside a message does not
 * start a new one. Nothing here talks to the engine: the lines it returns are the public chat-line shape the importer already reads.
 */

export interface LogMessage {
  speaker: string
  text: string
}
export interface LogSpeaker {
  name: string
  count: number
}
export interface ParsedLog {
  messages: LogMessage[]
  speakers: LogSpeaker[]
}

/** The most text read (characters) and messages kept: a guard for a paste, not a limit anyone meets by writing. */
export const LOG_MAX_CHARS = 4_000_000
export const LOG_MAX_MESSAGES = 20_000

const STAMP = /^\s*(?:\[[^\]\n]{1,40}\]|\([^)\n]{1,40}\)|\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AaPp][Mm])?\s*[-–—]?)\s*/
const LABEL = /^\s*(?:\*\*|__|\*|_)?([^\s:：\[\]*_#>][^:：\n*_]{0,38}?)(?:\*\*|__|\*|_)?\s*[:：]\s*(?:\*\*|__)?\s*(.*)$/

/** A label, as {name, rest}, from one line; null when the line does not start with one. */
function labelOf(line: string): { name: string; rest: string } | null {
  let s = line
  // at most two stamps in front ("[2024-01-02] [12:30] Ada: hi")
  for (let i = 0; i < 2; i++) {
    const m = STAMP.exec(s)
    if (!m || m[0].length === 0) break
    // a bracket that is the whole label ("[Ada]: hi" is read below) stays; only stamps with a digit go
    if (!/\d/.test(m[0])) break
    s = s.slice(m[0].length)
  }
  const m = LABEL.exec(s)
  if (!m) return null
  const name = m[1].replace(/\s+/g, ' ').trim()
  if (!name || name.length > 40) return null
  if (/https?$/i.test(name) || /^https?\b/i.test(name)) return null
  // a sentence is no name: more than four words, or it ends like one
  if (name.split(' ').length > 4 || /[.!?,;]$/.test(name)) return null
  // a bare number or time is no name either
  if (/^[\d\s:.,/-]+$/.test(name)) return null
  return { name, rest: m[2] ?? '' }
}

/** Read a plain-text chat log. An empty result (no messages) means the text has no `Name: text` shape. */
export function parseChatLog(input: string): ParsedLog {
  const text = String(input ?? '').slice(0, LOG_MAX_CHARS).replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const lines = text.split('\n')
  // first pass: how often each label starts a line (compared without case)
  const seen = new Map<string, { name: string; count: number }>()
  const labels: Array<{ name: string; rest: string } | null> = lines.map((l) => labelOf(l))
  for (const l of labels) {
    if (!l) continue
    const k = l.name.toLowerCase()
    const e = seen.get(k)
    if (e) e.count++
    else seen.set(k, { name: l.name, count: 1 })
  }
  // a speaker is a label that comes at least twice. With fewer than two such labels the text is short or lopsided: when it has
  // three labels at most they all count (a short exchange), more than that and the rare ones are taken for text ("Note: ...")
  const all = [...seen.values()]
  const frequent = all.filter((e) => e.count >= 2)
  const accepted = new Set((frequent.length >= 2 ? frequent : all.length <= 3 ? all : frequent).map((e) => e.name.toLowerCase()))
  if (accepted.size < 1) return { messages: [], speakers: [] }

  const messages: LogMessage[] = []
  let cur: LogMessage | null = null
  const flush = () => {
    if (cur) {
      cur.text = cur.text.replace(/\n{3,}/g, '\n\n').trim()
      if (cur.text) messages.push(cur)
    }
    cur = null
  }
  for (let i = 0; i < lines.length; i++) {
    const l = labels[i]
    if (l && accepted.has(l.name.toLowerCase())) {
      flush()
      if (messages.length >= LOG_MAX_MESSAGES) break
      cur = { speaker: seen.get(l.name.toLowerCase())!.name, text: l.rest }
    } else if (cur) {
      cur.text += '\n' + lines[i]
    }
    // text before the first label has no speaker and is dropped
  }
  flush()

  const counts = new Map<string, LogSpeaker>()
  for (const m of messages) {
    const e = counts.get(m.speaker)
    if (e) e.count++
    else counts.set(m.speaker, { name: m.speaker, count: 1 })
  }
  const speakers = [...counts.values()].sort((a, b) => b.count - a.count)
  // one speaker alone is no conversation: the importer would have nobody to answer
  if (speakers.length < 2) return { messages: [], speakers: [] }
  return { messages, speakers }
}

/** The public chat-line shape the importer reads (`POST /import/batch` `chats[].lines`): `me` is the player's speaker. */
export function toChatLines(messages: LogMessage[], me: string, now = Date.now()): Array<{ name: string; is_user: boolean; mes: string; send_date: string }> {
  const start = now - messages.length * 1000
  return messages.map((m, i) => ({
    name: m.speaker,
    is_user: m.speaker.toLowerCase() === me.toLowerCase(),
    mes: m.text,
    send_date: new Date(start + i * 1000).toISOString(),
  }))
}

/**
 * How many model calls the memory rebuild of an imported log will make: Litopys writes one chapter per closed scene, and
 * a chat with no Dashboard data is cut every `maxMessages` messages (Litopys `findScenes`); the last stretch stays open until
 * the chat goes on. Never less than 0.
 */
export function sceneCalls(messageCount: number, maxMessages = 40): number {
  const max = Math.max(10, Math.min(200, Math.round(maxMessages) || 40))
  return Math.max(0, Math.floor(messageCount / max))
}
