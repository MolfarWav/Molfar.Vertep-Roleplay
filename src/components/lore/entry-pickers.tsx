import { useMemo } from 'react'
import { X } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'

/** Speakers the entry is limited to: stored as the cards' ids, shown by name. */
export function CharacterPicker({ ids, onChange }: { ids: string[]; onChange: (ids: string[]) => void }) {
  const t = useT()
  const characters = useApp((s) => s.characters)
  const nameOf = (id: string) => characters.find((c) => c.id === id)?.name ?? id
  const toggle = (id: string) => onChange(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ids.map((id) => (
        <Badge key={id} variant="secondary" className="max-w-full gap-0.5 text-caption">
          <span className="max-w-40 truncate">{nameOf(id)}</span>
          <button
            type="button"
            onClick={() => toggle(id)}
            aria-label={t('lore.ed.removeNamed', { name: nameOf(id) })}
            title={t('lore.ed.removeNamed', { name: nameOf(id) })}
            className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-full hover:text-destructive max-md:size-10 max-md:-my-2"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </Badge>
      ))}
      <Popover>
        <PopoverTrigger render={<Button variant="outline" size="sm" className="h-8 text-caption max-md:h-10">{t('lore.ed.pickCharacters')}</Button>} />
        <PopoverContent align="start" className="max-h-72 w-64">
          {characters.length === 0 && <p className="text-caption text-muted-foreground">{t('lore.ed.noCharacters')}</p>}
          <ul className="flex flex-col gap-0.5">
            {characters.map((c) => (
              <li key={c.id}>
                <label className="flex min-h-10 items-center gap-2 rounded-md px-1.5 text-body hover:bg-accent/50 md:min-h-8">
                  <input type="checkbox" className="size-4 accent-primary" checked={ids.includes(c.id)} onChange={() => toggle(c.id)} />
                  <span className="truncate">{c.name}</span>
                </label>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  )
}

/** Tags of the cards (and the ones the entry already has): a toggle per tag. */
export function TagPicker({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const t = useT()
  const characters = useApp((s) => s.characters)
  const all = useMemo(() => Array.from(new Set([...characters.flatMap((c) => c.tags), ...tags])).sort((a, b) => a.localeCompare(b)), [characters, tags])
  if (all.length === 0) return <p className="text-caption text-muted-foreground">{t('lore.ed.noTags')}</p>
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('lore.ed.tags')}>
      {all.map((tag) => {
        const on = tags.includes(tag)
        return (
          <button
            key={tag}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? tags.filter((x) => x !== tag) : [...tags, tag])}
            className={cn(
              'min-h-10 rounded-full border px-3 text-caption md:min-h-0 md:px-2.5 md:py-0.5',
              on ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground hover:bg-accent/50',
            )}
          >
            {tag}
          </button>
        )
      })}
    </div>
  )
}
