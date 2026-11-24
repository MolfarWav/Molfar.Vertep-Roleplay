// The RPG hand-over (plugins/rpg, Molfar.Vertep#486) as the app sees it: gather the party, ask for opponents, write the encounter,
// read the results the RPG app leaves. An app without the plugin answers 404; everything here then fails with a plain reason.

import { create } from 'zustand'
import { j } from './engine'
import type { ID } from './types'

export const ARCHETYPES = ['balanced', 'brute', 'scout', 'archer', 'caster', 'tank'] as const
export type Archetype = (typeof ARCHETYPES)[number]
export const SKINS = ['fantasy', 'cyberpunk', 'superhero', 'postapoc', 'modern', 'horror'] as const
export type Skin = (typeof SKINS)[number]

export interface FightFoe {
  name: string
  description: string
  level: number | null
  archetype: Archetype
}

export interface FightMember {
  id: string
  name: string
  hero: boolean
  role: string
}

export interface FightResult {
  encounterId: string
  outcome: 'won' | 'lost' | 'fled' | 'aborted'
  defeatApplied: number | null
  party: { id: string; name: string; hp: number; hpMax: number; fled: boolean; dead: boolean; injuries: { zone: string; severity: string }[] }[]
  loot: { name: string }[]
  summary: string
  rounds: number
}

export interface FightResultRow {
  id: string
  result?: FightResult
  note?: string
  error?: string
  seen: boolean
}

export async function fetchParty(chatId: ID): Promise<{ party: FightMember[]; scene: string; place: string }> {
  return j(`/rpg/party?chatId=${encodeURIComponent(chatId)}`)
}

export async function proposeFoes(chatId: ID): Promise<{ ok: true; foes: FightFoe[] } | { ok: false; error: string; code?: string }> {
  return j('/rpg/foes', { method: 'POST', body: JSON.stringify({ chatId }) })
}

export async function sendEncounter(body: { chatId: ID; foes: FightFoe[]; stakes: { flee: boolean; defeat: number }; skin: Skin; language: 'en' | 'uk'; place?: string }): Promise<{ ok: boolean; id?: string; error?: string }> {
  return j('/rpg/encounter', { method: 'POST', body: JSON.stringify(body) })
}

export async function fetchResults(chatId: ID): Promise<{ state: 'ready' | 'closed'; results: FightResultRow[] }> {
  try {
    return await j(`/rpg/results?chatId=${encodeURIComponent(chatId)}`)
  } catch {
    return { state: 'closed', results: [] }
  }
}

export async function markSeen(id: string): Promise<void> {
  await j('/rpg/seen', { method: 'POST', body: JSON.stringify({ id }) }).catch(() => undefined)
}

/** Which chat an encounter belongs to (the shell hands the app only its id). */
export async function encounterChat(id: string): Promise<{ chatId: string; language: 'en' | 'uk' } | null> {
  try {
    return await j(`/rpg/encounter?id=${encodeURIComponent(id)}`)
  } catch {
    return null
  }
}

/** What the RPG hand-over asks the chat screen to show: the Fight dialog, or the result card of one encounter. Never saved. */
interface RpgUi {
  fightOpen: boolean
  resultId: string | null
  setFightOpen: (v: boolean) => void
  openResult: (id: string | null) => void
}
export const useRpgUi = create<RpgUi>((set) => ({
  fightOpen: false,
  resultId: null,
  setFightOpen: (fightOpen) => set({ fightOpen }),
  openResult: (resultId) => set({ resultId }),
}))
