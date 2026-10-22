import { useState } from 'react'
import { toast } from 'sonner'
import { DotsThree, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { useT } from '@/hooks/use-t'
import type { MsgKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { type CardMemoryView, type MemLinePatch, type MemSource, putCardMemory } from './memory-api'

type T = ReturnType<typeof useT>
type ListName = 'facts' | 'notes' | 'said'
const LINE_MAX = 300
const ARC_MAX = 1500
const KINDS = ['vow', 'promise', 'threat', 'confession', 'secret', 'order', 'refusal', 'lie', 'other'] as const

/** What one story keeps, line by line: read, edit, remove (with Undo) and add by hand. Works the same
 *  when the chat is gone: the lines live in the card's memory file, not in the chat. */
export function StoryLines({
  cardId,
  cardName,
  source,
  t,
  apply,
}: {
  cardId: string
  cardName: string
  source: MemSource
  t: T
  apply: (run: () => Promise<CardMemoryView>) => Promise<boolean>
}) {
  // one line is edited or added at a time: "facts:2" edits the third fact, "facts:+" adds one
  const [at, setAt] = useState<string | null>(null)
  const send = (line: MemLinePatch) => apply(() => putCardMemory(cardId, { source: { id: source.id, line } }))

  const removeLine = async (list: ListName, index: number) => {
    const old = source[list][index]
    if (!old || !(await send({ list, index, remove: true }))) return
    toast(t('mem.ln.removed'), {
      action: {
        label: t('mem.ln.undo'),
        onClick: () => {
          // the line goes back to the end of its list (the server only appends)
          const back: MemLinePatch = { list, add: true, text: old.text }
          if ('subject' in old) back.subject = old.subject
          if ('who' in old) back.who = old.who
          if ('kind' in old) back.kind = old.kind
          if ('how' in old) back.how = old.how
          void send(back).then((ok) => { if (ok) toast.success(t('mem.ln.restored')) })
        },
      },
    })
  }
  const removeArc = async () => {
    const old = source.arc
    if (!old || !(await send({ list: 'arc', remove: true }))) return
    toast(t('mem.ln.removed'), { action: { label: t('mem.ln.undo'), onClick: () => void send({ list: 'arc', text: old }) } })
  }

  return (
    <div className="mt-2 flex flex-col gap-4 rounded-md border border-border bg-muted/30 p-2.5" data-testid="mem-story-lines">
      <Block title={t('mem.ln.arc')} count={source.arc ? 1 : 0}>
        {at === 'arc' ? (
          <LineEditor
            t={t}
            initial={source.arc}
            max={ARC_MAX}
            label={t('mem.ln.editLabel')}
            placeholder={t('mem.ln.ph.arc')}
            submitLabel={source.arc ? t('mem.ln.save') : t('mem.ln.addNow')}
            onCancel={() => setAt(null)}
            onSubmit={async (text) => { if (await send({ list: 'arc', text })) setAt(null) }}
          />
        ) : source.arc ? (
          <ul className="flex flex-col">
            <Row t={t} onEdit={() => setAt('arc')} onRemove={() => void removeArc()}>
              <span className="block max-h-40 overflow-y-auto break-words whitespace-pre-wrap">{source.arc}</span>
            </Row>
          </ul>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">{t('mem.ln.none')}</p>
            <AddButton label={t('mem.ln.addSummary')} onClick={() => setAt('arc')} />
          </>
        )}
      </Block>

      {(['facts', 'notes', 'said'] as const).map((list) => (
        <Block key={list} title={t(`mem.ln.${list}` as MsgKey)} count={source[list].length}>
          {source[list].length === 0 && at !== `${list}:+` && <p className="text-xs text-muted-foreground">{t('mem.ln.none')}</p>}
          <ul className="flex flex-col">
            {source[list].map((line, i) =>
              at === `${list}:${i}` ? (
                <li key={`${list}${i}`} className="py-1.5">
                  <LineEditor
                    t={t}
                    initial={line.text}
                    max={LINE_MAX}
                    label={t('mem.ln.editLabel')}
                    submitLabel={t('mem.ln.save')}
                    onCancel={() => setAt(null)}
                    onSubmit={async (text) => { if (await send({ list, index: i, text })) setAt(null) }}
                  />
                </li>
              ) : (
                <Row key={`${list}${i}`} t={t} onEdit={() => setAt(`${list}:${i}`)} onRemove={() => void removeLine(list, i)}>
                  <span className="break-words">
                    {'who' in line && line.who && <span className="text-muted-foreground">{line.who}: </span>}
                    {line.text}
                  </span>
                  {'kind' in line && line.kind && <Badge variant="outline" className="mt-1 block w-fit text-[10px]">{kindLabel(t, line.kind)}</Badge>}
                </Row>
              ),
            )}
          </ul>
          {at === `${list}:+` ? (
            <LineEditor
              t={t}
              initial=""
              max={LINE_MAX}
              label={t('mem.ln.newLabel')}
              placeholder={t(`mem.ln.ph.${list}` as MsgKey)}
              submitLabel={t('mem.ln.addNow')}
              kind={list === 'said'}
              onCancel={() => setAt(null)}
              onSubmit={async (text, kind) => {
                const line: MemLinePatch = { list, add: true, text }
                if (list === 'facts') line.subject = cardName
                else line.who = cardName
                if (list === 'said') line.kind = kind
                if (await send(line)) setAt(null)
              }}
            />
          ) : (
            <AddButton label={t('mem.ln.add')} onClick={() => setAt(`${list}:+`)} />
          )}
        </Block>
      ))}
    </div>
  )
}

function Block({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h4 className="text-xs font-semibold tracking-wide uppercase">{title} <span className="font-normal text-muted-foreground">({count})</span></h4>
      {children}
    </section>
  )
}

function Row({ t, children, onEdit, onRemove }: { t: T; children: React.ReactNode; onEdit: () => void; onRemove: () => void }) {
  return (
    <li className="flex items-start gap-1 border-t border-border py-1.5 text-sm first:border-t-0">
      <div className="min-w-0 flex-1 pt-1.5">{children}</div>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="max-md:size-10" aria-label={t('mem.ln.menu')} />}>
          <DotsThree className="size-5" weight="bold" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuItem className="max-md:min-h-10" onClick={onEdit}><PencilSimple aria-hidden="true" />{t('mem.ln.edit')}</DropdownMenuItem>
          <DropdownMenuItem className="text-destructive max-md:min-h-10" onClick={onRemove}><Trash aria-hidden="true" />{t('mem.ln.remove')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="w-fit max-md:h-10" onClick={onClick}>
      <Plus aria-hidden="true" />{label}
    </Button>
  )
}

/** An inline text box with a counter and Save / Cancel; `kind` adds the select for a said line. */
function LineEditor({
  t,
  initial,
  max,
  label,
  placeholder,
  submitLabel,
  kind,
  onCancel,
  onSubmit,
}: {
  t: T
  initial: string
  max: number
  label: string
  placeholder?: string
  submitLabel: string
  kind?: boolean
  onCancel: () => void
  onSubmit: (text: string, kind: string) => Promise<void>
}) {
  const [text, setText] = useState(initial)
  const [kindValue, setKindValue] = useState('promise')
  const [busy, setBusy] = useState(false)
  const empty = !text.trim()
  const submit = async () => {
    if (empty || busy) return
    setBusy(true)
    try { await onSubmit(text.trim(), kindValue) } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-1.5" data-testid="mem-line-editor">
      <Textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={max}
        rows={max > LINE_MAX ? 5 : 3}
        placeholder={placeholder}
        aria-label={label}
        className="min-h-0 text-sm"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel() } }}
      />
      {kind && (
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          {t('mem.ln.kind')}
          <Select value={kindValue} onValueChange={(v) => v && setKindValue(String(v))}>
            <SelectTrigger className="w-full max-md:h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => <SelectItem key={k} value={k} className="max-md:min-h-10">{kindLabel(t, k)}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="max-md:h-10" disabled={empty || busy} onClick={() => void submit()}>{submitLabel}</Button>
        <Button size="sm" variant="outline" className="max-md:h-10" disabled={busy} onClick={onCancel}>{t('home.cancel')}</Button>
        <span className={cn('ml-auto text-[11px] tabular-nums text-muted-foreground', text.length >= max && 'text-amber-700 dark:text-amber-300')}>{text.length}/{max}</span>
      </div>
      {empty && <p className="text-[11px] text-muted-foreground">{t('mem.ln.empty')}</p>}
    </div>
  )
}

const kindLabel = (t: T, kind: string) => (t(`dash.said.kind.${kind}` as MsgKey) as string | undefined) || kind
