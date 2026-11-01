// The strings of the Sensor tab of the Dashboard settings that say what is set: the "Current setup" chips and the chips
// in the task cards' headers. Pure: the caller passes `t` and plain values, so a test can check them without a DOM.

import type { useT } from '@/hooks/use-t'

export type T = ReturnType<typeof useT>

export interface SensorSummaryInput {
  mode: 'sensor' | 'fast' | 'manual'
  /** '' = the chat's own model */
  sensorModel: string
  insertOn: boolean
  insertTokens: number
  saidOn: boolean
  groupsOn: number
  groupsTotal: number
  /** the plugin offers quest limits */
  hasQuests: boolean
  maxMain: number
  maxThreads: number
}

export function modeChip(t: T, mode: SensorSummaryInput['mode']): string {
  return t(`dash.set.mode.${mode}`)
}

/** "insert on · 80 tokens" or "insert off". */
export function insertChip(t: T, v: Pick<SensorSummaryInput, 'insertOn' | 'insertTokens'>): string {
  return v.insertOn ? t('dash.set.chip.insertOn', { n: v.insertTokens }) : t('dash.set.chip.insertOff')
}

/** "7 of 7 groups". */
export function groupsChip(t: T, v: Pick<SensorSummaryInput, 'groupsOn' | 'groupsTotal'>): string {
  return t('dash.set.chip.groups', { n: v.groupsOn, total: v.groupsTotal })
}

/** "2 main · 4 side quests", or null when the plugin has no quest limits. */
export function questsChip(t: T, v: Pick<SensorSummaryInput, 'hasQuests' | 'maxMain' | 'maxThreads'>): string | null {
  return v.hasQuests ? t('dash.set.chip.quests', { main: v.maxMain, side: v.maxThreads }) : null
}

/** The chips of the "Current setup" card, in order, each with the tone it is drawn in. */
export function summaryChips(t: T, v: SensorSummaryInput): { text: string; tone: 'sky' | 'violet' | 'teal' | 'pink' }[] {
  const out: { text: string; tone: 'sky' | 'violet' | 'teal' | 'pink' }[] = [
    { text: modeChip(t, v.mode), tone: 'sky' },
    { text: v.sensorModel || t('dash.set.chatModel'), tone: 'sky' },
    { text: insertChip(t, v), tone: 'violet' },
    { text: groupsChip(t, v), tone: 'teal' },
  ]
  const quests = questsChip(t, v)
  if (quests) out.push({ text: quests, tone: 'pink' })
  return out
}

/** Value chips of the "How it works" card header: the mode. */
export function howChips(t: T, v: Pick<SensorSummaryInput, 'mode'>): string[] {
  return [modeChip(t, v.mode)]
}

/** Value chips of the "What the model is reminded of" card header. */
export function remindedChips(t: T, v: Pick<SensorSummaryInput, 'insertOn' | 'insertTokens' | 'groupsOn' | 'groupsTotal'>): string[] {
  return [insertChip(t, v), groupsChip(t, v)]
}
