
import { useEffect, useMemo, useState } from 'react'
import { Plug, SealCheck, Brain, CircleNotch, ArrowsClockwise, PencilSimple, Plus, MagnifyingGlass, X } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useApp } from '@/lib/store'
import { SectionPage, PaneTitle } from '@/components/shell/section-page'
import {
  fetchEngineProviders, setEngineModelContext, setEngineModelPricing,
  type EngineConnectionInfo, type EngineProviderInfo,
} from '@/lib/engine'
import { ProfilesSheet } from '@/components/connections/profiles-sheet'
import { ModelMark } from '@/components/model-mark'
import type { ModelInfo, ModelPricing } from '@/lib/types'
import { cn, shortModel } from '@/lib/utils'

/**
 * Connections — the app is a CONSUMER of the engine's provider setup:
 * providers, keys and endpoints are configured once in the engine client
 * (Settings → API connections) and every app sees them. Nothing here can
 * create or edit a connection.
 *
 * The page is one picker, top to bottom:
 *   1. the model in use (qualified engine ref "<provider>/<model>"; model
 *      names repeat across providers, so bare names never select),
 *   2. quick-switch chips (saved provider + model pairs),
 *   3. provider pills, then that provider's models inline. The search
 *      bar and pills stay pinned while the list scrolls, and a search also
 *      counts matches under the other providers so nothing is hidden.
 */

const API_LABELS: Record<string, string> = {
  'openai-completions': 'OpenAI-compatible',
  'anthropic-messages': 'Anthropic-compatible',
  'openai-responses': 'OpenAI Responses',
  'google-generative-ai': 'Google AI',
}

/** Resolve the app's stored default (which may be a legacy bare model name)
 *  to its catalog entry — refs win, bare ids only survive as fallback. */
function findByRef(models: ModelInfo[], stored: string | null): ModelInfo | null {
  if (!stored) return null
  return models.find((m) => m.ref === stored) ?? models.find((m) => m.id === stored) ?? null
}

/** The builtin provider catalog changes only with engine releases. */
let providerCache: EngineProviderInfo[] | null = null

/** A price per Mtok as people write it: catalogs compute some (0.42000000000000004), so keep 6 significant digits. */
const priceText = (n: number) => String(Number(n.toPrecision(6)))

export function ConnectionsView() {
  const models = useApp((s) => s.models)
  const connections = useApp((s) => s.engineConnections)
  const model = useApp((s) => s.model)
  const setModel = useApp((s) => s.setModel)
  const hydrate = useApp((s) => s.hydrate)
  const profiles = useApp((s) => s.connectionProfiles)
  const addProfile = useApp((s) => s.addConnectionProfile)

  const [providers, setProviders] = useState<EngineProviderInfo[]>(providerCache ?? [])
  const [busy, setBusy] = useState(false)
  /** the provider whose models are listed; null follows the model in use */
  const [browse, setBrowse] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [profilesOpen, setProfilesOpen] = useState(false)
  const [ctxEdit, setCtxEdit] = useState(false)
  const [ctxDraft, setCtxDraft] = useState('')
  const [priceEdit, setPriceEdit] = useState(false)
  const [priceDraft, setPriceDraft] = useState({ input: '', output: '', cacheRead: '' })
  /** The draft as engine rates, or null while it can't be saved: blanks read
   *  as 0, but an all-zero table is "unknown", which is what Clear is for. */
  const priceRates: ModelPricing | null = (() => {
    const n = (v: string) => (v.trim() === '' ? 0 : Number(v.trim()))
    const input = n(priceDraft.input), output = n(priceDraft.output), cacheRead = n(priceDraft.cacheRead)
    if (![input, output, cacheRead].every((x) => Number.isFinite(x) && x >= 0)) return null
    if (input === 0 && output === 0 && cacheRead === 0) return null
    return { input, output, cacheRead, cacheWrite: 0 }
  })()

  // connections + models live in the store (hydrate fetches both; the
  // connections_changed ws push re-hydrates them live) — only the builtin
  // provider catalog is local, it changes solely with engine releases
  const refresh = async () => {
    setBusy(true)
    try {
      providerCache = await fetchEngineProviders()
      setProviders(providerCache)
      await hydrate()
    } finally { setBusy(false) }
  }
  // opening the section re-fetches nothing heavy: the store's models and
  // connections stay live over the socket, only the static provider catalog
  // loads once per page
  useEffect(() => {
    if (!providerCache) void fetchEngineProviders().then((p) => { providerCache = p; setProviders(p) })
  }, [])

  const modelCountByConnection = useMemo(() => {
    const m = new Map<string, number>()
    for (const x of models) m.set(x.provider, (m.get(x.provider) ?? 0) + 1)
    return m
  }, [models])

  const current = findByRef(models, model)
  const shown = browse ?? current?.provider ?? connections[0]?.name ?? null
  const shownConnection = connections.find((c) => c.name === shown) ?? null

  const needle = q.trim().toLowerCase()
  const matches = (m: ModelInfo) => !needle || m.id.toLowerCase().includes(needle)
  const list = models.filter((m) => m.provider === shown && matches(m))
  /** a search that misses (or also hits) elsewhere points at the providers
   *  that do have it, so switching provider is never guesswork */
  const elsewhere = useMemo(() => {
    if (!needle) return []
    const hits = new Map<string, number>()
    for (const m of models) {
      if (m.provider === shown || !m.id.toLowerCase().includes(needle)) continue
      hits.set(m.provider, (hits.get(m.provider) ?? 0) + 1)
    }
    return [...hits.entries()]
  }, [models, needle, shown])

  const kindLabel = (c: EngineConnectionInfo) =>
    c.providerId ? (providers.find((p) => p.id === c.providerId)?.label ?? c.providerId)
      : c.api ? (API_LABELS[c.api] ?? c.api)
        : c.oauthProvider ? 'OAuth sign-in'
          : 'connection'

  const pick = (m: ModelInfo) => {
    void setModel(m.ref)
    toast.success(`Model: ${shortModel(m.id)}`, { description: m.provider })
  }

  const saveCurrentAsProfile = () => {
    if (!current) return
    const base = `${current.provider} ${shortModel(current.id)}`
    let name = base
    let n = 2
    while (profiles.some((p) => p.name === name)) name = `${base} ${n++}`
    addProfile({ name, provider: current.provider, modelId: current.ref })
    toast.success(`Saved: ${name}`, { description: 'Rename it under Edit.' })
  }

  const openPrice = () => {
    if (!current) return
    setPriceDraft({
      input: current.pricing ? priceText(current.pricing.input) : '',
      output: current.pricing ? priceText(current.pricing.output) : '',
      cacheRead: current.pricing?.cacheRead ? priceText(current.pricing.cacheRead) : '',
    })
    setPriceEdit(true)
  }
  const savePrice = async (rates: ModelPricing | null) => {
    if (!current) return
    try {
      await setEngineModelPricing(current.ref, rates)
      setPriceEdit(false)
      await refresh()
      toast.success(rates ? `${shortModel(current.id)}: prices saved` : `${shortModel(current.id)}: prices cleared`)
    } catch (e) { toast.error(String((e as Error).message ?? e)) }
  }

  const openCtx = () => {
    if (!current) return
    setCtxDraft(current.context > 0 ? String(current.context) : '')
    setCtxEdit(true)
  }
  const saveCtx = async (value: number | null) => {
    if (!current) return
    try {
      await setEngineModelContext(current.ref, value)
      setCtxEdit(false)
      await refresh()
      toast.success(value == null ? `${shortModel(current.id)}: catalog value restored` : `${shortModel(current.id)}: ${value.toLocaleString()} ctx`)
    } catch (e) { toast.error(String((e as Error).message ?? e)) }
  }

  return (
    <SectionPage section="connections" count={models.length}>
    <div className="flex h-full min-h-0 flex-col">
      {/* header scrolls WITH the page (mobile keyboard room) */}
      <ScrollArea className="min-h-0 flex-1">
        <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <PaneTitle section="connections" count={`${models.length} models`} icon={<Plug className="size-4 text-primary" aria-hidden="true" />} />
          <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="Refresh connections" onClick={() => void refresh()} disabled={busy}>
            {busy ? <CircleNotch className="size-4 animate-spin" aria-hidden="true" /> : <ArrowsClockwise className="size-4" aria-hidden="true" />}
          </Button>
        </header>

        <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pt-4 pb-3">

          {/* ── 1. the model in use ──────────────────────────────────────── */}
          <section className="flex flex-col gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">In use</h2>
            <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-card px-3 py-2.5">
              {current ? (
                <>
                  <ModelMark model={current.id} className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 truncate font-mono text-sm font-medium">{shortModel(current.id)}</span>
                  <span className="text-[11px] text-muted-foreground">{current.provider}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-5 rounded-full px-2 text-[10px]"
                      onClick={openCtx}
                      aria-label="Context window"
                    >
                      {current.context > 0 ? `${ctxLabel(current.context)} ctx` : 'set ctx'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-5 rounded-full px-2 text-[10px]"
                      onClick={openPrice}
                      aria-label="Token prices"
                    >
                      {current.pricing ? `${priceText(current.pricing.input)}/${priceText(current.pricing.output)} per Mtok` : 'set prices'}
                    </Button>
                    {current.reasoning && <Badge variant="secondary" className="text-[10px]">reasoning</Badge>}
                  </span>
                </>
              ) : (
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {model ? <span className="font-mono">{shortModel(model)}</span> : 'Engine picks automatically'}
                </span>
              )}
              {model && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto"
                  aria-label="Clear model, the engine picks"
                  onClick={() => { void setModel(null); toast.success('Model cleared, the engine picks') }}
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              )}
            </div>
          </section>

          {/* ── 2. quick switch chips (app-side saved pairs) ─────────────── */}
          <QuickSwitch
            onEdit={() => setProfilesOpen(true)}
            onPick={pick}
            onSave={current ? saveCurrentAsProfile : null}
          />

          {connections.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-start gap-2 p-4">
                <p className="text-sm text-muted-foreground">
                  No providers yet. Add one in the engine client (Settings → API
                  connections) and it shows up here.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── 3. provider → model. Pills + search stay pinned while the list
               scrolls, so switching provider never means scrolling back up. ── */}
        {connections.length > 0 && (
          <>
            <div className="sticky top-0 z-10 border-y border-border bg-background/95 backdrop-blur">
              <div className="mx-auto flex max-w-2xl flex-col gap-2 px-4 py-2.5">
                <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Providers">
                  {connections.map((c) => {
                    const active = c.name === shown
                    const inUse = current?.provider === c.name
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setBrowse(c.name)}
                        className={cn(
                          'flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors',
                          active ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <ModelMark model={`${c.providerId ?? ''} ${c.name}`} className="size-3.5 shrink-0" />
                        <span className="max-w-40 truncate">{c.name}</span>
                        <span className="opacity-60">{modelCountByConnection.get(c.name) ?? 0}</span>
                        {!c.hasKey && (c.providerId || c.oauthProvider) && <span className="size-1.5 shrink-0 rounded-full bg-destructive" aria-label="no key" />}
                        {inUse && <SealCheck className="size-3.5 shrink-0" aria-label="in use" />}
                      </button>
                    )
                  })}
                </div>
                <div className="relative">
                  <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={`Search ${shown ?? 'models'}…`}
                    className="h-8 pl-8 text-sm"
                    aria-label="Search models"
                  />
                </div>
              </div>
            </div>

            <div className="mx-auto flex max-w-2xl flex-col px-2 pt-1.5 pb-4">
              {shownConnection && (
                <p className="flex flex-wrap items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground">
                  {kindLabel(shownConnection)}
                  <span>·</span>
                  {shownConnection.hasKey
                    ? 'key saved'
                    : shownConnection.providerId || shownConnection.oauthProvider
                      ? <span className="text-destructive">no key, add one in the engine client and refresh</span>
                      : 'no key'}
                </p>
              )}
              {elsewhere.length > 0 && (
                <p className="flex flex-wrap items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground">
                  Also in:
                  {elsewhere.map(([name, n]) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setBrowse(name)}
                      className="rounded-full border border-border px-2 py-0.5 transition-colors hover:text-foreground"
                    >
                      {name} {n}
                    </button>
                  ))}
                </p>
              )}
              {list.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  {needle ? 'No models match.' : 'This provider lists no models.'}
                </p>
              )}
              <ul className="flex flex-col">
                {list.map((m) => {
                  const active = m.ref === current?.ref
                  const slash = m.id.lastIndexOf('/')
                  return (
                    <li key={m.ref} className="[contain-intrinsic-size:auto_40px] [content-visibility:auto]">
                      <button
                        type="button"
                        onClick={() => pick(m)}
                        aria-current={active || undefined}
                        className={cn(
                          'flex min-h-10 w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-accent',
                          active && 'bg-primary/10 text-primary',
                        )}
                      >
                        <ModelMark model={m.id} className="size-3.5 shrink-0 opacity-70" />
                        <span className="min-w-0 flex-1 truncate font-mono text-xs">
                          {slash !== -1 && <span className="opacity-50">{m.id.slice(0, slash + 1)}</span>}
                          {shortModel(m.id)}
                        </span>
                        {m.context > 0 && <Badge variant="outline" className="shrink-0 text-[10px]">{ctxLabel(m.context)}</Badge>}
                        {m.reasoning && (
                          <>
                            <Badge variant="secondary" className="hidden shrink-0 text-[10px] sm:inline-flex">reasoning</Badge>
                            <Brain className="size-3.5 shrink-0 text-muted-foreground sm:hidden" aria-label="reasoning" />
                          </>
                        )}
                        {active && <SealCheck className="size-3.5 shrink-0" aria-hidden="true" />}
                      </button>
                    </li>
                  )
                })}
              </ul>
              <p className="px-2 pt-3 text-[11px] text-muted-foreground">
                Add or edit providers in the engine client: Settings → API connections.
              </p>
            </div>
          </>
        )}
      </ScrollArea>

      <ProfilesSheet open={profilesOpen} onOpenChange={setProfilesOpen} />

      {/* context override: the number attached to the model wins over the
          catalog's official value; empty means unknown (catalog has none) */}
      <Dialog open={ctxEdit} onOpenChange={setCtxEdit}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Context window</DialogTitle></DialogHeader>
          <p className="break-all font-mono text-xs text-muted-foreground">{current ? shortModel(current.ref) : ''}</p>
          <Input
            value={ctxDraft}
            inputMode="numeric"
            placeholder="e.g. 128000"
            onChange={(e) => setCtxDraft(e.target.value)}
            aria-label="Context window"
            className="font-mono"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => void saveCtx(null)}>Use catalog value</Button>
            <Button
              size="sm"
              disabled={!/^\d+$/.test(ctxDraft.trim()) || Number(ctxDraft) <= 0}
              onClick={() => void saveCtx(Number(ctxDraft.trim()))}
            >
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* token prices: what a generation actually costs. Custom endpoints and
          proxies are in no price catalog, so without a number here the studio
          reports spend as unknown rather than as zero. */}
      <Dialog open={priceEdit} onOpenChange={setPriceEdit}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Token prices</DialogTitle></DialogHeader>
          <p className="break-all font-mono text-xs text-muted-foreground">{current ? shortModel(current.ref) : ''}</p>
          <p className="text-xs text-muted-foreground">USD per million tokens.</p>
          {(['input', 'output', 'cacheRead'] as const).map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <span className="w-24 shrink-0 text-xs text-muted-foreground">
                {k === 'cacheRead' ? 'cached in' : k}
              </span>
              <Input
                value={priceDraft[k]}
                inputMode="decimal"
                placeholder="0"
                onChange={(e) => setPriceDraft((d) => ({ ...d, [k]: e.target.value }))}
                aria-label={`${k} price per million tokens`}
                className="font-mono"
              />
            </label>
          ))}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => void savePrice(null)}>Clear</Button>
            <Button size="sm" disabled={!priceRates} onClick={() => priceRates && void savePrice(priceRates)}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </SectionPage>
  )
}

function QuickSwitch({ onEdit, onPick, onSave }: {
  onEdit: () => void
  onPick: (m: ModelInfo) => void
  /** snapshot the model in use as a new chip; null when nothing is in use */
  onSave: (() => void) | null
}) {
  const profiles = useApp((s) => s.connectionProfiles)
  const models = useApp((s) => s.models)
  const model = useApp((s) => s.model)
  const targets = profiles.map((p) => ({ p, target: models.find((m) => m.ref === p.modelId || m.id === p.modelId) }))
  const saved = targets.some(({ target }) => !!target && (target.ref === model || target.id === model))
  if (profiles.length === 0 && !onSave) return null
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Quick switch</h2>
        {profiles.length > 0 && (
          <Button variant="ghost" size="sm" className="ml-auto h-6 px-2 text-[11px]" onClick={onEdit}>
            <PencilSimple className="size-3" aria-hidden="true" />Edit
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {targets.map(({ p, target }) => {
          const active = !!target && (target.ref === model || target.id === model)
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => { if (target) onPick(target) }}
              className={cn(
                'flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors',
                active ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {target ? <ModelMark model={target.id} className="size-3.5 shrink-0" /> : null}
              <span className="max-w-48 truncate">{p.name}</span>
            </button>
          )
        })}
        {onSave && !saved && (
          <button
            type="button"
            onClick={onSave}
            className="flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Plus className="size-3.5" aria-hidden="true" />Save current
          </button>
        )}
      </div>
    </section>
  )
}

/** Compact context size for tight rows: 1M, 200k, 8k. */
function ctxLabel(n: number): string {
  if (n >= 1_000_000) return `${Number((n / 1_000_000).toFixed(2))}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}
