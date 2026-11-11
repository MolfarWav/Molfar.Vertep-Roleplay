import { useState } from 'react'
import { FilmSlate, X } from '@phosphor-icons/react'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'

/**
 * The stage directions a player wrote in [[double brackets]] (Molfar.Vertep#368), shown under their message
 * as muted chips: they went to the model as an out-of-character instruction for the reply to that message,
 * not as the player's words. A long one is cut at two lines; tap it to read it all. The x takes one off
 * (`onRemove` is absent while a reply is being written, and on an archived chat).
 */
export function DirectionChips({ directions, touch, onRemove }: {
  directions: string[]
  touch?: boolean
  onRemove?: (index: number) => void
}) {
  const t = useT()
  const [open, setOpen] = useState<Set<number>>(() => new Set())
  const toggle = (i: number) => setOpen((cur) => {
    const next = new Set(cur)
    if (!next.delete(i)) next.add(i)
    return next
  })
  if (!directions.length) return null
  return (
    <ul className="mt-1.5 flex min-w-0 list-none flex-col items-start gap-1 p-0" data-guide="chat.directions" aria-label={t('sd.chipsLabel')}>
      {directions.map((d, i) => (
        <li
          key={`${d}#${directions.slice(0, i).filter((x) => x === d).length}`}
          className={cn(
            'flex max-w-full min-w-0 items-start gap-1 rounded-md border border-dashed border-border bg-muted/40 pl-2 text-xs text-muted-foreground',
            onRemove ? 'pr-0.5' : 'pr-2',
          )}
        >
          <button
            type="button"
            onClick={() => toggle(i)}
            aria-expanded={open.has(i)}
            title={t('sd.toggle')}
            className="flex min-w-0 flex-1 items-start gap-1.5 rounded-sm py-1.5 text-left outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <FilmSlate className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span className="sr-only">{t('sd.chipPrefix')}</span>
            <span className={cn('min-w-0 whitespace-pre-line break-words italic', !open.has(i) && 'line-clamp-2')}>{d}</span>
          </button>
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(i)}
              aria-label={t('sd.remove')}
              title={t('sd.remove')}
              className={cn(
                'flex shrink-0 items-center justify-center self-start rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring',
                touch ? 'size-10' : 'size-7',
              )}
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
