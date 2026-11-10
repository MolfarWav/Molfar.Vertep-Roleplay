import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CircleNotch, Sparkle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  cancelSuggestLitScenes,
  clearSuggestLitScenes,
  fetchLitChat,
  markLitScenes,
  suggestLitScenes,
  unmarkLitScene,
  type LitChat,
} from '@/components/library/litopys-api'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import type { Chat } from '@/lib/types'

/** Set a run of messages apart as a scene of its own: the story record never folds it into a longer one and is told it matters. */
export function SceneMarkDialog({
  chat,
  messageId,
  tab: firstTab,
  onClose,
}: {
  chat: Chat
  /** the message the reader opened this from: the first of the run */
  messageId?: string
  /** which tab to open on; by default the hand picker when opened from a message, else the suggestions */
  tab?: 'suggested' | 'hand'
  onClose: () => void
}) {
  const t = useT()
  // the story record counts the messages it reads: the ones the model sees, in order (the same numbers as its chapters)
  // the store lets go of a chat's messages when the chat's record is refreshed (a saved scene does that): keep the last list
  const lastMessages = useRef(chat.messages)
  if (chat.messages.length > 0) lastMessages.current = chat.messages
  const messages = lastMessages.current
  const line = useMemo(
    () => messages.filter((m) => !m.hidden && (m.role === 'user' || m.role === 'assistant')),
    [messages],
  )
  const [lit, setLit] = useState<LitChat | null>(null)
  const [busy, setBusy] = useState(false)
  const sug = lit?.sceneSuggest ?? null

  // until the record has answered once, neither tab is drawn (the picker would flash before the tabs appear)
  const [loaded, setLoaded] = useState(false)
  const reload = useCallback(() => fetchLitChat(chat.id).then(setLit).catch(() => {}).finally(() => setLoaded(true)), [chat.id])
  useEffect(() => { void reload() }, [reload])
  // the model's answer comes on the worker's next pass: look again while it works
  const working = sug?.state === 'working'
  useEffect(() => {
    if (!working) return
    const timer = setInterval(() => void reload(), 4000)
    return () => clearInterval(timer)
  }, [working, reload])

  const [tab, setTab] = useState<'suggested' | 'hand'>(firstTab ?? (messageId ? 'hand' : 'suggested'))
  // an older plugin has no suggestions: only the picker
  const tabNow = sug ? tab : 'hand'

  // --- the hand picker ---
  const at = messageId ? Math.max(0, line.findIndex((m) => m.id === messageId)) : -1
  const [start, setStart] = useState<number | null>(at >= 0 ? at : null)
  const [end, setEnd] = useState<number | null>(null)
  const marks = lit?.marks ?? []
  const blockAt = (i: number) => marks.find((m) => i + 1 >= m.fromNo && i + 1 <= m.toNo)
  const inChapter = useMemo(() => {
    const set = new Set<number>()
    for (const c of lit?.chapters ?? []) {
      if (c.stale || !c.fromNo) continue
      for (let n = c.fromNo; n <= c.toNo; n++) set.add(n)
    }
    return set
  }, [lit?.chapters])
  const [hint, setHint] = useState<string | null>(null)

  const pick = (i: number) => {
    setHint(null)
    if (start === null || end !== null) {
      setStart(i)
      setEnd(null)
      return
    }
    if (i < start) {
      setStart(i)
      return
    }
    if (marks.some((m) => m.fromNo - 1 > start && m.fromNo - 1 <= i)) {
      setHint(t('scene.hand.blocked'))
      return
    }
    setEnd(i)
  }
  const lo = start
  const hi = start === null ? null : (end ?? start)
  const rangeOk = lo !== null && hi !== null && !marks.some((m) => m.fromNo - 1 <= hi && m.toNo - 1 >= lo)

  // open scrolled to the first message after the last scene (or to the message the reader came from)
  const listRef = useRef<HTMLDivElement>(null)
  const scrolled = useRef(false)
  useEffect(() => {
    if (tabNow !== 'hand' || scrolled.current || !listRef.current) return
    if (!lit && at < 0) return
    let target = at
    if (target < 0) {
      const lastTaken = Math.max(-1, ...marks.map((m) => m.toNo - 1), ...[...inChapter].map((n) => n - 1))
      target = Math.min(line.length - 1, lastTaken + 1)
    }
    const el = listRef.current.querySelector<HTMLElement>(`[data-no="${target + 1}"]`)
    if (el) {
      scrolled.current = true
      const box = listRef.current
      box.scrollTop = Math.max(0, el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2)
    }
  })

  const saveHand = async () => {
    if (lo === null || hi === null || !rangeOk) return
    setBusy(true)
    try {
      await markLitScenes(chat.id, [{ from: line[lo].id, to: line[hi].id }])
      toast.success(t('scene.saved'))
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // --- the suggestions ---
  const [off, setOff] = useState<Set<string>>(new Set())
  const kept = (sug?.scenes ?? []).filter((s) => !off.has(s.id))
  const act = async (fn: () => Promise<LitChat>) => {
    setBusy(true)
    try {
      setLit(await fn())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const saveKept = async () => {
    setBusy(true)
    try {
      await markLitScenes(chat.id, kept.map((s) => ({ from: s.from, to: s.to, title: s.title })))
      toast.success(t('scene.sug.saved', { n: kept.length }))
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const adjust = (from: number, to: number) => {
    setStart(from - 1)
    setEnd(to - 1)
    setHint(null)
    scrolled.current = false
    setTab('hand')
  }

  const text = (i: number) => {
    const m = line[i]
    return (m.swipes[m.activeSwipe]?.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 160)
  }
  const who = (i: number) => (line[i].role === 'user' ? t('scene.you') : t('scene.char'))

  // rows: a saved scene is one folded row, every other message its own
  const rows: ({ kind: 'msg'; i: number } | { kind: 'mark'; id: string; fromNo: number; toNo: number })[] = []
  for (let i = 0; i < line.length; i++) {
    const b = blockAt(i)
    if (!b) rows.push({ kind: 'msg', i })
    else if (i + 1 === b.fromNo) rows.push({ kind: 'mark', id: b.id, fromNo: b.fromNo, toNo: b.toNo })
  }
  const markTitle = (fromNo: number) => lit?.chapters.find((c) => c.marked && c.fromNo === fromNo)?.label || marks.find((m) => m.fromNo === fromNo)?.title || ''
  const rangeText = (from: number, to: number) => t('scene.sug.range', { from, to, n: to - from + 1 })

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-3 sm:max-w-xl" data-testid="scene-mark-dialog">
        <DialogHeader>
          <DialogTitle>{t('scene.title')}</DialogTitle>
          <DialogDescription>{t('scene.body')}</DialogDescription>
        </DialogHeader>

        {!loaded && (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground" aria-live="polite">
            <CircleNotch className="size-4 shrink-0 animate-spin" aria-hidden="true" />
            {t('scene.loading')}
          </p>
        )}

        {loaded && sug && (
          <Tabs value={tabNow} onValueChange={(v) => setTab(v as 'suggested' | 'hand')}>
            <TabsList className="w-full max-md:h-10">
              <TabsTrigger value="suggested" data-testid="scene-tab-suggested">
                <Sparkle className="size-4" aria-hidden="true" />
                {t('scene.tabSuggested')}
                {sug.state === 'done' && sug.scenes.length > 0 && <span className="text-xs tabular-nums opacity-70">{sug.scenes.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="hand" data-testid="scene-tab-hand">{t('scene.tabHand')}</TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {loaded && tabNow === 'suggested' && sug && (
          <div className="flex min-h-0 flex-1 flex-col gap-3" data-testid="scene-suggested">
            {sug.state === 'working' && (
              <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-3 text-sm">
                <p className="flex items-center gap-2" aria-live="polite">
                  <CircleNotch className="size-4 shrink-0 animate-spin" aria-hidden="true" />
                  {t('scene.sug.working')}
                </p>
                <p className="text-xs text-muted-foreground">{t('scene.sug.workingHint')}</p>
                <div>
                  <Button variant="ghost" size="sm" className="max-md:h-10" disabled={busy} onClick={() => void act(() => cancelSuggestLitScenes(chat.id))}>
                    {t('scene.sug.stop')}
                  </Button>
                </div>
              </div>
            )}

            {(sug.state === 'idle' || sug.state === 'failed') && (
              <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-3 text-sm">
                {sug.state === 'failed' && (
                  <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-600 dark:text-amber-400">
                    {t('scene.sug.failed', { error: sug.error })}
                  </p>
                )}
                <p>{sug.free >= 2 ? t('scene.sug.intro', { n: sug.free }) : t('scene.sug.none')}</p>
                <p className="text-xs text-muted-foreground">{t('scene.sug.cost')}</p>
                <div>
                  <Button className="max-md:min-h-10" disabled={busy || sug.free < 2} data-testid="scene-suggest-start" onClick={() => void act(() => suggestLitScenes(chat.id))}>
                    <Sparkle className="size-4" aria-hidden="true" />
                    {sug.state === 'failed' ? t('scene.sug.retry') : t('scene.sug.start')}
                  </Button>
                </div>
              </div>
            )}

            {sug.state === 'done' && sug.scenes.length === 0 && (
              <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-3 text-sm">
                <p>{t('scene.sug.empty')}</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="max-md:min-h-10" disabled={busy || sug.free < 2} onClick={() => void act(() => suggestLitScenes(chat.id))}>
                    {t('scene.sug.again')}
                  </Button>
                  <Button variant="ghost" className="max-md:min-h-10" onClick={() => setTab('hand')}>{t('scene.tabHand')}</Button>
                </div>
              </div>
            )}

            {sug.state === 'done' && sug.scenes.length > 0 && (
              <>
                <p className="text-sm text-muted-foreground">{t('scene.sug.found', { n: sug.scenes.length })}</p>
                <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto" data-testid="scene-suggested-list">
                  {sug.scenes.map((s) => (
                    <li key={s.id} className="flex items-start gap-3 rounded-md border border-border bg-card p-3">
                      <Checkbox
                        className="mt-0.5"
                        checked={!off.has(s.id)}
                        aria-label={s.title || rangeText(s.fromNo, s.toNo)}
                        onCheckedChange={(v) => setOff((o) => { const n = new Set(o); if (v) n.delete(s.id); else n.add(s.id); return n })}
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <p className="break-words text-sm font-medium">{s.title || t('scene.sug.untitled')}</p>
                        <p className="text-xs tabular-nums text-muted-foreground">{rangeText(s.fromNo, s.toNo)}</p>
                        {s.why && <p className="break-words text-xs text-muted-foreground">{s.why}</p>}
                      </div>
                      <Button variant="ghost" size="sm" className="shrink-0 max-md:h-10" onClick={() => adjust(s.fromNo, s.toNo)}>
                        {t('scene.sug.adjust')}
                      </Button>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button variant="ghost" className="max-md:min-h-10" disabled={busy} onClick={() => void act(() => clearSuggestLitScenes(chat.id))}>
                    {t('scene.sug.discard')}
                  </Button>
                  <Button className="max-md:min-h-10" disabled={busy || kept.length === 0} data-testid="scene-suggest-save" onClick={() => void saveKept()}>
                    {t('scene.sug.saveN', { n: kept.length })}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {loaded && tabNow === 'hand' && (
          <div className="flex min-h-0 flex-1 flex-col gap-3" data-testid="scene-hand">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {hint ?? (start !== null && end === null ? t('scene.hand.hintEnd') : t('scene.hand.hint'))}
            </p>
            <div ref={listRef} className="relative min-h-40 flex-1 overflow-y-auto rounded-md border border-border" data-testid="scene-message-list">
              {rows.map((r) => {
                if (r.kind === 'mark') {
                  const title = markTitle(r.fromNo)
                  return (
                    <div key={`m${r.id}`} data-no={r.fromNo} className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      <span className="min-w-0 flex-1 break-words">
                        <span className="tabular-nums">#{r.fromNo}–#{r.toNo}</span> · {t('scene.hand.taken', { title: title || t('scene.sug.untitled') })}
                      </span>
                      <Button variant="ghost" size="sm" className="shrink-0 max-md:h-10" disabled={busy} onClick={() => void act(() => unmarkLitScene(chat.id, r.id))}>
                        {t('scene.hand.untake')}
                      </Button>
                    </div>
                  )
                }
                const i = r.i
                const inside = lo !== null && hi !== null && i >= lo && i <= hi
                const edge = i === lo ? t('scene.hand.start') : i === hi && end !== null ? t('scene.hand.end') : ''
                return (
                  <button
                    key={line[i].id}
                    type="button"
                    data-no={i + 1}
                    aria-pressed={inside}
                    onClick={() => pick(i)}
                    className={cn(
                      'flex min-h-12 w-full flex-col items-stretch gap-0.5 border-b border-l-2 border-border px-3 py-1.5 text-left text-sm transition-colors [contain-intrinsic-size:auto_3rem] [content-visibility:auto] hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none',
                      inside ? 'border-l-primary bg-primary/10' : 'border-l-transparent',
                    )}
                  >
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="tabular-nums">#{i + 1}</span>
                      <span>{who(i)}</span>
                      {inChapter.has(i + 1) && <span className="rounded-sm bg-muted px-1.5 py-0.5">{t('scene.hand.chapter')}</span>}
                      {edge && <span className="ml-auto rounded-sm bg-primary px-1.5 py-0.5 font-medium text-primary-foreground">{edge}</span>}
                    </span>
                    <span className="line-clamp-2 break-words">{text(i)}</span>
                  </button>
                )
              })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs tabular-nums text-muted-foreground">
                {lo !== null && hi !== null ? `#${lo + 1}–#${hi + 1} · ${t('scene.count', { n: hi - lo + 1 })}` : ''}
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" className="max-md:min-h-10" onClick={onClose}>{t('lit.cancel')}</Button>
                <Button className="max-md:min-h-10" disabled={busy || line.length === 0 || !rangeOk} data-testid="scene-save" onClick={() => void saveHand()}>
                  {t('scene.save')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
