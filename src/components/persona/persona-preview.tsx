import { Copy, DotsThree, Trash } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ChipLine, type PersonaItem } from '@/components/persona/persona-list'
import { useT } from '@/hooks/use-t'
import { formatTokens } from '@/lib/tokens'
import type { Tag } from '@/lib/types'
import { DEFAULT_AVATAR, cn } from '@/lib/utils'

export interface PreviewActions {
  inUse: boolean
  /** names of the characters this persona is bound to */
  goesWith: string[]
  tagMeta: ReadonlyMap<string, Tag>
  onOpen: () => void
  onUse: () => void
  onDuplicate: () => void
  onDelete: () => void
  /** the Chats section, narrowed to this persona */
  onChats: () => void
}

function MoreMenu({ item, a, className }: { item: PersonaItem; a: PreviewActions; className?: string }) {
  const t = useT()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className={cn('size-11 p-0 md:size-8', className)} aria-label={t('personas.actions', { name: item.p.name })}><DotsThree className="size-4" aria-hidden="true" /></Button>} />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={a.onDuplicate}><Copy className="size-4" aria-hidden="true" />{t('personas.duplicate')}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={a.onDelete}><Trash className="size-4" aria-hidden="true" />{t('personas.delete')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Tile({ value, label, tone, onClick }: { value: string; label: string; tone: string; onClick?: () => void }) {
  const body = (
    <>
      <span className={cn('block text-base font-bold tabular-nums', tone)}>{value}</span>
      <span className={cn('block text-[11px]', onClick ? 'text-sky-700 underline dark:text-sky-300' : 'text-muted-foreground')}>{label}</span>
    </>
  )
  const cls = 'min-w-0 rounded-lg border p-2 text-left'
  return onClick
    ? <button type="button" onClick={onClick} className={cn(cls, 'border-sky-500/50 bg-sky-500/10 hover:bg-sky-500/20')} data-testid="persona-chats-link">{body}</button>
    : <div className={cn(cls, 'border-border')}>{body}</div>
}

/** The right-hand panel (desktop): the selected persona at a glance, with Open, Use and More. */
export function PersonaPreviewPanel({ item, a }: { item: PersonaItem; a: PreviewActions }) {
  const t = useT()
  const { p } = item
  return (
    <aside className="flex min-h-0 w-[360px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-border bg-card/40 p-4 max-md:hidden" aria-label={t('personas.preview.aria')} data-testid="persona-preview">
      <img src={p.avatar || DEFAULT_AVATAR} alt="" className="h-[250px] w-full rounded-xl bg-muted object-cover object-top" />
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="min-w-0 truncate text-lg font-bold">{p.name}</h2>
        {a.inUse && <Badge variant="secondary" className="shrink-0 font-normal">{t('personas.inUse')}</Badge>}
      </div>
      {(item.line || p.pronouns.trim()) && (
        <p className="text-sm text-muted-foreground">{[item.line, p.pronouns.trim()].filter(Boolean).join(' · ')}</p>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Tile value={item.chats > 0 ? `${item.chats} →` : '0'} label={t('personas.chatsLabel')} tone="text-sky-700 dark:text-sky-300" onClick={item.chats > 0 ? a.onChats : undefined} />
        <Tile value={formatTokens(item.tokens)} label={t('personas.tokensLabel')} tone="text-amber-700 dark:text-amber-400" />
        <Tile value={item.fill} label={t('personas.profileLabel')} tone="text-emerald-700 dark:text-emerald-400" />
      </div>
      {a.goesWith.length > 0 && (
        <p className="text-xs leading-5 text-muted-foreground">{t('personas.goesWith')}: <span className="text-foreground">{a.goesWith.join(', ')}</span></p>
      )}
      {item.tags.length > 0 && <ChipLine pronouns="" tags={item.tags} tagMeta={a.tagMeta} max={item.tags.length} />}
      <div className="mt-auto flex gap-2 pt-2">
        <Button className="h-9 flex-1 md:h-8" onClick={a.onOpen}>{t('personas.open')}</Button>
        {!a.inUse && <Button variant="outline" className="h-9 md:h-8" onClick={a.onUse}>{t('personas.use')}</Button>}
        <MoreMenu item={item} a={a} />
      </div>
    </aside>
  )
}

/** The phone's bottom sheet for a tapped row. The old "tap opens the page" is its Open button. */
export function PersonaPreviewSheet({ item, a, open, onOpenChange }: { item: PersonaItem | null; a: PreviewActions; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT()
  return (
    <Sheet open={open && !!item} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh]" data-testid="persona-sheet">
        {item && (
          <>
            <SheetHeader className="sr-only"><SheetTitle>{item.p.name}</SheetTitle></SheetHeader>
            <div className="flex min-w-0 flex-col gap-3 overflow-y-auto px-4 pb-4 pt-2">
              <div className="flex min-w-0 gap-3">
                <img src={item.p.avatar || DEFAULT_AVATAR} alt="" className="h-[110px] w-[84px] shrink-0 rounded-[10px] bg-muted object-cover" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate text-[17px] font-bold">{item.p.name}</span>
                    {a.inUse && <Badge variant="secondary" className="shrink-0 font-normal">{t('personas.inUse')}</Badge>}
                  </div>
                  {(item.line || item.p.pronouns.trim()) && <span className="text-xs text-muted-foreground">{[item.line, item.p.pronouns.trim()].filter(Boolean).join(' · ')}</span>}
                  {item.tags.length > 0 && <ChipLine pronouns="" tags={item.tags} tagMeta={a.tagMeta} max={3} />}
                  <span className="mt-auto flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    {item.chats > 0
                      ? <button type="button" onClick={a.onChats} className="flex min-h-11 items-center text-sky-700 underline dark:text-sky-300" data-testid="persona-chats-link">{t('personas.chatsLink', { n: item.chats })}</button>
                      : <span>{t('personas.chatsN', { n: 0 })}</span>}
                    <span aria-hidden="true">·</span>
                    <span className="text-amber-700 dark:text-amber-400">{t('personas.tokensN', { n: formatTokens(item.tokens) })}</span>
                    <span aria-hidden="true">·</span>
                    <span>{item.fill}</span>
                  </span>
                </div>
              </div>
              {a.goesWith.length > 0 && (
                <p className="text-xs leading-5 text-muted-foreground">{t('personas.goesWith')}: <span className="text-foreground">{a.goesWith.join(', ')}</span></p>
              )}
              <div className="flex gap-2">
                <Button className="h-11 flex-1" onClick={a.onOpen}>{t('personas.open')}</Button>
                {!a.inUse && <Button variant="outline" className="h-11 flex-1" onClick={a.onUse}>{t('personas.useThis')}</Button>}
                <MoreMenu item={item} a={a} />
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
