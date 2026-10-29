import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, CheckCircle, ChatCircleText, CircleNotch, Warning, X } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useT } from '@/hooks/use-t'
import { resolveLanguage } from '@/lib/i18n'
import { beginImport } from '@/lib/import-progress'
import type { MsgKey } from '@/lib/i18n'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Textarea } from '@/components/ui/textarea'
import { type CardMemoryView, type MemChat, type MemPreview, type MemSummary, importCardMemory, previewCardMemory, summarizeChat } from './memory-api'

const message = (e: unknown) => (e instanceof Error && e.message ? e.message : String(e))
const SEARCH_FROM = 8

/** Two steps: choose one of the card's chats, then tick what the card keeps from it. The chat can be
 *  deleted afterwards; what is ticked stays in the card's memory. A full-screen page on a phone. */
export function MemoryImportDialog({
  open,
  onOpenChange,
  card,
  chats,
  initialChatId,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  card: { id: string; name: string }
  chats: MemChat[]
  /** Skips the list: "Take from the chat again" opens straight on that chat's preview. */
  initialChatId: string | null
  onDone: (view: CardMemoryView) => void
}) {
  const t = useT()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        data-testid="mem-dialog"
        className="flex flex-col gap-0 overflow-hidden p-0 max-md:top-0 max-md:left-0 max-md:h-dvh max-md:max-h-dvh max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:ring-0 md:h-[min(40rem,calc(100dvh-4rem))] sm:max-w-xl"
      >
        <DialogTitle className="sr-only">{t('mem.dlg.title')}</DialogTitle>
        <DialogDescription className="sr-only">{t('mem.dlg.pick', { name: card.name })}</DialogDescription>
        <Body card={card} chats={chats} initialChatId={initialChatId} onClose={() => onOpenChange(false)} onDone={onDone} />
      </DialogContent>
    </Dialog>
  )
}

type Ticks = { arc: boolean; facts: Set<string>; notes: Set<string>; said: Set<string>; habits: Set<string> }
type TickSet = 'facts' | 'notes' | 'said' | 'habits'
const ticksOf = (p: MemPreview): Ticks => ({
  arc: !!p.arc,
  facts: new Set(p.facts.filter((x) => x.checked).map((x) => x.id)),
  notes: new Set(p.notes.filter((x) => x.checked).map((x) => x.id)),
  said: new Set(p.said.filter((x) => x.checked).map((x) => x.id)),
  habits: new Set((p.habits ?? []).filter((x) => x.checked).map((x) => x.id)),
})

function Body({
  card,
  chats,
  initialChatId,
  onClose,
  onDone,
}: {
  card: { id: string; name: string }
  chats: MemChat[]
  initialChatId: string | null
  onClose: () => void
  onDone: (view: CardMemoryView) => void
}) {
  const t = useT()
  const lang = resolveLanguage(useApp((s) => s.settings.language))
  const [chatId, setChatId] = useState<string | null>(initialChatId)
  const [preview, setPreview] = useState<MemPreview | null>(null)
  const [reading, setReading] = useState(false)
  const [ticks, setTicks] = useState<Ticks | null>(null)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  // the text of the summary when it is not the one built from the record (written by the model, or edited by hand)
  const [arcText, setArcText] = useState<string | null>(null)
  const asked = useRef(false)

  // step 2: read the chat whenever one is chosen
  useEffect(() => {
    if (!chatId) return
    let live = true
    setReading(true)
    setPreview(null)
    setArcText(null)
    asked.current = false
    previewCardMemory(card.id, chatId)
      .then((p) => { if (live) { setPreview(p); setTicks(ticksOf(p)) } })
      .catch((e) => { if (live) { toast.error(message(e)); setChatId(null) } })
      .finally(() => { if (live) setReading(false) })
    return () => { live = false }
  }, [card.id, chatId])

  // a summary being written: look again every few seconds; the answer replaces the text unless the user typed in it
  const sumState = preview?.summary?.state
  useEffect(() => {
    if (sumState !== 'working' || !chatId) return
    let live = true
    const id = window.setInterval(() => {
      previewCardMemory(card.id, chatId)
        .then((p) => { if (live) setPreview((cur) => (cur ? { ...cur, summary: p.summary } : cur)) })
        .catch(() => {})
    }, 4000)
    return () => { live = false; window.clearInterval(id) }
  }, [card.id, chatId, sumState])
  const sumText = preview?.summary?.state === 'done' ? preview.summary.text : ''
  useEffect(() => {
    if (!asked.current || !sumText) return
    asked.current = false
    setArcText((cur) => cur ?? sumText)
    setTicks((cur) => (cur ? { ...cur, arc: true } : cur))
  }, [sumText])
  const askSummary = (op: 'start' | 'cancel') => {
    if (!chatId) return
    asked.current = op === 'start'
    summarizeChat(chatId, op)
      .then((r) => setPreview((cur) => (cur ? { ...cur, summary: r.summary } : cur)))
      .catch((e) => { asked.current = false; toast.error(message(e)) })
  }

  const count = ticks ? (ticks.arc ? 1 : 0) + ticks.facts.size + ticks.notes.size + ticks.said.size + ticks.habits.size : 0
  const submit = async () => {
    if (!preview || !ticks || !chatId || count === 0 || saving) return
    setSaving(true)
    // the same progress card as every other import: one unit, so the bar only names the step
    const run = beginImport(t('imp.title.memory'), 1)
    run.start(card.name, t('imp.step.saving'))
    try {
      const view = await importCardMemory({ cardId: card.id, chatId, arc: ticks.arc, ...(ticks.arc && arcText?.trim() ? { arcText } : {}), facts: [...ticks.facts], notes: [...ticks.notes], said: [...ticks.said], habits: [...ticks.habits] })
      if (view.imported?.habitsLeft) toast.warning(t('mem.dlg.habitsLeft', { n: view.imported.habitsLeft }))
      run.finish(true)
      run.end(t('imp.memory.done', { n: count }))
      onDone(view)
    } catch (e) {
      run.finish(false, message(e))
      run.end()
      toast.error(message(e))
      setSaving(false)
    }
  }

  const header = (title: string, back?: () => void) => (
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 max-md:min-h-14">
      {back && (
        <Button variant="ghost" size="icon" className="max-md:size-10" onClick={back} aria-label={t('mem.dlg.back')}>
          <ArrowLeft aria-hidden="true" />
        </Button>
      )}
      <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{title}</h2>
      <Button variant="ghost" size="icon" className="max-md:size-10" onClick={onClose} aria-label={t('mem.dlg.close')}>
        <X aria-hidden="true" />
      </Button>
    </div>
  )

  // ---- step 1: the card's chats
  if (!chatId) {
    const q = query.trim().toLowerCase()
    const shown = q ? chats.filter((x) => (x.title || '').toLowerCase().includes(q)) : chats
    return (
      <>
        {header(t('mem.dlg.title'))}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
          <p className="text-sm text-muted-foreground">{t('mem.dlg.pick', { name: card.name })}</p>
          {chats.length > SEARCH_FROM && (
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('mem.dlg.search')} aria-label={t('mem.dlg.search')} className="max-md:h-10" />
          )}
          {chats.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">{t('mem.dlg.noChats', { name: card.name })}</p>
          ) : shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('mem.dlg.noMatch')}</p>
          ) : (
            <ul className="flex flex-col gap-1.5" data-testid="mem-chat-list">
              {shown.map((x) => (
                <li key={x.id}>
                  <button
                    type="button"
                    onClick={() => setChatId(x.id)}
                    className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-border px-3 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 max-md:min-h-14"
                  >
                    <ChatCircleText className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{x.title || t('mem.untitled')}</span>
                      <span className="block text-xs text-muted-foreground">{new Date(x.updatedAt).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </span>
                    {x.imported && (
                      <Badge variant="outline" className="shrink-0 gap-1 border-sky-500/50 bg-sky-500/10 text-sky-800 dark:text-sky-300">
                        <CheckCircle weight="fill" aria-hidden="true" />{t('mem.dlg.inMemory')}
                      </Badge>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-border p-3">
          <Button variant="outline" className="max-md:h-10" onClick={onClose}>{t('home.cancel')}</Button>
        </div>
      </>
    )
  }

  // ---- step 2: what to keep
  const back = () => { setChatId(null); setPreview(null) }
  if (reading || !preview || !ticks) {
    return (
      <>
        {header(t('mem.dlg.title'), back)}
        <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground" role="status">
          <CircleNotch className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />{t('mem.dlg.reading')}
        </p>
      </>
    )
  }
  const flip = (set: TickSet, id: string, on: boolean) =>
    setTicks((cur) => {
      if (!cur) return cur
      const next = new Set(cur[set])
      if (on) next.add(id)
      else next.delete(id)
      return { ...cur, [set]: next }
    })
  const toggleAll = (set: TickSet) =>
    setTicks((cur) => {
      if (!cur || !preview) return cur
      const lines: { id: string; dup: 'memory' | null }[] = preview[set] ?? []
      return { ...cur, [set]: cur[set].size ? new Set<string>() : new Set(lines.filter((l) => !l.dup).map((l) => l.id)) }
    })

  return (
    <>
      {header(t('mem.dlg.keep', { title: preview.chat.title || t('mem.untitled') }), back)}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3" data-testid="mem-preview">
        {preview.already && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
            <Warning className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden="true" />{t('mem.dlg.already')}
          </p>
        )}

        <Section title={t('mem.dlg.arc')}>
          {preview.arc || preview.summary?.can ? (
            <>
              {(preview.arc || arcText) && (
                <Tick checked={ticks.arc} onChange={(v) => setTicks({ ...ticks, arc: v })} label={t('mem.dlg.arc')}>
                  <Textarea
                    value={arcText ?? preview.arc?.text ?? ''}
                    onChange={(e) => setArcText(e.target.value)}
                    aria-label={t('mem.dlg.sumEdit')}
                    rows={5}
                    maxLength={1500}
                    className="max-h-48 min-h-24 text-xs"
                    data-testid="mem-arc-text"
                  />
                  <span className="mt-1 block text-[11px] text-muted-foreground">~{Math.ceil((arcText ?? preview.arc?.text ?? '').length / 3.6)} tok</span>
                </Tick>
              )}
              {preview.summary && <SummaryRow summary={preview.summary} used={arcText === preview.summary.text} onAsk={askSummary} onUse={() => { setArcText(preview.summary?.text ?? null); setTicks({ ...ticks, arc: true }) }} onPlain={() => setArcText(null)} plain={arcText !== null && !!preview.arc} />}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{t('mem.dlg.none')}</p>
          )}
        </Section>

        <LineSection
          title={t('mem.dlg.facts')}
          lines={preview.facts.map((x) => ({ id: x.id, text: x.text, dup: x.dup, lead: '' }))}
          ticked={ticks.facts}
          onFlip={(id, on) => flip('facts', id, on)}
          onAll={() => toggleAll('facts')}
        />
        <LineSection
          title={t('mem.dlg.notes')}
          lines={preview.notes.map((x) => ({ id: x.id, text: x.text, dup: x.dup, lead: x.who }))}
          ticked={ticks.notes}
          onFlip={(id, on) => flip('notes', id, on)}
          onAll={() => toggleAll('notes')}
        />
        <LineSection
          title={t('mem.dlg.said')}
          lines={preview.said.map((x) => ({ id: x.id, text: x.text, dup: x.dup, lead: x.who, kind: x.kind }))}
          ticked={ticks.said}
          onFlip={(id, on) => flip('said', id, on)}
          onAll={() => toggleAll('said')}
        />
        {(preview.habits?.length ?? 0) > 0 && (
          <LineSection
            title={t('mem.dlg.habits')}
            lines={preview.habits.map((x) => ({ id: x.id, text: x.rule, dup: x.dup, lead: x.name }))}
            ticked={ticks.habits}
            onFlip={(id, on) => flip('habits', id, on)}
            onAll={() => toggleAll('habits')}
          />
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-2 border-t border-border p-3">
        <p className="text-xs text-muted-foreground">{t('mem.dlg.after')}</p>
        {count === 0 && (
          <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300" role="status" data-testid="mem-nothing">
            <Warning className="size-3.5 shrink-0" aria-hidden="true" />{t('mem.dlg.nothing')}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" className="max-md:h-10" onClick={back} disabled={saving}>{t('mem.dlg.back')}</Button>
          <Button className="max-md:h-10" onClick={() => void submit()} disabled={count === 0 || saving}>
            {saving && <CircleNotch className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {saving ? t('mem.dlg.adding') : t('mem.dlg.submit')}
          </Button>
        </div>
      </div>
    </>
  )
}

/** Under the summary: ask the model for a better one, follow the run, take the written text. */
function SummaryRow({ summary, used, plain, onAsk, onUse, onPlain }: { summary: MemSummary; used: boolean; plain: boolean; onAsk: (op: 'start' | 'cancel') => void; onUse: () => void; onPlain: () => void }) {
  const t = useT()
  if (summary.state === 'working') {
    return (
      <div className="flex flex-wrap items-center gap-2" role="status">
        <p className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
          <CircleNotch className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />{t('mem.dlg.sumWorking')}
        </p>
        <Button variant="outline" size="sm" className="max-md:h-10" onClick={() => onAsk('cancel')}>{t('home.cancel')}</Button>
      </div>
    )
  }
  const done = summary.state === 'done' && !!summary.text
  return (
    <div className="flex flex-col gap-1.5">
      {summary.state === 'failed' && (
        <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300" role="status">
          <Warning className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{t('mem.dlg.sumFailed', { error: summary.error })}
        </p>
      )}
      {done && summary.stale && <p className="text-xs text-muted-foreground">{t('mem.dlg.sumStale')}</p>}
      {!done && summary.state !== 'failed' && <p className="text-xs text-muted-foreground">{t('mem.dlg.sumHint')}</p>}
      <div className="flex flex-wrap gap-2">
        {done && !used && <Button size="sm" className="max-md:h-10" onClick={onUse}>{t('mem.dlg.sumUse')}</Button>}
        {done && used && plain && <Button variant="outline" size="sm" className="max-md:h-10" onClick={onPlain}>{t('mem.dlg.sumBuilt')}</Button>}
        <Button variant="outline" size="sm" className="max-md:h-10" onClick={() => onAsk('start')}>
          {summary.state === 'failed' ? t('mem.dlg.sumRetry') : done ? t('mem.dlg.sumAgain') : t('mem.dlg.sumAsk')}
        </Button>
      </div>
    </div>
  )
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

/** One tickable row: the whole row is the tap target (at least 40 px on a phone). */
function Tick({ checked, onChange, label, children }: { checked: boolean; onChange: (v: boolean) => void; label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-h-10 cursor-pointer items-start gap-3 rounded-md border border-border px-2.5 py-2 hover:bg-muted/50">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} aria-label={label} className="mt-0.5" />
      <span className="min-w-0 flex-1 text-sm">{children}</span>
    </label>
  )
}

interface Line { id: string; text: string; dup: 'memory' | null; lead: string; kind?: string }

function LineSection({ title, lines, ticked, onFlip, onAll }: { title: string; lines: Line[]; ticked: Set<string>; onFlip: (id: string, on: boolean) => void; onAll: () => void }) {
  const t = useT()
  const heading = useMemo(() => (lines.length ? `${title} (${ticked.size}/${lines.length})` : title), [title, lines.length, ticked.size])
  return (
    <Section
      title={heading}
      action={lines.length > 1 && (
        <Button variant="ghost" size="sm" className="max-md:h-10" onClick={onAll}>{ticked.size ? t('mem.dlg.tickNone') : t('mem.dlg.tickAll')}</Button>
      )}
    >
      {lines.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('mem.dlg.none')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {lines.map((l) => (
            <li key={l.id}>
              <Tick checked={ticked.has(l.id)} onChange={(v) => onFlip(l.id, v)} label={l.text}>
                <span className={cn('block break-words', l.dup && 'text-muted-foreground')}>
                  {l.lead && <span className="text-muted-foreground">{l.lead}: </span>}{l.text}
                </span>
                {(l.dup || l.kind) && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {l.kind && <Badge variant="outline" className="text-[10px]">{kindLabel(t, l.kind)}</Badge>}
                    {l.dup && <Badge variant="secondary" className="text-[10px]">{t('mem.dlg.dup')}</Badge>}
                  </span>
                )}
              </Tick>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

const kindLabel = (t: ReturnType<typeof useT>, kind: string) => {
  const key = `dash.said.kind.${kind}` as MsgKey
  const label = t(key) as string | undefined
  return label || kind
}
