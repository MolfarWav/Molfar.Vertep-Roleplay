// "What changed" under the newest reply (#184 P8): one muted line that sums up the Dashboard's "Since your last reply"
// (moods, stats, place, quests), folded; a press unfolds the same chips the Dashboard shows, and a chip opens the
// Dashboard on the tab that holds the change. Only under the newest assistant reply, and only while the Dashboard's
// newest snapshot is that reply's own (viewIsOfReply), so a reply that is still being written, or whose update has
// not landed, never shows the previous reply's changes. Not a message: it never goes to the model or an export.

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { CaretRight, Sparkle } from '@phosphor-icons/react'
import { ChangeChip, useChangeSummary, useChangeText } from '@/components/dashboard/change-chips'
import { useDashMaybe } from '@/components/dashboard/dash-context'
import { useT } from '@/hooks/use-t'
import { changesLineVisible, sinceChanges, sortChanges, viewIsOfReply, type DashChange } from '@/lib/dash-changes'
import { useDashLive } from '@/lib/dash-live'
import { useApp } from '@/lib/store'
import type { Message } from '@/lib/types'
import { cn } from '@/lib/utils'

export function ChangesNote({ chatId, message, last }: { chatId: string; message: Message; last: boolean }) {
  const t = useT()
  const dash = useDashMaybe()
  const on = useApp((s) => s.settings.showChanges !== false)
  const writing = useApp((s) => s.streaming?.chatId === chatId)
  const updating = useDashLive((s) => !!s.running[chatId])
  const openDashboard = useApp((s) => s.openDashboard)
  const summarize = useChangeSummary()
  const plain = useChangeText()
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  const box = useRef<HTMLDivElement>(null)
  // the chips unfold below the line, which sits at the bottom of the log: bring them into view
  useEffect(() => { if (open) box.current?.scrollIntoView({ block: 'nearest' }) }, [open])
  const view = dash?.view ?? null
  const here = dash?.here ?? null
  const focus = dash?.focus ?? ''
  const changes = useMemo(() => (view && focus ? sortChanges(sinceChanges(view, here, focus)) : []), [view, here, focus])

  if (!dash || !changesLineVisible({ last, on, ready: dash.status === 'ready', writing, updating, ofReply: viewIsOfReply(view, message), count: changes.length })) return null

  const fell = changes.some((c) => c.kind === 'fell')
  const summary = t('dash.since.line', { text: summarize(changes) })
  const pick = (c: DashChange) => openDashboard({ tab: c.tab, who: c.who })

  return (
    <div ref={box} className="flex flex-col gap-1 px-4 py-1" data-testid="changes-note">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-10 w-full items-center gap-1.5 rounded-md py-1 text-left text-caption text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <CaretRight className={cn('size-4 shrink-0 text-foreground/70 transition-transform motion-reduce:transition-none', open && 'rotate-90')} aria-hidden="true" />
        <Sparkle className={cn('size-3.5 shrink-0', fell ? 'text-red-600 dark:text-red-400' : 'text-sky-600 dark:text-sky-400')} aria-hidden="true" />
        <span className="min-w-0 break-words" data-testid="changes-note-summary">{summary}</span>
      </button>
      {open && (
        <div id={bodyId} className="flex flex-col gap-1.5 pb-1 pl-5" data-testid="changes-note-body">
          <div className="flex flex-wrap gap-1.5">
            {changes.map((c, i) => (
              <ChangeChip key={`${c.kind}-${c.who ?? ''}-${i}`} change={c} text={plain(c)} onPick={pick} />
            ))}
          </div>
          <p className="text-caption text-muted-foreground">{t('dash.since.hint')}</p>
        </div>
      )}
    </div>
  )
}
