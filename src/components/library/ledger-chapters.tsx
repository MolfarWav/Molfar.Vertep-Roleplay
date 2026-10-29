import { Fragment, useMemo, useState } from 'react'
import { BookmarkSimple, CaretRight, ChatText, DotsThree, PencilSimple, Plus, Quotes, ArrowCounterClockwise, Trash, WarningCircle } from '@phosphor-icons/react'
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
import type { LitArc, LitChapter, LitChat, LitSkipped, LitView } from './litopys-api'
import { ArcCard, arcOfChapter } from './arcs'
import { editLitChapter, rewriteLitChapter, deleteLitChapter, unmarkLitScene, isRebuilding } from './litopys-api'
import type { TabProps } from './ledger-facts'
import { TONE } from './tones'
import { MessagesDialog, type MessagesRange } from './messages-dialog'

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

const VIEW_MAX = 300
const VIEWS_MAX = 8
/** Short enough to show at once: two people at most and not much text. */
const viewsAreLong = (views: LitView[]) => views.length > 2 || views.reduce((n, v) => n + v.text.length, 0) > 220

/** "What they remember": one line per character, small and muted; folded behind a button when long. */
function Recollections({ views, onEdit, disabled }: { views: LitView[]; onEdit: () => void; disabled: boolean }) {
  const t = useT()
  const long = viewsAreLong(views)
  const [open, setOpen] = useState(false)
  const shown = !long || open
  return (
    <div className="mt-2 rounded-md border border-border bg-muted/30 p-2" data-testid="chapter-views">
      <div className="flex items-center gap-1">
        {long ? (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex min-h-10 min-w-0 flex-1 items-center gap-1.5 rounded text-left text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:min-h-7"
          >
            <CaretRight className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none', open && 'rotate-90')} aria-hidden="true" />
            <Quotes className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0">{t('lit.views.title')}</span>
            <span className="text-muted-foreground">({views.length})</span>
            <span className="ml-auto shrink-0 font-normal text-muted-foreground">{open ? t('lit.views.hide') : t('lit.views.show')}</span>
          </button>
        ) : (
          <p className="flex min-h-7 flex-1 items-center gap-1.5 text-xs font-medium">
            <Quotes className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            {t('lit.views.title')}
          </p>
        )}
        <Button size="icon-sm" variant="ghost" className="size-10 shrink-0 md:size-7" disabled={disabled} onClick={onEdit} aria-label={t('lit.views.edit')} data-testid="chapter-views-edit">
          <PencilSimple className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
      {shown && (
        <ul className="mt-1 flex flex-col gap-1">
          {views.map((v) => (
            <li key={v.who} className="text-xs break-words text-muted-foreground">
              <span className="font-medium text-foreground/80">{v.who}:</span> {v.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface ViewRow extends LitView { key: number; fresh: boolean }

/** Edits what each person remembers: one box per person (300 characters), remove a person, add one (name and text). */
function ViewsEditor({ views, onSave, onCancel }: { views: LitView[]; onSave: (views: LitView[]) => Promise<void>; onCancel: () => void }) {
  const t = useT()
  const [rows, setRows] = useState<ViewRow[]>(() => views.map((v, i) => ({ ...v, key: i, fresh: false })))
  const [next, setNext] = useState(views.length)
  const [busy, setBusy] = useState(false)
  const clean = rows.filter((r) => r.who.trim() && r.text.trim()).map((r) => ({ who: r.who.trim(), text: r.text.trim() }))
  const incomplete = rows.some((r) => !!r.who.trim() !== !!r.text.trim() || (r.fresh && !r.who.trim() && !r.text.trim()))
  const same = JSON.stringify(clean) === JSON.stringify(views)
  const canSave = !busy && !incomplete && !same
  const patch = (key: number, p: Partial<ViewRow>) => setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...p } : r)))
  const save = async () => {
    if (!canSave) return
    setBusy(true)
    try { await onSave(clean) } finally { setBusy(false) }
  }
  return (
    <div className="mt-2 flex flex-col gap-3 rounded-md border border-border bg-muted/30 p-2" data-testid="chapter-views-editor">
      <p className="flex items-center gap-1.5 text-xs font-medium">
        <Quotes className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        {t('lit.views.title')}
      </p>
      {rows.map((r) => (
        <div key={r.key} className="flex flex-col gap-1" data-testid="chapter-view-row">
          <div className="flex items-center gap-2">
            {r.fresh ? (
              <Input
                value={r.who}
                onChange={(e) => patch(r.key, { who: e.target.value.slice(0, 80) })}
                placeholder={t('lit.views.namePh')}
                aria-label={t('lit.views.who')}
                className="h-10 min-w-0 flex-1 text-sm md:h-8"
              />
            ) : (
              <span className="min-w-0 flex-1 truncate text-xs font-medium">{r.who}</span>
            )}
            <Button size="icon-sm" variant="ghost" className="size-10 shrink-0 md:size-7" onClick={() => setRows((cur) => cur.filter((x) => x.key !== r.key))} aria-label={t('lit.views.remove', { who: r.who || t('lit.views.who') })}>
              <Trash className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
          <Textarea
            value={r.text}
            onChange={(e) => patch(r.key, { text: e.target.value.slice(0, VIEW_MAX) })}
            maxLength={VIEW_MAX}
            rows={3}
            placeholder={t('lit.views.textPh')}
            aria-label={t('lit.views.text', { who: r.who || t('lit.views.who') })}
            className="text-sm"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void save()
              if (e.key === 'Escape') onCancel()
            }}
          />
          <span className="self-end text-[11px] text-muted-foreground">{r.text.length}/{VIEW_MAX}</span>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="xs"
          variant="outline"
          className="max-md:h-10"
          disabled={rows.length >= VIEWS_MAX}
          onClick={() => { setRows((cur) => [...cur, { who: '', text: '', key: next, fresh: true }]); setNext((n) => n + 1) }}
        >
          <Plus className="size-3.5" aria-hidden="true" />
          {t('lit.views.add')}
        </Button>
        {rows.length >= VIEWS_MAX && <span className="text-[11px] text-muted-foreground">{t('lit.views.max', { n: VIEWS_MAX })}</span>}
      </div>
      {incomplete && <p className="text-[11px] text-amber-700 dark:text-amber-300" role="status">{t('lit.views.need')}</p>}
      <div className="flex justify-end gap-2">
        <Button size="xs" className="max-md:h-10" disabled={!canSave} onClick={() => void save()}>{t('lit.save')}</Button>
        <Button size="xs" variant="ghost" className="max-md:h-10" onClick={onCancel}>{t('lit.cancel')}</Button>
      </div>
      <p className="text-[11px] text-muted-foreground">{t('lit.views.hint')}</p>
    </div>
  )
}

interface ChapterRowProps {
  chat: LitChat
  chapter: LitChapter
  onChat: (c: LitChat) => void
  disabled: boolean
}

export function ChapterRow({ chat, chapter, onChat, disabled, arc }: ChapterRowProps & { arc?: LitArc }) {
  const t = useT()
  const [confirm, confirmDialog] = useConfirm()
  const [editing, setEditing] = useState(false)
  const [editingViews, setEditingViews] = useState(false)
  const [busy, setBusy] = useState<'edit' | 'rewrite' | 'delete' | 'unmark' | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [keepGone, setKeepGone] = useState(false)
  const [msgRange, setMsgRange] = useState<MessagesRange | null>(null)

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

  const handleViews = async (views: LitView[]) => {
    setBusy('edit')
    try {
      const c = await editLitChapter(chat.chatId, chapter.id, { views })
      onChat(c)
      setEditingViews(false)
      toast.success(t('lit.views.saved'))
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

  const mark = chat.marks?.find((m) => m.fromNo === chapter.fromNo && m.toNo === chapter.toNo)
  const handleUnmark = async () => {
    if (!mark) return
    setBusy('unmark')
    try {
      onChat(await unmarkLitScene(chat.chatId, mark.id))
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
      <MessagesDialog chatId={chat.chatId} range={msgRange} onClose={() => setMsgRange(null)} />
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
                <TooltipTrigger render={<Badge variant="outline" className={cn('text-[10px]', TONE.stale)}>{t('lit.stale')}</Badge>} />
                <TooltipContent>{t('lit.staleHint')}</TooltipContent>
              </Tooltip>
            )}
            {chapter.marked && <Badge variant="outline" className={cn('text-[10px]', TONE.kind)}>{t('lit.marked')}</Badge>}
            {chapter.edited && <Badge variant="outline" className={cn('text-[10px]', TONE.edited)}>{t('lit.edited')}</Badge>}
            {chapter.kind === 'part' && <Badge variant="outline" className={cn('text-[10px]', TONE.kind)}>{t('lit.kind.part')}</Badge>}
            {chapter.kind === 'merged' && <Badge variant="outline" className={cn('text-[10px]', TONE.kind)}>{t('lit.kind.merged')}</Badge>}
            {arc && <Badge variant="outline" className={cn('text-[10px]', TONE.arc)}>{t('lit.arc.inArc', { label: arc.label || t('lit.arc.label') })}</Badge>}
            {chapter.place && <Badge variant="outline" className={cn('max-w-full truncate text-[10px]', TONE.place)}>{chapter.place}</Badge>}
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
          {editingViews ? (
            <ViewsEditor views={chapter.views ?? []} onSave={handleViews} onCancel={() => setEditingViews(false)} />
          ) : (
            !!chapter.views?.length && <Recollections views={chapter.views} onEdit={() => setEditingViews(true)} disabled={disabled || busy !== null} />
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
            {chapter.fromNo > 0 && (
              <DropdownMenuItem onClick={() => setMsgRange({ from: chapter.from, to: chapter.to, title: chapter.label || chapter.text })}>
                <ChatText className="size-3.5" aria-hidden="true" />
                {t('lit.msgs.open')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem disabled={busy !== null} onClick={() => setEditing(true)}>
              <PencilSimple className="size-3.5" aria-hidden="true" />
              {t('lit.edit')}
            </DropdownMenuItem>
            {chapter.kind !== 'merged' && (
              <DropdownMenuItem disabled={busy !== null} onClick={() => setEditingViews(true)}>
                <Quotes className="size-3.5" aria-hidden="true" />
                {t('lit.views.edit')}
              </DropdownMenuItem>
            )}
            {chapter.kind !== 'merged' && (
              <DropdownMenuItem disabled={busy !== null} onClick={() => void handleRewrite()}>
                <ArrowCounterClockwise className="size-3.5" aria-hidden="true" />
                {t('lit.rewrite')}
              </DropdownMenuItem>
            )}
            {mark && (
              <DropdownMenuItem disabled={busy !== null} onClick={() => void handleUnmark()}>
                <BookmarkSimple className="size-3.5" aria-hidden="true" />
                {t('lit.unmark')}
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

  // M4d: an arc's card stands before its first chapter; its chapters follow, indented
  const arcMap = arcOfChapter(chat)
  const firstOfArc = new Set(chat.arcs.map((arc) => items.find((it) => it.chapter && arc.chapterIds.includes(it.chapter.id))?.chapter?.id))

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
              <Fragment key={it.chapter.id}>
                {firstOfArc.has(it.chapter.id) && arcMap.get(it.chapter.id) && (
                  <li>
                    <ArcCard chat={chat} arc={arcMap.get(it.chapter.id)!} onChat={onChat} disabled={disabled} />
                  </li>
                )}
                <li className={cn(arcMap.has(it.chapter.id) && 'ml-4 border-l-2 border-l-violet-500/50 pl-3 md:ml-6 md:pl-4')}>
                  <ChapterRow chat={chat} chapter={it.chapter} onChat={onChat} disabled={disabled} arc={arcMap.get(it.chapter.id)} />
                </li>
              </Fragment>
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
