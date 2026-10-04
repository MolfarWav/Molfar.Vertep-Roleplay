import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import { ALL, characterOptions, type ChatFilter } from '@/lib/chat-filters'
import { cn } from '@/lib/utils'

/** Persona and Character selects for a chat list. Personas list every defined
 *  persona (there are only a few); characters list only what the chats
 *  actually use. "All" is the default. Shared by Home and Chats. */
export function ChatFilters({ value, onChange, className }: {
  value: ChatFilter
  onChange: (next: ChatFilter) => void
  className?: string
}) {
  const t = useT()
  const chats = useApp((s) => s.chats)
  const personas = useApp((s) => s.personas)
  const characters = useApp((s) => s.characters)
  // every persona: when all visible chats share one, a used-only list would hide the filter
  const personaOpts = personas
  const characterOpts = characterOptions(chats, characters)
  // nothing to choose between yet
  if (personaOpts.length < 2 && characterOpts.length < 2) return null
  return (
    <div role="group" aria-label={t('home.filterBy')} className={cn('flex flex-wrap items-center gap-2', className)}>
      {personaOpts.length > 1 && (
        <FilterSelect
          label={t('home.persona')}
          allLabel={t('home.all')}
          value={value.personaId}
          options={personaOpts.map((p) => [p.id, p.name])}
          onChange={(personaId) => onChange({ ...value, personaId })}
        />
      )}
      {characterOpts.length > 1 && (
        <FilterSelect
          label={t('home.character')}
          allLabel={t('home.all')}
          value={value.characterId}
          options={characterOpts.map((c) => [c.id, c.name])}
          onChange={(characterId) => onChange({ ...value, characterId })}
        />
      )}
    </div>
  )
}

function FilterSelect({ label, allLabel, value, options, onChange }: {
  label: string
  allLabel: string
  value: string
  options: [string, string][]
  onChange: (v: string) => void
}) {
  const active = value !== ALL
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger
        aria-label={label}
        className={cn('h-8 w-auto min-w-0 max-w-[11rem] gap-1.5 font-heading text-[13px]', active && 'border-primary/60 text-foreground')}
      >
        <span className="text-muted-foreground">{label}:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}
