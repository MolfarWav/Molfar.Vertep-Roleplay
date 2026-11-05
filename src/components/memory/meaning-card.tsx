import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { TONES, type ToneName } from '@/components/ui/tone'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import type { MsgKey } from '@/lib/i18n'
import { canOpenSettingsTab, openSettingsTab } from '@/lib/shell-bridge'
import { loadEmbedSetup, loadShelf, loadVectors, startEmbed, startShelf } from '@/lib/vectors-load'
import { meaningState, retryMinutes, roughTokens, toEmbed, type EmbedSetup, type MeaningState, type VectorsView } from '@/lib/vectors'

const TONE: Record<MeaningState, ToneName> = { off: 'slate', empty: 'slate', all: 'emerald', partial: 'amber', none: 'amber', other: 'amber', failing: 'amber', working: 'sky' }
const POLL_MS = 3000

/**
 * "Matching by meaning" for one chat (#184): the state in one line, how many facts and chapters have a vector,
 * and a button that says what embedding the rest costs. Nothing is spent without a click.
 * Used in Canvas > Prompt > Memory and in Library > Litopys.
 */
export function MeaningCard({ chatId, shelf, refreshKey, onView, className }: {
  chatId?: string
  /** the Data Bank's passages instead of a chat's record (then `chatId` is ignored) */
  shelf?: boolean
  /** change it to read the numbers again (the Refresh button, a record that grew) */
  refreshKey?: string | number
  /** the view, each time it is read (the Data Bank tab shows a line per file) */
  onView?: (v: VectorsView) => void
  className?: string
}) {
  const t = useT()
  // `t` is a new function on every render: effects read it through a ref
  const tRef = useRef(t)
  tRef.current = t
  const [view, setView] = useState<VectorsView | null>(null)
  const [setup, setSetup] = useState<EmbedSetup>('unknown')
  const [busy, setBusy] = useState(false)
  const id = shelf ? 'shelf' : chatId ?? ''
  const live = useRef(id)
  live.current = id
  const onViewRef = useRef(onView)
  onViewRef.current = onView
  const read = (): Promise<VectorsView> => (shelf ? loadShelf() : loadVectors(id))
  const readRef = useRef(read)
  readRef.current = read

  useEffect(() => {
    let gone = false
    void loadEmbedSetup().then((s) => { if (!gone) setSetup(s) })
    void readRef.current().then((v) => { if (!gone && live.current === id) { setView(v); onViewRef.current?.(v) } }).catch(() => undefined)
    return () => { gone = true }
  }, [id, refreshKey])

  // a view of the chat shown before this one is not this chat's
  const state = meaningState(view && view.chatId === id ? view : null, setup)
  // while the engine embeds, watch the count grow
  useEffect(() => {
    if (state !== 'working') return
    let gone = false
    const timer = setInterval(() => {
      void readRef.current().then((v) => { if (!gone && live.current === id) { setView(v); onViewRef.current?.(v) } }).catch(() => undefined)
    }, POLL_MS)
    return () => { gone = true; clearInterval(timer) }
  }, [state, id])

  if (!view || view.chatId !== id || !state || state === 'empty') return null

  const n = toEmbed(view)
  const tokens = roughTokens(view.tokens)
  const run = async () => {
    setBusy(true)
    try {
      const v = shelf ? await startShelf() : await startEmbed(id)
      if (live.current === id) { setView(v); onViewRef.current?.(v) }
    } catch (e) {
      toast.error(tRef.current('meaning.startFailed', { error: e instanceof Error ? e.message : String(e) }))
    } finally {
      setBusy(false)
    }
  }
  const settings = () => void openSettingsTab('memory').catch((e: unknown) => toast.error(String((e as Error).message ?? e)))
  const pct = view.items > 0 ? Math.min(100, Math.round((view.have / view.items) * 100)) : 0 // a sliver shows even at 0, so the bar reads as a bar
  const canEmbed = (state === 'none' || state === 'partial' || state === 'other' || state === 'failing') && n > 0

  const line =
    state === 'off' ? t('meaning.off')
    : state === 'failing' ? t('meaning.failing', { min: retryMinutes(view, Date.now()) })
    : state === 'none' ? t(shelf ? 'meaning.shelf.none' : 'meaning.none', { items: view.items })
    : state === 'other' ? t('meaning.other', { n: view.other, have: view.have, items: view.items })
    : state === 'partial' ? t(shelf ? 'meaning.shelf.partial' : 'meaning.partial', { have: view.have, items: view.items })
    : state === 'working' ? t('meaning.working', { have: view.have, items: view.items })
    : t(shelf ? 'meaning.shelf.all' : 'meaning.all', { items: view.items })

  return (
    <section className={cn('rounded-xl border border-border bg-card p-3', className)} data-testid="meaning-card" data-state={state} aria-label={t(shelf ? 'meaning.shelf.title' : 'meaning.title')}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-body font-semibold">{t(shelf ? 'meaning.shelf.title' : 'meaning.title')}</h3>
        <span className={cn('inline-flex h-5 items-center rounded-full border px-1.5 text-caption font-medium', TONES[TONE[state]].chip)}>{t(`meaning.state.${state}` as MsgKey)}</span>
        {state === 'all' && view.model && <code className="min-w-0 truncate rounded bg-muted px-1 text-caption text-foreground/70">{view.model}</code>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">{line}</p>
      {(state === 'partial' || state === 'working' || state === 'other') && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted-foreground/20" role="img" aria-label={t('meaning.progress', { have: view.have, items: view.items })}>
          <div className={cn('h-full rounded-full', TONES[TONE[state]].square)} style={{ width: `${Math.max(pct, 3)}%` }} />
        </div>
      )}
      {(canEmbed || state === 'working' || state === 'off' || state === 'failing') && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(canEmbed || state === 'working') && (
            <Button size="sm" onClick={() => void run()} disabled={busy || state === 'working'} className="h-auto min-h-10 max-w-full whitespace-normal py-1.5 text-left sm:min-h-8" data-testid="meaning-embed">
              {state === 'working' ? t('meaning.busy') : t(state === 'other' ? 'meaning.embedAgain' : 'meaning.embed', { n, tokens })}
            </Button>
          )}
          {(state === 'off' || state === 'failing') && canOpenSettingsTab() && (
            <Button variant="outline" size="sm" onClick={settings} className="min-h-10 sm:min-h-8">{t('lit.emb.setup')}</Button>
          )}
        </div>
      )}
      {canEmbed && <p className="mt-2 text-caption text-muted-foreground">{t(shelf ? 'meaning.shelf.note' : 'meaning.note')}</p>}
    </section>
  )
}
