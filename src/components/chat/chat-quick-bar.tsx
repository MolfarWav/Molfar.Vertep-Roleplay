import { useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '@/lib/store'
import type { ID } from '@/lib/types'
import { DEFAULT_AVATAR, cn, shortModel, storedMediaUrl } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command'
import { ModelMark } from '@/components/model-mark'
import { ProfilesSheet } from '@/components/connections/profiles-sheet'
import {
  BookmarkSimple, CaretDown, Check, Cpu, GearSix, PencilSimple, SlidersHorizontal, User,
} from '@phosphor-icons/react'

/**
 * Chat-header quick switcher: ONE compact pill summarising the whole live
 * context — preset · persona · model — with a tabbed palette behind it.
 * Each tab shows rich rows (preset meta, persona avatar + title, provider
 * mark + model) so the state reads at a glance, and a search narrows it.
 *
 * Profiles are connection profiles: a saved (provider, model) pair. Picking
 * one swaps the model for the NEXT generation — switching mid-RP never
 * touches chat content.
 */
/** cmdk renders every item it's given — with years of presets/personas that's
 *  thousands of DOM nodes. Cap each group and tell the user to type. */
const GROUP_CAP = 60
function GroupCapHint({ hidden }: { hidden: number }) {
  return (
    <div className="px-2 py-1.5 text-[11px] text-muted-foreground" aria-live="polite">
      +{hidden} more, keep typing to narrow
    </div>
  )
}

type Tab = 'preset' | 'persona' | 'profile'

const TABS: { id: Tab; label: string; icon: typeof SlidersHorizontal }[] = [
  { id: 'preset', label: 'Preset', icon: SlidersHorizontal },
  { id: 'persona', label: 'Persona', icon: User },
  { id: 'profile', label: 'Model', icon: Cpu },
]

/**
 * Card-like rows: every entity is its own bordered tile with a clear hover
 * (cmkd marks the hovered/keyboard row data-selected) and a distinct active
 * state, so dense two-line rows no longer melt into one list. Action rows
 * (edit/manage/save) sit behind a separator in a quieter tile.
 */
const itemCls =
  'my-0.5 rounded-lg border border-transparent px-2.5 py-2 ' +
  'data-selected:border-border data-selected:bg-accent data-selected:text-foreground ' +
  'hover:border-border hover:bg-accent'
const activeItemCls = 'border-border/70 bg-accent/50'
const actionCls =
  'my-0.5 rounded-lg border border-dashed border-border/70 px-2.5 py-2 ' +
  'data-selected:border-border data-selected:bg-accent data-selected:text-foreground ' +
  'hover:border-border hover:bg-accent'

function presetMeta(p: { sections: { enabled: boolean }[]; samplers: { temperature: { value: number; enabled: boolean }; contextSize: number } } | undefined): string {
  if (!p) return 'none'
  const on = p.sections.filter((s) => s.enabled).length
  const temp = p.samplers.temperature.enabled ? ` · ${p.samplers.temperature.value}` : ''
  const ctx = p.samplers.contextSize >= 1000 ? ` · ${Math.round(p.samplers.contextSize / 1000)}k ctx` : ''
  return `${on}/${p.sections.length} on${temp}${ctx}`
}

export function ChatQuickSwitch({ chatId }: { chatId: ID }) {
  const chat = useApp((s) => s.chats.find((c) => c.id === chatId))
  const presets = useApp((s) => s.presets)
  const personas = useApp((s) => s.personas)
  const profiles = useApp((s) => s.connectionProfiles)
  const models = useApp((s) => s.models)
  const model = useApp((s) => s.model)
  const setModel = useApp((s) => s.setModel)
  const addProfile = useApp((s) => s.addConnectionProfile)
  const updateChat = useApp((s) => s.updateChat)
  const focusPreset = useApp((s) => s.focusPreset)
  const focusPersona = useApp((s) => s.focusPersona)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('preset')
  const [manageOpen, setManageOpen] = useState(false)
  if (!chat) return null

  const preset = presets.find((p) => p.id === chat.presetId) ?? presets.find((p) => p.isDefault)
  const persona = personas.find((p) => p.id === chat.personaId) ?? personas.find((p) => p.isDefault)
  // resolve through the catalog so qualified refs AND legacy bare names agree
  const current = model ? (models.find((m) => m.ref === model) ?? models.find((m) => m.id === model) ?? null) : null
  const activeProfile = current
    ? profiles.find((p) => {
        const t = models.find((m) => m.ref === p.modelId || m.id === p.modelId)
        return t != null && t.ref === current.ref
      })
    : undefined
  const modelLabel = activeProfile?.name ?? (current ? shortModel(current.id) : null) ?? 'no model'

  // create flow: snapshot the live connection under an auto-name
  const saveCurrentAsProfile = () => {
    if (!current) return
    const base = `${current.provider} ${shortModel(current.id)}`
    let name = base
    let n = 2
    while (profiles.some((p) => p.name === name)) name = `${base} ${n++}`
    addProfile({ name, provider: current.provider, modelId: current.ref })
    toast.success(`Profile saved: ${name}`, { description: 'Rename it in Manage profiles.' })
  }

  const pick = (fn: () => void) => {
    fn()
    setOpen(false)
  }

  const searchPlaceholder =
    tab === 'preset' ? 'Search presets…' : tab === 'persona' ? 'Search personas…' : 'Search models & profiles…'

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={cn(
            'flex h-8 min-w-0 max-w-full items-center rounded-lg border border-border bg-card/60 text-[11px]',
            'overflow-hidden hover:bg-accent/70 hover:text-foreground',
          )}
          aria-label={`Switch context: preset ${preset?.name ?? 'none'}, persona ${persona?.name ?? 'none'}, model ${modelLabel}`}
          title={`Preset: ${preset?.name ?? '—'}\nPersona: ${persona?.name ?? '—'}\nModel: ${current ? `${current.provider} · ${current.id}` : modelLabel}`}
        >
          {/* below md only the three icons show: the labels would not fit the header on a phone */}
          {/* preset segment */}
          <span className="flex min-w-0 items-center gap-1.5 px-2.5 md:px-2">
            <SlidersHorizontal className="size-3.5 shrink-0 text-amber-500/90" aria-hidden="true" />
            <span className="hidden max-w-24 truncate font-medium text-foreground/90 md:inline">{preset?.name ?? '—'}</span>
          </span>
          <span className="h-4 w-px shrink-0 bg-border" aria-hidden="true" />
          {/* persona segment */}
          <span className="flex min-w-0 items-center gap-1.5 px-2.5 md:px-2">
            {persona?.avatar ? (
              <img
                src={storedMediaUrl(persona.avatar) || DEFAULT_AVATAR}
                alt=""
                className="size-4 shrink-0 rounded-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR }}
              />
            ) : (
              <User className="size-3.5 shrink-0 text-sky-500/90" aria-hidden="true" />
            )}
            <span className="hidden max-w-20 truncate text-muted-foreground md:inline">{persona?.name ?? '—'}</span>
          </span>
          <span className="h-4 w-px shrink-0 bg-border" aria-hidden="true" />
          {/* model segment */}
          <span className="flex min-w-0 items-center gap-1.5 px-2.5 md:px-2">
            <ModelMark model={chat ? (current?.ref ?? model ?? '') : ''} className="size-3.5 shrink-0 text-emerald-500/90" />
            <span className="hidden max-w-28 truncate font-mono text-muted-foreground md:inline">{modelLabel}</span>
          </span>
          <CaretDown className="mr-1.5 size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        </PopoverTrigger>

        <PopoverContent align="end" className="w-[340px] overflow-hidden p-0">
          {/* tab bar */}
          <div className="flex items-center gap-1 border-b border-border bg-muted/40 p-1.5" role="tablist" aria-label="Switch what to change">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors',
                  tab === t.id ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <t.icon className="size-3.5" aria-hidden="true" />
                {t.label}
              </button>
            ))}
          </div>

          {/* live context line for the active tab */}
          {tab === 'preset' && (
            <button
              type="button"
              onClick={() => { if (preset) pick(() => focusPreset(preset.id)) }}
              className="flex w-full items-center gap-2 border-b border-border bg-card px-3 py-2 text-left hover:bg-accent/50"
              title="Open preset editor"
            >
              <SlidersHorizontal className="size-4 shrink-0 text-amber-500" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold">{preset?.name ?? 'No preset'}</span>
                <span className="block truncate font-mono text-[10px] text-muted-foreground">{presetMeta(preset)}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                <PencilSimple className="size-3" aria-hidden="true" /> Edit
              </span>
            </button>
          )}
          {tab === 'persona' && (
            <button
              type="button"
              onClick={() => { if (persona) pick(() => focusPersona(persona.id)) }}
              className="flex w-full items-center gap-2 border-b border-border bg-card px-3 py-2 text-left hover:bg-accent/50"
              title="Open persona editor"
            >
              <img
                src={(persona?.avatar && storedMediaUrl(persona.avatar)) || DEFAULT_AVATAR}
                alt=""
                className="size-7 shrink-0 rounded-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold">
                  {persona?.name ?? 'No persona'}
                  {persona?.pronouns ? <span className="ml-1 font-normal text-muted-foreground">· {persona.pronouns}</span> : null}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {persona?.title || persona?.description || '—'}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                <PencilSimple className="size-3" aria-hidden="true" /> Edit
              </span>
            </button>
          )}
          {tab === 'profile' && (
            <div className="flex w-full items-center gap-2 border-b border-border bg-card px-3 py-2">
              <ModelMark model={current?.ref ?? model ?? ''} className="size-4 shrink-0 text-emerald-500" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold">{modelLabel}</span>
                <span className="block truncate font-mono text-[10px] text-muted-foreground">
                  {current ? `${current.provider} · ${current.id}` : 'engine picks'}
                </span>
              </span>
              <button
                type="button"
                onClick={() => pick(() => { setManageOpen(true) })}
                className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <GearSix className="size-3" aria-hidden="true" /> Manage
              </button>
            </div>
          )}

          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>Nothing matches.</CommandEmpty>

              {tab === 'preset' && (
                <CommandGroup heading={`Presets · ${presets.length}`} className="flex flex-col gap-0.5">
                  {presets.slice(0, GROUP_CAP).map((p) => {
                    const active = p.id === preset?.id
                    return (
                      <CommandItem key={p.id} value={`preset ${p.name}`} onSelect={() => pick(() => updateChat(chatId, { presetId: p.id }))}
                        className={cn(itemCls, active && activeItemCls)}>
                        <span className={cn(
                          'flex size-5 shrink-0 items-center justify-center rounded-full',
                          active ? 'bg-amber-500/15 text-amber-500' : 'text-transparent',
                        )}>
                          <Check className="size-3" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn('block truncate text-xs', active && 'font-semibold')}>{p.name}</span>
                          <span className="block truncate font-mono text-[10px] text-muted-foreground">{presetMeta(p)}</span>
                        </span>
                        {p.isDefault && (
                          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">default</span>
                        )}
                      </CommandItem>
                    )
                  })}
                  {presets.length > GROUP_CAP && <GroupCapHint hidden={presets.length - GROUP_CAP} />}
                </CommandGroup>
              )}

              {tab === 'persona' && (
                <CommandGroup heading={`Personas · ${personas.length}`} className="flex flex-col gap-0.5">
                  {personas.slice(0, GROUP_CAP).map((p) => {
                    const active = p.id === persona?.id
                    return (
                      <CommandItem key={p.id} value={`persona ${p.name} ${p.title ?? ''}`} onSelect={() => pick(() => updateChat(chatId, { personaId: p.id }))}
                        className={cn(itemCls, active && activeItemCls)}>
                        <img
                          src={(p.avatar && storedMediaUrl(p.avatar)) || DEFAULT_AVATAR}
                          alt=""
                          className="size-6 shrink-0 rounded-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className={cn('flex items-center gap-1 truncate text-xs', active && 'font-semibold')}>
                            <span className="truncate">{p.name}</span>
                            {active && <Check className="size-3 shrink-0 text-sky-500" aria-hidden="true" />}
                          </span>
                          <span className="block truncate text-[10px] text-muted-foreground">
                            {p.title || p.description || '—'}
                          </span>
                        </span>
                      </CommandItem>
                    )
                  })}
                  {personas.length > GROUP_CAP && <GroupCapHint hidden={personas.length - GROUP_CAP} />}
                  <CommandSeparator className="my-1.5" />
                  <CommandItem value="edit personas" onSelect={() => { if (persona) pick(() => focusPersona(persona.id)) }}
                    className={actionCls}>
                    <PencilSimple className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="flex-1 text-xs">Edit personas…</span>
                  </CommandItem>
                </CommandGroup>
              )}

              {tab === 'profile' && (
                <CommandGroup heading={profiles.length > 0 ? `Profiles · ${profiles.length}` : 'Profiles'} className="flex flex-col gap-0.5">
                  {profiles.length === 0 && !current && (
                    <div className="px-2 py-1.5 text-[11px] text-muted-foreground">No model selected</div>
                  )}
                  {profiles.slice(0, GROUP_CAP).map((p) => {
                    const target = models.find((m) => m.ref === p.modelId || m.id === p.modelId)
                    const active = p.id === activeProfile?.id
                    return (
                      <CommandItem
                        key={p.id}
                        value={`profile ${p.name} ${p.modelId}`}
                        className={cn(itemCls, active && activeItemCls)}
                        onSelect={() => {
                          if (!target) return
                          pick(() => {
                            void setModel(target.ref)
                            toast.success(`Model: ${shortModel(target.id)}`, { description: target.provider })
                          })
                        }}
                      >
                        <ModelMark model={target?.ref ?? p.modelId} className={cn('size-4 shrink-0', active ? 'text-emerald-500' : 'text-muted-foreground')} />
                        <span className="min-w-0 flex-1">
                          <span className={cn('flex items-center gap-1 truncate text-xs', active && 'font-semibold')}>
                            <span className="truncate">{p.name}</span>
                            {active && <Check className="size-3 shrink-0 text-emerald-500" aria-hidden="true" />}
                          </span>
                          {target && (
                            <span className="block truncate font-mono text-[10px] text-muted-foreground">
                              {target.provider} · {target.id}
                            </span>
                          )}
                        </span>
                      </CommandItem>
                    )
                  })}
                  {profiles.length > GROUP_CAP && <GroupCapHint hidden={profiles.length - GROUP_CAP} />}
                  <CommandSeparator className="my-1.5" />
                  <CommandItem value="save current profile" disabled={!current} onSelect={() => saveCurrentAsProfile()}
                    className={actionCls}>
                    <BookmarkSimple className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="flex-1 text-xs">Save current as profile…</span>
                  </CommandItem>
                  <CommandItem value="manage profiles" onSelect={() => pick(() => setManageOpen(true))}
                    className={actionCls}>
                    <GearSix className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="flex-1 text-xs">Manage profiles…</span>
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <ProfilesSheet open={manageOpen} onOpenChange={setManageOpen} />
    </>
  )
}
