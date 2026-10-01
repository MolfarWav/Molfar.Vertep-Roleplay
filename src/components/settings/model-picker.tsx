import { useMemo, useState } from 'react'
import { CaretDown, Check } from '@phosphor-icons/react'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { useApp } from '@/lib/store'
import { shortModel } from '@/lib/utils'

interface ModelPickerProps {
  value: string
  onChange: (v: string) => void
  /** '' = "use the chat's own model". Shown as the first row when true. */
  allowChatDefault?: boolean
  chatDefaultLabel?: string
  placeholder?: string
  ariaLabel?: string
  hint?: string
}

/** Endpoint-aware engine model picker. The same model id can exist on several
 *  endpoints, so rows are grouped under their connection name and the trigger
 *  always shows "Endpoint / model". Stores the qualified wire ref. */
export function ModelPicker({
  value,
  onChange,
  allowChatDefault = true,
  chatDefaultLabel = "The chat's model",
  placeholder = 'provider/model-id',
  ariaLabel = 'Model',
  hint,
}: ModelPickerProps) {
  const models = useApp((s) => s.models)
  const [open, setOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const [query, setQuery] = useState('')

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    // every open starts from the full catalog, not the last search
    if (!next) { setQuery(''); setCustomOpen(false) }
    else setQuery('')
  }

  const select = (v: string) => { onChange(v); setQuery(''); setCustomOpen(false); setOpen(false) }

  const current = models.find((m) => m.ref === value) ?? models.find((m) => m.id === value) ?? null
  const unknown = value !== '' && !current

  const groups = useMemo(() => {
    const order: string[] = []
    const byProvider = new Map<string, typeof models>()
    for (const m of models) {
      if (!byProvider.has(m.provider)) {
        byProvider.set(m.provider, [])
        order.push(m.provider)
      }
      byProvider.get(m.provider)!.push(m)
    }
    return order.map((name) => ({ name, models: byProvider.get(name)! }))
  }, [models])

  // Manual substring filtering (cmdk's built-in ranking only bubbles matches
  // to the top and keeps the rest visible — here non-matches must hide).
  const q = query.trim().toLowerCase()
  const filteredGroups = useMemo(() => {
    if (!q) return groups
    const out: typeof groups = []
    for (const g of groups) {
      // an endpoint name match keeps the whole endpoint
      if (g.name.toLowerCase().includes(q)) { out.push(g); continue }
      const kept = g.models.filter((m) =>
        `${m.id} ${shortModel(m.id)} ${m.provider} ${m.ref}`.toLowerCase().includes(q),
      )
      if (kept.length) out.push({ name: g.name, models: kept })
    }
    return out
  }, [groups, q])
  const showDefault = allowChatDefault && (!q || 'chat default the chat\u2019s model'.includes(q))

  return (
    <div>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger
          render={
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm transition-colors outline-none hover:bg-accent/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label={`${ariaLabel}: ${current ? `${current.provider} ${shortModel(current.id)}` : value === '' ? chatDefaultLabel : value}`}
            >
              {value === '' && allowChatDefault ? (
                <span className="min-w-0 flex-1 truncate text-left text-muted-foreground">{chatDefaultLabel}</span>
              ) : current ? (
                <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <span className="shrink-0 rounded border border-border bg-muted px-1 py-px text-[10px] font-medium text-muted-foreground">
                    {current.provider}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs" title={current.ref}>
                    {shortModel(current.id)}
                  </span>
                </span>
              ) : (
                <span className="min-w-0 flex-1 truncate text-left font-mono text-xs" title={value}>
                  {value}
                </span>
              )}
              <CaretDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          }
        />
        <PopoverContent align="start" className="w-80 p-0">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search models or endpoints…" value={query} onValueChange={setQuery} />
            <CommandList>
              <CommandEmpty>No models match.</CommandEmpty>
              {showDefault && (
                <CommandGroup heading="Default">
                  <CommandItem value="__chat_default" onSelect={() => select('')}>
                    <span className="flex flex-1 items-center gap-2">
                      <span>{chatDefaultLabel}</span>
                      {value === '' && <Check className="ml-auto size-4 shrink-0" aria-hidden="true" />}
                    </span>
                  </CommandItem>
                </CommandGroup>
              )}
              {filteredGroups.map((g) => (
                <CommandGroup key={g.name} heading={`${g.name} · ${g.models.length}`}>
                  {g.models.map((m) => (
                    <CommandItem
                      key={m.ref}
                      value={m.ref}
                      onSelect={() => select(m.ref)}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-2" title={m.ref}>
                        <span className="min-w-0 flex-1 truncate font-mono text-xs">{shortModel(m.id)}</span>
                        {m.ref === value && <Check className="size-4 shrink-0" aria-hidden="true" />}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
          {models.length === 0 || customOpen || unknown ? (
            <div className="border-t border-border p-2">
              {models.length === 0 && (
                <p className="mb-1.5 px-1 text-xs text-muted-foreground">
                  Engine model catalog is empty — type the ref manually.
                </p>
              )}
              <Input
                className="h-8 font-mono text-xs"
                value={value}
                placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)}
                aria-label="Custom model ref"
              />
            </div>
          ) : (
            <button
              type="button"
              className="w-full border-t border-border px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setCustomOpen(true)}
            >
              Custom ref…
            </button>
          )}
        </PopoverContent>
      </Popover>
      {unknown ? (
        <p className="mt-1.5 text-xs text-destructive">
          Not in the engine catalog — check the ref or pick from the list above.
        </p>
      ) : (
        value !== '' && current && <p className="mt-1.5 font-mono text-[11px] break-all text-muted-foreground/80">Sends as: {current.ref}</p>
      )}
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
