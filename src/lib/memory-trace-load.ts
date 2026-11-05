// Loads the three answers the Memory view needs (#184 P6). Kept apart from memory-trace.ts, which is pure.
import { j } from '@/lib/engine'
import type { DashResponse } from '@/lib/dashboard'
import type { DatabankTrace, LitopysTrace, MemoryTrace } from '@/lib/memory-trace'

export async function loadMemoryTrace(chatId: string): Promise<MemoryTrace> {
  const id = encodeURIComponent(chatId)
  const [lit, bank, dash] = await Promise.allSettled([
    j<{ trace: LitopysTrace | null }>(`/litopys/trace?chatId=${id}`),
    j<{ trace: DatabankTrace | null }>(`/databank/trace?chatId=${id}`),
    j<DashResponse>(`/dashboard/state?chatId=${id}&view=1`),
  ])
  const view = dash.status === 'fulfilled' ? dash.value : null
  const kept = view?.view?.keptOut ?? null
  return {
    litopys: lit.status === 'fulfilled' ? lit.value.trace ?? null : null,
    databank: bank.status === 'fulfilled' ? bank.value.trace ?? null : null,
    leaks: view?.leaks ?? [],
    keptOut: kept && (kept.user || kept.absent) ? kept : null,
    unavailable: lit.status === 'rejected',
  }
}

