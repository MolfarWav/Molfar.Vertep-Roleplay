import { Fragment, useCallback, useEffect, useId, useMemo, useState, type ComponentType } from 'react'
import {
  Plus,
  MagnifyingGlass,
  PushPin,
  PushPinSlash,
  PencilSimple,
  Trash,
  ArrowCounterClockwise,
  Archive,
  DotsThree,
  Check,
  X,
  CircleNotch,
  Eye,
  ChatText,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { useConfirm } from '@/components/ui/confirm'
import {
  type LitChat,
  type LitFact,
  type LitFactFields,
  type LitFactType,
  type LitFactWeight,
  type LitFactStatus,
  addLitFact,
  searchLitMessages,
  type LitSearchHit,
  editLitFact,
  pinLitFact,
  unpinLitFact,
  retireLitFact,
  restoreLitFact,
  deleteLitFact,
  acceptLitProposal,
  pinnedOf,
  isPinLimit,
} from './litopys-api'
import { TONE, TYPE_TONE, WEIGHT_TONE } from './tones'
import { MessagesDialog, type MessagesRange } from './messages-dialog'

export interface TabProps {
  chat: LitChat
  onChat: (c: LitChat) => void
  onRefresh: () => void
}

const FACT_TYPES: LitFactType[] = ['event', 'trait', 'change', 'relation', 'world', 'plan']
const FACT_WEIGHTS: LitFactWeight[] = ['everyday', 'important', 'key']
const STATE_FILTERS = ['active', 'pinned', 'retired', 'superseded', 'all'] as const
type StateFilter = (typeof STATE_FILTERS)[number]

const WEIGHT_ORDER: Record<LitFactWeight, number> = { key: 0, important: 1, everyday: 2 }

interface RowAction {
  key: string
  label: string
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>
  run: () => unknown
  destructive?: boolean
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

function typeKey(type: LitFactType) {
  const map: Record<LitFactType, `lit.type.${LitFactType}`> = {
    event: 'lit.type.event',
    trait: 'lit.type.trait',
    change: 'lit.type.change',
    relation: 'lit.type.relation',
    world: 'lit.type.world',
    plan: 'lit.type.plan',
  }
  return map[type]
}

function weightKey(weight: LitFactWeight) {
  const map: Record<LitFactWeight, `lit.weight.${LitFactWeight}`> = {
    everyday: 'lit.weight.everyday',
    important: 'lit.weight.important',
    key: 'lit.weight.key',
  }
  return map[weight]
}

function statusKey(status: LitFactStatus) {
  const map: Record<LitFactStatus, `lit.status.${LitFactStatus}`> = {
    active: 'lit.status.active',
    retired: 'lit.status.retired',
    superseded: 'lit.status.superseded',
  }
  return map[status]
}

function stateKey(state: StateFilter) {
  if (state === 'pinned') return 'lit.state.pinned'
  if (state === 'all') return 'lit.status.all'
  return statusKey(state as LitFactStatus)
}

function originKey(origin: string | undefined) {
  if (origin === 'user') return 'lit.origin.user'
  if (origin === 'merge') return 'lit.origin.merge'
  return undefined
}

function sameKnown(a: string[] | 'all', b: string[] | 'all') {
  if (a === 'all' || b === 'all') return a === 'all' && b === 'all'
  return a.length === b.length && a.every((x, i) => x === b[i])
}

export function PinLimitDialog(props: {
  open: boolean
  subject: string
  limit: number
  pinned: LitFact[]
  busy?: boolean
  onCancel: () => void
  onReplace: (replaceId: string) => void
}) {
  const t = useT()
  const { open, subject, limit, pinned, busy, onCancel, onReplace } = props
  const [selected, setSelected] = useState<string | null>(null)
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent data-testid="pin-limit-dialog">
        <DialogHeader>
          <DialogTitle>{t('lit.pinLimitTitle', { name: subject, n: limit })}</DialogTitle>
          <DialogDescription>{t('lit.pinLimitBody')}</DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto py-2">
          {pinned.map((f) => (
            <label
              key={f.id}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 transition-colors',
                selected === f.id && 'bg-accent'
              )}
            >
              <input
                type="radio"
                name="pin-replace"
                value={f.id}
                checked={selected === f.id}
                onChange={() => setSelected(f.id)}
                className="mt-1"
              />
              <span className="text-sm">{f.text}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {t('lit.cancel')}
          </Button>
          <Button disabled={!selected || busy} onClick={() => selected && onReplace(selected)}>
            {busy ? <CircleNotch className="size-4 animate-spin" aria-hidden="true" /> : t('lit.replace')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function usePinFlow(chat: LitChat, onChat: (c: LitChat) => void) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [limit, setLimit] = useState(0)
  const [pinned, setPinned] = useState<LitFact[]>([])
  const [pending, setPending] = useState<{ fact?: LitFact; proposalId?: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const pin = useCallback(
    async (fact: LitFact, proposalId?: string) => {
      setBusy(true)
      try {
        let answer: LitChat
        if (proposalId) {
          answer = await acceptLitProposal(chat.chatId, proposalId)
        } else {
          answer = await pinLitFact(chat.chatId, fact.id)
        }
        onChat(answer)
        toast.success(t('lit.pinnedToast'))
      } catch (e) {
        if (isPinLimit(e)) {
          setPending({ fact, proposalId })
          setSubject(fact.subject)
          setLimit(chat.pinLimit)
          setPinned(pinnedOf(chat.facts, fact.subject))
          setOpen(true)
        } else if (e instanceof Error && e.message === 'target gone') {
          toast.error(t('lit.targetGone'))
        } else {
          toast.error(errText(e))
        }
      } finally {
        setBusy(false)
      }
    },
    [chat, onChat, t]
  )

  const onReplace = useCallback(
    async (replaceId: string) => {
      if (!pending) return
      setBusy(true)
      try {
        let answer: LitChat
        if (pending.proposalId) {
          answer = await acceptLitProposal(chat.chatId, pending.proposalId, replaceId)
        } else if (pending.fact) {
          answer = await pinLitFact(chat.chatId, pending.fact.id, replaceId)
        } else {
          return
        }
        onChat(answer)
        toast.success(t('lit.pinnedToast'))
        setOpen(false)
      } catch (e) {
        toast.error(errText(e))
      } finally {
        setBusy(false)
      }
    },
    [chat, onChat, pending, t]
  )

  const dialog = (
    <PinLimitDialog
      open={open}
      subject={subject}
      limit={limit}
      pinned={pinned}
      busy={busy}
      onCancel={() => setOpen(false)}
      onReplace={onReplace}
    />
  )

  return { pin, dialog }
}

function FactEditor({
  fact,
  names,
  busy,
  onSave,
  onCancel,
}: {
  fact?: LitFact
  names: string[]
  busy?: boolean
  onSave: (patch: LitFactFields & { text?: string }) => void
  onCancel: () => void
}) {
  const t = useT()
  const listId = useId()
  const [text, setText] = useState(fact?.text ?? '')
  const [subject, setSubject] = useState(fact?.subject === 'world' ? '' : (fact?.subject ?? ''))
  const [everyone, setEveryone] = useState(fact ? fact.knownBy === 'all' : true)
  const [knownInput, setKnownInput] = useState(
    fact && Array.isArray(fact.knownBy) ? fact.knownBy.join(', ') : ''
  )
  const [type, setType] = useState<LitFactType>(fact?.type ?? 'event')
  const [weight, setWeight] = useState<LitFactWeight>(fact?.weight ?? 'everyday')

  const normSubject = subject.trim() || 'world'
  const normKnown: string[] | 'all' = everyone
    ? 'all'
    : knownInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

  const patch: LitFactFields = {}
  if (!fact || text.trim() !== fact.text) patch.text = text.trim()
  if (!fact || normSubject !== fact.subject) patch.subject = normSubject
  if (!fact || !sameKnown(normKnown, fact.knownBy)) patch.knownBy = normKnown
  if (!fact || type !== fact.type) patch.type = type
  if (!fact || weight !== fact.weight) patch.weight = weight

  const changed = Object.keys(patch).length > 0
  const canSave = text.trim().length > 0 && changed && !busy && (normKnown === 'all' || normKnown.length > 0)

  const save = () => {
    if (!canSave) return
    onSave(patch)
  }

  return (
    <div
      data-testid="fact-editor"
      className="flex flex-col gap-2 rounded-md border border-border bg-card p-3"
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
        maxLength={300}
        rows={3}
        placeholder={t('lit.f.textPlaceholder')}
        aria-label={t('lit.f.text')}
        className="min-h-0 text-sm"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            save()
          }
        }}
      />
      <div className="text-xs text-muted-foreground">{text.length}/300</div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t('lit.f.subject')}</label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t('lit.subjectPlaceholder')}
            list={listId}
            className="text-sm"
          />
          <datalist id={listId}>
            {names.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t('lit.f.knownBy')}</label>
          <div className="flex items-center gap-2 py-1">
            <Checkbox
              id={`${listId}-everyone`}
              checked={everyone}
              onCheckedChange={(v) => setEveryone(v === true)}
            />
            <label htmlFor={`${listId}-everyone`} className="text-sm">
              {t('lit.everyoneKnows')}
            </label>
          </div>
          {!everyone && (
            <Input
              value={knownInput}
              onChange={(e) => setKnownInput(e.target.value)}
              placeholder={t('lit.knownByPlaceholder')}
              className="text-sm"
            />
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t('lit.f.type')}</label>
          <Select value={type} onValueChange={(v) => setType(v as LitFactType)}>
            <SelectTrigger className="text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FACT_TYPES.map((tKey) => (
                <SelectItem key={tKey} value={tKey}>
                  {t(typeKey(tKey))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t('lit.f.weight')}</label>
          <Select value={weight} onValueChange={(v) => setWeight(v as LitFactWeight)}>
            <SelectTrigger className="text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FACT_WEIGHTS.map((w) => (
                <SelectItem key={w} value={w}>
                  {t(weightKey(w))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" disabled={!canSave} onClick={save}>
          <Check className="size-4" aria-hidden="true" />
          {t('lit.save')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X className="size-4" aria-hidden="true" />
          {t('lit.cancel')}
        </Button>
      </div>
    </div>
  )
}

/** Every name the record knows (subjects and knownBy), for editors and the who-filter. */
function namesOf(facts: LitFact[]) {
  const map = new Map<string, string>()
  for (const f of facts) {
    if (f.subject) map.set(f.subject.toLowerCase(), f.subject)
    if (Array.isArray(f.knownBy)) for (const n of f.knownBy) map.set(n.toLowerCase(), n)
  }
  return Array.from(map.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

/**
 * The fact actions shared by the Ledger and the Overview: one busy row at a time, one editor,
 * the pin flow and the delete confirmation. Render `dialogs` once where the hook is used.
 */
export function useFactControls(chat: LitChat, onChat: (c: LitChat) => void) {
  const t = useT()
  const [confirm, confirmDialog] = useConfirm()
  const pinFlow = usePinFlow(chat, onChat)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const names = useMemo(() => namesOf(chat.facts), [chat.facts])
  const factById = useMemo(() => new Map(chat.facts.map((f) => [f.id, f])), [chat.facts])
  const [msgRange, setMsgRange] = useState<MessagesRange | null>(null)

  const run = async (id: string, fn: () => Promise<LitChat>) => {
    setBusyId(id)
    try {
      onChat(await fn())
      return true
    } catch (e) {
      toast.error(errText(e))
      return false
    } finally {
      setBusyId(null)
    }
  }

  const handleEdit = async (fact: LitFact, patch: LitFactFields) => {
    if (await run(fact.id, () => editLitFact(chat.chatId, fact.id, patch))) setEditingId(null)
  }

  const handleDelete = async (fact: LitFact) => {
    const ok = await confirm({ title: t('lit.deleteFactTitle'), description: t('lit.deleteFactBody'), actionLabel: t('lit.delete'), destructive: true })
    if (ok) await run(fact.id, () => deleteLitFact(chat.chatId, fact.id))
  }

  const withToast = (text: string, fn: () => Promise<LitChat>) => async () => {
    const answer = await fn()
    toast.info(text)
    return answer
  }

  /** One list of row actions for both the inline buttons (md+) and the ⋯ menu. */
  const actionsFor = (fact: LitFact, slot = ''): RowAction[] => {
    const out: RowAction[] = []
    if (fact.status === 'active') {
      out.push(
        fact.pinned
          ? { key: 'unpin', label: t('lit.unpin'), icon: PushPinSlash, run: () => run(fact.id, withToast(t('lit.unpinnedToast'), () => unpinLitFact(chat.chatId, fact.id))) }
          : { key: 'pin', label: t('lit.pin'), icon: PushPin, run: () => pinFlow.pin(fact) },
        { key: 'retire', label: t('lit.retire'), icon: Archive, run: () => run(fact.id, withToast(t('lit.retiredToast'), () => retireLitFact(chat.chatId, fact.id))) },
      )
    }
    if (fact.status === 'retired') out.push({ key: 'restore', label: t('lit.restore'), icon: ArrowCounterClockwise, run: () => run(fact.id, () => restoreLitFact(chat.chatId, fact.id)) })
    if (fact.src?.from) {
      const src = fact.src
      out.push({ key: 'messages', label: t('lit.msgs.open'), icon: ChatText, run: () => setMsgRange({ from: src.from!, to: src.to ?? undefined, title: fact.text }) })
    }
    if (fact.status !== 'superseded') out.push({ key: 'edit', label: t('lit.edit'), icon: PencilSimple, run: () => setEditingId(slot + fact.id) })
    out.push({ key: 'delete', label: t('lit.delete'), icon: Trash, run: () => handleDelete(fact), destructive: true })
    return out
  }

  const dialogs = (
    <>
      {confirmDialog}
      {pinFlow.dialog}
      <MessagesDialog chatId={chat.chatId} range={msgRange} onClose={() => setMsgRange(null)} />
    </>
  )
  return { names, factById, busyId, editingId, setEditingId, actionsFor, handleEdit, run, dialogs, openMessages: setMsgRange }
}

export type FactControls = ReturnType<typeof useFactControls>

/**
 * One fact: its text, badges and actions, or its editor while it is being edited. compact (the
 * Overview) drops the subject badge, which the card or chapter around it already says.
 */
export function FactItem({ fact, ctl, compact = false, slot = '' }: { fact: LitFact; ctl: FactControls; compact?: boolean; slot?: string }) {
  const t = useT()
  if (ctl.editingId === slot + fact.id) {
    return <FactEditor fact={fact} names={ctl.names} busy={ctl.busyId === fact.id} onSave={(patch) => ctl.handleEdit(fact, patch)} onCancel={() => ctl.setEditingId(null)} />
  }
  const disabled = ctl.busyId === fact.id
  const actions = ctl.actionsFor(fact, slot)
  const textOf = (id: string) => {
    const f = ctl.factById.get(id)
    return f ? (f.text.length > 60 ? f.text.slice(0, 59) + '…' : f.text) : id
  }
  return (
    <div data-testid="fact-row" className={cn('group rounded-md border border-border bg-card', compact ? 'px-2.5 py-1.5' : 'px-3 py-2')}>
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className={cn('break-words', compact ? 'text-sm leading-snug' : 'text-sm')}>{fact.text}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {!compact && (
              <Badge variant="outline" className={cn('text-[10px]', fact.subject === 'world' ? TYPE_TONE.world : TONE.subject)}>
                {fact.subject === 'world' ? t('lit.type.world') : t('lit.subject', { name: fact.subject })}
              </Badge>
            )}
            <Badge variant="outline" className={cn('gap-1 text-[10px]', TONE.knownBy)}>
              <Eye className="size-3" aria-hidden="true" />
              {fact.knownBy === 'all' ? t('lit.knownByAll') : t('lit.knownBy', { names: fact.knownBy.join(', ') })}
            </Badge>
            <Badge variant="outline" className={cn('text-[10px]', TYPE_TONE[fact.type])}>{t(typeKey(fact.type))}</Badge>
            <Badge variant="outline" className={cn('text-[10px]', WEIGHT_TONE[fact.weight])}>
              {t(weightKey(fact.weight))}
            </Badge>
            {fact.pinned && (
              <Badge variant="outline" className={cn('gap-1 text-[10px]', TONE.pinned)}>
                <PushPin weight="fill" className="size-3" aria-hidden="true" />
                {t('lit.pinned')}
              </Badge>
            )}
            {!fact.pinned && fact.pinProposed && (
              <Badge variant="outline" className={cn('gap-1 text-[10px]', TONE.pinProposed)}>
                <PushPin className="size-3" aria-hidden="true" />
                {t('lit.pinProposed')}
              </Badge>
            )}
            {fact.edited && <Badge variant="outline" className={cn('text-[10px]', TONE.edited)}>{t('lit.edited')}</Badge>}
            {originKey(fact.origin) && <Badge variant="outline" className={cn('text-[10px]', fact.origin === 'merge' ? TONE.merged : TONE.yours)}>{t(originKey(fact.origin)!)}</Badge>}
            {fact.status !== 'active' && <Badge variant="outline" className={cn('text-[10px]', TONE.gone)}>{t(statusKey(fact.status))}</Badge>}
            {fact.mergedInto && <Badge variant="outline" className={cn('text-[10px]', TONE.merged)}>{t('lit.mergedInto', { id: textOf(fact.mergedInto) })}</Badge>}
            {fact.supersedes && <Badge variant="outline" className={cn('text-[10px]', TONE.kind)}>{t('lit.supersedes', { id: textOf(fact.supersedes) })}</Badge>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {/* compact rows have no room to spare: the hover buttons would keep ~110px free all the time, the menu has everything */}
          <div className={cn("hidden items-center gap-0.5", !compact && "md:flex md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100")}>
            {actions.map((x) => (
              <Tooltip key={x.key}>
                <TooltipTrigger
                  render={
                    <Button variant="ghost" size="icon-sm" className={cn('size-9 md:size-7', x.destructive && 'text-destructive')} disabled={disabled} onClick={() => void x.run()} aria-label={x.label}>
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
                <Button variant="ghost" size="icon-sm" className="size-9 md:size-7" data-testid="fact-menu" disabled={disabled} aria-label={t('lit.actions')}>
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
    </div>
  )
}

export function FactsTab({ chat, onChat }: TabProps) {
  const t = useT()
  const ctl = useFactControls(chat, onChat)
  const [adding, setAdding] = useState(false)

  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | LitFactType>('all')
  const [weightFilter, setWeightFilter] = useState<'all' | LitFactWeight>('all')
  const [whoFilter, setWhoFilter] = useState<'all' | string>('all')
  const [stateFilter, setStateFilter] = useState<StateFilter>('active')
  const names = ctl.names
  // M4d: the search box can look in the original messages instead of the facts
  const [inMessages, setInMessages] = useState(false)
  const [hits, setHits] = useState<LitSearchHit[] | null>(null)
  const [hitError, setHitError] = useState('')
  const q2 = query.trim()
  useEffect(() => {
    if (!inMessages || q2.length < 2) {
      setHits(null)
      setHitError('')
      return
    }
    let live = true
    const id = setTimeout(() => {
      searchLitMessages(chat.chatId, q2)
        .then((r) => {
          if (live) {
            setHits(r.hits)
            setHitError('')
          }
        })
        .catch((e: unknown) => {
          if (live) setHitError(errText(e))
        })
    }, 350)
    return () => {
      live = false
      clearTimeout(id)
    }
  }, [inMessages, q2, chat.chatId])

  const isFiltered =
    query.trim().length > 0 ||
    typeFilter !== 'all' ||
    weightFilter !== 'all' ||
    whoFilter !== 'all' ||
    stateFilter !== 'active'

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return chat.facts
      .filter((f) => {
        if (q) {
          const hay = [f.text, f.subject, ...(Array.isArray(f.knownBy) ? f.knownBy : ['all'])]
            .join('\n')
            .toLowerCase()
          if (!hay.includes(q)) return false
        }
        if (typeFilter !== 'all' && f.type !== typeFilter) return false
        if (weightFilter !== 'all' && f.weight !== weightFilter) return false
        if (whoFilter !== 'all') {
          const who = whoFilter.toLowerCase()
          const about = f.subject.toLowerCase() === who
          const knows =
            f.knownBy === 'all' ||
            (Array.isArray(f.knownBy) && f.knownBy.some((n) => n.toLowerCase() === who))
          if (!about && !knows) return false
        }
        if (stateFilter === 'active') return f.status === 'active'
        if (stateFilter === 'pinned') return f.status === 'active' && f.pinned
        if (stateFilter === 'all') return true
        return f.status === stateFilter
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        const wa = WEIGHT_ORDER[a.weight]
        const wb = WEIGHT_ORDER[b.weight]
        if (wa !== wb) return wa - wb
        return b.updatedAt - a.updatedAt
      })
  }, [chat.facts, query, typeFilter, weightFilter, whoFilter, stateFilter])

  const handleAdd = async (fields: LitFactFields) => {
    if (await ctl.run('add', () => addLitFact(chat.chatId, { ...fields, text: fields.text ?? '' }))) setAdding(false)
  }

  const clearFilters = () => {
    setQuery('')
    setTypeFilter('all')
    setWeightFilter('all')
    setWhoFilter('all')
    setStateFilter('active')
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {ctl.dialogs}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)} disabled={ctl.busyId === 'add'}>
          <Plus className="size-4" aria-hidden="true" />
          {t('lit.addFact')}
        </Button>
      </div>

      {adding && <FactEditor names={names} busy={ctl.busyId === 'add'} onSave={handleAdd} onCancel={() => setAdding(false)} />}

      <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
        <div className="relative col-span-2 md:col-span-1 md:min-w-[180px] md:flex-1">
          <MagnifyingGlass className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={inMessages ? t('lit.msgs.searchPlaceholder') : t('lit.searchFacts')}
            className="pl-9 text-sm"
          />
        </div>
        <label className="col-span-2 flex items-center gap-2 text-xs md:col-span-1">
          <Checkbox checked={inMessages} onCheckedChange={(v) => setInMessages(v === true)} data-testid="search-originals" />
          {t('lit.msgs.searchToggle')}
        </label>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as 'all' | LitFactType)}>
          <SelectTrigger className="w-full min-w-0 text-sm md:w-auto md:min-w-[120px]" aria-label={t('lit.f.type')}>
            <SelectValue placeholder={t('lit.type.event')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('lit.filter.anyType')}</SelectItem>
            {FACT_TYPES.map((tKey) => (
              <SelectItem key={tKey} value={tKey}>
                {t(typeKey(tKey))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={weightFilter} onValueChange={(v) => setWeightFilter(v as 'all' | LitFactWeight)}>
          <SelectTrigger className="w-full min-w-0 text-sm md:w-auto md:min-w-[120px]" aria-label={t('lit.f.weight')}>
            <SelectValue placeholder={t('lit.weight.everyday')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('lit.filter.anyWeight')}</SelectItem>
            {FACT_WEIGHTS.map((w) => (
              <SelectItem key={w} value={w}>
                {t(weightKey(w))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={whoFilter} onValueChange={(v) => setWhoFilter(v ?? 'all')}>
          <SelectTrigger className="w-full min-w-0 text-sm md:w-auto md:min-w-[120px]" aria-label={t('lit.f.knownBy')}>
            <SelectValue placeholder={t('lit.f.knownBy')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('lit.filter.anyone')}</SelectItem>
            {names.map((n) => (
              <SelectItem key={n} value={n}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={stateFilter} onValueChange={(v) => setStateFilter(v as StateFilter)}>
          <SelectTrigger className="w-full min-w-0 text-sm md:w-auto md:min-w-[120px]" aria-label={t('lit.status')}>
            <SelectValue placeholder={t('lit.status.active')} />
          </SelectTrigger>
          <SelectContent>
            {STATE_FILTERS.map((s) => (
              <SelectItem key={s} value={s}>
                {t(stateKey(s))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isFiltered && (
          <Button size="sm" variant="ghost" onClick={clearFilters}>
            {t('lit.clear')}
          </Button>
        )}
      </div>

      {inMessages ? (
        <div className="flex flex-col gap-2" data-testid="search-hits">
          {q2.length < 2 && <p className="text-xs text-muted-foreground">{t('lit.msgs.searchHint')}</p>}
          {hitError && <p className="text-xs text-destructive">{hitError}</p>}
          {hits && hits.length === 0 && <p className="py-4 text-sm text-muted-foreground">{t('lit.msgs.noHits')}</p>}
          {hits?.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => ctl.openMessages({ from: h.chapter?.from ?? h.id, to: h.chapter?.to ?? h.id, title: h.chapter?.label || h.snippet })}
              className="rounded-md border border-border bg-card px-3 py-2 text-left hover:bg-accent/50"
            >
              <p className="mb-1 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{h.name}</span> · {t('lit.msgs.no', { n: h.no })}
                {h.chapter && <> · {t('lit.msgs.inChapter', { label: h.chapter.label || h.chapter.id })}</>}
              </p>
              <p className="break-words text-sm">{h.snippet}</p>
            </button>
          ))}
        </div>
      ) : (
      <>
      <p className="text-xs text-muted-foreground">
        {t('lit.factsShown', { n: visible.length, total: chat.facts.length })}
      </p>

      {chat.facts.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">{t('lit.noFactsYet')}</p>
      ) : visible.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">{t('lit.noFacts')}</p>
      ) : (
        <ul className="flex min-w-0 flex-col gap-2">
          {visible.map((fact) => (
            <li key={fact.id}>
              <FactItem fact={fact} ctl={ctl} />
            </li>
          ))}
        </ul>
      )}
      </>
      )}
    </div>
  )
}
