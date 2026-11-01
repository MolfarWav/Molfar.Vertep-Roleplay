import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PresetChoices, usePresetCosts, type PresetValues } from '@/components/chat/preset-choices'
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
  // the options can be clicked before the memory arrives: a late answer must not undo those clicks
  const touched = useRef(false)
  // a group chat: how its members answer, the group's default unless changed here
  const groupMode = character?.group?.generationMode ?? 'swap'
  const [genMode, setGenMode] = useState<NonNullable<ChatTurns['generationMode']>>(groupMode)

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
  const storeChats = useApp((s) => s.chats)
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

  const start = () => {
    if (!preset || !ready) return
    if (dontAsk) updateSettings({ askPresetOnNewChat: false })
    closeNewChatStep()
    void startChatWith(charId, greetingIndex, {
      presetId: preset.id, presetVars: values,
      ...(setPick === 'none' ? { agents: { own: [] as [] } } : setPick !== 'default' ? { agents: { preset: setPick } } : {}),
      ...(character?.isGroup && genMode !== groupMode ? { turns: { generationMode: genMode } } : {}),
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
            start()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('pc.step.title', { name: character?.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('pc.step.desc')}</DialogDescription>
        </DialogHeader>
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
            <Button size="sm" onClick={start} disabled={!ready || !preset} data-testid="new-chat-start">{t('pc.step.start')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
