import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { FilmSlate } from '@phosphor-icons/react'
import { directionModel } from '@/lib/direction'
import { useModelEntry } from '@/components/chat/model-palette'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PresetChoices, usePresetCosts, type PresetValues } from '@/components/chat/preset-choices'
import { AgentOffer, useStarterOffer } from '@/components/chat/agent-offer'
import { chatAgentsWith, markOfferShown } from '@/lib/agent-offer'
import { installPicked } from '@/lib/agent-offer-install'
import { toast } from 'sonner'
import { listAgentSets, loadDefaultAgentSet, useAgentsLive, type AgentSet } from '@/lib/agents'
import { lastSetFor } from '@/lib/agent-usage'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import { formatTokens } from '@/lib/tokens'
import { listSavedWorlds, listWorldChats, type SavedWorld, type WorldChat } from '@/lib/world'
import type { ChatTurns, ID, PresetMemory } from '@/lib/types'

/**
 * The short step before a chat starts: pick the preset and its options for this chat. It opens with the
 * preset and picks of this character's last chat where they were chosen (per-character memory), else the
 * user's default preset with its defaults. Nothing is created until "Start".
 */
export function NewChatStep() {
  const step = useApp((s) => s.newChatStep)
  if (!step) return null
  // keyed by the request, so a second step starts from a clean state
  return <StepDialog key={`${step.charId}:${step.greetingIndex ?? 0}`} charId={step.charId} greetingIndex={step.greetingIndex} />
}

function StepDialog({ charId, greetingIndex }: { charId: ID; greetingIndex?: number }) {
  const t = useT()
  const character = useApp((s) => s.characters.find((c) => c.id === charId))
  const presets = useApp((s) => s.presets)
  const fetchPresetMemory = useApp((s) => s.fetchPresetMemory)
  const startChatWith = useApp((s) => s.startChatWith)
  const closeNewChatStep = useApp((s) => s.closeNewChatStep)
  const updateSettings = useApp((s) => s.updateSettings)
  const loadPresetDefaults = useApp((s) => s.loadPresetDefaults)
  const presetDefaults = useApp((s) => s.presetDefaults)
  const defaultId = (presets.find((p) => p.isDefault) ?? presets[0])?.id ?? ''
  const [memory, setMemory] = useState<PresetMemory | null>(null)
  const [ready, setReady] = useState(false)
  const [presetId, setPresetId] = useState<ID>(defaultId)
  const [values, setValues] = useState<PresetValues>({})
  const [dontAsk, setDontAsk] = useState(false)
  // the earlier chat this one picks up (#262): 'none' = a new beginning
  const [contPick, setContPick] = useState<ID | 'none'>('none')
  // the options can be clicked before the memory arrives: a late answer must not undo those clicks
  const touched = useRef(false)
  // a group chat: how its members answer, the group's default unless changed here
  const groupMode = character?.group?.generationMode ?? 'swap'
  const [genMode, setGenMode] = useState<NonNullable<ChatTurns['generationMode']>>(groupMode)

  // Direction for a group's chat: on when the group's default is on and a director model is picked (#496)
  const [dirModel, setDirModel] = useState<string | null>(null)
  const [dirOn, setDirOn] = useState(character?.group?.direction !== false)
  useEffect(() => {
    if (!character?.isGroup) return
    let live = true
    void directionModel().then((m) => { if (live) setDirModel(m) })
    return () => { live = false }
  }, [character?.isGroup])
  const dirEntry = useModelEntry(dirModel)
  const dirReady = dirModel !== null && dirModel !== ''

  // a world to start in: a saved one, or a chat of this character that has one (only when the app has the World plugin)
  const [worlds, setWorlds] = useState<SavedWorld[] | null>(null)
  const [worldChats, setWorldChats] = useState<WorldChat[]>([])
  const [worldPick, setWorldPick] = useState('none')
  useEffect(() => {
    let live = true
    listSavedWorlds().then((w) => { if (live) setWorlds(w) }).catch(() => {})
    listWorldChats().then((c) => { if (live) setWorldChats((c ?? []).filter((x) => (x.characterId === charId || x.groupId === charId) && x.records > 0)) }).catch(() => {})
    return () => { live = false }
  }, [charId])
  // the agent set: 'default' sends nothing (the chat follows the user's default set), 'none' starts with no agents
  const [sets, setSets] = useState<AgentSet[]>([])
  const [defaultSet, setDefaultSet] = useState<string | null>(null)
  const [setPick, setSetPick] = useState('default')
  // the set this character's last chat used: the select opens on it (unless the person already picked), and says so
  const [lastFrom, setLastFrom] = useState<string | null>(null)
  const setTouched = useRef(false)
  // the ready agents the player switched on in the offer (nothing is on until they do), and the install that Start runs for them
  const offer = useStarterOffer(!!character?.isGroup)
  const [picked, setPicked] = useState<string[]>([])
  // once the offer has been on screen it is not a reason to open the step again
  useEffect(() => { if (offer.state === 'ready') markOfferShown() }, [offer.state])
  const [starting, setStarting] = useState(false)
  const storeChats = useApp((s) => s.chats)
  const personas = useApp((s) => s.personas)
  // this character's earlier chats, newest first: what the new one may continue
  const earlier = storeChats.filter((c) => c.characterId === charId && !c.temporary).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 40)
  const from = contPick === 'none' ? undefined : storeChats.find((c) => c.id === contPick)
  useEffect(() => {
    let live = true
    // silent when the app has no agents plugin
    Promise.all([listAgentSets(), loadDefaultAgentSet()]).then(([all, d]) => {
      if (!live) return
      setSets(all)
      setDefaultSet(d)
      if (setTouched.current) return
      const last = lastSetFor(storeChats, useAgentsLive.getState().chats, charId, d, new Set(all.map((x) => x.id)))
      setSetPick(last.pick)
      setLastFrom(last.from)
    }).catch(() => {})
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const defaultSetName = sets.find((x) => x.id === defaultSet)?.name
  const defaultLabel = defaultSetName ? t('ag.new.default', { name: defaultSetName }) : t('ag.new.defaultNone')

  const showWorld = (worlds?.length ?? 0) + worldChats.length > 0

  // the character's memory (single characters only)
  useEffect(() => {
    let live = true
    const done = (m: PresetMemory | null, mine: Record<ID, PresetValues>) => {
      if (!live) return
      setMemory(m)
      if (!touched.current) {
        // the character's last choices first, else the user's own default for the preset
        if (m?.presetId && presets.some((p) => p.id === m.presetId)) {
          setPresetId(m.presetId)
          setValues(m.vars ?? {})
        } else {
          setValues(mine[defaultId] ?? {})
        }
      }
      setReady(true)
    }
    void Promise.all([character?.isGroup ? null : fetchPresetMemory(charId), loadPresetDefaults()]).then(([m, mine]) => done(m, mine))
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charId])

  const preset = presets.find((p) => p.id === presetId) ?? presets.find((p) => p.id === defaultId)

  const costs = usePresetCosts(`${preset?.id ?? ''}|${JSON.stringify(preset?.variables ?? [])}`, preset?.id, { vars: values }, JSON.stringify(values), ready)

  const start = async () => {
    if (!preset || !ready || starting) return
    // the ready agents come first: if one cannot be installed the chat is not started and nothing is bound half way
    let withOffer: { agents: { own: ReturnType<typeof chatAgentsWith> } } | null = null
    if (picked.length > 0 && offer.state === 'ready') {
      setStarting(true)
      const failed = await installPicked(offer.files, offer.previews, picked)
      setStarting(false)
      if (failed.length > 0) {
        for (const f of failed) toast.error(t('ag.offer.failed', { name: offer.previews.get(f.id)?.name ?? f.id, why: f.why }))
        return
      }
      const baseId = setPick === 'default' ? defaultSet : setPick === 'none' ? null : setPick
      withOffer = { agents: { own: chatAgentsWith(sets.find((x) => x.id === baseId)?.items ?? [], picked) } }
    }
    if (dontAsk) updateSettings({ askPresetOnNewChat: false })
    closeNewChatStep()
    void startChatWith(charId, greetingIndex, {
      presetId: preset.id, presetVars: values,
      ...(withOffer ?? (setPick === 'none' ? { agents: { own: [] as [] } } : setPick !== 'default' ? { agents: { preset: setPick } } : {})),
      ...(character?.isGroup && genMode !== groupMode ? { turns: { generationMode: genMode } } : {}),
      ...(character?.isGroup ? { direction: dirOn && dirReady } : {}),
      ...(from ? { continues: from.id, ...(from.personaId && personas.some((p) => p.id === from.personaId) ? { personaId: from.personaId } : {}), ...(from.model ? { model: from.model } : {}) } : {}),
      ...(worldPick.startsWith('w:') ? { world: { worldId: worldPick.slice(2) } } : worldPick.startsWith('c:') ? { world: { fromChatId: worldPick.slice(2) } } : {}),
    })
  }

  const pickPreset = (id: ID) => {
    touched.current = true
    setPresetId(id)
    setValues(memory?.presetId === id ? memory.vars ?? {} : presetDefaults?.[id] ?? {})
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) closeNewChatStep() }}>
      <DialogContent
        className="flex max-h-[88dvh] flex-col gap-3 sm:max-w-lg"
        data-testid="new-chat-step"
        onKeyDown={(e) => {
          const el = e.target as HTMLElement
          if (e.key === 'Enter' && !e.shiftKey && !el.closest('input, textarea, button, [role="combobox"], [role="radio"], [role="checkbox"], [role="switch"]')) {
            e.preventDefault()
            void start()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('pc.step.title', { name: character?.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('pc.step.desc')}</DialogDescription>
        </DialogHeader>
        {earlier.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" id="new-chat-continues">{t('pc.step.continues')}</span>
            <Select value={contPick} onValueChange={(v) => v && setContPick(v)}>
              <SelectTrigger className="h-8 w-full text-xs" aria-labelledby="new-chat-continues" data-testid="new-chat-continues">
                <SelectValue>
                  {(v: string) => (v === 'none' ? t('canvas.continuesNone') : (() => { const c = storeChats.find((x) => x.id === v); return c ? `${c.title || t('mem.untitled')} · ${new Date(c.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : v })())}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('canvas.continuesNone')}</SelectItem>
                {earlier.map((c) => <SelectItem key={c.id} value={c.id}>{(c.title || t('mem.untitled')) + ' · ' + new Date(c.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">{from ? t('pc.step.continuesHint') : t('pc.step.continuesOff')}</p>
          </div>
        )}
        {/* the preset picker stays in view; only the options scroll */}
        {preset && (
          <div className="flex flex-col gap-1.5">
            <Select value={preset.id} onValueChange={(id) => id && pickPreset(id)}>
              <SelectTrigger className="h-8 w-full text-xs" aria-label={t('pc.title')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {presets.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {costs ? t('pc.total', { n: formatTokens(costs.total) }) : t('pc.totalCounting')}
            </p>
          </div>
        )}
        {sets.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <Select value={setPick} onValueChange={(v) => { if (v) { setTouched.current = true; setSetPick(v); setLastFrom(null) } }}>
              <SelectTrigger className="h-8 w-full text-xs" aria-label={t('ag.new.label')} data-testid="new-chat-agents">
                <SelectValue>
                  {(v: string) => t('ag.new.trigger', { what: v === 'default' ? defaultLabel : v === 'none' ? t('ag.new.none') : sets.find((x) => x.id === v)?.name ?? v })}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">{defaultLabel}</SelectItem>
                <SelectItem value="none">{t('ag.new.none')}</SelectItem>
                {sets.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground" data-testid="new-chat-agents-hint">{lastFrom && character ? `${t('ag.new.fromLast', { name: character.name })} ` : ''}{t('ag.new.hint')}</p>
          </div>
        )}
        {character?.isGroup && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" id="new-chat-turns">{t('turns.step')}</span>
            <Select value={genMode} onValueChange={(v) => v && setGenMode(v as typeof genMode)}>
              <SelectTrigger className="h-8 w-full text-xs" aria-labelledby="new-chat-turns" data-testid="new-chat-turns">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['narrator', 'swap', 'append'] as const).map((v) => (
                  <SelectItem key={v} value={v}>
                    {t(v === 'narrator' ? 'group.ed.generationModeNarrator' : v === 'swap' ? 'group.ed.generationModeSwap' : 'group.ed.generationModeAppend')}
                    {groupMode === v ? ` · ${t('turns.groupDefault')}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {character?.isGroup && (
          <div className="flex items-start justify-between gap-3" data-testid="new-chat-direction">
            <div className="min-w-0">
              <label htmlFor="new-chat-direction-switch" className="flex items-center gap-1.5 text-xs font-medium">
                <FilmSlate className="size-3.5" aria-hidden="true" />{t('dir.title')}
              </label>
              <p className="mt-0.5 text-[11px] text-muted-foreground" data-testid="new-chat-direction-hint">
                {dirModel === null ? '…' : dirReady ? t('dir.step.hint', { model: dirEntry.label ?? dirModel }) : t('dir.step.noModel')}
              </p>
            </div>
            <Switch id="new-chat-direction-switch" className="mt-0.5 shrink-0" checked={dirOn && dirReady} disabled={!dirReady} onCheckedChange={setDirOn} />
          </div>
        )}
        {showWorld && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" id="new-chat-world">{t('world.step.world')}</span>
            <Select value={worldPick} onValueChange={(v) => v && setWorldPick(v)}>
              <SelectTrigger className="h-8 w-full text-xs" aria-labelledby="new-chat-world" data-testid="new-chat-world">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('world.step.none')}</SelectItem>
                {(worlds?.length ?? 0) > 0 && (
                  <SelectGroup>
                    <SelectLabel>{t('world.step.saved')}</SelectLabel>
                    {(worlds ?? []).map((w) => <SelectItem key={w.id} value={`w:${w.id}`}>{w.name}</SelectItem>)}
                  </SelectGroup>
                )}
                {worldChats.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>{t('world.step.chats')}</SelectLabel>
                    {worldChats.map((c) => <SelectItem key={c.chatId} value={`c:${c.chatId}`}>{c.title || c.cards.join(', ')}</SelectItem>)}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
            {worldPick !== 'none' && <p className="text-[11px] text-muted-foreground">{t('world.step.hint')}</p>}
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-0.5">
          <AgentOffer offer={offer} picked={picked} onPicked={setPicked} />
          {preset && preset.variables.length > 0 && (
            <PresetChoices
              preset={preset}
              values={values}
              costs={costs}
              onChange={(name, value) => { touched.current = true; setValues((cur) => {
                const next = { ...cur }
                if (value === null) delete next[name]
                else next[name] = value
                return next
              }) }}
            />
          )}
        </div>
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <label className="flex items-start gap-2 text-xs">
            <Checkbox checked={dontAsk} onCheckedChange={(c) => setDontAsk(c === true)} className="mt-0.5" />
            <span className="flex flex-col">
              <span>{t('pc.step.dontAsk')}</span>
              <span className="text-[11px] text-muted-foreground">{t('pc.step.dontAskHint')}</span>
            </span>
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeNewChatStep}>{t('pc.step.cancel')}</Button>
            <Button size="sm" onClick={() => void start()} disabled={!ready || !preset || starting} data-testid="new-chat-start">{t('pc.step.start')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
