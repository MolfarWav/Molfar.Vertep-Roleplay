import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Check, PencilSimple, Plus, Robot, Star, Trash, Warning } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { InfoTip } from '@/components/ui/info-tip'
import { useConfirm } from '@/components/ui/confirm'
import { ChatPicker, type PickerChat } from '@/components/canvas/chat-picker'
import { useT } from '@/hooks/use-t'
import {
  costsFromRuns, freeName, GUESS_REPLY_MS, laneOf, LANES, putInLane, sameItems, setsWith, simulate, usageFor,
  type Lane, type SetItem,
} from '@/lib/agent-sets'
import {
  deleteAgentSet, listAgentSets, listInstalledAgents, loadAgentRuns, loadAgentUsage, loadDefaultAgentSet, saveAgentSet, setDefaultAgentSet, setIdFromName,
  type AgentInfo, type AgentRun, type AgentSet, type AgentUsage,
} from '@/lib/agents'
import { useApp } from '@/lib/store'
import type { MsgKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const errText = (e: unknown) => String((e as Error)?.message ?? e)

const LANE_DOT: Record<Lane, string> = { before: 'bg-amber-500', parallel: 'bg-violet-500', after: 'bg-emerald-500', manual: 'bg-muted-foreground' }
const LANE_BAR: Record<Lane, string> = { before: 'bg-amber-500', parallel: 'bg-violet-500', after: 'bg-emerald-500', manual: 'bg-muted' }
const seconds = (ms: number) => `${(Math.round(ms / 100) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 })} s`

/** Round tick marks for the time line: about five of them, on whole seconds. */
function ticks(end: number): number[] {
  const step = [1000, 2000, 5000, 10000, 20000, 30000, 60000].find((s) => end / s <= 6) ?? 120000
  return Array.from({ length: Math.floor(end / step) + 1 }, (_, i) => i * step)
}

/**
 * The Agent sets screen (a board of the Canvas): pick a set, move its agents between the three lanes, and see
 * what a turn with it costs, from the agents' real runs in a chat. A set is what a chat follows (the chat's Agents tab).
 */
export function AgentSets({ onOpenAgents }: { onOpenAgents: () => void }) {
  const t = useT()
  const [confirm, confirmDialog] = useConfirm()
  // undefined = not read yet, null = the app has no agents plugin
  const [installed, setInstalled] = useState<AgentInfo[] | null | undefined>(undefined)
  const [sets, setSets] = useState<AgentSet[]>([])
  const [defaultSet, setDefault] = useState<string | null>(null)
  // undefined = counting, null = the app could not say
  const [usage, setUsage] = useState<AgentUsage | null | undefined>(undefined)
  const [pickId, setPickId] = useState<string | null>(null)
  // the working copy of the picked set: saved only on Save
  const [name, setName] = useState('')
  const [items, setItems] = useState<SetItem[]>([])
  const [naming, setNaming] = useState<null | 'rename' | 'copy' | 'new'>(null)
  const [draftName, setDraftName] = useState('')
  const [busy, setBusy] = useState(false)
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [runChat, setRunChat] = useState<string | null>(null)
  const [replySec, setReplySec] = useState(String(GUESS_REPLY_MS / 1000))
  const storeChats = useApp((s) => s.chats)
  const characters = useApp((s) => s.characters)
  const nameInput = useRef<HTMLInputElement>(null)
  // `t` is a new function on every render; the loader reads it through a ref so it stays stable
  const tRef = useRef(t)
  tRef.current = t

  const saved = sets.find((s) => s.id === pickId) ?? null
  const dirty = !!saved && (name.trim() !== saved.name || !sameItems(items, saved.items))

  const take = useCallback((s: AgentSet | null) => {
    setPickId(s?.id ?? null)
    setName(s?.name ?? '')
    setItems(s?.items ?? [])
    setNaming(null)
  }, [])

  const reload = useCallback(async (select?: string) => {
    try {
      const [i, s, d] = await Promise.all([listInstalledAgents(), listAgentSets(), loadDefaultAgentSet()])
      setInstalled(i)
      setSets(s)
      setDefault(d)
      // counted after the screen has what it needs: opening every chat's meta must not hold the sets back
      void loadAgentUsage().then(setUsage)
      setPickId((cur) => {
        const id = select ?? (cur && s.some((x) => x.id === cur) ? cur : d && s.some((x) => x.id === d) ? d : s[0]?.id ?? null)
        const set = s.find((x) => x.id === id) ?? null
        if (id !== cur || select) { setName(set?.name ?? ''); setItems(set?.items ?? []); setNaming(null) }
        return id
      })
    } catch (e) {
      setInstalled(null)
      toast.error(tRef.current('ag.loadFailed', { why: errText(e) }))
    }
  }, [])
  useEffect(() => { void reload() }, [reload])
  useEffect(() => { if (naming) nameInput.current?.focus() }, [naming])

  // the chat whose runs give the numbers: the newest one unless the person picked another
  const chatRows = useMemo<PickerChat[]>(() => {
    const names = new Map(characters.map((c) => [c.id, c.name]))
    return storeChats.map((c) => ({ id: c.id, title: c.title ?? '', name: names.get(c.characterId) ?? '', updatedAt: c.updatedAt }))
  }, [storeChats, characters])
  const numbersChat = runChat ?? chatRows.reduce<PickerChat | null>((a, c) => (!a || (c.updatedAt ?? 0) > (a.updatedAt ?? 0) ? c : a), null)?.id ?? null
  useEffect(() => {
    if (!numbersChat || !installed) { setRuns([]); return }
    let live = true
    loadAgentRuns(numbersChat).then((r) => { if (live) setRuns(r) }).catch(() => { if (live) setRuns([]) })
    return () => { live = false }
  }, [numbersChat, installed])

  const infos = installed ?? []
  const info = useMemo(() => new Map(infos.map((a) => [a.id, a])), [infos])
  const costs = useMemo(() => costsFromRuns(runs, infos), [runs, infos])
  const replyMs = Math.max(0, (Number(replySec.replace(',', '.')) || 0) * 1000)
  const turn = useMemo(() => simulate(items, infos, costs, replyMs), [items, infos, costs, replyMs])
  const nameOf = (id: string) => info.get(id)?.name ?? id

  const guard = async (): Promise<boolean> => !dirty || confirm({ title: t('as.unsavedTitle'), description: t('as.unsavedBody'), actionLabel: t('as.discard') })

  const pick = async (id: string) => {
    if (id === pickId) return
    if (!(await guard())) return
    take(sets.find((s) => s.id === id) ?? null)
  }

  /** What a chat-count line says: "3 chats", "at least 4000 chats". */
  const countText = (u: { n: number; partial: boolean }) => (u.partial ? `${u.n}+` : String(u.n))

  /** Saving the picked set: when chats follow it and its agents change, say so first (the change reaches them on their next reply). */
  const saveSet = async () => {
    if (!saved) return
    const u = usageFor(usage, saved.id)
    if (u && u.n > 0 && !sameItems(items, saved.items)) {
      const ok = await confirm({ title: t('as.saveInUseTitle', { name: saved.name }), description: t('as.saveInUseBody', { count: countText(u) }), actionLabel: t('as.save'), destructive: false })
      if (!ok) return
    }
    await persist(saved.id, name.trim(), items)
  }

  const persist = async (id: string, nm: string, its: SetItem[]) => {
    setBusy(true)
    try {
      await saveAgentSet(id, nm, its)
      await reload(id)
      toast.success(t('ag.sets.saved', { name: nm }))
    } catch (e) { toast.error(t('ag.saveFailed', { why: errText(e) })) } finally { setBusy(false) }
  }

  const openNaming = (kind: 'rename' | 'copy' | 'new') => {
    setNaming(kind)
    setDraftName(kind === 'rename' ? name : kind === 'copy' ? freeName(name, sets.map((s) => s.name)) : '')
  }
  const finishNaming = async () => {
    const nm = draftName.trim()
    if (!nm || !naming) return
    if (naming === 'rename') { setName(nm); setNaming(null); return }
    if (sets.some((s) => s.name.toLowerCase() === nm.toLowerCase())) { toast.error(t('as.nameTaken')); return }
    const id = setIdFromName(nm, new Set(sets.map((s) => s.id)))
    // "save as" keeps the original as it was saved: the copy takes the working list
    await persist(id, nm, naming === 'copy' ? items : [])
  }

  const drop = async () => {
    if (!saved) return
    const u = usageFor(usage, saved.id)
    const inUse = u && u.n > 0 ? ` ${t('as.deleteInUse', { count: countText(u) })}` : ''
    if (!(await confirm({ title: t('ag.sets.deleteTitle', { name: saved.name }), description: `${t('ag.sets.deleteBody')}${inUse}`, actionLabel: t('ag.sets.delete') }))) return
    try { await deleteAgentSet(saved.id); setPickId(null); await reload() } catch (e) { toast.error(t('ag.saveFailed', { why: errText(e) })) }
  }
  const makeDefault = async () => {
    if (!saved) return
    try { await setDefaultAgentSet(defaultSet === saved.id ? null : saved.id); setDefault(await loadDefaultAgentSet()) } catch (e) { toast.error(t('ag.saveFailed', { why: errText(e) })) }
  }

  const setItem = (agent: string, f: (it: SetItem) => SetItem) => setItems((l) => l.map((it) => (it.agent === agent ? f(it) : it)))

  if (installed === undefined) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('canvas.loading')}</div>
  if (installed === null) return <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">{t('ag.noPlugin')}</div>

  const inSet = new Set(items.map((it) => it.agent))
  const lane = (l: Lane) => items.filter((it) => laneOf(it, info.get(it.agent)) === l)
  const span = Math.max(turn.end, 1000)

  return (
    <div className="h-full overflow-y-auto" data-testid="agent-sets">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-3 md:flex-row md:items-start md:p-5">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <section aria-label={t('as.title')} className="flex flex-col gap-2">
            <div className="flex items-center gap-1">
              <h2 className="text-base font-semibold">{t('as.title')}</h2>
              <InfoTip label={t('as.infoLabel')}>{t('as.info')}</InfoTip>
            </div>
            <p className="text-xs text-muted-foreground">{t('as.lead')}</p>
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="as-pick">{t('as.pick')}</label>
              <select
                id="as-pick"
                data-testid="as-pick"
                value={pickId ?? ''}
                onChange={(e) => void pick(e.target.value)}
                className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm md:w-64 md:flex-none max-md:h-10"
              >
                {sets.length === 0 && <option value="">{t('as.noSets')}</option>}
                {sets.map((s) => <option key={s.id} value={s.id}>{s.name}{s.id === defaultSet ? ` · ${t('ag.sets.default')}` : ''}</option>)}
              </select>
              {dirty && <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-600 dark:text-amber-400" data-testid="as-dirty">{t('as.dirty')}</span>}
              <span className="flex-1 max-md:hidden" />
              {saved && <Button size="sm" className="shrink-0 max-md:h-10" disabled={!dirty || busy || !name.trim()} onClick={() => void saveSet()} data-testid="as-save">{t('as.save')}</Button>}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Button variant="outline" size="sm" className="max-md:h-10" onClick={() => openNaming('new')} data-testid="as-new"><Plus className="size-3.5" aria-hidden="true" />{t('as.new')}</Button>
              {saved && <>
                <Button variant="ghost" size="sm" className="max-md:h-10" onClick={() => openNaming('rename')}><PencilSimple className="size-3.5" aria-hidden="true" />{t('as.rename')}</Button>
                <Button variant="ghost" size="sm" className="max-md:h-10" onClick={() => openNaming('copy')} data-testid="as-copy">{t('as.saveAs')}</Button>
                <Button variant={defaultSet === saved.id ? 'secondary' : 'ghost'} size="sm" className="max-md:h-10" title={t('ag.sets.defaultTip')} onClick={() => void makeDefault()} aria-pressed={defaultSet === saved.id}>
                  <Star className="size-3.5" weight={defaultSet === saved.id ? 'fill' : 'regular'} aria-hidden="true" />{defaultSet === saved.id ? t('ag.sets.default') : t('ag.sets.makeDefault')}
                </Button>
                <Button variant="ghost" size="icon-sm" className="max-md:size-10" aria-label={t('ag.sets.delete')} title={t('ag.sets.delete')} onClick={() => void drop()}><Trash className="size-4" aria-hidden="true" /></Button>
              </>}
            </div>
            {naming && (
              <form className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2" onSubmit={(e) => { e.preventDefault(); void finishNaming() }}>
                <label className="sr-only" htmlFor="as-name">{t('ag.sets.name')}</label>
                <Input id="as-name" ref={nameInput} value={draftName} onChange={(ev) => setDraftName(ev.target.value)} maxLength={80} placeholder={t('as.namePlaceholder')} className="min-w-0 flex-1 max-md:h-10" />
                <Button type="submit" size="sm" className="max-md:h-10" disabled={!draftName.trim() || busy}>{t('as.nameDone')}</Button>
                <Button type="button" variant="ghost" size="sm" className="max-md:h-10" onClick={() => setNaming(null)}>{t('as.nameCancel')}</Button>
              </form>
            )}
            {saved && name.trim() !== saved.name && <p className="text-xs text-muted-foreground">{t('as.renamed', { name })}</p>}
            {saved && (() => {
              const u = usageFor(usage, saved.id)
              return (
                <p className="flex items-center gap-0.5 text-xs text-muted-foreground" data-testid="as-usage" aria-live="polite">
                  {usage === undefined ? t('as.usage.counting') : !u ? null : u.n === 0 && !u.partial ? t('as.usage.none') : t(u.partial ? 'as.usage.atLeast' : 'as.usage.count', { n: u.n })}
                  {u && <InfoTip label={t('as.usage.infoLabel')} testId="as-usage-info">{t('as.usage.info')}{usage && usage.own > 0 ? ` ${t('as.usage.own', { n: usage.own })}` : ''}</InfoTip>}
                </p>
              )
            })()}
          </section>

          {!saved ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">{t('as.empty')}</p>
          ) : (
            <>
              <section className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-3" aria-label={t('as.sandbox')} data-testid="as-sandbox">
                <div className="flex items-center gap-1">
                  <h3 className="text-sm font-semibold">{t('as.sandbox')}</h3>
                  <InfoTip label={t('as.infoLabel')}>{t('as.sandboxInfo')}</InfoTip>
                </div>
                <p className="text-xs text-muted-foreground">{t('as.sandboxLead')}</p>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-[11px] text-muted-foreground">{t('as.numbersFrom')}</span>
                    <ChatPicker chats={chatRows} value={numbersChat} onChange={setRunChat} className="max-md:h-10" />
                  </div>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted-foreground">{t('as.replyTakes')}</span>
                    <Input value={replySec} onChange={(e) => setReplySec(e.target.value)} inputMode="decimal" className="h-8 w-24 max-md:h-10" aria-label={t('as.replyTakes')} data-testid="as-reply" />
                  </label>
                  <div className="ml-auto flex gap-2" aria-live="polite">
                    <div className="rounded-lg bg-muted px-3 py-1.5 text-center" data-testid="as-wait"><b className="block text-sm">{seconds(turn.waitMs)}</b><span className="text-[10px] text-muted-foreground">{t('as.kpiWait')}</span></div>
                    <div className="rounded-lg bg-muted px-3 py-1.5 text-center" data-testid="as-calls"><b className="block text-sm">{turn.calls}</b><span className="text-[10px] text-muted-foreground">{t('as.kpiCalls')}</span></div>
                  </div>
                </div>
                <div className="relative flex flex-col gap-1.5 rounded-lg bg-muted/40 p-2" role="img" aria-label={t('as.timeAria', { wait: seconds(turn.waitMs), calls: turn.calls })}>
                  <TimeRow label={t('as.reply')} sub={`${t('as.replySub')} · ${seconds(replyMs)}`} from={turn.reply.from} to={turn.reply.to} span={span} cls="bg-sky-500" />
                  {turn.bars.map((b) => (
                    <TimeRow key={b.agent} label={nameOf(b.agent)} sub={`${t(`as.lane.${b.lane}` as MsgKey)} · ${seconds(b.to - b.from)}${b.known ? '' : ' ?'}`} from={b.from} to={b.to} span={span}
                      cls={cn(LANE_BAR[b.lane], !b.known && 'border-2 border-dashed border-foreground/50 bg-transparent')} />
                  ))}
                  <div className="relative ml-0 h-4 md:ml-[9.5rem]" aria-hidden="true">
                    {ticks(span).map((tk) => <span key={tk} className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] text-muted-foreground" style={{ left: `${(tk / span) * 100}%` }}>{Math.round(tk / 1000)} s</span>)}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {runs.length === 0 ? t('as.noRuns') : t('as.fromRuns', { n: runs.length })}{runs.length > 0 && turn.bars.some((b) => !b.known) ? ` ${t('as.guess')}` : ''}
                </p>
              </section>

              <section className="grid gap-3 md:grid-cols-3" aria-label={t('as.lanes')}>
                {LANES.filter((l) => l !== 'manual' || lane('manual').length > 0).map((l) => (
                  <div key={l} className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-2.5" data-testid={`as-lane-${l}`}>
                    <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><span className={cn('size-2 rounded-full', LANE_DOT[l])} aria-hidden="true" />{t(`as.lane.${l}` as MsgKey)}</h3>
                    <p className="text-[11px] text-muted-foreground">{t(`as.laneHint.${l}` as MsgKey)}</p>
                    {lane(l).length === 0 && <p className="rounded-md border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted-foreground">{t('as.laneEmpty')}</p>}
                    {lane(l).map((it) => {
                      const a = info.get(it.agent)
                      const c = costs.byAgent.get(it.agent)
                      return (
                        <div key={it.agent} className={cn('flex flex-col gap-1.5 rounded-md border border-border bg-background p-2', !it.on && 'opacity-60')} data-testid={`as-item-${it.agent}`}>
                          <div className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">{nameOf(it.agent)}</span>
                            <Switch size="sm" className="max-md:after:-inset-y-3.5" checked={it.on} aria-label={t('as.on', { name: nameOf(it.agent) })} onCheckedChange={(on) => setItem(it.agent, (x) => ({ ...x, on }))} />
                          </div>
                          {!a && <p className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400"><Warning className="size-3" aria-hidden="true" />{t('ag.wait.notInstalled')}</p>}
                          {c && <p className="text-[11px] text-muted-foreground">{t('as.cost', { time: seconds(c.ms), n: c.calls })}{c.known ? '' : ' ?'}</p>}
                          <div className="flex items-center gap-2">
                            <label className="sr-only" htmlFor={`as-lane-${it.agent}`}>{t('as.moveTo', { name: nameOf(it.agent) })}</label>
                            <select id={`as-lane-${it.agent}`} data-testid={`as-move-${it.agent}`} value={l}
                              onChange={(e) => setItems((list) => putInLane(list, it.agent, e.target.value as Lane))}
                              className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-1.5 text-xs max-md:h-10">
                              {LANES.map((x) => <option key={x} value={x}>{t(`as.lane.${x}` as MsgKey)}</option>)}
                            </select>
                            <Button variant="ghost" size="icon-sm" className="max-md:size-10" aria-label={t('as.takeOut', { name: nameOf(it.agent) })} title={t('as.takeOut', { name: nameOf(it.agent) })} onClick={() => setItems((list) => list.filter((x) => x.agent !== it.agent))}>
                              <Trash className="size-3.5" aria-hidden="true" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </section>
            </>
          )}
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-2 md:w-72" aria-label={t('as.library')} data-testid="as-library">
          <h3 className="text-sm font-semibold">{t('as.library')}</h3>
          <p className="text-xs text-muted-foreground">{t('as.libraryLead')}</p>
          {infos.length === 0 && <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">{t('ag.noneInstalled')}</p>}
          {infos.map((a) => {
            const where = setsWith(sets, a.id).map((s) => s.name)
            const here = inSet.has(a.id)
            return (
              <div key={a.id} className={cn('flex flex-col gap-1.5 rounded-lg border bg-card p-2.5', here ? 'border-emerald-500/50' : 'border-border')} data-testid={`as-lib-${a.id}`}>
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.name}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{a.version}</span>
                </div>
                {a.description && <p className="line-clamp-2 text-[11px] text-muted-foreground">{a.description}</p>}
                <div className="flex flex-wrap gap-1 text-[10px]">
                  <span className="rounded-full bg-muted px-1.5 py-0.5">{t(`as.lane.${a.trigger.when ?? 'after'}` as MsgKey)}</span>
                  <span className="rounded-full bg-muted px-1.5 py-0.5">{t('as.calls', { n: a.maxCalls })}</span>
                  {!a.runnable && <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-amber-600 dark:text-amber-400">{t('as.waiting')}</span>}
                </div>
                <p className="text-[11px] text-muted-foreground">{where.length ? t('as.inSets', { names: where.join(', ') }) : t('as.inNoSets')}</p>
                {saved && (here
                  ? <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"><Check className="size-3" aria-hidden="true" />{t('as.inThis')}</span>
                  : <Button variant="outline" size="sm" className="self-start max-md:h-10" onClick={() => setItems((l) => putInLane(l, a.id, a.trigger.when ?? 'after'))} data-testid={`as-add-${a.id}`}>
                    <Plus className="size-3.5" aria-hidden="true" />{t('as.add')}
                  </Button>)}
              </div>
            )
          })}
          <Button variant="outline" size="sm" className="self-start max-md:h-10" onClick={onOpenAgents}><Robot className="size-3.5" aria-hidden="true" />{t('as.openEditor')}</Button>
        </aside>
      </div>
      {confirmDialog}
    </div>
  )
}

/** One row of the time line: the name on the left (above the bar on a phone) and a bar placed by time. */
function TimeRow({ label, sub, from, to, span, cls }: { label: string; sub: string; from: number; to: number; span: number; cls: string }) {
  return (
    <div className="grid items-center gap-x-2 gap-y-0.5 md:grid-cols-[9rem_1fr]">
      <div className="min-w-0 leading-tight"><span className="block truncate text-xs font-medium">{label}</span><span className="block truncate text-[10px] text-muted-foreground">{sub}</span></div>
      <div className="relative h-6 rounded bg-background/60">
        <div className={cn('absolute inset-y-0 min-w-1.5 rounded', cls)} style={{ left: `${(from / span) * 100}%`, width: `${Math.max(((to - from) / span) * 100, 1)}%` }} />
      </div>
    </div>
  )
}
