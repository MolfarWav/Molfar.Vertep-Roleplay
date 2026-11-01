// A small searchable list of the app's models, for "Choose another model" on a
// failed rating: the pick becomes the dashboard's sensor model.

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ModelMark } from '@/components/model-mark'
import { useT } from '@/hooks/use-t'
import { useApp } from '@/lib/store'

/** cmdk renders every item it gets; a catalog of hundreds is fine, thousands are not. */
const CAP = 300

export function SoulModelPicker({ disabled, onPick, label, open: openProp, onOpenChange }: { disabled?: boolean; onPick: (ref: string) => void; label?: string; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const t = useT()
  const models = useApp((s) => s.models)
  // controlled when `open` is given (an error card's "Pick another model" opens it), else on its own
  const [own, setOwn] = useState(false)
  const open = openProp ?? own
  const setOpen = (v: boolean) => { setOwn(v); onOpenChange?.(v) }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        render={<Button variant="outline" size="sm" className="rounded-none max-md:h-10">{label ?? t('soul.chooseModel')}</Button>}
      />
      <PopoverContent align="start" className="w-80 overflow-hidden p-0">
        <Command>
          <CommandInput placeholder={t('soul.searchModels')} />
          <CommandList>
            <CommandEmpty>{t('soul.noModels')}</CommandEmpty>
            <CommandGroup>
              {models.slice(0, CAP).map((m) => (
                <CommandItem
                  key={m.ref}
                  value={`${m.provider} ${m.id}`}
                  onSelect={() => { setOpen(false); onPick(m.ref) }}
                  className="gap-2"
                >
                  <ModelMark model={m.ref} className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs">{m.id}</span>
                    <span className="block truncate text-caption text-muted-foreground">{m.provider}</span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
