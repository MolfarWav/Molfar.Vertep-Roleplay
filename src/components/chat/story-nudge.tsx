// "Story, move": a one-time nudge for the NEXT reply, armed from the composer row. The plugin
// (POST /dashboard/nudge) keeps it in a file and adds it to the model request only; it never
// reaches the chat. Two parts, both rendered in composer.tsx: the chip above the input row
// (what is armed, with an ×) and the split button left of send (arm: any thread, or one).

import { CaretDown, Sparkle, Wind, X } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDashMaybe } from '@/components/dashboard/dash-context'
import { useT } from '@/hooks/use-t'
import { armNudge, clearNudge, questGroups, questKindOf, type Nudge, type Thread } from '@/lib/dashboard'
import { cn } from '@/lib/utils'

/** The dashboard of this chat when the plugin is there ('absent' and 'loading' render nothing). */
function useNudgeState() {
  const dash = useDashMaybe()
  const usable = !!dash && (dash.status === 'ready' || dash.status === 'empty')
  const view = dash?.view ?? null
  const nudge: Nudge | null = view?.nudge ?? dash?.data?.nudge ?? null
  const open: Thread[] = view ? view.threads.filter((th) => th.status === 'open') : []
  return { dash, usable, view, nudge, open }
}

/** The armed note above the input row. One truncated line; the full text is the tooltip. */
export function StoryNudgeChip({ chatId }: { chatId: string }) {
  const t = useT()
  const { dash, usable, view, nudge } = useNudgeState()
  if (!dash || !usable || !nudge) return null
  const picked = nudge.threadId ? view?.threads.find((th) => th.id === nudge.threadId) : undefined
  const text = nudge.twist ? t('dash.nudge.armedTwist') : t('dash.nudge.armed', { what: picked ? picked.text : t('dash.nudge.all') })
  const cancel = async () => {
    try {
      await clearNudge(chatId)
    } catch {
      toast.error(t('dash.nudge.error'))
    }
    // the 15 s poll catches up if this reload fails
    await dash.reload().catch(() => {})
  }
  return (
    <div className="mb-1.5 flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-muted/50 py-0.5 pl-2 pr-1 text-xs" data-testid="nudge-chip">
      <Wind className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate" title={text}>{text}</span>
      <button
        type="button"
        onClick={() => void cancel()}
        aria-label={t('dash.nudge.cancel')}
        title={t('dash.nudge.cancel')}
        className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-3" />
      </button>
    </div>
  )
}

/**
 * The split button. A click on the main part, or on one menu item, only arms the nudge: the
 * user's own send carries it, with text or with an empty box (user, 2026-10-09: sending at once
 * from an empty box read as an empty message going into the chat).
 */
export function StoryNudgeButton({ chatId, isStreaming }: {
  chatId: string
  isStreaming: boolean
}) {
  const t = useT()
  const { dash, usable, nudge, open } = useNudgeState()
  if (!dash || !usable) return null
  const g = questGroups(open)
  const picks = [
    ...g.main.flatMap((m) => [{ th: m.quest, step: false }, ...m.steps.map((th) => ({ th, step: true }))]),
    ...g.side.map((th) => ({ th, step: false })),
    ...g.everyday.map((th) => ({ th, step: false })),
  ]

  const arm = async (threadId: string | null, twist = false) => {
    if (isStreaming) return
    try {
      await armNudge(chatId, threadId, twist)
    } catch {
      toast.error(t('dash.nudge.error'))
      void dash.reload()
      return
    }
    // the meaning, in words, for anyone who never saw the tooltip (a phone has none)
    toast.info(t('dash.nudge.tooltip'))
    void dash.reload()
  }

  const variant = nudge ? 'default' : 'ghost'
  return (
    <div className="flex shrink-0 items-center" data-testid="nudge-split" data-guide="story.nudge">
      <Button
        variant={variant}
        className={cn('h-9 gap-1.5 rounded-r-none px-2.5', !nudge && 'border-border border-r-0')}
        onClick={() => void arm(null)}
        disabled={isStreaming}
        aria-label={t('dash.nudge.button')}
        title={t('dash.nudge.tooltip')}
      >
        <Wind className="size-4.5" />
        <span className="hidden md:inline">{t('dash.nudge.button')}</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant={variant}
              className={cn('h-9 w-6 rounded-l-none px-0', nudge ? 'border-l-primary-foreground/30' : 'border-border')}
              disabled={isStreaming}
              aria-label={t('dash.nudge.pick')}
              title={t('dash.nudge.pick')}
            >
              <CaretDown className="size-3.5" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" side="top" className="w-72 max-w-[calc(100vw-1rem)]">
          <DropdownMenuGroup>
          <DropdownMenuLabel>{t('dash.nudge.pick')}</DropdownMenuLabel>
          {open.length === 0 ? (
            <DropdownMenuItem disabled>
              <span className="min-w-0 flex-1 whitespace-normal">{t('dash.nudge.none')}</span>
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem disabled={isStreaming} onClick={() => void arm(null)} className="max-md:min-h-10">
                <Wind className="size-4" />
                <span className="min-w-0 flex-1 truncate">{t('dash.nudge.any')}</span>
              </DropdownMenuItem>
              {/* main quests with their steps under them, then side, then everyday ones */}
              {picks.map(({ th, step }) => (
                <DropdownMenuItem key={th.id} disabled={isStreaming} onClick={() => void arm(th.id)} className={cn('max-md:min-h-10', step && 'pl-7')}>
                  <span className="min-w-0 flex-1 truncate" title={th.text}>{th.text}</span>
                  {!step && questKindOf(th) !== 'side' && (
                    <span className="ml-1.5 shrink-0 border border-border px-1 text-[10px] uppercase tracking-wide">{t(`dash.quest.kind.${questKindOf(th)}`)}</span>
                  )}
                  {th.by === 'user' && (
                    <span className="ml-1.5 shrink-0 border border-border px-1 text-[10px] uppercase tracking-wide">{t('dash.thread.yours')}</span>
                  )}
                </DropdownMenuItem>
              ))}
            </>
          )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={isStreaming} onClick={() => void arm(null, true)} className="max-md:min-h-10">
            <Sparkle className="size-4" />
            <span className="min-w-0 flex-1 whitespace-normal">{t('dash.nudge.twist')}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
