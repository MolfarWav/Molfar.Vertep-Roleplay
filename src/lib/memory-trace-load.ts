// Loads the three answers the Memory view needs (#184 P6). Kept apart from memory-trace.ts, which is pure.
import { j } from '@/lib/engine'
import type { DashResponse } from '@/lib/dashboard'
import { bankFor, type BankFile, type LitopysTrace, type MemoryTrace, type TraceReply, type WorkerSkips } from '@/lib/memory-trace'

export async function loadMemoryTrace(chatId: string, back = 0): Promise<MemoryTrace> {
  const id = encodeURIComponent(chatId)
  const [lit, bank, dash] = await Promise.allSettled([
    j<{ trace: LitopysTrace | null; replies?: TraceReply[]; back?: number; worker?: WorkerSkips | null }>(`/litopys/trace?chatId=${id}&back=${back}`),
    j<{ trace: BankFile }>(`/databank/trace?chatId=${id}`),
    j<DashResponse>(`/dashboard/state?chatId=${id}&view=1`),
  ])
  const view = dash.status === 'fulfilled' ? dash.value : null
  const kept = view?.view?.keptOut ?? null
  const litopys = lit.status === 'fulfilled' ? lit.value.trace ?? null : null
  const bankFile = bank.status === 'fulfilled' ? bank.value.trace ?? null : null
  return {
    replies: lit.status === 'fulfilled' ? lit.value.replies ?? [] : [],
    back: lit.status === 'fulfilled' ? lit.value.back ?? 0 : 0,
    worker: lit.status === 'fulfilled' ? lit.value.worker ?? null : null,
    litopys,
    databank: bankFor(bankFile, litopys ? litopys.at : null, back),
    // the Dashboard and the leak check only know the newest reply
    leaks: view?.leaks ?? [],
    keptOut: kept && (kept.user || kept.absent) ? kept : null,
    unavailable: lit.status === 'rejected',
  }
}
