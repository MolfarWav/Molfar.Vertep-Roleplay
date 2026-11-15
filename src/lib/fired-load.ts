// Loads the answers the "What fired" panel needs (#253). Kept apart from fired.ts, which is pure.
import { j } from '@/lib/engine'
import type { FiredBooks, FiredLog, LitFired } from '@/lib/fired'
import { loadMemoryTrace } from '@/lib/memory-trace-load'
import type { MemoryTrace } from '@/lib/memory-trace'

/** One answer: the data (null = the plugin has nothing yet) or `down` when the route did not answer (an older plugin, or it is off). */
export interface Part<T> {
  data: T | null
  down: boolean
}

export interface FiredAll {
  log: Part<FiredLog>
  lit: Part<LitFired>
  /** the chat's lorebooks against the log and the entry vectors (#258, #259); `down` on an older plugin */
  books: Part<FiredBooks>
  trace: MemoryTrace
}

const settled = async <T>(p: Promise<T | null>): Promise<Part<T>> => {
  try {
    return { data: await p, down: false }
  } catch {
    return { data: null, down: true }
  }
}

export async function loadFired(chatId: string): Promise<FiredAll> {
  const id = encodeURIComponent(chatId)
  const [log, lit, books, trace] = await Promise.all([
    settled(j<{ log: FiredLog | null }>(`/fired-log?chatId=${id}`).then((r) => r.log)),
    settled(j<{ log: LitFired | null }>(`/litopys/fired?chatId=${id}`).then((r) => r.log)),
    settled(j<FiredBooks>(`/fired-books?chatId=${id}`)),
    loadMemoryTrace(chatId, 0),
  ])
  return { log, lit, books, trace }
}

/** The numbers the chat header shows: lorebook entries of the last real reply, replies counted. null = no record or an older plugin. */
export async function loadFiredBrief(chatId: string): Promise<{ replies: number; since: number; loreFired: number } | null> {
  try {
    const r = await j<{ brief?: { replies: number; since: number; loreFired: number } }>(`/fired-log?chatId=${encodeURIComponent(chatId)}&brief=1`)
    return r.brief ?? null
  } catch {
    return null
  }
}
