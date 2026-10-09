// Types and fetchers for the Library (Litopys plugin routes: GET /litopys/chats,
// GET /litopys/chat?chatId=, config, rebuild, and the M4a editing routes).
import { ApiError, j } from '@/lib/engine'

export interface LitWorker {
  lastRunAt: number
  ok: boolean
  /** The message ids of the last scene; the numbers are 1-based, 0 = no longer in the chat. */
  lastScene?: { from: string; to: string; fromNo?: number; toNo?: number }
  error?: string
  ms?: number
  /** After a failure: epoch ms before which the worker does not try this chat again. */
  retryAt?: number
  /** M4a+: closed scenes still waiting for a chapter (in the chat list: as of the last tick). */
  next?: number
  /**
   * working: a request is out (inFlight); retry: failed, waits for retryAt; idle: nothing left;
   * queued: work left, the worker is on another chat or the next tick is due; stalled: work left
   * and nothing moved for 3 minutes or more (the model or the engine may be down).
   */
  state?: LitWorkerState
  /** stalled only: ms since anything moved. */
  stalledFor?: number
  /** When the last chapter was written. */
  lastProgressAt?: number
  /** The request in flight: the scene's message ids and 1-based numbers, and since when (epoch ms). */
  inFlight?: { from: string; to: string; fromNo: number; toNo: number; since: number }
  /** true while this is the worker of a rebuild in progress. */
  rebuild?: boolean
}

export type LitWorkerState = 'working' | 'retry' | 'idle' | 'queued' | 'stalled'

export interface LitChatItem {
  id: string
  title: string
  /** The character's or the group's name; '' when unknown. */
  name: string
  /** The chat this one was forked from (M4c map), null when it is not a fork. */
  parentChatId: string | null
  /** 0.9.2: the earlier chat this one continues (a link the user set; it gets that story as backstory), null when none. */
  continues: string | null
  updatedAt: number
  hasData: boolean
  chapters: number
  /** Active facts only. */
  facts: number
  /** Pending proposals only. */
  proposals: number
  worker: LitWorker | null
}

export interface LitChapter {
  id: string
  /** message ids of its range (M4d: "Open the messages") */
  from: string
  to: string
  label: string
  text: string
  kind: 'scene' | 'part' | 'merged'
  /** How many messages it covers. */
  count: number
  /** 1-based message numbers of the range; 0 when the messages are gone. */
  fromNo: number
  toNo: number
  place?: string
  at: number
  stale: boolean
  edited: boolean
}

/** M4d: neighbouring older chapters merged into one summary. The insert takes a fresh arc in place of its chapters. */
export interface LitArc {
  id: string
  /** member chapter ids, in story order */
  chapterIds: string[]
  label: string
  text: string
  /** 1-based message numbers from the first member's start to the last member's end; 0 = gone */
  fromNo: number
  toNo: number
  at: number
  /** a member changed since the merge: the insert uses the chapters until the worker merges it again */
  stale: boolean
  model?: string
}

/** 'ask': the Library offers a merge; 'auto': Litopys merges by itself; 'off': no new arcs. */
export type LitArcMode = 'ask' | 'auto' | 'off'

/** A run of chapters: ids and the 1-based message numbers it spans. */
export interface LitArcRun {
  chapterIds: string[]
  chapters: number
  fromNo: number
  toNo: number
}

export interface LitArcState {
  mode: LitArcMode
  /** newest chapters before the cut kept whole */
  keep: number
  /** tokens the older chapters may take before a merge is offered */
  threshold: number
  /** tokens the older chapters take now (an arc counted once, in place of its chapters) */
  tokens: number
  /** how many chapters before the cut are "older" (all but the newest keep) */
  older: number
  /** mode ask, over the threshold, not snoozed, nothing queued: the notice offers this run */
  suggested: (LitArcRun & { fromChapter: string; toChapter: string; tokens: number }) | null
  /** the merge the user asked for, waiting for the worker */
  queued: LitArcRun | null
  /** the arc request in flight */
  working: { chapters: number; fromNo: number; toNo: number; since: number; rewrite: boolean } | null
  /** the last arc request failed; the worker tries again after retryAt */
  error: { error: string; retryAt: number } | null
  /** "Not now" holds until the older part grows by another threshold */
  snoozed: boolean
}

/** A scene the user deleted and kept out of the record (1-based message numbers). */
export interface LitSkipped {
  fromNo: number
  toNo: number
}

export type LitFactType = 'event' | 'trait' | 'change' | 'relation' | 'world' | 'plan'
export type LitFactWeight = 'everyday' | 'important' | 'key'
export type LitFactStatus = 'active' | 'retired' | 'superseded'

export interface LitFact {
  id: string
  text: string
  subject: string
  knownBy: string[] | 'all'
  type: LitFactType
  weight: LitFactWeight
  pinned: boolean
  pinProposed?: boolean
  status: LitFactStatus
  supersedes?: string
  /** chapter | user | dashboard | migrated | merge */
  origin?: string
  /** The user changed it: the worker only proposes changes to it. */
  edited?: boolean
  /** Retired by a merge into this fact. */
  mergedInto?: string
  /** A merged fact: the facts it replaced. */
  merges?: string[]
  /** Where it came from: message ids and the chapter id (null for user facts). */
  src?: { from: string | null; to: string | null; chapter?: string }
  at: number
  updatedAt: number
}

export interface LitProposal {
  id: string
  op: 'merge' | 'retire' | 'rewrite' | 'pin'
  targets: string[]
  text?: string
  reason?: string
  status: LitProposalStatus
  /** The chapter whose writing produced it. */
  chapter?: string
  at?: number
  settledAt?: number
}

export type LitProposalStatus = 'pending' | 'accepted' | 'rejected' | 'expired'

export type LitActivityKind =
  | 'fact.add' | 'fact.edit' | 'fact.pin' | 'fact.unpin' | 'fact.retire' | 'fact.restore' | 'fact.delete'
  | 'chapter.edit' | 'chapter.rewrite' | 'chapter.delete' | 'chapter.write'
  | 'proposal.accept' | 'proposal.reject'
  | 'worker.fail' | 'import' | 'notes.move' | 'rebuild.start' | 'rebuild.finish'
  | 'arc.ask' | 'arc.write' | 'arc.rewrite' | 'arc.delete' | 'arc.drop' | 'arc.fail'

/**
 * One line of the Activity tab (newest LAST in the array). text is an English sentence (fallback);
 * data holds the values for the UI's own words, by kind:
 * fact.*: { text } · chapter.edit / chapter.rewrite: { label } · chapter.delete: { label, keepGone } ·
 * chapter.write: { label, from, to, facts, proposals, rewrite } · proposal.*: { op, text } ·
 * worker.fail: { error } · import / notes.move: { n } · rebuild.finish: { chapters, facts } · rebuild.start: none ·
 * arc.ask: { chapters } · arc.write: { label, chapters, from, to, rewrite } · arc.rewrite / arc.delete / arc.drop: { label } ·
 * arc.fail: { error }.
 */
export interface LitActivity {
  at: number
  by: 'user' | 'worker' | 'rebuild' | 'sweep' | 'notes'
  kind: LitActivityKind | string
  text: string
  ids: string[]
  data?: Record<string, string | number | boolean>
}

export interface LitChat {
  chatId: string
  title: string
  name: string
  /** Messages on the chat's active line. */
  messages: number
  hasData: boolean
  migrated: boolean
  chapters: LitChapter[]
  facts: LitFact[]
  proposals: LitProposal[]
  /** The scene in progress (never compressed); sceneFromNo is 1-based, 0 = unknown. */
  scene: { openFrom: string | null; label?: string }
  sceneFromNo: number
  worker: LitWorker & { facts?: { got: number; added: number; skipped: number } } | null
  cut: { count: number; upTo: string | null }
  /** arcs: M4d, missing in inserts made before arcs */
  lastInsert: { at: number; tokens: number; facts: number; chapters: number; arcs?: number; cut: number } | null
  rebuildScenes: number
  rebuilding: { chapters: number; startedAt: number } | null
  /** M4a */
  activity: LitActivity[]
  skipped: LitSkipped[]
  pinLimit: number
  rev: number
  /** M4d */
  arcs: LitArc[]
  arcState: LitArcState
}

export interface LitConfig {
  enabled: boolean
  model: string
  recentMessages: number
  scene: { minMessages: number; maxMessages: number }
  pinLimit: number
  insert: boolean
  budget: number
  /** 0.9.2: the most a linked earlier chat's story may take as backstory, 0 = none */
  linkBudget: number
  chapter: string
  /** M4d arcs; arcThreshold 0 = twice the budget */
  arcMode: LitArcMode
  arcKeep: number
  arcThreshold: number
  arcSizeMin: number
  arcSizeMax: number
  arcWords: number
  arc: string
}

export const fetchLitChats = () => j<{ items: LitChatItem[]; total: number }>('/litopys/chats')
export const fetchLitChat = (chatId: string) => j<LitChat>(`/litopys/chat?chatId=${encodeURIComponent(chatId)}`)
export const fetchLitConfig = () => j<LitConfig>('/litopys/config')
export const putLitConfig = (patch: Record<string, unknown>) => j<LitConfig>('/litopys/config', { method: 'PUT', body: JSON.stringify(patch) })
export const deleteLitPrompts = () => j<{ ok: boolean }>('/litopys/config/prompts', { method: 'DELETE' })
export const rebuildLitChat = (chatId: string) => j<{ scenes: number }>('/litopys/rebuild', { method: 'POST', body: JSON.stringify({ chatId }) })

// ---------- M4a editing: every call answers the whole chat view ----------
const post = <T>(path: string, body: Record<string, unknown>) => j<T>(path, { method: 'POST', body: JSON.stringify(body) })

export interface LitFactFields {
  text?: string
  subject?: string
  knownBy?: string[] | 'all'
  type?: LitFactType
  weight?: LitFactWeight
}

export const addLitFact = (chatId: string, fields: LitFactFields & { text: string }) => post<LitChat>('/litopys/facts', { chatId, op: 'add', ...fields })
export const editLitFact = (chatId: string, id: string, fields: LitFactFields) => post<LitChat>('/litopys/facts', { chatId, op: 'edit', id, ...fields })
/** replace: a pinned fact of the same subject to unpin in the same write (after the pin limit dialog). */
export const pinLitFact = (chatId: string, id: string, replace?: string) => post<LitChat>('/litopys/facts', { chatId, op: 'pin', id, ...(replace ? { replace } : {}) })
export const unpinLitFact = (chatId: string, id: string) => post<LitChat>('/litopys/facts', { chatId, op: 'unpin', id })
export const retireLitFact = (chatId: string, id: string) => post<LitChat>('/litopys/facts', { chatId, op: 'retire', id })
export const restoreLitFact = (chatId: string, id: string) => post<LitChat>('/litopys/facts', { chatId, op: 'restore', id })
export const deleteLitFact = (chatId: string, id: string) => post<LitChat>('/litopys/facts', { chatId, op: 'delete', id })

export const editLitChapter = (chatId: string, id: string, fields: { label?: string; text?: string }) => post<LitChat>('/litopys/chapters', { chatId, op: 'edit', id, ...fields })
export const rewriteLitChapter = (chatId: string, id: string) => post<LitChat>('/litopys/chapters', { chatId, op: 'rewrite', id })
/** keepGone: the worker never writes a chapter for these messages again; they still leave the prompt. */
export const deleteLitChapter = (chatId: string, id: string, keepGone: boolean) => post<LitChat>('/litopys/chapters', { chatId, op: 'delete', id, keepGone })

/** M4d arcs. merge: from/to = the first and last chapter ids of the run (a suggestion's fromChapter/toChapter). */
export const mergeLitArc = (chatId: string, from: string, to: string) => post<LitChat>('/litopys/arcs', { chatId, op: 'merge', from, to })
/** Cancels a queued merge (also holds the offer like Not now). */
export const cancelLitArc = (chatId: string) => post<LitChat>('/litopys/arcs', { chatId, op: 'cancel' })
/** "Not now": the offer comes back when the older chapters grow by another threshold. */
export const snoozeLitArc = (chatId: string) => post<LitChat>('/litopys/arcs', { chatId, op: 'snooze' })
export const rewriteLitArc = (chatId: string, id: string) => post<LitChat>('/litopys/arcs', { chatId, op: 'rewrite', id })
/** The arc goes; its chapters stay and ride the insert again. */
export const deleteLitArc = (chatId: string, id: string) => post<LitChat>('/litopys/arcs', { chatId, op: 'delete', id })

export const acceptLitProposal = (chatId: string, id: string, replace?: string) => post<LitChat>('/litopys/proposals', { chatId, id, op: 'accept', ...(replace ? { replace } : {}) })
export const rejectLitProposal = (chatId: string, id: string) => post<LitChat>('/litopys/proposals', { chatId, id, op: 'reject' })

// ---------- M4d: the original messages ----------
export interface LitMessage {
  id: string
  /** 1-based number on the chat's active line */
  no: number
  role: 'user' | 'char'
  name: string
  text: string
}
export interface LitSearchHit {
  id: string
  no: number
  name: string
  at: number
  /** the text around the match, with … where it was cut */
  snippet: string
  /** the chapter that holds this message, if any */
  chapter: { id: string; label: string; from: string; to: string } | null
}
/** The messages from..to (message ids, as in a chapter or a fact's src). more = the range was longer than shown. */
export const fetchLitMessages = (chatId: string, from: string, to?: string) =>
  j<{ items: LitMessage[]; more: boolean }>(`/litopys/messages?chatId=${encodeURIComponent(chatId)}&from=${encodeURIComponent(from)}${to ? `&to=${encodeURIComponent(to)}` : ''}`)
/** Plain search over the original messages (never the summaries), newest first, 20 hits. */
export const searchLitMessages = (chatId: string, q: string) =>
  j<{ hits: LitSearchHit[] }>(`/litopys/search?chatId=${encodeURIComponent(chatId)}&q=${encodeURIComponent(q)}`)

/** Portraits the user set, by lower-cased name (M4c): they win over a card or persona of the same name. */
export type LitPortraits = Record<string, { name: string; url: string }>
export const fetchLitPortraits = () => j<LitPortraits>('/litopys/portraits')
/** url: a data:image (png/jpeg/webp, small); null removes the user's portrait for that name. */
export const setLitPortrait = (name: string, url: string | null) => post<LitPortraits>('/litopys/portraits', { name, url })

/** The plugin answered 409 "pin limit": the UI opens the pin limit dialog (pinned facts of that subject are in the chat view). */
export const isPinLimit = (e: unknown) => e instanceof ApiError && e.status === 409 && e.message === 'pin limit'
/** 409 "rebuilding": chapters cannot change until the rebuild is done. */
export const isRebuilding = (e: unknown) => e instanceof ApiError && e.status === 409 && e.message === 'rebuilding'
/** Active pinned facts of a subject (case-insensitive), as the plugin counts them for the limit. */
export const pinnedOf = (facts: LitFact[], subject: string) =>
  facts.filter((f) => f.status === 'active' && f.pinned && f.subject.toLowerCase() === subject.toLowerCase())

/** 0.9.2: set the chat this one continues (from = null removes the link). Refused (400) for itself, a missing chat or a loop. */
export const setLitLink = (chatId: string, from: string | null) =>
  post<{ links: Record<string, { from: string; at: number }> }>('/litopys/links', { chatId, from })
