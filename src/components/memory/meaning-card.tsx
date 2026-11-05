import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { TONES, type ToneName } from '@/components/ui/tone'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import type { MsgKey } from '@/lib/i18n'
import { canOpenSettingsTab, openSettingsTab } from '@/lib/shell-bridge'
import { loadEmbedSetup, loadVectors, startEmbed } from '@/lib/vectors-load'
import { meaningState, retryMinutes, roughTokens, toEmbed, type EmbedSetup, type MeaningState, type VectorsView } from '@/lib/vectors'

const TONE: Record<MeaningState, ToneName> = { off: 'slate', empty: 'slate', all: 'emerald', partial: 'amber', none: 'amber', other: 'amber', failing: 'amber', working: 'sky' }
const POLL_MS = 3000

/**
 * "Matching by meaning" for one chat (#184): the state in one line, how many facts and chapters have a vector,
 * and a button that says what embedding the rest costs. Nothing is spent without a click.
 * Used in Canvas > Prompt > Memory and in Library > Litopys.
 */
export function MeaningCard({ chatId, refreshKey, className }: { chatId: string; /** change it to read the numbers again (the Refresh button, a record that grew) */ refreshKey?: string | number; className?: string }) {
  const t = useT()
  // `t` is a new function on every render: effects read it through a ref
  const tRef = useRef(t)
  tRef.current = t
  const [view, setView] = useState<VectorsView | null>(null)
  const [setup, setSetup] = useState<EmbedSetup>('unknown')
  const [busy, setBusy] = useState(false)
  const live = useRef(chatId)
  live.current = chatId

  useEffect(() => {
    let gone = false
    void loadEmbedSetup().then((s) => { if (!gone) setSetup(s) })
    void loadVectors(chatId).then((v) => { if (!gone && live.current === chatId) setView(v) }).catch(() => undefined)
    return () => { gone = true }
  }, [chatId, refreshKey])

  // a view of the chat shown before this one is not this chat's
  const state = meaningState(view && view.chatId === chatId ? view : null, setup)
  // while the engine embeds, watch the count grow
  useEffect(() => {
    if (state !== 'working') return
    let gone = false
    const id = setInterval(() => {
      void loadVectors(chatId).then((v) => { if (!gone && live.current === chatId) setView(v) }).catch(() => undefined)
    }, POLL_MS)
    return () => { gone = true; clearInterval(id) }
  }, [state, chatId])

  if (!view || view.chatId !== chatId || !state || state === 'empty') return null

  const n = toEmbed(view)
  const tokens = roughTokens(view.tokens)
  const run = async () => {
    setBusy(true)
    try {
      const v = await startEmbed(chatId)
      if (live.current === chatId) setView(v)
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
    : state === 'none' ? t('meaning.none', { items: view.items })
    : state === 'other' ? t('meaning.other', { n: view.other, have: view.have, items: view.items })
    : state === 'partial' ? t('meaning.partial', { have: view.have, items: view.items })
    : state === 'working' ? t('meaning.working', { have: view.have, items: view.items })
    : t('meaning.all', { items: view.items })

  return (
    <section className={cn('rounded-xl border border-border bg-card p-3', className)} data-testid="meaning-card" data-state={state} aria-label={t('meaning.title')}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-body font-semibold">{t('meaning.title')}</h3>
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
      {canEmbed && <p className="mt-2 text-caption text-muted-foreground">{t('meaning.note')}</p>}
    </section>
  )
}
