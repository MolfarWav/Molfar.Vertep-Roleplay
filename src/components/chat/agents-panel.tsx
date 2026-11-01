import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ArrowClockwise, ArrowCounterClockwise, Check, GearSix, HourglassMedium, MapPin, Plus, Robot, Star, Trash, UploadSimple, X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { CommandGroup, CommandItem, CommandSeparator } from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { AgentOwnLimits } from '@/components/chat/agent-own-limits'
import { AgentNotesSwitch } from '@/components/chat/agent-notes-switch'
import { AgentPermissions } from '@/components/chat/agent-permissions'
import { allowedCount } from '@/lib/agent-permissions'
import { useSetUsage } from '@/hooks/use-set-usage'
import { AgentIssueText } from '@/components/chat/agent-issue'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useConfirm } from '@/components/ui/confirm'
import { useRelativeTime, useT } from '@/hooks/use-t'
import {
  deleteAgentDraft, deleteAgentSet, describeNeed, editChatAgents, installAgentDraft, installAgentFile, listAgentDrafts, listAgentSets, listInstalledAgents, loadAgentRuns,
  loadChatAgents, loadDefaultAgentSet, removeAgent, runAgents, saveAgentSet, setDefaultAgentSet, setIdFromName, useAgentsLive,
  type AgentDraft, type AgentInfo, type AgentPhase, type AgentRun, type AgentSet, type ChatAgentItem, type ChatAgentsOp,
} from '@/lib/agents'
import type { MsgKey } from '@/lib/i18n'
import { installMessage } from '@/lib/agent-install'
import { cn } from '@/lib/utils'

const errText = (e: unknown) => String((e as Error)?.message ?? e)

/** The agents of one chat and what the panels around it need: the chat's list, the installed agents, the sets, the newest runs. */
export function useAgentsData(chatId: string, enabled: boolean) {
  const t = useT()
  const list = useAgentsLive((s) => s.chats[chatId])
  // undefined = not read yet, null = the app has no agents plugin
  const [installed, setInstalled] = useState<AgentInfo[] | null | undefined>(undefined)
  const [sets, setSets] = useState<AgentSet[]>([])
  const [defaultSet, setDefault] = useState<string | null>(null)
  const [runs, setRuns] = useState<AgentRun[]>([])
  // `t` is a new function on every render: as a dependency it made every state update read everything again
  const tRef = useRef(t)
  tRef.current = t

  const reload = useCallback(async () => {
    const [l, i, s, d, r] = await Promise.allSettled([loadChatAgents(chatId), listInstalledAgents(), listAgentSets(), loadDefaultAgentSet(), loadAgentRuns(chatId)])
    if (i.status === 'fulfilled') setInstalled(i.value)
    if (s.status === 'fulfilled') setSets(s.value)
    if (d.status === 'fulfilled') setDefault(d.value)
    if (r.status === 'fulfilled') setRuns(r.value)
    // a missing runs route just means the plugin is absent: the installed list says so
    const failed = [l, i, s, d].find((x) => x.status === 'rejected') as PromiseRejectedResult | undefined
    if (failed) toast.error(tRef.current('ag.loadFailed', { why: errText(failed.reason) }))
  }, [chatId])

  useEffect(() => { if (enabled) void reload() }, [enabled, reload])
  /** Just the installed list: every plugin call builds the sandbox again, so an install does not re-read the rest. */
  const refreshInstalled = useCallback(async () => { setInstalled(await listInstalledAgents()) }, [])

  const lastRun = useMemo(() => {
    const m = new Map<string, AgentRun>()
    for (const r of runs) if (!m.has(r.agent) || m.get(r.agent)!.at < r.at) m.set(r.agent, r)
    return m
  }, [runs])

  return { list, installed, sets, defaultSet, lastRun, reload, refreshInstalled }
}
export type AgentsData = ReturnType<typeof useAgentsData>

/** Runs one edit of the chat's list; the live store keeps the answer. */
function useEdit(chatId: string) {
  const t = useT()
  return useCallback(async (op: ChatAgentsOp) => {
    try { await editChatAgents(chatId, op) } catch (e) { toast.error(t('ag.saveFailed', { why: errText(e) })) }
  }, [chatId, t])
}

/** Why an agent does not run yet, in words ('' = nothing in the way). */
function waitingFor(info: AgentInfo | undefined, t: ReturnType<typeof useT>, loaded = true): string {
  if (!loaded) return ''
  if (!info) return t('ag.wait.notInstalled')
  if (info.errors.length) return t('ag.wait.errors')
  if (info.unsupported.length) return t('ag.wait.unsupported')
  if (info.missing.length) return t('ag.wait.permission')
  return ''
}

const phaseOf = (it: ChatAgentItem, info: AgentInfo | undefined): AgentPhase | undefined => it.phase ?? info?.trigger.when

/** The line above the tab's list: what the chat's agents follow. */
export function AgentsTabContext({ chatId, data }: { chatId: string; data: AgentsData }) {
  const t = useT()
  const edit = useEdit(chatId)
  const { list, sets } = data
  const setName = list?.presetId ? sets.find((s) => s.id === list.presetId)?.name ?? list.presetId : ''
  const line = !list ? '…'
    : !list.followsPreset ? t('ag.ownList')
      : list.presetId && list.presetMissing ? t('ag.missingSet', { name: setName })
        : list.presetId ? t('ag.followsSet', { name: setName })
          : t('ag.noSet')
  return (
    <div className="flex w-full flex-wrap items-center gap-1 border-b border-border bg-card px-3 py-2">
      <Robot className="size-4 shrink-0 text-violet-500" aria-hidden="true" />
      <span className="min-w-[8rem] flex-1 truncate text-xs font-semibold" data-testid="agents-context">{line}</span>
      {list && !list.followsPreset && (
        <button
          type="button"
          onClick={() => void edit({ op: 'reset' })}
          className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground max-md:min-h-10"
        >
          <ArrowCounterClockwise className="size-3" aria-hidden="true" /> {t('ag.backToSet')}
        </button>
      )}
      <AgentNotesSwitch className="mt-1 w-full" />
    </div>
  )
}

/**
 * Where the chat shows one agent's results: a button on the agent's row that opens the places that suit what the agent
 * makes. The first choice leaves it to the agent's author. Nothing else about the agent changes.
 */
function PlacePicker({ chatId, item, info }: { chatId: string; item: ChatAgentItem; info: AgentInfo }) {
  const t = useT()
  const edit = useEdit(chatId)
  const places = info.places ?? []
  const pick = (place: string | null) => void edit({ op: 'show', agent: item.agent, place })
  const row = 'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent max-md:py-2.5'
  return (
    <Popover>
      <PopoverTrigger
        aria-label={t('ag.place.aria', { name: info.name })}
        title={t('ag.place.aria', { name: info.name })}
        data-testid={`agent-place-${item.agent}`}
        onClick={(e) => e.stopPropagation()}
        className={cn('flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-background max-md:size-10', item.show || item.also ? 'text-violet-500' : 'text-muted-foreground')}
      >
        <MapPin className="size-3.5" aria-hidden="true" />
      </PopoverTrigger>
      {/* the popover is drawn outside the list but its clicks and keys still travel up through it */}
      <PopoverContent align="end" className="w-64 gap-1 p-2" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <p className="px-2 pt-1 text-xs font-semibold">{t('ag.place.title')}</p>
        <p className="px-2 pb-1 text-[11px] text-muted-foreground">{t('ag.place.hint')}</p>
        <div role="radiogroup" aria-label={t('ag.place.title')} className="flex flex-col">
          <button type="button" role="radio" aria-checked={!item.show} className={row} onClick={() => pick(null)}>
            <Check className={cn('size-3.5 shrink-0', item.show ? 'invisible' : '')} aria-hidden="true" />
            <span className="min-w-0 flex-1 first-letter:uppercase">{t('ag.place.default', { place: t(`fg.place.${places[0]}` as MsgKey) })}</span>
          </button>
          {places.map((pl) => (
            <button key={pl} type="button" role="radio" aria-checked={item.show === pl} className={row} onClick={() => pick(pl)} data-testid={`agent-place-${item.agent}-${pl}`}>
              <Check className={cn('size-3.5 shrink-0', item.show === pl ? '' : 'invisible')} aria-hidden="true" />
              <span className="min-w-0 flex-1 first-letter:uppercase">{t(`fg.place.${pl}` as MsgKey)}</span>
            </button>
          ))}
        </div>
        <button type="button" role="checkbox" aria-checked={!!item.also} className={cn(row, 'mt-1 items-start rounded-t-none border-t border-border pt-2')} data-testid={`agent-also-${item.agent}`}
          onClick={() => void edit({ op: 'also', agent: item.agent, on: !item.also })}>
          <span className={cn('mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border', item.also ? 'border-violet-500 bg-violet-500 text-white' : 'border-muted-foreground/60')} aria-hidden="true">
            {item.also && <Check className="size-2.5" weight="bold" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block">{t('ag.also.label')}</span>
            <span className="block text-[11px] text-muted-foreground">{t('ag.also.hint')}</span>
          </span>
        </button>
      </PopoverContent>
    </Popover>
  )
}

/** The tab's rows (inside the palette's list): the chat's agents, the installed ones to add, the sets. */
export function AgentsTabItems({ chatId, data, itemCls, activeItemCls, actionCls, onManage }: { chatId: string; data: AgentsData; itemCls: string; activeItemCls: string; actionCls: string; onManage: () => void }) {
  const t = useT()
  const when = useRelativeTime()
  const edit = useEdit(chatId)
  const { list, installed, sets, lastRun } = data
  const running = useAgentsLive((s) => !!s.running[chatId])
  if (installed === null) return <p className="px-3 py-3 text-xs text-muted-foreground">{t('ag.noPlugin')}</p>
  const items = list?.items ?? []
  const inChat = new Set(items.map((it) => it.agent))
  const rest = (installed ?? []).filter((a) => !inChat.has(a.id))

  const status = (it: ChatAgentItem, info: AgentInfo | undefined) => {
    const w = waitingFor(info, t, installed !== undefined)
    if (w) return { text: w, warn: true }
    if (installed === undefined) return { text: '…', warn: false }
    const r = lastRun.get(it.agent)
    if (!r) return { text: t('ag.notYet'), warn: false }
    return r.status === 'failed' ? { text: t('ag.failed', { why: r.reason ?? '?' }), warn: true } : { text: t('ag.ranAt', { when: when(r.at) }), warn: false }
  }

  return (
    <>
      <CommandGroup heading={t('ag.inChat', { n: items.length })} className="flex flex-col gap-0.5">
        {items.length === 0 && <p className="px-2 py-1.5 text-[11px] text-muted-foreground">{t('ag.none')}</p>}
        {items.map((it) => {
          const info = installed?.find((a) => a.id === it.agent)
          const st = status(it, info)
          const ph = phaseOf(it, info)
          return (
            <CommandItem key={it.agent} value={`agent ${info?.name ?? ''} ${it.agent}`} onSelect={() => void edit({ op: 'toggle', agent: it.agent, on: !it.on })}
              className={cn(itemCls, 'max-md:flex-wrap', it.on && activeItemCls)} data-testid={`agent-row-${it.agent}`}>
              <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full', it.on ? 'bg-emerald-500/15 text-emerald-500' : 'text-transparent')}>
                <Check className="size-3" aria-hidden="true" />
              </span>
              <span className="min-w-[7rem] flex-1">
                <span className={cn('block truncate text-xs', it.on && 'font-semibold', !it.on && 'text-muted-foreground')}>{info?.name ?? it.agent}</span>
                <span className={cn('block truncate text-[10px]', st.warn ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                  {ph && !st.warn ? `${t(`ag.phase.${ph === 'before' && it.wait === false ? 'parallel' : ph}` as 'ag.phase.after')} · ` : ''}{st.text}
                </span>
              </span>
              <span className="ml-auto flex shrink-0 items-center">
              {ph === 'before' && (
                <button
                  type="button"
                  aria-pressed={it.wait !== false}
                  aria-label={it.wait === false ? t('ag.sync.off') : t('ag.sync.on')}
                  title={it.wait === false ? t('ag.sync.off') : t('ag.sync.on')}
                  data-testid={`agent-wait-${it.agent}`}
                  onClick={(e) => { e.stopPropagation(); void edit({ op: 'wait', agent: it.agent, wait: it.wait === false }) }}
                  className={cn('flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-background max-md:size-10', it.wait === false ? 'text-muted-foreground' : 'text-violet-500')}
                >
                  <HourglassMedium className="size-3.5" aria-hidden="true" />
                </button>
              )}
              {(info?.places?.length ?? 0) > 1 && <PlacePicker chatId={chatId} item={it} info={info!} />}
              <button
                type="button"
                aria-label={t('ag.runAgain.title')}
                title={t('ag.runAgain.title')}
                disabled={running || !it.on || !!waitingFor(info, t, installed !== undefined)}
                data-testid={`agent-run-${it.agent}`}
                onClick={(e) => { e.stopPropagation(); void runAgents(chatId, it.agent) }}
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-40 max-md:size-10"
              >
                <ArrowClockwise className={cn('size-3.5', running && 'animate-spin')} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={t('ag.removeFromChat')}
                title={t('ag.removeFromChat')}
                onClick={(e) => { e.stopPropagation(); void edit({ op: 'remove', agent: it.agent }) }}
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground max-md:size-10"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
              </span>
            </CommandItem>
          )
        })}
      </CommandGroup>

      {rest.length > 0 && (
        <CommandGroup heading={t('ag.installed', { n: rest.length })} className="flex flex-col gap-0.5">
          {rest.map((a) => {
            const w = waitingFor(a, t)
            return (
              <CommandItem key={a.id} value={`add ${a.name} ${a.id}`} onSelect={() => void edit({ op: 'add', agent: a.id })} className={itemCls}>
                <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs">{a.name}</span>
                  <span className={cn('block truncate text-[10px]', w ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>{w || a.description || '—'}</span>
                </span>
              </CommandItem>
            )
          })}
        </CommandGroup>
      )}
      {installed && installed.length === 0 && <p className="px-3 py-1.5 text-[11px] text-muted-foreground">{t('ag.noneInstalled')}</p>}

      {sets.length > 0 && (
        <CommandGroup heading={t('ag.sets', { n: sets.length })} className="flex flex-col gap-0.5">
          {sets.map((s) => {
            const active = !!list?.followsPreset && list.presetId === s.id
            return (
              <CommandItem key={s.id} value={`set ${s.name}`} onSelect={() => void edit({ op: 'preset', preset: s.id })} className={cn(itemCls, active && activeItemCls)} title={t('ag.useSet')}>
                <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full', active ? 'bg-violet-500/15 text-violet-500' : 'text-transparent')}>
                  <Check className="size-3" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate text-xs', active && 'font-semibold')}>{s.name}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">{t('ag.sets.count', { n: s.items.length })}</span>
                </span>
                {data.defaultSet === s.id && <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{t('ag.sets.default')}</span>}
              </CommandItem>
            )
          })}
        </CommandGroup>
      )}

      <CommandSeparator className="my-1.5" />
      <CommandItem value="manage agents install" onSelect={onManage} className={actionCls}>
        <GearSix className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex-1 text-xs">{t('ag.manage')}</span>
      </CommandItem>
    </>
  )
}

/** Installed agent, with its permissions in plain words. Not allowed yet = the list stays open and Allow is the main button. */
export function InstalledAgent({ agent, focus, onChanged }: { agent: AgentInfo; focus: boolean; onChanged: () => Promise<void> }) {
  const t = useT()
  const [confirm, confirmDialog] = useConfirm()
  const ref = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const [permOpen, setPermOpen] = useState(false)
  useEffect(() => { if (focus) ref.current?.scrollIntoView({ block: 'nearest' }) }, [focus])
  // an agent that was just installed asks for its permissions at once; the person decides on the page, not in a list
  const asked = useRef(false)
  const waiting = agent.missing.length > 0
  const capped = !!agent.own && agent.own.maxCalls > 0 && agent.maxCalls > agent.own.maxCalls
  const supported = agent.needs.filter((n) => !agent.unsupported.includes(n))
  // allowed before and asking for more now = a new version: only what is new needs a decision
  const added = agent.added ?? []
  const update = waiting && added.length > 0
  useEffect(() => { if (focus && waiting && !asked.current) { asked.current = true; setPermOpen(true) } }, [focus, waiting])

  const remove = async () => {
    if (!(await confirm({ title: t('ag.removeTitle', { name: agent.name }), description: t('ag.removeBody'), actionLabel: t('ag.removeAgent') }))) return
    setBusy(true)
    try { await removeAgent(agent.id); await onChanged() } catch (e) { toast.error(t('ag.saveFailed', { why: errText(e) })) } finally { setBusy(false) }
  }
  return (
    <div ref={ref} className={cn('flex flex-col gap-2 rounded-lg border px-3 py-2.5', waiting ? 'border-amber-500/50 bg-amber-500/5' : 'border-border')} data-testid={`agent-card-${agent.id}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{agent.name}{agent.version && <span className="ml-1.5 font-normal text-muted-foreground">{agent.version}</span>}</p>
          {agent.author && <p className="truncate text-[11px] text-muted-foreground">{t('ag.by', { name: agent.author })}</p>}
        </div>
        {!waiting && !agent.unsupported.length && !agent.errors.length && (capped
          ? <span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300" data-testid="agent-capped">{t('ag.own.badge')}</span>
          : <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">{t('ag.allowed')}</span>)}
      </div>
      {agent.description && <p className="text-xs leading-relaxed text-muted-foreground">{agent.description}</p>}
      {agent.errors.length > 0 && <p className="text-xs text-destructive">{t('ag.wait.errors')}: <AgentIssueText issue={agent.errors[0]} /></p>}
      {update && <p className="rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300" data-testid="agent-update">{t('ag.update.lead', { name: agent.name, n: added.length })}</p>}
      {agent.unsupported.length > 0 && (
        <div className="flex flex-col gap-1 text-xs text-amber-600 dark:text-amber-400">
          <p>{t('ag.review.unsupported')}</p>
          <ul className="list-disc pl-4">{agent.unsupported.map((n) => <li key={n}>{describeNeed(n, t)}</li>)}</ul>
        </div>
      )}
      {!waiting && <AgentOwnLimits agent={agent} onChanged={onChanged} />}
      <div className="flex flex-wrap items-center gap-2">
        {supported.length > 0 && (
          <Button size="sm" variant={waiting ? 'default' : 'outline'} className="max-md:h-10" onClick={() => setPermOpen(true)} data-testid={`agent-perm-open-${agent.id}`}>
            {t('ag.perm.open', { n: supported.length })}
          </Button>
        )}
        {waiting && <span className="text-[11px] text-muted-foreground" data-testid="agent-perm-count">{t('ag.perm.progress', allowedCount(agent.needs, agent.unsupported, agent.granted))}</span>}
        <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground max-md:h-10" disabled={busy} onClick={() => void remove()}>
          <Trash className="size-3.5" aria-hidden="true" /> {t('ag.removeAgent')}
        </Button>
      </div>
      <AgentPermissions agent={agent} open={permOpen} onOpenChange={setPermOpen} onChanged={onChanged} />
      {confirmDialog}
    </div>
  )
}

/** One place for the agents of the app: install a file, see and allow what it asks, remove it, and manage sets. */
export function AgentsSheet({ chatId, open, onOpenChange, data }: { chatId: string; open: boolean; onOpenChange: (o: boolean) => void; data: AgentsData }) {
  const t = useT()
  const [confirm, confirmDialog] = useConfirm()
  const file = useRef<HTMLInputElement>(null)
  const [fresh, setFresh] = useState<string | null>(null)
  const [setName, setSetName] = useState('')
  const [busy, setBusy] = useState(false)
  const { installed, sets, defaultSet, list, reload, refreshInstalled } = data
  const usage = useSetUsage(defaultSet)
  // files Molfar wrote into the workspace; none, or no agents plugin, shows nothing
  const [drafts, setDrafts] = useState<AgentDraft[]>([])
  const loadDrafts = useCallback(async () => { try { setDrafts(await listAgentDrafts()) } catch { setDrafts([]) } }, [])
  useEffect(() => { if (open) void loadDrafts() }, [open, loadDrafts])

  const installDraft = async (d: AgentDraft) => {
    setBusy(true)
    try {
      const r = await installAgentDraft(d.name)
      await refreshInstalled()
      await loadDrafts()
      setFresh(r.id)
      toast.success(installMessage(t, d.title, r))
    } catch (e) { toast.error(t('ag.install.failed', { why: errText(e) })) } finally { setBusy(false) }
  }
  const dropDraft = async (d: AgentDraft) => {
    if (!(await confirm({ title: t('ag.drafts.deleteTitle', { name: d.title }), description: t('ag.drafts.deleteBody'), actionLabel: t('ag.drafts.delete') }))) return
    try { await deleteAgentDraft(d.name); await loadDrafts() } catch (e) { toast.error(t('ag.saveFailed', { why: errText(e) })) }
  }

  const install = async (f: File | undefined) => {
    if (!f) return
    let json: unknown
    try { json = JSON.parse(await f.text()) } catch (e) { toast.error(t('ag.install.bad', { why: errText(e) })); return }
    setBusy(true)
    try {
      const r = await installAgentFile(json)
      await refreshInstalled()
      setFresh(r.id)
      if (r.updated) toast.success(installMessage(t, String((json as { agent?: { name?: string } }).agent?.name ?? r.id), r))
    } catch (e) { toast.error(t('ag.install.failed', { why: errText(e) })) } finally { setBusy(false) }
  }

  const saveSet = async () => {
    const name = setName.trim()
    if (!name || !list) return
    setBusy(true)
    try {
      await saveAgentSet(setIdFromName(name, new Set(sets.map((s) => s.id))), name, list.items.map((it) => ({ agent: it.agent, on: it.on, ...(it.phase ? { phase: it.phase } : {}) })))
      setSetName('')
      await reload()
      toast.success(t('ag.sets.saved', { name }))
    } catch (e) { toast.error(t('ag.saveFailed', { why: errText(e) })) } finally { setBusy(false) }
  }
  const makeDefault = async (s: AgentSet) => {
    try { await setDefaultAgentSet(defaultSet === s.id ? null : s.id); await reload() } catch (e) { toast.error(t('ag.saveFailed', { why: errText(e) })) }
  }
  const dropSet = async (s: AgentSet) => {
    const users = usage.get(s.id) ?? 0
    if (!(await confirm({ title: t('ag.sets.deleteTitle', { name: s.name }), description: users > 0 ? t('ag.sets.deleteBodyUsed', { n: users }) : t('ag.sets.deleteBody'), actionLabel: t('ag.sets.delete') }))) return
    try { await deleteAgentSet(s.id); await reload() } catch (e) { toast.error(t('ag.saveFailed', { why: errText(e) })) }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 pr-8"><Robot className="size-4 shrink-0" aria-hidden="true" />{t('ag.sheet.title')}</SheetTitle>
          <SheetDescription>{t('ag.sheet.lead')}</SheetDescription>
        </SheetHeader>
        {open && (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
            {installed === null ? (
              <p className="text-xs text-muted-foreground">{t('ag.noPlugin')}</p>
            ) : (
              <>
                <div>
                  <input ref={file} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { void install(e.target.files?.[0]); e.target.value = '' }} />
                  <Button variant="outline" className="max-md:h-10" disabled={busy} title={t('ag.install.tip')} onClick={() => file.current?.click()} data-testid="agent-install">
                    <UploadSimple className="size-4" aria-hidden="true" /> {t('ag.install')}
                  </Button>
                </div>

                {drafts.length > 0 && (
                  <section className="flex flex-col gap-2" aria-label={t('ag.drafts.title', { n: drafts.length })} data-testid="agent-drafts">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('ag.drafts.title', { n: drafts.length })}</h3>
                    <p className="text-[11px] text-muted-foreground">{t('ag.drafts.lead')}</p>
                    {drafts.map((d) => (
                      <div key={d.name} className="flex flex-col gap-1.5 rounded-lg border border-border px-3 py-2" data-testid={`agent-draft-${d.name}`}>
                        <div className="flex items-start gap-2">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-semibold">{d.title}</span>
                            <span className={cn('block text-[11px]', d.errors.length ? 'text-destructive' : 'text-muted-foreground')}>
                              {d.errors.length ? t('ag.drafts.problems', { n: d.errors.length }) : d.installed ? t('ag.drafts.installed') : t('ag.drafts.ok')}
                            </span>
                          </span>
                          <Button size="sm" variant="outline" className="shrink-0 max-md:h-10" disabled={busy || d.errors.length > 0} onClick={() => void installDraft(d)}>
                            {d.installed ? t('ag.drafts.update') : t('ag.drafts.install')}
                          </Button>
                          <button type="button" aria-label={t('ag.drafts.delete')} title={t('ag.drafts.delete')} onClick={() => void dropDraft(d)}
                            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground max-md:size-10">
                            <Trash className="size-3.5" aria-hidden="true" />
                          </button>
                        </div>
                        {d.description && <p className="text-[11px] leading-snug text-muted-foreground">{d.description}</p>}
                        {(d.errors.length > 0 || d.warnings.length > 0) && (
                          <details className="text-[11px]">
                            <summary className="cursor-pointer select-none text-muted-foreground">{t('ag.drafts.details')}</summary>
                            <ul className="mt-1 flex flex-col gap-0.5">
                              {d.errors.map((x, i) => <li key={`e${i}`} className="text-destructive max-md:py-1"><AgentIssueText issue={x} /></li>)}
                              {d.warnings.map((x, i) => <li key={`w${i}`} className="text-amber-600 dark:text-amber-400 max-md:py-1"><AgentIssueText issue={x} /></li>)}
                            </ul>
                          </details>
                        )}
                      </div>
                    ))}
                  </section>
                )}

                <section className="flex flex-col gap-2" aria-label={t('ag.installed', { n: installed?.length ?? 0 })}>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('ag.installed', { n: installed?.length ?? 0 })}</h3>
                  {installed && installed.length === 0 && <p className="text-xs text-muted-foreground">{t('ag.noneInstalled')}</p>}
                  {(installed ?? []).map((a) => <InstalledAgent key={a.id} agent={a} focus={a.id === fresh} onChanged={refreshInstalled} />)}
                </section>

                <section className="flex flex-col gap-2" aria-label={t('ag.sets.title')}>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('ag.sets.title')}</h3>
                  <p className="text-[11px] text-muted-foreground">{t('ag.sets.lead')}</p>
                  {sets.length === 0 && <p className="text-xs text-muted-foreground">{t('ag.sets.none')}</p>}
                  {sets.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold">{s.name}</span>
                        <span className="block text-[10px] text-muted-foreground">{t('ag.sets.count', { n: s.items.length })}{(usage.get(s.id) ?? 0) > 0 ? ` · ${t('ag.sets.users', { n: usage.get(s.id) ?? 0 })}` : ''}</span>
                      </span>
                      <Button variant={defaultSet === s.id ? 'secondary' : 'ghost'} size="sm" className="shrink-0 max-md:h-10" title={t('ag.sets.defaultTip')} onClick={() => void makeDefault(s)}>
                        <Star className="size-3.5" weight={defaultSet === s.id ? 'fill' : 'regular'} aria-hidden="true" />{defaultSet === s.id ? t('ag.sets.default') : t('ag.sets.makeDefault')}
                      </Button>
                      <button type="button" aria-label={t('ag.sets.delete')} title={t('ag.sets.delete')} onClick={() => void dropSet(s)}
                        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground max-md:size-10">
                        <Trash className="size-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                  <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); void saveSet() }}>
                    <Input value={setName} onChange={(e) => setSetName(e.target.value)} placeholder={t('ag.sets.name')} maxLength={80} className="max-md:h-10" aria-label={t('ag.sets.name')} />
                    <Button type="submit" variant="outline" className="max-md:h-10" disabled={busy || !setName.trim() || !list?.items.length}>{t('ag.sets.save')}</Button>
                  </form>
                </section>
              </>
            )}
          </div>
        )}
        {confirmDialog}
      </SheetContent>
    </Sheet>
  )
}
