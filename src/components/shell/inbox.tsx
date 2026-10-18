import { create } from 'zustand'
import { Bell, BellSimple, CaretRight, Sparkle, Warning } from '@phosphor-icons/react'
import { useApp } from '@/lib/store'
import { useAttention, inboxRows, type InboxRow } from '@/lib/attention'
import { useT } from '@/hooks/use-t'
import { useIsDesktop } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { NeedsYouBadge } from '@/components/shell/needs-you-badge'

/** The inbox ("Waiting on you", #55): open on desktop as a popover on the rail, on phones as a sheet. */
export const useInbox = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))

/** The rows and the total, from the two sources and the per-kind switches. */
export function useInboxRows() {
  const litopys = useAttention((s) => s.litopys)
  const litNames = useAttention((s) => s.litNames)
  const soul = useAttention((s) => s.soul)
  const settings = useApp((s) => s.settings.attention)
  const chats = useApp((s) => s.chats)
  const characters = useApp((s) => s.characters)
  return inboxRows({
    settings,
    litopys,
    soul,
    chatName: (chatId) => {
      const chat = chats.find((c) => c.id === chatId)
      return characters.find((c) => c.id === chat?.characterId)?.name || litNames[chatId] || ''
    },
    cardName: (id) => characters.find((c) => c.id === id)?.name ?? '',
  })
}

/** The number on the inbox button. */
export const useInboxTotal = () => useInboxRows().total

function openRow(row: InboxRow) {
  useInbox.getState().setOpen(false)
  const app = useApp.getState()
  if (row.kind === 'litopys') app.focusLibraryChat(row.chatId)
  else app.openCharacterOnTab(row.characterId, 'soul')
}

/** The list itself: shared by the popover and the sheet. */
export function InboxList({ phone }: { phone?: boolean }) {
  const t = useT()
  const { rows } = useInboxRows()
  if (!rows.length) {
    return (
      <Empty className="p-4">
        <EmptyHeader>
          <EmptyMedia variant="icon"><BellSimple aria-hidden="true" /></EmptyMedia>
          <EmptyTitle>{t('inbox.empty')}</EmptyTitle>
          <EmptyDescription>{t('inbox.emptyHint')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <ul className="flex flex-col gap-1" data-testid="inbox-list">
      {rows.map((row) => {
        const name = row.name || '…'
        const what = row.kind === 'litopys'
          ? t('inbox.lit', { n: row.count })
          : row.failed ? t('inbox.soulFailed') : t('inbox.soul', { n: row.count })
        const Icon = row.kind === 'soul' && row.failed ? Warning : Sparkle
        return (
          <li key={row.key}>
            <button
              type="button"
              onClick={() => openRow(row)}
              aria-label={`${name}: ${what}. ${t('attn.open')}`}
              className={cn(
                'flex w-full min-w-0 items-center gap-3 rounded-lg border border-border px-3 text-left transition-colors hover:bg-accent',
                phone ? 'min-h-14 py-2' : 'min-h-11 py-1.5',
              )}
            >
              <Icon className={cn('size-5 shrink-0', row.kind === 'soul' && row.failed ? 'text-destructive' : 'text-cta')} aria-hidden="true" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-foreground">{name}</span>
                <span className="truncate text-xs text-muted-foreground">{what}</span>
              </span>
              <span className={cn('shrink-0 text-xs text-muted-foreground', phone ? 'hidden' : 'hidden min-[1200px]:block')}>{t('attn.open')}</span>
              <CaretRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** Title line of the popover: the name and the total. */
export function InboxHeading() {
  const t = useT()
  const total = useInboxTotal()
  return (
    <div className="flex items-center gap-2 px-0.5">
      <Bell className="size-4 text-muted-foreground" aria-hidden="true" />
      <h2 className="flex-1 font-heading text-[15px]">{t('inbox.title')}</h2>
      <NeedsYouBadge count={total} />
    </div>
  )
}

/** Phones: the same list in a sheet from the bottom. */
export function InboxSheet() {
  const t = useT()
  const open = useInbox((s) => s.open)
  const setOpen = useInbox((s) => s.setOpen)
  const isDesktop = useIsDesktop()
  return (
    <Sheet open={open && !isDesktop} onOpenChange={setOpen}>
      <SheetContent side="bottom" className="max-h-[80dvh] pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <SheetHeader>
          <SheetTitle>{t('inbox.title')}</SheetTitle>
          <SheetDescription className="sr-only">{t('inbox.emptyHint')}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
          <InboxList phone />
        </div>
      </SheetContent>
    </Sheet>
  )
}
