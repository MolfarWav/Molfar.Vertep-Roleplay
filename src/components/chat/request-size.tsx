// The request-size alarm (#261, #262). A coloured button in the chat header shows how many tokens the last request
// sent and which model got it; past the person's limit (60% of the window unless they set a size) a popup offers to
// carry on in a new chat, in one click. The count is the whole request (history, card, memory and the rest), the
// real number the provider reported, so nobody has to look it up on the provider's site.
import { useEffect, useRef, useState } from 'react'
import { Gauge, WarningCircle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/setting-row'
import { ModelMark } from '@/components/model-mark'
import { fetchLitConfig, LIT_CONFIG_EVENT, putLitConfig, type LitConfig } from '@/components/library/litopys-api'
import { useT } from '@/hooks/use-t'
import { continueInNewChat } from '@/lib/continue-chat'
import { alertLimit, lastPromptTokens, parseTokens, requestLevel, shortTokens, shouldOfferTrim, type RequestLevel } from '@/lib/long-chat'
import { formatTokens } from '@/lib/tokens'
import { cn, shortModel } from '@/lib/utils'
import type { Chat } from '@/lib/types'

const key = (chatId: string) => `rp.bigPrompt.${chatId}`
const PRESETS = [16000, 32000, 64000, 100000, 200000, 500000]

function readDismissed(chatId: string): number | null {
  try {
    const v = Number(localStorage.getItem(key(chatId)))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

export interface RequestSize {
  chatId: string
  /** What the newest reply's request sent, in tokens (0 = nothing yet) */
  tokens: number
  model: string | null
  windowTokens: number | null
  /** null = no alarm (switched off, or "60% of the window" and the window is not known) */
  limit: number | null
  level: RequestLevel
  cfg: LitConfig | null
  open: boolean
  setOpen: (o: boolean) => void
  /** "Not now": the popup stays away until the request has grown by half */
  hide: () => void
  streaming: boolean
}

/** The state behind the button and the popup; chat-view owns it so the phone menu can open the popup too. */
export function useRequestSize(chat: Chat | undefined, model: string | null, windowTokens: number | null, streaming: boolean): RequestSize {
  const chatId = chat?.id ?? ''
  const tokens = lastPromptTokens(chat?.messages ?? [])
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState<number | null>(() => readDismissed(chatId))
  const [cfg, setCfg] = useState<LitConfig | null>(null)
  // the limit is a Litopys setting (all chats); read again after each reply and when it is saved anywhere
  useEffect(() => {
    let live = true
    const read = () => { fetchLitConfig().then((c) => { if (live) setCfg(c) }).catch(() => { if (live) setCfg(null) }) }
    read()
    window.addEventListener(LIT_CONFIG_EVENT, read)
    return () => { live = false; window.removeEventListener(LIT_CONFIG_EVENT, read) }
  }, [chatId, tokens])
  useEffect(() => { setDismissed(readDismissed(chatId)); setOpen(false) }, [chatId])

  const limit = alertLimit(cfg, windowTokens)
  const level = requestLevel(tokens, limit)

  // the popup opens by itself only when a reply made the request grow past the limit while this chat was open;
  // opening an old chat that is already big shows the button in alarm colour and nothing else
  // The usage lands a moment before the stream is marked finished, so the growth is remembered until the reply ends.
  const seen = useRef<{ chat: string; tokens: number } | null>(null)
  const grew = useRef(false)
  useEffect(() => {
    const prev = seen.current
    seen.current = { chat: chatId, tokens }
    if (!prev || prev.chat !== chatId) { grew.current = false; return }
    if (tokens > prev.tokens) grew.current = true
    if (grew.current && !streaming) {
      grew.current = false
      if (shouldOfferTrim(tokens, limit, dismissed)) setOpen(true)
    }
  }, [tokens, chatId, limit, dismissed, streaming])

  const hide = () => {
    setDismissed(tokens)
    try { localStorage.setItem(key(chatId), String(tokens)) } catch { /* private mode: the popup may come back after a reload, harmless */ }
  }
  return { chatId, tokens, model, windowTokens, limit, level, cfg, open, setOpen, hide, streaming }
}

/** Colours by level; the icon and the words change too, so colour is never the only signal. */
const TINT: Record<RequestLevel, { box: string; icon: string }> = {
  none: { box: 'border-dashed border-border bg-muted/40', icon: 'text-muted-foreground' },
  ok: { box: 'border-teal-500/40 bg-teal-500/10', icon: 'text-teal-600 dark:text-teal-300' },
  near: { box: 'border-amber-500/50 bg-amber-500/15', icon: 'text-amber-600 dark:text-amber-300' },
  over: { box: 'border-destructive/60 bg-destructive/15', icon: 'text-destructive' },
}

export function requestAria(t: ReturnType<typeof useT>, rs: Pick<RequestSize, 'tokens' | 'model' | 'limit' | 'level'>): string {
  if (rs.level === 'none') return t('req.ariaNone')
  const model = rs.model ? shortModel(rs.model) : t('req.modelUnknown')
  const base = rs.limit !== null
    ? t('req.aria', { n: rs.tokens.toLocaleString(), model, limit: rs.limit.toLocaleString() })
    : t('req.ariaNoLimit', { n: rs.tokens.toLocaleString(), model })
  return rs.level === 'over' ? `${t('req.over')}. ${base}` : base
}

/** The button for the header tools row. `labelled` adds the words; `compact` is the phone header's smaller chip. */
export function RequestSizeButton({ rs, labelled, compact }: { rs: RequestSize; labelled?: boolean; compact?: boolean }) {
  const t = useT()
  const aria = requestAria(t, rs)
  const Icon = rs.level === 'over' ? WarningCircle : Gauge
  return (
    <button
      type="button"
      onClick={() => rs.setOpen(true)}
      aria-label={aria}
      aria-haspopup="dialog"
      title={aria}
      data-testid="request-size"
      data-level={rs.level}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-medium outline-none transition-colors hover:brightness-125 focus-visible:ring-2 focus-visible:ring-ring/60',
        compact ? 'h-10' : 'h-8',
        TINT[rs.level].box,
      )}
    >
      <Icon className={cn('size-4 shrink-0', TINT[rs.level].icon)} weight={rs.level === 'over' ? 'fill' : 'regular'} aria-hidden="true" />
      {labelled && <span className="whitespace-nowrap">{t('req.label')}</span>}
      <span className="whitespace-nowrap tabular-nums">
        {rs.level === 'none' ? '—' : labelled && rs.limit !== null ? `${shortTokens(rs.tokens)} / ${shortTokens(rs.limit)}` : shortTokens(rs.tokens)}
      </span>
    </button>
  )
}

/** The limit control inside the popup: 60% of the window, a size the person types, or never. */
function LimitControl({ rs }: { rs: RequestSize }) {
  const t = useT()
  const cfg = rs.cfg
  const [draft, setDraft] = useState('')
  const [bad, setBad] = useState(false)
  const mode = cfg?.promptAlert ?? 'auto'
  const size = Number(cfg?.promptAlertTokens) || 30000
  useEffect(() => { setDraft(shortTokens(size)); setBad(false) }, [size, mode])
  if (!cfg) return null

  const save = async (patch: Partial<LitConfig>) => {
    try { await putLitConfig(patch) } catch (e) { toast.error(String((e as Error).message ?? e)) }
  }
  const commit = () => {
    const n = parseTokens(draft)
    if (n === null) { setBad(true); return }
    setBad(false)
    if (n !== size) void save({ promptAlertTokens: n })
  }
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3" data-testid="request-limit">
      <span className="text-xs font-medium" id="req-limit-label">{t('req.setTitle')}</span>
      <Segmented
        label={t('req.setTitle')}
        value={mode}
        options={[
          { id: 'auto', label: t('lit.set.alertAuto') },
          { id: 'tokens', label: t('lit.set.alertTokens') },
          { id: 'off', label: t('lit.set.alertOff') },
        ]}
        onChange={(v) => void save({ promptAlert: v, ...(v === 'tokens' ? { promptAlertTokens: size } : {}) })}
        className="w-full [&>button]:flex-1 [&>button]:px-1.5 [&>button]:text-xs"
      />
      {mode === 'tokens' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Input
              value={draft}
              inputMode="text"
              aria-labelledby="req-limit-label"
              aria-invalid={bad}
              data-testid="request-limit-size"
              className="h-9 w-28 text-sm tabular-nums max-md:h-10"
              onChange={(e) => { setDraft(e.target.value); setBad(false) }}
              onBlur={commit}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
            />
            <span className="text-xs text-muted-foreground">{t('lit.unit.tokens')}</span>
          </div>
          {bad && <p className="text-[11px] text-destructive" role="alert">{t('req.setBad')}</p>}
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((n) => (
              <Button key={n} type="button" size="sm" variant={n === size ? 'secondary' : 'outline'} className="h-8 px-2 text-xs max-md:h-10" onClick={() => void save({ promptAlertTokens: n })}>
                {shortTokens(n)}
              </Button>
            ))}
          </div>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">{t('req.setHint')}</p>
    </div>
  )
}

/** The popup: the numbers, the one-click continuation, "Not now", and the limit setting. */
export function RequestSizeDialog({ rs }: { rs: RequestSize }) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const over = rs.level === 'over'
  const litopysOn = !!rs.cfg && rs.cfg.enabled !== false && rs.cfg.insert !== false
  const canSwitch = litopysOn && rs.cfg?.cutMode !== 'scenes'
  const pct = rs.limit ? Math.min(100, (rs.tokens / rs.limit) * 100) : 0

  const close = (o: boolean) => {
    // closing a popup that asked for an answer counts as "Not now", so it does not come back with every reply
    if (!o && over) rs.hide()
    rs.setOpen(o)
  }
  const yes = async () => {
    if (busy) return
    setBusy(true)
    try {
      await continueInNewChat(rs.chatId)
      rs.setOpen(false)
    } catch (e) {
      toast.error(String((e as Error).message ?? e))
    } finally {
      setBusy(false)
    }
  }
  const switchToScenes = async () => {
    try {
      await putLitConfig({ cutMode: 'scenes' })
      toast.success(t('req.scenesDone'))
      rs.hide()
      rs.setOpen(false)
    } catch (e) {
      toast.error(String((e as Error).message ?? e))
    }
  }

  const row = 'flex items-start justify-between gap-3'
  return (
    <Dialog open={rs.open} onOpenChange={close}>
      <DialogContent className="flex max-h-[88dvh] flex-col gap-3 overflow-y-auto sm:max-w-md" data-testid="request-dialog">
        <DialogHeader>
          <DialogTitle>{over ? t('req.titleOver') : t('req.title')}</DialogTitle>
          <DialogDescription>{over ? t('req.descOver') : t('req.descOk')}</DialogDescription>
        </DialogHeader>
        <dl className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs">
          <div className={row}>
            <dt className="shrink-0 text-muted-foreground">{t('req.sent')}</dt>
            <dd className="font-mono text-right" data-testid="request-tokens">
              {rs.tokens > 0 ? t('req.tokens', { n: rs.tokens.toLocaleString() }) : <span className="text-muted-foreground">{t('req.none')}</span>}
            </dd>
          </div>
          <div className={row}>
            <dt className="shrink-0 text-muted-foreground">{t('details.model')}</dt>
            <dd className="flex min-w-0 items-center gap-1.5 text-right">
              {rs.model ? (
                <>
                  <ModelMark model={rs.model} className="size-3.5 shrink-0" />
                  <span className="min-w-0 truncate font-mono" title={rs.model}>{shortModel(rs.model)}</span>
                </>
              ) : <span className="text-muted-foreground">{t('req.modelUnknown')}</span>}
            </dd>
          </div>
          {rs.windowTokens ? (
            <div className={row}>
              <dt className="shrink-0 text-muted-foreground">{t('req.window')}</dt>
              <dd className="font-mono text-right">{formatTokens(rs.windowTokens)}</dd>
            </div>
          ) : null}
          <div className={row}>
            <dt className="shrink-0 text-muted-foreground">{t('req.limit')}</dt>
            <dd className="font-mono text-right">{rs.limit !== null ? formatTokens(rs.limit) : <span className="text-muted-foreground">{t('req.noLimit')}</span>}</dd>
          </div>
          {rs.limit !== null && rs.tokens > 0 && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="presentation">
              <div className={cn('h-full rounded-full', over ? 'bg-destructive' : rs.level === 'near' ? 'bg-amber-500' : 'bg-teal-500')} style={{ width: `${pct}%` }} />
            </div>
          )}
        </dl>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button className="h-11 w-full md:h-9" variant={over ? 'default' : 'outline'} onClick={() => void yes()} disabled={busy || rs.streaming} data-testid="request-continue">
            {over ? t('req.yes') : t('req.yesAnyway')}
          </Button>
          {rs.streaming && <p className="text-[11px] text-muted-foreground">{t('req.streaming')}</p>}
          {over && canSwitch && (
            <Button variant="outline" className="h-11 w-full md:h-9" onClick={() => void switchToScenes()} data-testid="request-scenes">
              {t('req.scenes')}
            </Button>
          )}
          <Button variant="ghost" className="h-11 w-full md:h-9" onClick={() => close(false)} data-testid="request-later">
            {over ? t('req.later') : t('req.close')}
          </Button>
        </DialogFooter>
        <LimitControl rs={rs} />
      </DialogContent>
    </Dialog>
  )
}
