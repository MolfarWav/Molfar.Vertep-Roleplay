// The Turning points tab of the chat Ledger (#288): the events the story turns on, with how the people they touched feel
// about each. The user adds one, marks a chapter, edits, says which later one undid an earlier one, deletes, and answers
// what the automatic worker wanted to change in a turning point the user wrote (`pending`).
// Built from the Facts tab's parts on purpose: the same card, badges, row actions, editor and delete confirmation.
import { Fragment, useId, useMemo, useState, type ComponentType } from 'react'
import {
  ArrowCounterClockwise,
  ArrowElbowDownRight,
  ArrowUUpLeft,
  BookmarkSimple,
  Check,
  DotsThree,
  Eye,
  PencilSimple,
  Plus,
  Trash,
  X,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { useConfirm } from '@/components/ui/confirm'
import { knownEditorName, knownNames, parseKnownInput } from '@/lib/known-by'
import {
  type LitChat,
  type LitChapter,
  type LitTurn,
  type LitTurnFields,
  type LitTurnPending,
  addLitTurn,
  editLitTurn,
  isAlreadyMarked,
  markLitTurn,
  removeLitTurn,
  resolveLitTurn,
  undoLitTurn,
} from './litopys-api'
import type { TabProps } from './ledger-facts'
import { TONE } from './tones'
import {
  STANCES_MAX,
  STANCE_CHARS,
  TURN_CHARS,
  activeTurnCount,
  firstWords,
  sameKnown,
  sameStances,
  sortTurns,
  stanceRowsOf,
  stancesOfRows,
  turnNames,
  type StanceRow,
} from './turns-util'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Phone targets are 40 px tall (the neighbouring tabs' convention); a mouse gets the compact size. */
const TAP = 'max-md:h-10'
/** The size of the Facts tab's badges, so the two tabs read alike. */
const TAG = 'text-[10px]'

interface RowAction {
  key: string
  label: string
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>
  run: () => unknown
  destructive?: boolean
}

// ---------- the editor (add and edit): the fact editor's layout ----------

function TurnEditor({
  turn,
  names,
  busy,
  onSave,
  onCancel,
}: {
  turn?: LitTurn
  names: string[]
  busy?: boolean
  onSave: (fields: LitTurnFields) => void
  onCancel: () => void
}) {
  const t = useT()
  const uid = useId()
  const [text, setText] = useState(turn?.text ?? '')
  const [rows, setRows] = useState<StanceRow[]>(() => stanceRowsOf(turn?.stances))
  const [everyone, setEveryone] = useState(turn ? turn.knownBy === 'all' : true)
  const [knownInput, setKnownInput] = useState(turn && Array.isArray(turn.knownBy) ? turn.knownBy.map(knownEditorName).join(', ') : '')

  const body = text.replace(/\s+/g, ' ').trim()
  const stances = stancesOfRows(rows)
  const knownBy: string[] | 'all' = everyone ? 'all' : parseKnownInput(knownInput, turn?.knownBy)
  const patch: LitTurnFields = {}
  if (!turn || body !== turn.text) patch.text = body
  if (!turn || !sameStances(stances, turn.stances ?? {})) patch.stances = stances
  if (!turn || !sameKnown(knownBy, turn.knownBy)) patch.knownBy = knownBy
  const changed = Object.keys(patch).length > 0
  const canSave = body.length > 0 && changed && !busy && (knownBy === 'all' || knownBy.length > 0)

  const save = () => {
    if (canSave) onSave(patch)
  }
  const setRow = (i: number, p: Partial<StanceRow>) => setRows((cur) => cur.map((r, j) => (j === i ? { ...r, ...p } : r)))

  return (
    <div
      data-testid="turn-editor"
      className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-card p-3"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
    >
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={TURN_CHARS}
        rows={4}
        placeholder={t('lit.turns.textPlaceholder')}
        aria-label={t('lit.turns.text')}
        className="min-h-0 text-sm"
        data-testid="turn-text"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            save()
          }
        }}
      />
      <div className="text-xs text-muted-foreground" data-testid="turn-chars">{text.length}/{TURN_CHARS}</div>

      <div className="flex min-w-0 flex-col gap-1">
        <label className="text-xs text-muted-foreground">{t('lit.turns.stancesLabel')}</label>
        <datalist id={`${uid}-names`}>
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        {rows.map((r, i) => (
          <div key={i} className="flex min-w-0 items-start gap-1.5 max-md:rounded-md max-md:border max-md:border-border max-md:p-1.5" data-testid="turn-stance-row">
            <div className="grid min-w-0 flex-1 grid-cols-1 gap-1.5 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <Input
                value={r.who}
                onChange={(e) => setRow(i, { who: e.target.value })}
                maxLength={60}
                list={`${uid}-names`}
                placeholder={t('lit.turns.stanceName')}
                aria-label={t('lit.turns.stanceName')}
                className={cn('text-sm', TAP)}
              />
              <Input
                value={r.line}
                onChange={(e) => setRow(i, { line: e.target.value })}
                maxLength={STANCE_CHARS}
                placeholder={t('lit.turns.stanceLine')}
                aria-label={t('lit.turns.stanceLine')}
                className={cn('text-sm', TAP)}
              />
            </div>
            <Button type="button" variant="ghost" size="icon-sm" className="size-10 md:size-8" aria-label={t('lit.turns.stanceRemove')} onClick={() => setRows((cur) => cur.filter((_, j) => j !== i))}>
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" className={TAP} disabled={rows.length >= STANCES_MAX} onClick={() => setRows((cur) => [...cur, { who: '', line: '' }])} data-testid="turn-add-stance">
            <Plus className="size-4" aria-hidden="true" />
            {t('lit.turns.addStance')}
          </Button>
          <span className="text-xs text-muted-foreground">{t('lit.turns.stancesHint', { n: STANCES_MAX, chars: STANCE_CHARS })}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">{t('lit.f.knownBy')}</label>
        <div className="flex items-center gap-2 py-1 max-md:min-h-10">
          <Checkbox id={`${uid}-everyone`} checked={everyone} onCheckedChange={(v) => setEveryone(v === true)} data-testid="turn-everyone" />
          <label htmlFor={`${uid}-everyone`} className="flex-1 text-sm max-md:py-2">{t('lit.everyoneKnows')}</label>
        </div>
        {!everyone && (
          <Input
            value={knownInput}
            onChange={(e) => setKnownInput(e.target.value)}
            placeholder={t('lit.knownByPlaceholder')}
            aria-label={t('lit.f.knownBy')}
            className={cn('text-sm', TAP)}
          />
        )}
        {!everyone && <p className="text-xs text-muted-foreground">{t('lit.knownByHint')}</p>}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" className={TAP} disabled={!canSave} onClick={save} data-testid="turn-save">
          <Check className="size-4" aria-hidden="true" />
          {t('lit.save')}
        </Button>
        <Button size="sm" variant="ghost" className={TAP} onClick={onCancel}>
          <X className="size-4" aria-hidden="true" />
          {t('lit.cancel')}
        </Button>
      </div>
    </div>
  )
}

// ---------- one card: the fact row's layout ----------

const ORIGIN_KEY = { chapter: 'lit.turns.origin.chapter', mark: 'lit.turns.origin.mark', user: 'lit.origin.user' } as const
const ORIGIN_TONE = { chapter: TONE.kind, mark: TONE.place, user: TONE.yours } as const

/** What the worker wanted to change in a turning point the user wrote: the arc offer's amber block, with Proposals' two answers. */
function PendingNote({ item, later, busy, onAnswer }: { item: LitTurnPending; later?: LitTurn; busy: boolean; onAnswer: (accept: boolean) => void }) {
  const t = useT()
  const override = item.kind === 'override'
  return (
    <div data-testid={override ? 'turn-pending-override' : 'turn-pending-stance'} className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/8 p-3">
      <p className="break-words text-sm">{override ? t('lit.turns.pendingOverride') : t('lit.turns.pendingStance', { who: item.who, line: item.line })}</p>
      {override && later && <p className="break-words text-xs text-muted-foreground">{t('lit.turns.pendingLater', { text: firstWords(later.text, 90) })}</p>}
      {item.reason && <p className="break-words text-xs text-muted-foreground">{t('lit.turns.pendingWhy', { reason: item.reason })}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className={TAP} disabled={busy} onClick={() => onAnswer(true)}>
          <Check className="size-3.5" aria-hidden="true" />
          {override ? t('lit.turns.markUndone') : t('lit.turns.useThis')}
        </Button>
        <Button size="sm" variant="ghost" className={TAP} disabled={busy} onClick={() => onAnswer(false)}>
          <X className="size-3.5" aria-hidden="true" />
          {override ? t('lit.turns.keepIt') : t('lit.turns.keepMine')}
        </Button>
      </div>
    </div>
  )
}

function TurnCard({ turn, byId, ctl }: { turn: LitTurn; byId: Map<string, LitTurn>; ctl: TurnControls }) {
  const t = useT()
  const busy = ctl.busyId === turn.id
  if (ctl.editingId === turn.id) {
    return <TurnEditor turn={turn} names={ctl.names} busy={busy} onSave={(f) => void ctl.save(turn, f)} onCancel={() => ctl.setEditingId(null)} />
  }
  const undone = !!turn.overriddenBy
  const by = turn.overriddenBy ? byId.get(turn.overriddenBy) : undefined
  const earlier = turn.overrides ? byId.get(turn.overrides) : undefined
  const stances = Object.entries(turn.stances ?? {})
  const pending = turn.pending ?? []

  const actions: RowAction[] = [{ key: 'edit', label: t('lit.edit'), icon: PencilSimple, run: () => ctl.setEditingId(turn.id) }]
  if (undone) actions.push({ key: 'putback', label: t('lit.turns.putBack'), icon: ArrowCounterClockwise, run: () => ctl.putBack(turn) })
  else if (ctl.count > 1) actions.push({ key: 'undoneby', label: t('lit.turns.undoneByAction'), icon: ArrowUUpLeft, run: () => ctl.askUndoneBy(turn) })
  if (turn.untrue) actions.push({ key: 'notlie', label: t('lit.turns.notLie'), icon: ArrowCounterClockwise, run: () => ctl.save(turn, { untrue: false }) })
  actions.push({ key: 'delete', label: t('lit.delete'), icon: Trash, run: () => ctl.remove(turn), destructive: true })

  return (
    <div
      data-testid="turn-card"
      data-turn-id={turn.id}
      data-undone={undone ? 'true' : undefined}
      className={cn('group flex flex-col gap-2 rounded-md border px-3 py-2', undone ? 'border-dashed border-border bg-muted/40' : 'border-border bg-card')}
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className={cn('break-words text-sm', undone && 'text-muted-foreground')}>{turn.text}</p>
          {earlier && (
            <p className="flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground" data-testid="turn-undoes">
              <ArrowElbowDownRight className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 break-words">{t('lit.turns.undoes', { text: firstWords(earlier.text, 60) })}</span>
            </p>
          )}
          {stances.length > 0 && (
            <ul className={cn('flex min-w-0 flex-col gap-0.5 text-sm', undone && 'text-muted-foreground')} data-testid="turn-stances">
              {stances.map(([who, line]) => (
                <li key={who} className="break-words">
                  <span className="font-medium">{who}</span>: {line}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={cn(TAG, ORIGIN_TONE[turn.origin] ?? TONE.kind)}>{t(ORIGIN_KEY[turn.origin] ?? ORIGIN_KEY.chapter)}</Badge>
            <Badge variant="outline" className={cn('gap-1', TAG, TONE.knownBy)}>
              <Eye className="size-3" aria-hidden="true" />
              {turn.knownBy === 'all' ? t('lit.knownByAll') : t('lit.knownBy', { names: knownNames(turn.knownBy, t) })}
            </Badge>
            {turn.untrue && <Badge variant="outline" className={cn(TAG, TONE.edited)} data-testid="turn-untrue-tag">{t('lit.turns.untrue', { who: (turn.believers ?? []).join(', ') || '…' })}</Badge>}
            {turn.edited && turn.origin !== 'user' && <Badge variant="outline" className={cn(TAG, TONE.edited)}>{t('lit.edited')}</Badge>}
            {undone && (
              <Badge variant="outline" className={cn('h-auto max-w-full whitespace-normal border-border bg-muted text-left text-muted-foreground', TAG)} data-testid="turn-undone-tag">
                <span className="min-w-0 break-words">{t('lit.turns.undoneBy', { text: by ? firstWords(by.text, 40) : '…' })}</span>
              </Badge>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <div className="hidden items-center gap-0.5 md:flex md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
            {actions.map((x) => (
              <Tooltip key={x.key}>
                <TooltipTrigger
                  render={
                    <Button variant="ghost" size="icon-sm" className={cn('size-9 md:size-7', x.destructive && 'text-destructive')} disabled={busy} onClick={() => void x.run()} aria-label={x.label} data-testid={`turn-${x.key}`}>
                      <x.icon className="size-4" aria-hidden="true" />
                    </Button>
                  }
                />
                <TooltipContent>{x.label}</TooltipContent>
              </Tooltip>
            ))}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" className="size-10 md:size-7" data-testid="turn-menu" disabled={busy} aria-label={t('lit.actions')}>
                  <DotsThree className="size-5 md:size-4" weight="bold" aria-hidden="true" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              {actions.map((x) => (
                <Fragment key={x.key}>
                  {x.destructive && <DropdownMenuSeparator />}
                  <DropdownMenuItem variant={x.destructive ? 'destructive' : 'default'} onClick={() => void x.run()}>
                    <x.icon className="size-4" aria-hidden="true" />
                    {x.label}
                  </DropdownMenuItem>
                </Fragment>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {undone && (
        <div>
          <Button size="sm" variant="outline" className="min-h-10 md:min-h-8" disabled={busy} onClick={() => void ctl.putBack(turn)} data-testid="turn-putback-btn">
            <ArrowCounterClockwise className="size-3.5" aria-hidden="true" />
            {t('lit.turns.putBack')}
          </Button>
        </div>
      )}

      {pending.map((p) => (
        <PendingNote
          key={p.kind === 'override' ? `o:${p.by}` : `s:${p.who}`}
          item={p}
          later={p.kind === 'override' ? byId.get(p.by) : undefined}
          busy={busy}
          onAnswer={(accept) => void ctl.answer(turn, p, accept)}
        />
      ))}
    </div>
  )
}

// ---------- the actions of the tab ----------

function useTurnControls(chat: LitChat, onChat: (c: LitChat) => void, count: number) {
  const t = useT()
  const [confirm, confirmDialog] = useConfirm()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [undoing, setUndoing] = useState<LitTurn | null>(null)
  const names = useMemo(() => turnNames(chat), [chat])

  const run = async (id: string, fn: () => Promise<LitChat>): Promise<boolean> => {
    setBusyId(id)
    try {
      onChat(await fn())
      return true
    } catch (e) {
      toast.error(isAlreadyMarked(e) ? t('lit.turns.alreadyMarked') : errText(e))
      return false
    } finally {
      setBusyId(null)
    }
  }

  return {
    names,
    count,
    editingId,
    setEditingId,
    busyId,
    run,
    undoing,
    closeUndoing: () => setUndoing(null),
    askUndoneBy: (turn: LitTurn) => setUndoing(turn),
    dialogs: confirmDialog,
    save: async (turn: LitTurn, fields: LitTurnFields) => {
      if (await run(turn.id, () => editLitTurn(chat.chatId, turn.id, fields))) setEditingId(null)
    },
    remove: async (turn: LitTurn) => {
      const undid = (chat.turns ?? []).some((x) => x.overriddenBy === turn.id)
      const ok = await confirm({
        title: t('lit.turns.removeTitle'),
        description: undid ? t('lit.turns.removeBodyUndid') : t('lit.turns.removeBody'),
        actionLabel: t('lit.delete'),
        destructive: true,
      })
      if (ok) await run(turn.id, () => removeLitTurn(chat.chatId, turn.id))
    },
    undoBy: async (turn: LitTurn, by: LitTurn) => {
      setUndoing(null)
      await run(turn.id, () => undoLitTurn(chat.chatId, turn.id, by.id))
    },
    putBack: (turn: LitTurn) => run(turn.id, () => undoLitTurn(chat.chatId, turn.id)),
    answer: (turn: LitTurn, p: LitTurnPending, accept: boolean) =>
      run(turn.id, () => resolveLitTurn(chat.chatId, turn.id, p.kind === 'override' ? { kind: 'override', by: p.by } : { kind: 'stance', who: p.who }, accept)),
  }
}

type TurnControls = ReturnType<typeof useTurnControls>

/** A list to pick one from, in a dialog (the pin limit dialog's shape): the chapters to mark, or the later turning point that undid this one. */
function PickDialog({
  open,
  title,
  body,
  items,
  disabled,
  empty,
  onClose,
  onPick,
}: {
  open: boolean
  title: string
  body: string
  items: { id: string; title: string; text: string; note?: string; disabled?: boolean }[]
  disabled: boolean
  empty: string
  onClose: () => void
  onPick: (id: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="turn-pick-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto py-1">
            {items.map((x) => (
              <button
                key={x.id}
                type="button"
                disabled={x.disabled || disabled}
                onClick={() => onPick(x.id)}
                data-testid="turn-pick-option"
                className="flex min-h-10 w-full min-w-0 flex-col gap-0.5 rounded-md border border-border p-3 text-left transition-colors hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                  <span className="min-w-0 break-words">{x.title}</span>
                  {x.note && <span className="text-xs text-muted-foreground">{x.note}</span>}
                </span>
                {x.text && <span className="line-clamp-2 break-words text-xs text-muted-foreground">{x.text}</span>}
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function TurnsTab({ chat, onChat }: TabProps) {
  const t = useT()
  const turns = useMemo(() => sortTurns(chat.turns), [chat.turns])
  const ctl = useTurnControls(chat, onChat, turns.length)
  const [adding, setAdding] = useState(false)
  const [picking, setPicking] = useState(false)

  const byId = useMemo(() => new Map(turns.map((x) => [x.id, x])), [turns])
  const marked = useMemo(() => new Set(turns.filter((x) => x.origin === 'mark' && x.chapterId).map((x) => x.chapterId as string)), [turns])
  const active = activeTurnCount(turns)

  const add = async (fields: LitTurnFields) => {
    if (await ctl.run('add', () => addLitTurn(chat.chatId, { ...fields, text: fields.text ?? '' }))) {
      setAdding(false)
      toast.success(t('lit.turns.addedToast'))
    }
  }
  const mark = async (c: LitChapter) => {
    if (await ctl.run('mark', () => markLitTurn(chat.chatId, c.id))) {
      setPicking(false)
      toast.success(t('lit.turns.markedToast'))
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="turns-tab">
      {ctl.dialogs}
      <PickDialog
        open={picking}
        title={t('lit.turns.markTitle')}
        body={t('lit.turns.markBody')}
        empty={t('lit.turns.noChapters')}
        disabled={ctl.busyId === 'mark'}
        items={chat.chapters.map((c) => ({
          id: c.id,
          title: c.label || firstWords(c.text, 40),
          text: firstWords(c.text, 140),
          note: marked.has(c.id) ? t('lit.turns.alreadyMarkedTag') : undefined,
          disabled: marked.has(c.id),
        }))}
        onClose={() => setPicking(false)}
        onPick={(id) => {
          const c = chat.chapters.find((x) => x.id === id)
          if (c) void mark(c)
        }}
      />
      <PickDialog
        open={!!ctl.undoing}
        title={t('lit.turns.undoneByTitle')}
        body={ctl.undoing ? t('lit.turns.undoneByBody', { text: firstWords(ctl.undoing.text, 60) }) : ''}
        empty={t('lit.turns.noOthers')}
        disabled={false}
        items={turns.filter((x) => x.id !== ctl.undoing?.id).map((x) => ({ id: x.id, title: firstWords(x.text, 90), text: '' }))}
        onClose={ctl.closeUndoing}
        onPick={(id) => {
          const by = byId.get(id)
          if (ctl.undoing && by) void ctl.undoBy(ctl.undoing, by)
        }}
      />

      <p className="text-xs text-muted-foreground">{t('lit.turns.intro')}</p>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className={TAP} onClick={() => setAdding((v) => !v)} disabled={ctl.busyId === 'add'} data-testid="turn-add">
          <Plus className="size-4" aria-hidden="true" />
          {t('lit.turns.add')}
        </Button>
        <Button size="sm" variant="outline" className={TAP} onClick={() => setPicking(true)} data-testid="turn-mark">
          <BookmarkSimple className="size-4" aria-hidden="true" />
          {t('lit.turns.mark')}
        </Button>
      </div>

      {adding && <TurnEditor names={ctl.names} busy={ctl.busyId === 'add'} onSave={(f) => void add(f)} onCancel={() => setAdding(false)} />}

      {turns.length === 0 ? (
        !adding && <p className="py-6 text-sm text-muted-foreground" data-testid="turns-empty">{t('lit.turns.empty')}</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {t('lit.turns.count', { n: active })}
            {active < turns.length && <> · {t('lit.turns.undoneCount', { n: turns.length - active })}</>}
          </p>
          <ul className="flex min-w-0 flex-col gap-2">
            {turns.map((x) => (
              <li key={x.id}>
                <TurnCard turn={x} byId={byId} ctl={ctl} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
