// "Seen in play without a soul": each name opens a small menu (give it a soul,
// say it is another spelling of an existing soul, or hide it as minor), and a
// "Hidden: N" link lists the names hidden so far.

import { X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useT } from '@/hooks/use-t'

interface Props {
  guests: string[]
  /** names of the souls in the working copy: targets of "Same as…" */
  soulNames: string[]
  minor: string[]
  onGive: (name: string) => void
  onSame: (name: string, target: string) => void
  onHide: (name: string) => void
  onUnhide: (name: string) => void
}

export function SoulGuests({ guests, soulNames, minor, onGive, onSame, onHide, onUnhide }: Props) {
  const t = useT()
  if (!guests.length && !minor.length) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      {guests.length > 0 && <span>{t('soul.seenWithout')}</span>}
      {guests.map((g) => (
        <DropdownMenu key={g}>
          <DropdownMenuTrigger
            aria-label={t('soul.guestMenu', { name: g })}
            className="border border-border px-1.5 py-0.5 text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            + {g}
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-auto min-w-44">
            <DropdownMenuItem onClick={() => onGive(g)}>{t('soul.give')}</DropdownMenuItem>
            {soulNames.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{t('soul.sameAs')}</DropdownMenuLabel>
                  {soulNames.map((n) => (
                    <DropdownMenuItem key={n} onClick={() => onSame(g, n)}>{n}</DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onHide(g)}>{t('soul.minorHide')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ))}
      {guests.length > 0 && <span>{t('soul.neutralNote')}</span>}
      {minor.length > 0 && (
        <Popover>
          <PopoverTrigger className="underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/60">
            {t('soul.hidden', { n: minor.length })}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64">
            <p className="text-xs font-medium text-muted-foreground">{t('soul.hiddenTitle')}</p>
            <ul className="flex flex-col gap-0.5">
              {minor.map((n) => (
                <li key={n} className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate">{n}</span>
                  <Button variant="ghost" size="icon-xs" aria-label={`${t('soul.unhide')}: ${n}`} title={t('soul.unhide')} onClick={() => onUnhide(n)}>
                    <X aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
