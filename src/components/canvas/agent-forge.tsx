import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowClockwise, ArrowCounterClockwise, CaretDown, CaretLeft, Check, DotsThreeVertical, FloppyDisk, PencilSimple, Play, Plus, Robot, Trash, UploadSimple, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { AGENT_BOARD, AGENT_CARDS } from '@/canvas-kit/boards/agent'
import { commit, fromFile, historyOf, redo, removeNode, undo } from '@/canvas-kit/graph'
import type { Graph, History } from '@/canvas-kit/graph'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useConfirm } from '@/components/ui/confirm'
import { InstalledAgent } from '@/components/chat/agents-panel'
import { useT } from '@/hooks/use-t'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  copyAgentToDraft, deleteAgentDraft, installAgentDraft, listAgentDrafts, listInstalledAgents, readAgentDraft, saveAgentDraft,
  type AgentDraft, type AgentInfo,
} from '@/lib/agents'
import { blankAgent, check, CARD_ORDER, copyOf, exportOf, fileOf, issuesByNode, lostWhen, newCard, prune, renameField, roomy, setCard } from '@/lib/forge'
import { downloadJson } from '@/lib/interop'
import { AGENT_RECIPES } from '@/lib/forge-recipes'
import type { MsgKey } from '@/lib/i18n'
import { installMessage } from '@/lib/agent-install'
import { cn } from '@/lib/utils'
import { AgentForm } from './forge/agent-form'
import { AgentBoard } from './forge/agent-board'
import { CardForm, type StateFields } from './forge/card-form'
import { Abilities, Palette, PlacesGuide } from './forge/palette'
import { TryPanel, useDry } from './forge/try-panel'

type Agent = Record<string, any>
interface Current { name: string; title: string; agent: Agent }

const errText = (e: unknown) => String((e as Error)?.message ?? e)
const slugOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36)

/** The editor for agents (the "Agents" board of the Canvas): open a draft or a copy of an installed agent, change its cards, see what the check says, save. */
export function AgentForge() {
  const t = useT()
  const isMobile = useIsMobile()
  const [confirm, confirmDialog] = useConfirm()
  const [drafts, setDrafts] = useState<AgentDraft[]>([])
  const [addOpen, setAddOpen] = useState(false)
  // undefined = not read yet, null = the app has no agents plugin
  const [installed, setInstalled] = useState<AgentInfo[] | null | undefined>(undefined)
  const [cur, setCur] = useState<Current | null>(null)
  const [hist, setHist] = useState<History>(() => historyOf({ nodes: [], edges: [] }))
  const [selected, setSelected] = useState<string | null>(null)
  const [tab, setTab] = useState<'card' | 'agent' | 'try'>('agent')
  const [sheet, setSheet] = useState(false)
  const [fit, setFit] = useState(0)
  // the side list of cards: shown by itself on a wide window, and the person can open or close it
  const [pal, setPal] = useState<boolean | null>(null)
  const [saving, setSaving] = useState<'saved' | 'saving' | 'failed'>('saved')
  const [busy, setBusy] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const graph = hist.present
  const palOpen = !isMobile && (pal ?? (typeof window !== 'undefined' && window.innerWidth >= 1500))
  const changed = useRef(false)

  const refresh = useCallback(async () => {
    try { setDrafts(await listAgentDrafts()) } catch { setDrafts([]) }
    try { setInstalled(await listInstalledAgents()) } catch { setInstalled(null) }
  }, [])
  useEffect(() => { void refresh() }, [refresh])

  const file = useMemo(() => (cur ? fileOf(cur.title, cur.agent, graph) : null), [cur, graph])
  const report = useMemo(() => (file ? check(file) : null), [file])
  const issues = useMemo(() => (report ? issuesByNode(report) : new Map<string, { errors: number; warnings: number }>()), [report])
  const fields = useMemo<StateFields>(() => (cur?.agent.state ?? {}) as StateFields, [cur])
  const installedCopy = installed?.find((a) => a.id === cur?.agent.id)
  const errorCount = report?.errors.length ?? 0
  const dry = useDry(file, cur?.name ?? '', tab === 'try' && errorCount === 0)

  // saved a moment after the last change; a draft is not installed, so a half-done one does no harm
  useEffect(() => {
    if (!cur || !file || !changed.current) return
    setSaving('saving')
    const id = setTimeout(() => {
      saveAgentDraft(cur.name, file).then(() => { setSaving('saved'); changed.current = false; void listAgentDrafts().then(setDrafts).catch(() => {}) }).catch(() => setSaving('failed'))
    }, 1200)
    return () => clearTimeout(id)
  }, [cur, file])

  const edit = (next: Graph) => {
    changed.current = true
    // a card that waited for a signal and no longer has one would run on every reply, and the check cannot tell
    for (const name of lostWhen(graph, next)) toast.warning(t('fg.lostWhen', { name }))
    setHist((h) => commit(h, next))
  }
  const editAgent = (agent: Agent) => { changed.current = true; setCur((c) => (c ? { ...c, agent } : c)) }
  const renameStateField = (from: string, to: string) => {
    if (!cur) return
    const r = renameField(cur.agent, graph, from, to)
    changed.current = true
    setCur({ ...cur, agent: r.agent })
    if (r.graph.nodes.some((n, i) => n !== graph.nodes[i])) setHist((h) => commit(h, r.graph))
  }
  const editTitle = (title: string) => { changed.current = true; setCur((c) => (c ? { ...c, title } : c)) }

  const load = (name: string, f: Record<string, unknown>) => {
    const parsed = fromFile(f)
    if ('error' in parsed) { toast.error(t('fg.open.bad', { why: parsed.error })); return false }
    changed.current = false
    setCur({ name, title: parsed.file.title, agent: { ...(parsed.file.agent ?? {}) } })
    setHist(historyOf(parsed.file.nodes ? roomy({ nodes: parsed.file.nodes, edges: parsed.file.edges }) : { nodes: [], edges: [] }))
    setSelected(null)
    setTab('agent')
    setSaving('saved')
    setFit((n) => n + 1)
    setTimeout(() => setFit((n) => n + 1), 300) // once more when the inspector has taken its width
    return true
  }

  const leave = async (): Promise<boolean> => {
    if (changed.current && saving !== 'saved') {
      // not saved yet: write it now rather than ask
      if (cur && file) { try { await saveAgentDraft(cur.name, file); changed.current = false } catch { return confirm({ title: t('fg.leave.title'), description: t('fg.leave.body'), actionLabel: t('fg.leave.go') }) } }
    }
    return true
  }

  const openDraft = async (name: string) => {
    if (!(await leave())) return
    try {
      const r = await readAgentDraft(name)
      if (!r.file) { toast.error(t('fg.open.notJson')); return }
      load(name, r.file)
    } catch (e) { toast.error(t('fg.open.failed', { why: errText(e) })) }
  }
  const openInstalled = async (id: string) => {
    if (!(await leave())) return
    try { const name = await copyAgentToDraft(id); await refresh(); await openDraft(name) } catch (e) { toast.error(t('fg.open.failed', { why: errText(e) })) }
  }
  const create = async (recipe: number | null) => {
    if (!(await leave())) return
    const taken = new Set([...drafts.map((d) => d.name), ...drafts.map((d) => d.id), ...(installed ?? []).map((a) => a.id)])
    const base = recipe === null ? 'new-agent' : String(AGENT_RECIPES[recipe].agent?.id ?? 'agent')
    let id = base
    for (let i = 2; taken.has(id); i++) id = `${base}-${i}`
    // a blank agent gets a name no draft or installed agent has, so a list of them stays readable
    const names = new Set([...drafts.map((d) => d.title), ...(installed ?? []).map((a) => a.name)])
    let title = t('fg.new.name')
    for (let i = 2; names.has(title); i++) title = `${t('fg.new.name')} ${i}`
    const f = recipe === null ? blankAgent(id, title) : { ...JSON.parse(JSON.stringify(AGENT_RECIPES[recipe])), agent: { ...(AGENT_RECIPES[recipe].agent ?? {}), id } }
    try {
      await saveAgentDraft(id, f)
      await refresh()
      load(id, f)
    } catch (e) { toast.error(t('fg.open.failed', { why: errText(e) })) }
  }
  const dropDraft = async (d: AgentDraft) => {
    if (!(await confirm({ title: t('ag.drafts.deleteTitle', { name: d.title }), description: t('ag.drafts.deleteBody'), actionLabel: t('ag.drafts.delete') }))) return
    try {
      await deleteAgentDraft(d.name)
      if (cur?.name === d.name) { setCur(null); changed.current = false }
      await refresh()
    } catch (e) { toast.error(t('ag.saveFailed', { why: errText(e) })) }
  }

  const install = async () => {
    if (!cur || !file) return
    setBusy(true)
    try {
      await saveAgentDraft(cur.name, file)
      changed.current = false
      setSaving('saved')
      const r = await installAgentDraft(cur.name)
      await refresh()
      setTab('agent')
      toast.success(installMessage(t, cur.title, r))
    } catch (e) { toast.error(t('ag.install.failed', { why: errText(e) })) } finally { setBusy(false) }
  }

  const exportFile = () => {
    if (!file) return
    const r = exportOf(file)
    if ('error' in r) { toast.error(t('fg.export.blocked', { why: r.error })); return }
    downloadJson(r.file, r.name)
    toast.success(t('fg.export.done', { file: r.name }))
  }
  const saveCopy = async () => {
    if (!cur || !file) return
    const taken = [...drafts.map((d) => d.name), ...drafts.map((d) => d.id), ...(installed ?? []).map((a) => a.id)]
    const c = copyOf(file, taken, t('fg.copy.name', { name: cur.title }))
    try {
      await saveAgentDraft(cur.name, file)
      await saveAgentDraft(c.id, c.file)
      changed.current = false
      await refresh()
      load(c.id, c.file as unknown as Record<string, unknown>)
      toast.success(t('fg.copy.done', { name: c.file.title }))
    } catch (e) { toast.error(t('fg.open.failed', { why: errText(e) })) }
  }

  const addCard = (type: string) => {
    const n = graph.nodes.length
    const card = newCard(graph, type, { x: 10 + (n % 5) * 250, y: 280 + Math.floor(n / 5) * 150 })
    edit({ nodes: [...graph.nodes, card], edges: graph.edges })
    setAddOpen(false)
    setSelected(card.id)
    setTab('card')
    if (isMobile) setSheet(true)
    setFit((x) => x + 1)
  }
  const patchCard = (id: string, patch: { params?: Record<string, unknown>; title?: string }) => edit(setCard(graph, id, patch))
  const noteOf = (id: string, text: string) => edit({ nodes: graph.nodes.map((n) => (n.id === id ? { ...n, note: text } : n)), edges: graph.edges })
  const dropCard = (id: string) => { edit(removeNode(graph, id)); setSelected(null); setSheet(false) }
  const pick = (id: string | null) => { setSelected(id); if (id) { setTab('card'); if (isMobile) setSheet(true) } }

  const reasonText = useCallback((core: string) => {
    if (core.includes('loop')) return t('canvas.why.loop')
    if (core.includes('itself')) return t('canvas.why.self')
    if (core.includes('output to an input')) return t('canvas.why.direction')
    if (core.includes('do not fit')) return t('canvas.why.type')
    if (core.includes('Already connected')) return t('canvas.why.dup')
    return t('canvas.why.unknown')
  }, [t])

  const node = graph.nodes.find((n) => n.id === selected) ?? null
  const inspector = cur && (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" className="flex shrink-0 gap-1 border-b border-border p-1.5">
        {(['card', 'agent', 'try'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cn('flex-1 rounded-md px-2 py-1.5 text-xs font-semibold max-md:min-h-10', tab === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent')}>
            {k === 'card' ? t('fg.tab.card') : k === 'agent' ? t('fg.tab.agent') : t('fg.tab.try')}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'card' ? (
          node ? (
            <CardForm
              key={node.id}
              node={node}
              graph={graph}
              fields={fields}
              // an input with no wire is shown by its own box under Wires (red), so its message is not said twice
              problems={report?.errors.filter((e) => e.node === node.id && e.code !== 'E_UNWIRED').map((e) => e.message) ?? []}
              onParams={(params) => patchCard(node.id, { params })}
              onTitle={(title) => patchCard(node.id, { title })}
              onNote={(text) => noteOf(node.id, text)}
              onGraph={edit}
              onDelete={() => dropCard(node.id)}
              deletable={(AGENT_BOARD.types[node.type]?.deletable ?? true) && node.type !== 'agent.input'}
            />
          ) : <p className="text-xs text-muted-foreground">{t('fg.card.none')}</p>
        ) : tab === 'try' ? (
          file && <TryPanel file={file as never} errors={errorCount} dry={dry} calls={report?.maxCalls ?? 0} titleOf={(id) => graph.nodes.find((n) => n.id === id)?.title ?? id} />
        ) : (
          <div className="flex flex-col gap-4">
            {report && <Abilities needs={report.needs} calls={report.maxCalls} />}
            <PlacesGuide />
            <AgentForm agent={cur.agent} title={cur.title} onAgent={editAgent} onTitle={editTitle} onRename={renameStateField} installed={!!installedCopy} />
            {installedCopy && (
              <section className="flex flex-col gap-2 border-t border-border pt-3" aria-label={t('fg.installedCopy')}>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('fg.installedCopy')}</h4>
                <InstalledAgent agent={installedCopy} focus={false} onChanged={refresh} />
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )

  const list = (
    <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-3" data-testid="forge-list">
      <Popover>
        <PopoverTrigger className="flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 max-md:h-11" data-testid="forge-new">
          <Plus className="size-4" aria-hidden="true" />{t('fg.new')}<CaretDown className="size-3" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-1.5">
          <button type="button" className="flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left hover:bg-accent max-md:min-h-11" onClick={() => void create(null)} data-testid="forge-new-empty">
            <span className="text-sm font-medium">{t('fg.new.empty')}</span>
            <span className="text-[11px] text-muted-foreground">{t('fg.new.emptyHint')}</span>
          </button>
          <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('fg.new.recipes')}</p>
          {AGENT_RECIPES.map((r, i) => (
            <button key={String(r.agent?.id)} type="button" className="flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left hover:bg-accent max-md:min-h-11" onClick={() => void create(i)}>
              <span className="text-sm font-medium">{String(r.agent?.name ?? r.title)}</span>
              <span className="text-[11px] leading-snug text-muted-foreground">{String(r.agent?.description ?? '')}</span>
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {installed === null && <p className="text-xs text-muted-foreground">{t('ag.noPlugin')}</p>}

      <section className="flex flex-col gap-1.5" aria-label={t('fg.drafts')}>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('fg.drafts')}</h3>
        {drafts.length === 0 && <p className="text-xs text-muted-foreground">{t('fg.drafts.none')}</p>}
        {drafts.map((d) => (
          <div key={d.name} className={cn('flex items-center gap-1 rounded-md border pr-1', cur?.name === d.name ? 'border-primary bg-primary/5' : 'border-border')}>
            <button type="button" className="flex min-w-0 flex-1 flex-col gap-0.5 px-2.5 py-2 text-left max-md:min-h-11" onClick={() => void openDraft(d.name)} data-testid={`forge-open-${d.name}`}>
              <span className="truncate text-sm font-medium">{d.title}</span>
              <span className={cn('flex items-center gap-1 text-[11px]', d.errors.length ? 'text-destructive' : 'text-muted-foreground')}>
                {d.errors.length ? <Warning className="size-3" aria-hidden="true" /> : <Check className="size-3 text-emerald-500" aria-hidden="true" />}
                {d.errors.length ? t('ag.drafts.problems', { n: d.errors.length }) : d.installed ? t('ag.drafts.installed') : t('ag.drafts.ok')}
              </span>
            </button>
            <button type="button" aria-label={t('ag.drafts.delete')} title={t('ag.drafts.delete')} onClick={() => void dropDraft(d)}
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground max-md:size-10">
              <Trash className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        ))}
      </section>

      {installed && installed.some((a) => !drafts.some((d) => d.name === a.id)) && (
        <section className="flex flex-col gap-1.5" aria-label={t('fg.installed')}>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('fg.installed')}</h3>
          <p className="text-[11px] leading-snug text-muted-foreground">{t('fg.installed.hint')}</p>
          {installed.filter((a) => !drafts.some((d) => d.name === a.id)).map((a) => (
            <button key={a.id} type="button" className="flex min-h-9 items-center gap-2 rounded-md border border-border px-2.5 py-2 text-left hover:bg-accent max-md:min-h-11" onClick={() => void openInstalled(a.id)}>
              <PencilSimple className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{t('fg.editCopy')}</span>
            </button>
          ))}
        </section>
      )}
    </div>
  )

  const problems = report ? report.errors.length : 0
  const toolbar = cur && report && (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-1 max-md:basis-full">
        <Button variant="ghost" size="sm" className="shrink-0 max-md:h-10" data-testid="forge-back" onClick={() => void leave().then((ok) => { if (ok) setCur(null) })}>
          <CaretLeft className="size-4" aria-hidden="true" />{t('fg.back')}
        </Button>
        {isMobile ? (
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{cur.title}</span>
        ) : (
          <>
            <select
              value={cur.name}
              onChange={(e) => void openDraft(e.target.value)}
              aria-label={t('fg.switch')}
              data-testid="forge-pick"
              className="h-8 w-44 min-w-0 shrink truncate rounded-md border border-border bg-background px-2 text-sm font-semibold"
            >
              {!drafts.some((d) => d.name === cur.name) && <option value={cur.name}>{cur.title}</option>}
              {drafts.map((d) => <option key={d.name} value={d.name}>{d.name === cur.name ? cur.title : d.title}</option>)}
            </select>
          </>
        )}
      </div>
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground" role="status" title={t('fg.saved')}>
        {saving === 'saving' ? t('fg.saving') : saving === 'failed' ? <span className="text-destructive">{t('fg.saveFailed')}</span> : <><FloppyDisk className="size-3.5" aria-hidden="true" /><span className="sr-only">{t('fg.saved')}</span></>}
      </span>
      <Button variant="ghost" size="icon" className="max-md:size-10" onClick={() => setHist((h) => undo(h))} disabled={!hist.past.length} title={t('canvas.undo')} aria-label={t('canvas.undo')}><ArrowCounterClockwise className="size-4" /></Button>
      <Button variant="ghost" size="icon" className="max-md:size-10" onClick={() => setHist((h) => redo(h))} disabled={!hist.future.length} title={t('canvas.redo')} aria-label={t('canvas.redo')}><ArrowClockwise className="size-4" /></Button>
      {!isMobile && (
        <Button variant={palOpen ? 'secondary' : 'ghost'} size="sm" aria-pressed={palOpen} onClick={() => { setPal(!palOpen); setTimeout(() => setFit((n) => n + 1), 50) }} data-testid="forge-blocks">{t('fg.pal.title')}</Button>
      )}
      {!palOpen && <Popover open={addOpen} onOpenChange={setAddOpen}>
        <PopoverTrigger className="flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-accent max-md:h-10" data-testid="forge-add-card">
          <Plus className="size-4" aria-hidden="true" />{t('fg.addCard')}
        </PopoverTrigger>
        <PopoverContent align="end" className="max-h-[70dvh] w-72 overflow-y-auto p-1.5">
          {CARD_ORDER.map((type) => (
            <button key={type} type="button" className="flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left hover:bg-accent max-md:min-h-11" onClick={() => addCard(type)}>
              <span className="text-sm font-medium">{AGENT_CARDS[type]?.label ?? type}</span>
              <span className="text-[11px] leading-snug text-muted-foreground">{t(`fg.hint.${type}` as MsgKey)}</span>
            </button>
          ))}
        </PopoverContent>
      </Popover>}
      <Popover open={moreOpen} onOpenChange={setMoreOpen}>
        <PopoverTrigger className="flex size-9 items-center justify-center rounded-md border border-border hover:bg-accent max-md:size-10" aria-label={t('fg.more')} title={t('fg.more')} data-testid="forge-more">
          <DotsThreeVertical className="size-4" weight="bold" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-1.5">
          <button type="button" className="flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left hover:bg-accent max-md:min-h-11" onClick={() => { setMoreOpen(false); exportFile() }} data-testid="forge-export">
            <span className="text-sm font-medium">{t('fg.export')}</span>
            <span className="text-[11px] leading-snug text-muted-foreground">{t('fg.export.hint')}</span>
          </button>
          <button type="button" className="flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left hover:bg-accent max-md:min-h-11" onClick={() => { setMoreOpen(false); void saveCopy() }} data-testid="forge-copy">
            <span className="text-sm font-medium">{t('fg.copy')}</span>
            <span className="text-[11px] leading-snug text-muted-foreground">{t('fg.copy.hint')}</span>
          </button>
        </PopoverContent>
      </Popover>
      <Button size="sm" className="max-md:h-10" disabled={busy || problems > 0} onClick={() => void install()} data-testid="forge-install">
        <UploadSimple className="size-4" aria-hidden="true" />{installedCopy ? t('ag.drafts.update') : t('ag.drafts.install')}
      </Button>
      {problems > 0 && <span className="basis-full text-[11px] text-destructive">{t('fg.installBlocked', { n: problems })}</span>}
    </div>
  )

  const checkPanel = cur && report && (
    <details className="border-t border-border bg-card text-xs" open={problems > 0} data-testid="forge-check">
      <summary className={cn('flex cursor-pointer select-none items-center gap-1.5 px-3 py-2 font-medium max-md:min-h-11', problems ? 'text-destructive' : 'text-muted-foreground')}>
        {problems ? <Warning className="size-3.5" aria-hidden="true" /> : <Check className="size-3.5 text-emerald-500" aria-hidden="true" />}
        {problems ? t('fg.check.problems', { n: problems }) : t('fg.check.ok')}
        {report.warnings.length > 0 && <span className="text-amber-600 dark:text-amber-400">· {t('fg.check.warnings', { n: report.warnings.length })}</span>}
        <span className="ml-auto flex items-center gap-2 text-muted-foreground" data-testid="forge-chips">
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px]">{t('fg.trigger.after')}{(cur.agent.trigger?.everyN ?? 1) > 1 ? ` · ${t('fg.chip.every', { n: cur.agent.trigger.everyN })}` : ''}</span>
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px]">{t('fg.check.calls', { n: report.maxCalls })}</span>
        </span>
      </summary>
      <ul className="flex max-h-40 flex-col gap-0.5 overflow-y-auto px-3 pb-2">
        {[...report.errors.map((x) => ({ ...x, bad: true })), ...report.warnings.map((x) => ({ ...x, bad: false }))].map((x, i) => (
          <li key={i}>
            <button type="button" disabled={!x.node} onClick={() => x.node && pick(x.node)} className={cn('w-full rounded px-1 py-1 text-left hover:bg-accent disabled:hover:bg-transparent max-md:min-h-10', x.bad ? 'text-destructive' : 'text-amber-600 dark:text-amber-400')}>
              <span className="mr-1 font-mono text-[10px]">{x.code}</span>{x.message}
            </button>
          </li>
        ))}
      </ul>
    </details>
  )

  if (installed === undefined) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('fg.loading')}</div>

  // a phone: the list, or one agent as a list of cards with the same forms in a sheet; the graph is for looking
  if (isMobile) {
    return (
      <div className="flex h-full min-h-0 flex-col" data-testid="agent-forge">
        {!cur ? list : (
          <>
            {toolbar}
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="mb-3 flex gap-2">
                <button type="button" className="flex min-h-11 flex-1 items-center gap-2 rounded-md border border-border px-3 text-left text-sm font-medium" onClick={() => { setTab('agent'); setSelected(null); setSheet(true) }}>
                  <Robot className="size-4" aria-hidden="true" />{t('fg.tab.agent')}
                </button>
                <button type="button" className="flex min-h-11 flex-1 items-center gap-2 rounded-md border border-border px-3 text-left text-sm font-medium" onClick={() => { setTab('try'); setSelected(null); setSheet(true) }} data-testid="forge-try-open">
                  <Play className="size-4" aria-hidden="true" />{t('fg.tab.try')}
                </button>
              </div>
              <ul className="flex flex-col gap-1.5" aria-label={t('fg.cards')}>
                {[...graph.nodes].sort((a, b) => a.x - b.x || a.y - b.y).map((n) => {
                  const i = issues.get(n.id)
                  return (
                    <li key={n.id}>
                      <button type="button" onClick={() => pick(n.id)} className={cn('flex min-h-12 w-full items-center gap-2 rounded-md border px-3 py-2 text-left', i?.errors ? 'border-destructive/50' : 'border-border')} data-testid={`forge-card-${n.id}`}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{n.title}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">{AGENT_CARDS[n.type]?.label ?? n.type}</span>
                        </span>
                        {i?.errors ? <span className="shrink-0 text-[11px] text-destructive">{t('fg.badge.errors', { n: i.errors })}</span> : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
            {checkPanel}
            <Sheet open={sheet} onOpenChange={setSheet}>
              <SheetContent side="bottom" className="flex max-h-[88dvh] flex-col p-0">
                <SheetHeader className="p-3 pb-0"><SheetTitle>{tab === 'card' ? node?.title ?? t('fg.tab.card') : tab === 'try' ? t('fg.tab.try') : t('fg.tab.agent')}</SheetTitle></SheetHeader>
                {inspector}
              </SheetContent>
            </Sheet>
          </>
        )}
        {confirmDialog}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0" data-testid="agent-forge">
      {!cur && <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-card">{list}</aside>}
      {cur && palOpen && <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card">{<Palette onAdd={addCard} />}</aside>}
      <div className="flex min-w-0 flex-1 flex-col">
        {!cur ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <Robot className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-semibold">{t('fg.empty.title')}</p>
            <p className="max-w-sm text-xs text-muted-foreground">{t('fg.empty.body')}</p>
          </div>
        ) : (
          <>
            {toolbar}
            <div className="relative min-h-0 flex-1">
              <AgentBoard
                graph={graph}
                editable
                onChange={(next) => edit(prune(next))}
                onRemoveNode={dropCard}
                reasonText={reasonText}
                selectedId={selected}
                onSelect={pick}
                issues={issues}
                probe={tab === 'try' ? dry.result : null}
                fitSignal={fit}
              />
            </div>
            {checkPanel}
          </>
        )}
      </div>
      {cur && <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-card">{inspector}</aside>}
      {confirmDialog}
    </div>
  )
}
