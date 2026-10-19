// Small things the World section shares: a colour per DM level, the number formats and the
// message for a failed run (in the app's language, by the plugin's error code).

import { BookBookmark, Compass, Crown, Prohibit, Skull, Sparkle } from '@phosphor-icons/react'
import { useT } from '@/hooks/use-t'
import type { MsgKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { WorldError, WorldErrorCode, WorldKind, WorldLevel, WorldModelFrom } from '@/lib/world'

export const LEVEL_ICON: Record<WorldLevel, typeof Prohibit> = { off: Prohibit, chronicler: BookBookmark, living: Compass, director: Crown, antagonist: Skull, chaos: Sparkle }

/** One colour per level, as classes that read in both themes: chip, picked radio, icon, dot. */
export const LEVEL_TONE: Record<WorldLevel, { chip: string; picked: string; icon: string; dot: string }> = {
  off: { chip: 'border-border bg-muted text-muted-foreground', picked: 'border-muted-foreground/50 bg-muted', icon: 'text-muted-foreground', dot: 'bg-muted-foreground/50' },
  chronicler: { chip: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300', picked: 'border-sky-500/60 bg-sky-500/10', icon: 'text-sky-600 dark:text-sky-300', dot: 'bg-sky-500' },
  living: { chip: 'border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300', picked: 'border-teal-500/60 bg-teal-500/10', icon: 'text-teal-600 dark:text-teal-300', dot: 'bg-teal-500' },
  director: { chip: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300', picked: 'border-amber-500/60 bg-amber-500/10', icon: 'text-amber-600 dark:text-amber-300', dot: 'bg-amber-500' },
  antagonist: { chip: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300', picked: 'border-red-500/60 bg-red-500/10', icon: 'text-red-600 dark:text-red-300', dot: 'bg-red-500' },
  chaos: { chip: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300', picked: 'border-violet-500/60 bg-violet-500/10', icon: 'text-violet-600 dark:text-violet-300', dot: 'bg-violet-500' },
}

export function LevelChip({ level, className }: { level: WorldLevel; className?: string }) {
  const t = useT()
  const Icon = LEVEL_ICON[level]
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-medium leading-none', LEVEL_TONE[level].chip, className)}>
      <Icon className="size-3" aria-hidden="true" />
      {t(`world.level.${level}` as MsgKey)}
    </span>
  )
}

/** 4600 -> "4.6k", 300 -> "300". */
export function formatK(n: number): string {
  const v = Math.max(0, Math.round(Number(n) || 0))
  if (v < 1000) return String(v)
  const k = v / 1000
  return `${k >= 100 ? Math.round(k) : Math.round(k * 10) / 10}k`
}

/** "$0.002"; a cost under a thousandth keeps its first digits. */
export function formatMoney(n: number): string {
  if (!(n > 0)) return '$0'
  if (n < 0.001) return `$${n.toFixed(4)}`
  if (n < 1) return `$${n.toFixed(3)}`
  return `$${n.toFixed(2)}`
}

export const formatSeconds = (ms: number): string => (Math.max(0, ms) / 1000).toFixed(1)

const ERROR_CODES: WorldErrorCode[] = ['thinking', 'thinking-block', 'reasoning-off', 'rate', 'context', 'auth', 'model', 'not-json', 'empty', 'other']

/** The message for a failed run in the app's language; the plugin's own English text when the code is unknown. */
export function useWorldErrorText(): (e: Pick<WorldError, 'code' | 'message' | 'limit'>) => string {
  const t = useT()
  return (e) => {
    if (!ERROR_CODES.includes(e.code)) return t('world.error', { message: e.message })
    return t(`world.err.${e.code}` as MsgKey, { max: e.limit?.max ?? '', message: e.message })
  }
}

/** Errors that the fix for lives in API connections (the model's own parameters). */
export const NEEDS_CONNECTIONS: WorldErrorCode[] = ['thinking-block', 'reasoning-off']

export const FROM_KEY: Record<WorldModelFrom, MsgKey> = {
  world: 'world.from.world',
  sensor: 'world.from.sensor',
  litopys: 'world.from.litopys',
  chat: 'world.from.chat',
  default: 'world.from.default',
}

/** One colour per kind of record (chips in the Records tab): person pink, place teal, group violet, thing amber, fact blue. */
export const KIND_TONE: Record<WorldKind, string> = {
  person: 'border-pink-500/40 bg-pink-500/10 text-pink-700 dark:text-pink-300',
  place: 'border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300',
  group: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  thing: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  fact: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
}

/** A profile's name: a built-in one is its level's, an own one has its own. */
export function useProfileName(): (p: { id: string; builtIn: boolean; name: string }) => string {
  const t = useT()
  return (p) => (p.builtIn ? t(`world.level.${p.id}` as MsgKey) : p.name)
}

/** A profile's one-line description. */
export function useProfileHint(): (p: { id: string; builtIn: boolean; description: string }) => string {
  const t = useT()
  return (p) => (p.builtIn ? t(`world.level.${p.id}.hint` as MsgKey) : p.description)
}
