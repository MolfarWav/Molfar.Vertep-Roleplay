import { useState } from 'react'
import { ArrowsClockwise, CircleNotch, DotsThree, Stack, Trash } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useConfirm } from '@/components/ui/confirm'
import { useT, useRelativeTime } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { LitArc, LitChat } from './litopys-api'
import { mergeLitArc, snoozeLitArc, cancelLitArc, rewriteLitArc, deleteLitArc, putLitConfig } from './litopys-api'
import type { TabProps } from './ledger-facts'
import { TONE } from './tones'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function arcOfChapter(chat: LitChat): Map<string, LitArc> {
  const map = new Map<string, LitArc>()
  for (const arc of chat.arcs) {
    for (const id of arc.chapterIds) map.set(id, arc)
  }
  return map
}

export function ArcNotice({ chat, onChat, onRefresh }: TabProps) {
  const t = useT()
  const rel = useRelativeTime()
  const [busy, setBusy] = useState(false)
  const arcState = chat.arcState

  const positionOf = (id: string) => chat.chapters.findIndex((c) => c.id === id) + 1

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setBusy(false)
    }
  }

  if (arcState.working) {
    const { fromNo, toNo, rewrite } = arcState.working
    return (
      <div data-testid="arc-notice" className="flex items-center gap-2 text-xs text-muted-foreground">
        <CircleNotch className="size-3.5 animate-spin" aria-hidden="true" />
        {rewrite
          ? t('lit.arc.workingRewrite', { from: fromNo, to: toNo })
          : t('lit.arc.working', { from: fromNo, to: toNo })}
      </div>
    )
  }

  if (arcState.queued) {
    return (
      <div data-testid="arc-notice" className="flex items-center justify-between gap-2 rounded-md border border-border bg-card p-3 text-sm">
        <p className="text-muted-foreground">
          {t('lit.arc.queued', { n: arcState.queued.chapters, from: arcState.queued.fromNo, to: arcState.queued.toNo })}
        </p>
        <Button variant="ghost" size="xs" disabled={busy} onClick={() => void run(() => cancelLitArc(chat.chatId).then(onChat))}>
          {t('lit.cancel')}
        </Button>
      </div>
    )
  }

  if (arcState.error) {
    return (
      <div data-testid="arc-notice" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-600 dark:text-amber-400">
        {t('lit.arc.error', { error: arcState.error.error, when: rel(arcState.error.retryAt) })}
      </div>
    )
  }

  if (arcState.suggested) {
    const s = arcState.suggested
    const fromPos = positionOf(s.fromChapter)
    const toPos = positionOf(s.toChapter)
    return (
      <div
        data-testid="arc-notice"
        className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/8 p-3"
      >
        <p className="text-sm">
          {t('lit.arc.suggested', { tokens: s.tokens, threshold: arcState.threshold, from: fromPos, to: toPos, a: s.fromNo, b: s.toNo })}
        </p>
        <p className="text-xs text-muted-foreground">{t('lit.arc.suggestedHint')}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="default"
            size="sm"
            data-testid="arc-merge"
            disabled={busy || !!chat.rebuilding}
            title={chat.rebuilding ? t('lit.lockedRebuild') : undefined}
            onClick={() => void run(() => mergeLitArc(chat.chatId, s.fromChapter, s.toChapter).then((c) => { onChat(c); toast.success(t('lit.arc.mergeToast')) }))}
          >
            {t('lit.arc.merge')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            data-testid="arc-snooze"
            disabled={busy || !!chat.rebuilding}
            onClick={() => void run(() => snoozeLitArc(chat.chatId).then(onChat))}
          >
            {t('lit.arc.notNow')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            data-testid="arc-auto"
            disabled={busy}
            onClick={() => void run(async () => {
              await putLitConfig({ arcMode: 'auto' })
              toast.success(t('lit.arc.autoToast'))
              onRefresh()
            })}
          >
            {t('lit.arc.always')}
          </Button>
        </div>
      </div>
    )
  }

  return null
}

export function ArcCard({ chat, arc, onChat, disabled, children }: {
  chat: LitChat
  arc: LitArc
  onChat: (c: LitChat) => void
  disabled: boolean
  children?: React.ReactNode
}) {
  const t = useT()
  const [confirm, confirmDialog] = useConfirm()
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const handle = async (fn: () => Promise<LitChat>, successMessage?: string) => {
    setBusy(true)
    try {
      const c = await fn()
      onChat(c)
      if (successMessage) toast.success(successMessage)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      data-testid={`arc-${arc.id}`}
      className="group rounded-md border border-border border-l-4 border-l-violet-500/70 bg-card p-3"
    >
      {confirmDialog}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Stack className="size-4" aria-hidden="true" />
            <span className="font-medium text-sm">{arc.label || t('lit.arc.label')}</span>
            <Badge variant="outline" className={cn('text-[10px]', TONE.arc)}>
              {t('lit.arc.badge', { n: arc.chapterIds.length })}
            </Badge>
            {arc.fromNo > 0 && (
              <span className="text-xs text-muted-foreground">
                {t('lit.arc.range', { from: arc.fromNo, to: arc.toNo })}
              </span>
            )}
            {arc.stale && <Badge variant="outline" className={cn('text-[10px]', TONE.stale)}>{t('lit.arc.stale')}</Badge>}
          </div>
          <p className="mt-1.5 text-sm whitespace-pre-wrap break-words">{arc.text}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-sm" className="size-9 md:size-7" aria-label={t('lit.arc.menu')} data-testid={`arc-menu-${arc.id}`} disabled={disabled || busy}>
                <DotsThree weight="bold" aria-hidden="true" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuItem disabled={busy} onClick={() => void handle(() => rewriteLitArc(chat.chatId, arc.id), t('lit.arc.rewriteToast'))}>
              <ArrowsClockwise className="size-3.5" aria-hidden="true" />
              {t('lit.arc.rewrite')}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={busy}
              onClick={() => {
                void confirm({ title: t('lit.arc.deleteTitle'), description: t('lit.arc.deleteConfirm'), actionLabel: t('lit.delete') }).then((ok) => {
                  if (ok) void handle(() => deleteLitArc(chat.chatId, arc.id), t('lit.arc.deleteToast'))
                })
              }}
            >
              <Trash className="size-3.5" aria-hidden="true" />
              {t('lit.arc.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="hidden md:flex opacity-0 group-hover:opacity-100 focus-within:opacity-100">
          <Button size="xs" variant="ghost" disabled={disabled || busy} onClick={() => void handle(() => rewriteLitArc(chat.chatId, arc.id), t('lit.arc.rewriteToast'))}>
            <ArrowsClockwise className="size-3.5" aria-hidden="true" />
            {t('lit.arc.rewrite')}
          </Button>
        </div>
      </div>
      {children && (
        <>
          <button
            type="button"
            className="mt-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded((v) => !v)}
          >
            {t('lit.arc.chapters', { n: arc.chapterIds.length })}
          </button>
          {expanded && <div className="mt-2 flex flex-col gap-2">{children}</div>}
        </>
      )}
    </div>
  )
}
