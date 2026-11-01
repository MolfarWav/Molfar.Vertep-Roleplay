import { useState } from 'react'
import { X } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { useT } from '@/hooks/use-t'
import { addKeys, commitKeyDraft, removeKey, splitKeyDraft } from '@/lib/lore-entry'
import { cn } from '@/lib/utils'

/**
 * Keys as chips. Type a word, then Enter or a comma adds it (leaving the box adds it too); x removes a chip; Backspace
 * in an empty box removes the last one. The list is stored as it always was: an array of strings.
 */
export function KeyChips({ id, keys, onChange, label, placeholder }: {
  id?: string
  keys: string[]
  onChange: (keys: string[]) => void
  label: string
  placeholder: string
}) {
  const t = useT()
  const [draft, setDraft] = useState('')
  const add = (incoming: string[]) => {
    const next = addKeys(keys, incoming)
    if (next.length !== keys.length) onChange(next)
  }
  const flush = () => {
    if (draft.trim()) {
      add(commitKeyDraft(draft))
      setDraft('')
    }
  }
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-input px-2 py-1 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 md:min-h-8">
      {keys.map((k, i) => (
        <Badge key={`${i}:${k}`} variant="secondary" className="max-w-full gap-0.5 text-caption">
          <span className="truncate">{k}</span>
          <button
            type="button"
            onClick={() => onChange(removeKey(keys, i))}
            aria-label={t('lore.ed.removeKey', { key: k })}
            title={t('lore.ed.removeKey', { key: k })}
            className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-full hover:text-destructive max-md:size-10 max-md:-my-2"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </Badge>
      ))}
      <input
        id={id}
        value={draft}
        aria-label={label}
        placeholder={keys.length === 0 ? placeholder : undefined}
        onChange={(e) => {
          const { add: complete, rest } = splitKeyDraft(e.target.value)
          add(complete)
          setDraft(rest)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            flush()
          } else if (e.key === 'Backspace' && draft === '' && keys.length > 0) {
            onChange(removeKey(keys, keys.length - 1))
          }
        }}
        onBlur={flush}
        className={cn('h-8 min-w-28 flex-1 bg-transparent text-body outline-none placeholder:text-muted-foreground max-md:h-10')}
      />
    </div>
  )
}
