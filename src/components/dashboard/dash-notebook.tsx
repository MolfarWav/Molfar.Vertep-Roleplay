import { useState } from 'react'
import { Brain, CaretDown, CaretRight, DotsThree, Ear, Eye, EyeSlash, Plus, PushPin } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { NOTE_TAGS, sortedNotes, type DashChar, type How, type Note, type NoteTag } from '@/lib/dashboard'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { Box, GOLD_TEXT, Label, useTx } from './dash-common'
import { useNotesAct } from './dash-context'

const FIELD = 'rounded-none'
const NOTE_MAX = 300

function HowIcon({ how }: { how: How }) {
  const cls = 'mt-0.5 size-3.5 shrink-0 text-muted-foreground'
  if (how === 'saw') return <Eye className={cls} aria-hidden="true" />
  if (how === 'heard') return <Ear className={cls} aria-hidden="true" />
  return <Brain className={cls} aria-hidden="true" />
}

/** pinned: gold with a pin, important: rose, everyday: grey; unmarked has no chip. */
function TagChip({ tag }: { tag: NoteTag }) {
  const tx = useTx()
  const look = {
    pinned: cn('border-[#9a6a14]/50 bg-[#f2c27a]/15', GOLD_TEXT),
    important: 'border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    everyday: 'border-border text-muted-foreground',
  }[tag]
  return (
    <span className={cn('inline-flex items-center gap-1 border px-1 py-px font-sans text-[10px] uppercase tracking-wide', look)}>
      {tag === 'pinned' && <PushPin className="size-2.5" weight="fill" aria-hidden="true" />}
      {tx('dash.tag', tag)}
    </span>
  )
}

function NoteEditor({ initial, onSave, onCancel }: { initial: string; onSave: (text: string) => void; onCancel: () => void }) {
  const t = useT()
  const [text, setText] = useState(initial)
  return (
    <div className="flex flex-col gap-1.5">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={NOTE_MAX} rows={3} className={cn(FIELD, 'min-h-0 text-sm')} aria-label={t('dash.note.edit')} />
      <div className="flex gap-2">
        <Button size="xs" className={FIELD} disabled={!text.trim() || text.trim() === initial} onClick={() => onSave(text.trim())}>{t('dash.set.save')}</Button>
        <Button size="xs" variant="ghost" className={FIELD} onClick={onCancel}>{t('home.cancel')}</Button>
      </div>
    </div>
  )
}

function NoteRow({ note, you, editable }: { note: Note; you: string; editable: boolean }) {
  const t = useT()
  const tx = useTx()
  const act = useNotesAct()
  const [editing, setEditing] = useState(false)
  const mine = note.by === 'user'
  const from = note.from === 'user' ? you : note.from
  const source = mine
    ? t('dash.note.byYou')
    : note.how === 'heard' && note.from && note.from !== 'user' && from
      ? t('dash.how.heardFrom', { from })
      : tx('dash.how', note.how)
  const mark = (tag: NoteTag | null) => { void act({ op: 'edit', id: note.id, tag }) }
  return (
    <li className="flex min-w-0 items-start gap-2 border-b border-dashed border-border py-1.5 first:pt-0 last:border-b-0 last:pb-0">
      <HowIcon how={note.how} />
      <div className="min-w-0 flex-1">
        {editing ? (
          <NoteEditor
            initial={note.text}
            onCancel={() => setEditing(false)}
            onSave={(text) => { void act({ op: 'edit', id: note.id, text }).then((ok) => { if (ok) setEditing(false) }) }}
          />
        ) : (
          <div className="text-sm leading-snug break-words">{note.text}</div>
        )}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10.5px] text-muted-foreground">
          {note.tag && <TagChip tag={note.tag} />}
          <span>{source}</span>
          {note.believes === false && <span>{t('dash.how.doubts')}</span>}
          {note.edited && <span>{t('dash.note.edited')}</span>}
          {!mine && <span>{t('dash.story.turn', { n: note.turn })}</span>}
        </div>
      </div>
      {editable && !editing && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-xs" className={FIELD} aria-label={t('dash.note.menu')} title={t('dash.note.menu')}><DotsThree weight="bold" aria-hidden="true" /></Button>}
          />
          <DropdownMenuContent align="end" className="min-w-56">
            <DropdownMenuItem onClick={() => setEditing(true)}>{t('dash.note.edit')}</DropdownMenuItem>
            <DropdownMenuSeparator />
            {NOTE_TAGS.map((tag) => (
              <DropdownMenuItem key={tag} onClick={() => mark(tag)} disabled={note.tag === tag}>{t(`dash.note.mark.${tag}`)}</DropdownMenuItem>
            ))}
            {note.tag && <DropdownMenuItem onClick={() => mark(null)}>{t('dash.tag.none')}</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => { void act({ op: 'retire', id: note.id }) }}>{t('dash.note.remove')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  )
}

function AddNote({ name }: { name: string }) {
  const t = useT()
  const tx = useTx()
  const act = useNotesAct()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [how, setHow] = useState<How>('saw')
  const [tag, setTag] = useState<NoteTag | 'none'>('none')
  const [busy, setBusy] = useState(false)
  if (!open) {
    return (
      <Button size="xs" variant="outline" className={cn(FIELD, 'mt-2 w-fit')} onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />{t('dash.note.add')}
      </Button>
    )
  }
  const add = async () => {
    setBusy(true)
    const ok = await act({ op: 'add', name, text: text.trim(), how, ...(tag === 'none' ? {} : { tag }) })
    setBusy(false)
    if (ok) { setText(''); setHow('saw'); setTag('none'); setOpen(false) }
  }
  return (
    <div className="mt-2 flex flex-col gap-1.5 border border-border p-2">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={NOTE_MAX} rows={3} placeholder={t('dash.note.placeholder', { name })} aria-label={t('dash.note.add')} className={cn(FIELD, 'min-h-0 text-sm')} />
      <div className="flex flex-wrap gap-2">
        <label className="flex min-w-[120px] flex-1 flex-col gap-1 text-[11px] text-muted-foreground">
          {t('dash.note.how')}
          <Select value={how} onValueChange={(v) => v && setHow(v as How)}>
            <SelectTrigger className={cn(FIELD, 'w-full')}><SelectValue /></SelectTrigger>
            <SelectContent>
              {(['saw', 'heard', 'guess'] as const).map((h) => <SelectItem key={h} value={h}>{tx('dash.how', h)}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <label className="flex min-w-[120px] flex-1 flex-col gap-1 text-[11px] text-muted-foreground">
          {t('dash.note.tag')}
          <Select value={tag} onValueChange={(v) => v && setTag(v as NoteTag | 'none')}>
            <SelectTrigger className={cn(FIELD, 'w-full')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t('dash.tag.none')}</SelectItem>
              {NOTE_TAGS.map((g) => <SelectItem key={g} value={g}>{tx('dash.tag', g)}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
      </div>
      <div className="flex gap-2">
        <Button size="xs" className={FIELD} disabled={busy || !text.trim()} onClick={() => { void add() }}>{t('dash.set.addRow')}</Button>
        <Button size="xs" variant="ghost" className={FIELD} onClick={() => setOpen(false)}>{t('home.cancel')}</Button>
      </div>
    </div>
  )
}

export function Notebook({ name, char, userName, className, id, compact }: {
  name: string
  char: DashChar
  userName: string
  className?: string
  /** makes the box a scroll target (the strip's note chips) */
  id?: string
  /** the wide view: the box is at most ~360 px tall and scrolls inside */
  compact?: boolean
}) {
  const t = useT()
  const act = useNotesAct()
  const [showBlind, setShowBlind] = useState(false)
  const you = userName || t('dash.you')
  const editable = Array.isArray(char.retired)
  const entries = sortedNotes(char.notebook)
  const removed = char.retired ?? []
  return (
    <Box id={id} title={t('dash.notebook', { name })} className={cn(compact && 'max-h-[360px] overflow-y-auto', className)}>
      <div className="mb-2 min-w-0 text-sm break-words">
        {char.name?.knowsUserName ? t('dash.name.known') : t('dash.name.unknown')}
        {char.name?.calls ? <span className="text-muted-foreground"> · {t('dash.name.calls', { calls: char.name.calls })}</span> : null}
      </div>
      {entries.length === 0 ? (
        <div className="text-sm text-muted-foreground">{t('dash.notebook.none')}</div>
      ) : (
        <ul className="flex flex-col">
          {entries.map((n) => <NoteRow key={n.id} note={n} you={you} editable={editable} />)}
        </ul>
      )}
      {editable && <AddNote name={name} />}
      {removed.length > 0 && (
        <Collapsible className="mt-2">
          <CollapsibleTrigger className="group/rm flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <CaretRight className="size-3 group-data-[panel-open]/rm:hidden" aria-hidden="true" />
            <CaretDown className="hidden size-3 group-data-[panel-open]/rm:block" aria-hidden="true" />
            {t('dash.note.removed', { n: removed.length })}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-1 flex flex-col">
              {removed.map((n) => (
                <li key={n.id} className="flex min-w-0 items-start gap-2 border-b border-dashed border-border py-1 text-muted-foreground last:border-b-0">
                  <span className="min-w-0 flex-1 text-xs break-words line-through">{n.text}</span>
                  <Button size="xs" variant="ghost" className={FIELD} onClick={() => { void act({ op: 'restore', id: n.id }) }}>{t('dash.note.restore')}</Button>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
      {char.blindSpot && (
        <div className="mt-3 border-t border-border pt-2">
          <button
            type="button"
            onClick={() => setShowBlind((v) => !v)}
            aria-expanded={showBlind}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <EyeSlash className="size-3.5" aria-hidden="true" />
            {t('dash.blind.show')}
          </button>
          {showBlind && (
            <div className="mt-2 border border-dashed border-border bg-muted/40 p-2">
              <Label className="mb-1">{t('dash.blind')}</Label>
              <div className="text-sm break-words">{char.blindSpot}</div>
            </div>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5 opacity-50">
        <span className="border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">{t('dash.later.rumor')}</span>
        <span className="border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">{t('dash.later.leak')}</span>
      </div>
    </Box>
  )
}
