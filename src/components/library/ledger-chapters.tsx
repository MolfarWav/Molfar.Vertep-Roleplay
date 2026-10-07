import { useMemo, useState } from 'react'
import { DotsThree, PencilSimple, ArrowCounterClockwise, Trash, WarningCircle } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { useConfirm } from '@/components/ui/confirm'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { LitChapter, LitChat, LitSkipped } from './litopys-api'
import { editLitChapter, rewriteLitChapter, deleteLitChapter, isRebuilding } from './litopys-api'
import type { TabProps } from './ledger-facts'

interface ChapterEditorProps {
  chapter: LitChapter
  onSave: (fields: { label?: string; text?: string }) => Promise<void>
  onCancel: () => void
}

function ChapterEditor({ chapter, onSave, onCancel }: ChapterEditorProps) {
  const t = useT()
  const [label, setLabel] = useState(chapter.label)
  const [text, setText] = useState(chapter.text)
  const [busy, setBusy] = useState(false)

  const changed = label.trim() !== chapter.label || text.trim() !== chapter.text
  const canSave = !busy && !!text.trim() && changed
  const save = async () => {
    if (!canSave) return
    setBusy(true)
    try {
      await onSave({
        ...(label.trim() !== chapter.label ? { label: label.trim() } : {}),
        ...(text.trim() !== chapter.text ? { text: text.trim() } : {}),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-2" data-testid="chapter-editor">
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value.slice(0, 80))}
        placeholder={t('lit.noLabel')}
        aria-label={t('lit.chapterLabel')}
        className="text-sm"
      />
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 1500))}
        maxLength={1500}
        rows={4}
        aria-label={t('lit.chapterText')}
        className="text-sm"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void save()
          if (e.key === 'Escape') onCancel()
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">{text.length}/1500</span>
        <div className="flex gap-2">
          <Button size="xs" disabled={!canSave} onClick={() => void save()}>
            {t('lit.save')}
          </Button>
          <Button size="xs" variant="ghost" onClick={onCancel}>
            {t('lit.cancel')}
          </Button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">{t('lit.editChapterHint')}</p>
    </div>
  )
}

interface ChapterRowProps {
  chat: LitChat
  chapter: LitChapter
  onChat: (c: LitChat) => void
  disabled: boolean
}

function ChapterRow({ chat, chapter, onChat, disabled }: ChapterRowProps) {
  const t = useT()
  const [confirm, confirmDialog] = useConfirm()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState<'edit' | 'rewrite' | 'delete' | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [keepGone, setKeepGone] = useState(false)

  const factsCount = useMemo(
    () => chat.facts.filter((f) => f.status === 'active' && f.src?.chapter === chapter.id).length,
    [chat.facts, chapter.id]
  )

  const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

  const handleError = (e: unknown) => {
    if (isRebuilding(e)) toast.error(t('lit.lockedRebuild'))
    else toast.error(errText(e))
  }

  const handleEdit = async (fields: { label?: string; text?: string }) => {
    setBusy('edit')
    try {
      const c = await editLitChapter(chat.chatId, chapter.id, fields)
      onChat(c)
      setEditing(false)
    } catch (e) {
      handleError(e)
    } finally {
      setBusy(null)
    }
  }

  const handleRewrite = async () => {
    if (chapter.edited) {
      const ok = await confirm({
        title: t('lit.rewriteTitle'),
        description: t('lit.rewriteEditedBody'),
        actionLabel: t('lit.rewrite'),
        destructive: true,
      })
      if (!ok) return
    }
    setBusy('rewrite')
    try {
      const c = await rewriteLitChapter(chat.chatId, chapter.id)
      onChat(c)
      toast.success(t('lit.rewriteQueued'))
    } catch (e) {
      handleError(e)
    } finally {
      setBusy(null)
    }
  }

  const handleDelete = async () => {
    setBusy('delete')
    try {
      const c = await deleteLitChapter(chat.chatId, chapter.id, keepGone)
      onChat(c)
      setDeleteOpen(false)
    } catch (e) {
      handleError(e)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      data-testid="chapter-row"
      className={cn('group rounded-md border border-border bg-card p-3', disabled && 'opacity-60')}
    >
      {confirmDialog}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-sm">{chapter.label || t('lit.noLabel')}</span>
            <span className="text-xs text-muted-foreground">
              {chapter.fromNo === 0
                ? t('lit.rangeGone', { n: chapter.count })
                : t('lit.range', { from: chapter.fromNo, to: chapter.toNo, n: chapter.count })}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {chapter.stale && (
              <Tooltip>
                <TooltipTrigger render={<Badge variant="outline" className="text-[10px]">{t('lit.stale')}</Badge>} />
                <TooltipContent>{t('lit.staleHint')}</TooltipContent>
              </Tooltip>
            )}
            {chapter.edited && <Badge variant="secondary" className="text-[10px]">{t('lit.edited')}</Badge>}
            {chapter.kind === 'part' && <Badge variant="outline" className="text-[10px]">{t('lit.kind.part')}</Badge>}
            {chapter.kind === 'merged' && <Badge variant="outline" className="text-[10px]">{t('lit.kind.merged')}</Badge>}
            {chapter.place && <Badge variant="outline" className="text-[10px]">{chapter.place}</Badge>}
            <span className="text-[11px] text-muted-foreground">{t('lit.chapterFacts', { n: factsCount })}</span>
          </div>
          {!editing && chapter.text && (
            <p className="mt-1.5 text-sm whitespace-pre-wrap break-words">{chapter.text}</p>
          )}
          {editing && (
            <ChapterEditor
              chapter={chapter}
              onSave={handleEdit}
              onCancel={() => setEditing(false)}
            />
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-sm" className="size-9 md:size-7" aria-label={t('lit.chapterMenu')} data-testid="chapter-menu" disabled={disabled || busy !== null}>
                <DotsThree weight="bold" aria-hidden="true" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuItem disabled={busy !== null} onClick={() => setEditing(true)}>
              <PencilSimple className="size-3.5" aria-hidden="true" />
              {t('lit.edit')}
            </DropdownMenuItem>
            {chapter.kind !== 'merged' && (
              <DropdownMenuItem disabled={busy !== null} onClick={() => void handleRewrite()}>
                <ArrowCounterClockwise className="size-3.5" aria-hidden="true" />
                {t('lit.rewrite')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem variant="destructive" disabled={busy !== null} onClick={() => setDeleteOpen(true)}>
              <Trash className="size-3.5" aria-hidden="true" />
              {t('lit.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className={cn("mt-1 hidden gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100", editing ? "md:hidden" : "md:flex")}>
        <Button size="xs" variant="ghost" disabled={disabled || busy !== null} onClick={() => setEditing(true)}>
          <PencilSimple className="size-3.5" aria-hidden="true" />
          {t('lit.edit')}
        </Button>
        {chapter.kind !== 'merged' && (
          <Button size="xs" variant="ghost" disabled={disabled || busy !== null} onClick={() => void handleRewrite()}>
            <ArrowCounterClockwise className="size-3.5" aria-hidden="true" />
            {t('lit.rewrite')}
          </Button>
        )}
        <Button size="xs" variant="ghost" disabled={disabled || busy !== null} onClick={() => setDeleteOpen(true)}>
          <Trash className="size-3.5" aria-hidden="true" />
          {t('lit.delete')}
        </Button>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent data-testid="chapter-delete-dialog" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('lit.deleteChapterTitle')}</DialogTitle>
            <DialogDescription>{t('lit.deleteChapterBody')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={keepGone} onCheckedChange={(v) => setKeepGone(v === true)} className="mt-0.5" />
              <span>{t('lit.keepGone')}</span>
            </label>
            <p className="text-xs text-muted-foreground pl-6">{keepGone ? t('lit.keepGoneOn') : t('lit.keepGoneOff')}</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={busy === 'delete'}>
              {t('lit.cancel')}
            </Button>
            <Button variant="destructive" disabled={busy === 'delete'} onClick={() => void handleDelete()}>
              {t('lit.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function ChaptersTab({ chat, onChat }: TabProps) {
  const t = useT()
  const disabled = Boolean(chat.rebuilding)

  type Item = { at: number; chapter?: LitChapter; skip?: LitSkipped }
  const items: Item[] = [
    ...chat.chapters.map((chapter) => ({ at: chapter.fromNo || Number.MAX_SAFE_INTEGER, chapter })),
    ...chat.skipped.map((skip) => ({ at: skip.fromNo, skip })),
  ].sort((x, y) => x.at - y.at)

  return (
    <div className="flex flex-col gap-2">
      {chat.scene.openFrom && (
        <p className="text-xs text-muted-foreground">
          {t('lit.scene', { label: chat.scene.label || t('lit.sceneNoLabel'), n: chat.sceneFromNo })}
        </p>
      )}
      {chat.rebuilding && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-xs text-amber-600 dark:text-amber-400">
          <WarningCircle className="size-4" aria-hidden="true" />
          {t('lit.lockedRebuild')}
        </div>
      )}
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('lit.noChapters')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it) =>
            it.chapter ? (
              <li key={it.chapter.id}>
                <ChapterRow chat={chat} chapter={it.chapter} onChat={onChat} disabled={disabled} />
              </li>
            ) : (
              <li
                key={`skip-${it.skip!.fromNo}-${it.skip!.toNo}`}
                className="rounded-md border border-dashed border-border bg-muted/40 p-2 text-xs text-muted-foreground"
              >
                {t('lit.skippedRange', { from: it.skip!.fromNo, to: it.skip!.toNo })}
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  )
}
