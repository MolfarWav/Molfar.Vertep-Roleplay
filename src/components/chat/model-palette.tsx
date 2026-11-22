import { toast } from 'sonner'
import { Check, GearSix } from '@phosphor-icons/react'
import { useApp } from '@/lib/store'
import { cn, shortModel } from '@/lib/utils'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command'
import { ModelMark } from '@/components/model-mark'
import { canOpenModelSettings, openModelSettings } from '@/lib/shell-bridge'
import { useT } from '@/hooks/use-t'

/**
 * Card-like rows: every entity is its own bordered tile with a clear hover
 * (cmkd marks the hovered/keyboard row data-selected) and a distinct active
 * state, so dense two-line rows no longer melt into one list. Action rows
 * (edit/manage/save) sit behind a separator in a quieter tile.
 */
export const itemCls =
  'my-0.5 rounded-lg border border-transparent px-2.5 py-2 ' +
  'data-selected:border-border data-selected:bg-accent data-selected:text-foreground ' +
  'hover:border-border hover:bg-accent'
export const activeItemCls = 'border-border/70 bg-accent/50'
export const actionCls =
  'my-0.5 rounded-lg border border-dashed border-border/70 px-2.5 py-2 ' +
  'data-selected:border-border data-selected:bg-accent data-selected:text-foreground ' +
  'hover:border-border hover:bg-accent'

/** cmdk renders every item it's given: with years of presets/personas that's
 *  thousands of DOM nodes. Cap each group and tell the user to type. */
export const GROUP_CAP = 60
export function GroupCapHint({ hidden }: { hidden: number }) {
  return (
    <div className="px-2 py-1.5 text-[11px] text-muted-foreground" aria-live="polite">
      +{hidden} more, keep typing to narrow
    </div>
  )
}

/** Which models are offered and starred is chosen in the shell's Settings only. */
export function setUpModels(ref?: string | null): void {
  if (!canOpenModelSettings()) {
    toast.info('Models are set up in Settings › Connections and models')
    return
  }
  void openModelSettings(ref).catch((e: unknown) => toast.error(String((e as Error).message ?? e)))
}

/** The catalog entry a stored model value stands for (qualified refs and legacy bare names both resolve). */
export function useModelEntry(value: string | null | undefined) {
  const models = useApp((s) => s.models)
  const favorites = useApp((s) => s.favorites)
  const current = value ? (models.find((m) => m.ref === value) ?? models.find((m) => m.id === value) ?? null) : null
  const starred = current ? favorites.find((f) => f.ref === current.ref) : undefined
  return { current, label: starred?.name ?? (current ? shortModel(current.id) : value ? shortModel(value) : null) }
}

/**
 * The model groups of the palette: the starred models, then every model by connection, then the link to Settings.
 * Rendered inside a cmdk `Command` (the chat's quick switch shares its search box across tabs); `onSettings` runs
 * from the last row.
 */
export function ModelPaletteGroups({ value, onPick, onSettings }: {
  value: string | null | undefined
  onPick: (ref: string, label: string, provider: string) => void
  onSettings: () => void
}) {
  const models = useApp((s) => s.models)
  const favorites = useApp((s) => s.favorites)
  const { current } = useModelEntry(value)
  const quick = favorites.flatMap((f) => {
    const m = models.find((x) => x.ref === f.ref)
    return m ? [{ m, name: f.name || shortModel(m.id) }] : []
  })
  const quickRefs = new Set(quick.map((q) => q.m.ref))
  const others = models.filter((m) => !quickRefs.has(m.ref))
  return (
    <>
      <CommandGroup heading={`★ Quick switch · ${quick.length}`} className="flex flex-col gap-0.5">
        {quick.length === 0 && (
          <div className="px-2 py-1.5 text-[11px] text-muted-foreground">Star models in Settings › Connections and models to switch between them here.</div>
        )}
        {quick.map(({ m, name }) => {
          const active = m.ref === current?.ref
          return (
            <CommandItem key={m.ref} value={`quick ${name} ${m.ref}`} className={cn(itemCls, active && activeItemCls)} onSelect={() => onPick(m.ref, name, m.provider)}>
              <ModelMark model={m.ref} className={cn('size-4 shrink-0', active ? 'text-emerald-500' : 'text-muted-foreground')} />
              <span className="min-w-0 flex-1">
                <span className={cn('flex items-center gap-1 truncate text-xs', active && 'font-semibold')}>
                  <span className="truncate">{name}</span>
                  {active && <Check className="size-3 shrink-0 text-emerald-500" aria-hidden="true" />}
                </span>
                <span className="block truncate font-mono text-[10px] text-muted-foreground">{m.provider} · {m.id}</span>
              </span>
            </CommandItem>
          )
        })}
      </CommandGroup>
      {others.length > 0 && (
        <CommandGroup heading={`Models · ${others.length}`} className="flex flex-col gap-0.5">
          {others.slice(0, GROUP_CAP).map((m) => {
            const active = m.ref === current?.ref
            return (
              <CommandItem key={m.ref} value={`model ${m.id} ${m.ref} ${m.provider}`} className={cn(itemCls, active && activeItemCls)} onSelect={() => onPick(m.ref, shortModel(m.id), m.provider)}>
                <ModelMark model={m.ref} className={cn('size-4 shrink-0', active ? 'text-emerald-500' : 'text-muted-foreground')} />
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate text-xs', active && 'font-semibold')}>{shortModel(m.id)}</span>
                  <span className="block truncate font-mono text-[10px] text-muted-foreground">{m.provider}</span>
                </span>
              </CommandItem>
            )
          })}
          {others.length > GROUP_CAP && <GroupCapHint hidden={others.length - GROUP_CAP} />}
        </CommandGroup>
      )}
      <CommandSeparator className="my-1.5" />
      <CommandItem value="choose models in settings" onSelect={onSettings} className={actionCls}>
        <GearSix className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex-1 text-xs">Choose models and the quick switch in Settings…</span>
      </CommandItem>
    </>
  )
}

/** A standalone model palette (search + the groups) for a popover: `value` is the model now, `onPick` gets the choice. */
export function ModelPalette({ value, onPick, onSettings }: {
  value: string | null | undefined
  onPick: (ref: string, label: string, provider: string) => void
  onSettings?: () => void
}) {
  const t = useT()
  return (
    <Command data-testid="model-palette">
      <CommandInput placeholder={t('dir.model.search')} />
      <CommandList>
        <CommandEmpty>{t('dir.model.none')}</CommandEmpty>
        <ModelPaletteGroups value={value} onPick={onPick} onSettings={onSettings ?? (() => setUpModels(null))} />
      </CommandList>
    </Command>
  )
}
