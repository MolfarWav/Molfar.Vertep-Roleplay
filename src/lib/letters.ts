// Letters from cards (#72): the unread letters and the switch, read from the letters plugin, and the pass that
// asks it for a new one. The plugin owns the limits (per day, per card) and the model call; here we only choose
// who to ask and never ask too often. Nothing here runs while the switch is off.
import { create } from 'zustand'
import { toast } from 'sonner'
import { j } from '@/lib/engine'
import { t } from '@/lib/i18n'
import { resolveLanguage } from '@/lib/i18n'
import { useApp } from '@/lib/store'
import { announceFailures, setFailed, useInbox } from '@/lib/attention'
import { soulsOf } from '@/lib/soul'
import {
  candidatesFor, CARD_REFUSALS, DEFAULT_LETTERS_CONFIG, isFailing, lettersOf, MODEL_FAILURES, nextStreak, NO_STREAK, PASS_MAX_ASKS, STOPS_PASS,
  type FailStreak, type Letter, type LettersConfig,
} from '@/lib/letters-core'

interface LettersState {
  letters: Letter[]
  config: LettersConfig
  /** cards that must not write again */
  muted: string[]
  /** the model that will write, '' when there is none */
  model: string
  /** where that model comes from: config (picked here), litopys, app (the app's default) or none */
  source: string
  /** the plugin answered at least once (a missing plugin leaves everything empty and silent) */
  available: boolean
  /** the passes keep failing on the model (shown in the inbox and in the dialog), null when they do not */
  failing: FailStreak | null
}

export const useLetters = create<LettersState>(() => ({ letters: [], config: DEFAULT_LETTERS_CONFIG, muted: [], model: '', source: 'none', available: false, failing: null }))


interface ListBody { letters?: unknown; config?: Partial<LettersConfig>; muted?: unknown; model?: unknown; source?: unknown }

function apply(body: ListBody | null) {
  if (!body) return
  const c = body.config ?? {}
  useLetters.setState({
    letters: lettersOf(body),
    config: { ...DEFAULT_LETTERS_CONFIG, ...c },
    muted: Array.isArray(body.muted) ? body.muted.filter((x): x is string => typeof x === 'string') : [],
    model: typeof body.model === 'string' ? body.model : '',
    source: typeof body.source === 'string' ? body.source : 'none',
    available: true,
  })
  // a failure kept from the last session shows at once, not only after the next pass; switched off, it goes
  if (useLetters.getState().config.enabled) syncLettersFailure()
  else resetLettersFailure()
}

/** Read the unread letters and the settings. A missing plugin or a stopped engine leaves the last state. */
export async function loadLetters() {
  try {
    apply(await j<ListBody>('/letters'))
  } catch {
    // no letters plugin: nothing to show
  }
}

export async function saveLettersConfig(patch: Partial<LettersConfig>) {
  const prev = useLetters.getState().config
  useLetters.setState({ config: { ...prev, ...patch } })
  // the player acted on the model or switched the feature off: the old failures say nothing about what comes next
  if (patch.model !== undefined || patch.enabled === false) resetLettersFailure()
  try {
    const r = await j<{ config: LettersConfig; model: string; source?: string }>('/letters/config', { method: 'PUT', body: JSON.stringify(patch) })
    useLetters.setState({ config: { ...DEFAULT_LETTERS_CONFIG, ...r.config }, model: r.model ?? '', source: r.source ?? 'none' })
  } catch {
    useLetters.setState({ config: prev })
    toast.error(t('letters.saveFailed', resolveLanguage(useApp.getState().settings.language)))
  }
}

/** "Do not write again" for one card (or "Allow again"); muting also takes its unread letters away. */
export async function muteCard(characterId: string, muted: boolean) {
  try {
    await j('/letters/mute', { method: 'POST', body: JSON.stringify({ characterId, muted }) })
  } catch {
    toast.error(t('letters.saveFailed', resolveLanguage(useApp.getState().settings.language)))
  }
  await loadLetters()
}

/** Delete letters (the card's cooldown stays, so it does not write again at once). */
export async function dismissLetters(ids: string[]) {
  if (!ids.length) return
  const drop = new Set(ids)
  useLetters.setState((s) => ({ letters: s.letters.filter((l) => !drop.has(l.id)) }))
  try {
    await j('/letters/dismiss', { method: 'POST', body: JSON.stringify({ ids }) })
  } catch {
    await loadLetters()
  }
}

// ---------- the pass ----------

const NOASK_KEY = 'rp.letters.noask'
const NOASK_MS = 24 * 60 * 60_000
const SOUL_NOASK_MS = 14 * 24 * 60 * 60_000
let noaskMem: Record<string, number> = {}

function readNoask(): Record<string, number> {
  try {
    const raw = localStorage.getItem(NOASK_KEY)
    if (raw) return JSON.parse(raw) as Record<string, number>
  } catch {
    // storage unavailable: memory only
  }
  return noaskMem
}

function writeNoask(map: Record<string, number>) {
  const now = Date.now()
  noaskMem = Object.fromEntries(Object.entries(map).filter(([, until]) => until > now).slice(-500))
  try {
    localStorage.setItem(NOASK_KEY, JSON.stringify(noaskMem))
  } catch {
    // storage unavailable: memory only
  }
}

// ---------- repeated model failures (#198) ----------
// A broken model used to be silent here. Three passes in a row that wanted a letter and failed on the model put
// one failure row in the inbox; a letter that arrives, a new model or switching letters off takes it away.

const STREAK_KEY = 'rp.letters.fails'
let streakMem: FailStreak = NO_STREAK

function readStreak(): FailStreak {
  try {
    const raw = localStorage.getItem(STREAK_KEY)
    if (raw) return { ...NO_STREAK, ...(JSON.parse(raw) as Partial<FailStreak>) }
  } catch {
    // storage unavailable: memory only
  }
  return streakMem
}

function writeStreak(s: FailStreak) {
  streakMem = s
  try {
    localStorage.setItem(STREAK_KEY, JSON.stringify(s))
  } catch {
    // storage unavailable: memory only
  }
}

/** Show the stored streak in the inbox, or take it away. */
function syncLettersFailure() {
  const s = readStreak()
  const failing = isFailing(s)
  useLetters.setState({ failing: failing ? s : null })
  setFailed('letters', failing ? [{ worker: 'letters', ref: 'letters', title: '', code: s.code, message: s.message, at: s.since }] : [])
  if (failing) announceFailures()
}

export function resetLettersFailure() {
  if (readStreak().n === 0 && !useLetters.getState().failing) return
  writeStreak(NO_STREAK)
  syncLettersFailure()
}

let passing = false

/**
 * One pass: ask about the cards that are due until one writes, the plugin stops the pass (switch off, the day's
 * limit, no model) or PASS_MAX_ASKS cards were asked. Returns the letter written, or null.
 */
export async function runLettersPass(now = Date.now()): Promise<Letter | null> {
  if (passing) return null
  passing = true
  try {
    await loadLetters()
    const { config, letters, muted, available } = useLetters.getState()
    if (!available || !config.enabled) {
      resetLettersFailure()
      return null
    }
    syncLettersFailure()
    const app = useApp.getState()
    const noask = readNoask()
    const skip = new Set<string>([...muted, ...letters.map((l) => l.characterId), ...Object.keys(noask).filter((id) => (noask[id] ?? 0) > now)])
    const list = candidatesFor({ characters: app.characters, chats: app.chats, now, config, skip, hasSoul: (id) => { const c = app.characters.find((x) => x.id === id); return !!c && Object.keys(soulsOf(c)).length > 0 } })
    const lang = resolveLanguage(app.settings.language)
    let asks = 0
    let failure: { code: string; message: string } | null = null
    // a pass that asked nobody leaves the streak alone; a letter clears it; a model refusal adds to it
    const settle = (written: boolean) => {
      writeStreak(nextStreak(readStreak(), { written, failure }, now))
      syncLettersFailure()
    }
    for (const cand of list) {
      if (asks++ >= PASS_MAX_ASKS) break
      let r: { ok: boolean; reason?: string; message?: string; letter?: Letter }
      try {
        r = await j('/letters/write', { method: 'POST', body: JSON.stringify({ ...cand, lang }) })
      } catch {
        break
      }
      if (r.ok && r.letter) {
        settle(true)
        await loadLetters()
        const name = useApp.getState().characters.find((c) => c.id === cand.characterId)?.name ?? '…'
        toast(t('letters.arrived', lang, { name }), {
          duration: 12_000,
          action: { label: t('attn.open', lang), onClick: () => { useInbox.getState().setFilter('letter'); useInbox.getState().setOpen(true) } },
        })
        return r.letter
      }
      const reason = r.reason ?? 'error'
      if (MODEL_FAILURES.has(reason)) failure = { code: reason, message: String(r.message ?? '').slice(0, 200) }
      if (CARD_REFUSALS.has(reason)) {
        writeNoask({ ...noask, [cand.characterId]: now + (reason === 'has-soul' ? SOUL_NOASK_MS : NOASK_MS) })
        Object.assign(noask, readNoask())
      }
      if (STOPS_PASS.has(reason)) break
    }
    settle(false)
    return null
  } finally {
    passing = false
  }
}
