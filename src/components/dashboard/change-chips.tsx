// The wording and the chip of one change since the last reply. "Since your last reply" in the Dashboard (dash-tabs.tsx)
// and the line under the newest reply in the chat (chat/changes-note.tsx) both draw changes through these, so a
// change reads the same in both places.

import { useT } from '@/hooks/use-t'
import { summaryOf, type ChangeKind, type DashChange } from '@/lib/dash-changes'
import { cn } from '@/lib/utils'

export const SINCE_TONE: Record<ChangeKind, string> = {
  mood: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  carry: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  fell: 'border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300',
  rose: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  place: 'border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300',
  things: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  quest: 'border-pink-500/40 bg-pink-500/10 text-pink-700 dark:text-pink-300',
  proposal: 'border-pink-500/40 bg-pink-500/10 text-pink-700 dark:text-pink-300',
  duplicate: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
}

/**
 * The words of a change. \`named\` puts the character in front of a mood ("Ada's mood calm → tense"), for the folded line in
 * the chat, where no character switcher says whose mood it is; the Dashboard chip sits under the focused character.
 */
export function useChangeText(named = false) {
  const t = useT()
  return (c: DashChange): string => {
    const stats = (c.stats ?? []).map((s) => t(`soul.stat.${s}`)).join(', ')
    const who = c.who ?? ''
    switch (c.kind) {
      case 'mood': return named && who ? t('dash.since.moodOf', { name: who, from: c.from ?? '', to: c.to ?? '' }) : t('dash.since.mood', { from: c.from ?? '', to: c.to ?? '' })
      case 'carry': return t('dash.since.carry')
      case 'fell': return t('dash.since.fell', { name: who, stats })
      case 'rose': return t('dash.since.rose', { name: who, stats })
      case 'place': return c.place ? t('dash.since.place', { place: c.place }) : t('dash.since.placeNone')
      case 'things': return t('dash.since.things')
      case 'duplicate': return t('dash.since.duplicate', { name: who })
      case 'quest': return t('dash.since.quest', { n: c.n })
      default: return t('dash.since.proposal', { n: c.n })
    }
  }
}

/**
 * The folded line under the newest reply: the first two changes and "+N" for the rest. When they are about one character the
 * name comes once ("Ada · trust fell, mood calm → tense"); otherwise each change says who it is about.
 */
export function useChangeSummary() {
  const t = useT()
  const named = useChangeText(true)
  return (changes: DashChange[]): string => {
    const { head, more, who } = summaryOf(changes)
    const stats = (c: DashChange) => (c.stats ?? []).map((s) => t(`soul.stat.${s}`).toLowerCase()).join(', ')
    const short = (c: DashChange): string | null =>
      c.kind === 'mood' ? t('dash.since.sumMood', { from: c.from ?? '', to: c.to ?? '' })
        : c.kind === 'fell' ? t('dash.since.sumFell', { stats: stats(c) })
          : c.kind === 'rose' ? t('dash.since.sumRose', { stats: stats(c) })
            : null
    const parts = head.map((c) => (who ? short(c) : null) ?? named(c))
    const text = who ? t('dash.since.sumWho', { name: who, text: parts.join(', ') }) : parts.join(', ')
    return text + (more > 0 ? `, +${more}` : '')
  }
}

/** One change as a chip; a press opens the Dashboard tab that holds it. */
export function ChangeChip({ change, text, onPick }: { change: DashChange; text: string; onPick: (c: DashChange) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(change)}
      className={cn('inline-flex min-h-7 max-w-full items-center gap-1.5 border px-2 py-0.5 text-left text-[12px] leading-snug break-words max-md:min-h-10', SINCE_TONE[change.kind])}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
      {text}
    </button>
  )
}
