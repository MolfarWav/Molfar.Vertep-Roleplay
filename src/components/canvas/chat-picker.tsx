import { useMemo, useState } from 'react'
import { CaretUpDown, UsersThree } from '@phosphor-icons/react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { useT, useRelativeTime } from '@/hooks/use-t'
import { useApp } from '@/lib/store'
import { Switch } from '@/components/ui/switch'
import { resolveLanguage } from '@/lib/i18n'
import { useIsMobile } from '@/hooks/use-mobile'

export interface PickerChat {
  id: string
  title: string
  /** the character's or the group's name; '' when unknown, or when every row is the same character's (the title leads then) */
  name: string
  updatedAt?: number
  /** the start of the newest message: shown as a third line and searched, so chats with the same title can be told apart (#540) */
  preview?: string
}

/** A message's start as one plain line: no markdown marks, no line breaks. */
const plainLine = (s: string) => s.replace(/[*_~`#>]+/g, '').replace(/\s+/g, ' ').trim()

/** One chat as the picker shows it: the name once, then what tells it apart from the character's other chats. */
function useRows(chats: PickerChat[]) {
  const t = useT()
  const rel = useRelativeTime()
  const storeChats = useApp((s) => s.chats)
  const characters = useApp((s) => s.characters)
  const lang = resolveLanguage(useApp((s) => s.settings.language))
  return useMemo(() => {
    const byId = new Map(storeChats.map((c) => [c.id, c]))
    const groups = new Set(characters.filter((c) => c.isGroup).map((c) => c.id))
    return [...chats]
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      .map((c) => {
        const full = byId.get(c.id)
        const name = c.name.trim()
        const title = c.title.trim()
        const main = name || title
        const count = full ? (full.messageCount ?? full.messages.length) : 0
        const own = name && title && title !== name ? title : ''
        const when = [
          c.updatedAt ? rel(c.updatedAt) : '',
          count ? t('chats.msgs', { n: count }) : '',
        ].filter(Boolean).join(' · ')
        const second = [own, when].filter(Boolean).join(' · ')
        const preview = c.preview ? plainLine(c.preview) : ''
        // what a search finds: the names, when and how long (also the date itself, "27 Nov"), and the newest message
        const date = c.updatedAt ? new Date(c.updatedAt).toLocaleDateString(lang, { day: 'numeric', month: 'short' }) : ''
        const search = [name, title, when, date, preview].join(' ').toLowerCase()
        return { id: c.id, main, own, when, second, preview, group: !!full && groups.has(full.characterId), search }
      })
  }, [chats, storeChats, characters, rel, t, lang])
}

/** A row matches when every word of the search is in it, in any order: "winter spring" finds "Winter at the spring" (#540). */
export const searchMatches = (hay: string, search: string) => search.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.toLowerCase().includes(w))

/** The row id of the optional "every chat" choice; never a chat id (those have no colon). */
const ALL = ':all'

/**
 * The Prompt board's chat picker: a button showing the current chat that opens a searchable list, the
 * most recently active chats first. Searches the character's name and the chat's title.
 * `allLabel` adds a first row that stands for every chat (chosen = `value` null, picking it calls `onAll`); `note` puts a short text
 * at the end of a row (the Memory tab's "3 blocks", #540).
 */
export function ChatPicker({
  chats, value, onChange, onAll, className, allLabel, note, label, testId, searchPlaceholder, narrow,
}: {
  chats: PickerChat[]
  /** the chosen chat; null = none yet, or every chat when `allLabel` is given */
  value: string | null
  onChange: (id: string) => void
  className?: string
  /** the first row, for every chat, and what picking it does */
  allLabel?: string
  onAll?: () => void
  /** a short text at the end of a row; `null` for the "every chat" row */
  note?: (id: string | null) => string
  /** what the button is called for a screen reader */
  label?: string
  /** the search box's hint, when the default ("by character or chat title") does not fit */
  searchPlaceholder?: string
  /** a switch under the search that keeps only the chats `test` lets through (the Memory tab's "only chats with blocks", #540);
   *  the caller keeps it on or off, so it is remembered where the caller wants; `empty` is said when no chat passes */
  narrow?: { label: string; on: boolean; onChange: (on: boolean) => void; test: (id: string) => boolean; empty: string }
  testId?: string
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const isMobile = useIsMobile()
  const all = useRows(chats)
  const current = all.find((r) => r.id === value)
  const rows = narrow?.on ? all.filter((r) => narrow.test(r.id)) : all
  // chats with the same name and title (a new chat takes the card's name): the button also says when and how long, or the
  // three "Aria" chats would look the same once one is picked (#540)
  const twin = !!current && all.some((r) => r.id !== current.id && r.main === current.main && r.own === current.own)
  const shown = current ? null : allLabel && value === null ? allLabel : null
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        data-guide="prompt.chat"
        data-testid={testId}
        aria-label={label ?? t('canvas.prompt.chat')}
        className={cn(
          'flex h-8 w-64 max-w-full min-w-0 items-center gap-2 rounded-md border border-border bg-background px-2 text-left text-sm hover:bg-accent/50',
          className,
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate', !current && !shown && 'text-muted-foreground')}>
          {current ? current.main : shown ?? t('canvas.prompt.pickShort')}
          {current?.own && <span className="text-muted-foreground"> · {current.own}</span>}
          {twin && current?.when && <span className="text-muted-foreground"> · {current.when}</span>}
        </span>
        {current?.group && <UsersThree className="size-3.5 shrink-0 text-muted-foreground" aria-label={t('canvas.prompt.group')} />}
        <CaretUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      {/* a dropdown: above or below the button, never beside it (a list whose height changes as you type or filter jumped to
          the right of the button when neither fitted); the list scrolls inside the room it gets (#540) */}
      <PopoverContent align="start" collisionAvoidance={{ fallbackAxisSide: 'none' }} className="w-[26rem] max-w-[calc(100vw-1.5rem)] gap-0 p-0">
        <Command
          className="max-h-[min(24rem,var(--available-height,24rem))]"
          filter={(_value, search, keywords) => (searchMatches(keywords?.[0] ?? '', search) ? 1 : 0)}
        >
          {/* on a computer typing searches at once; on a phone the keyboard waits for a tap on the box */}
          <CommandInput placeholder={searchPlaceholder ?? t('canvas.prompt.search')} autoFocus={!isMobile} />
          {narrow && (
            <label className="flex min-h-9 cursor-pointer items-center gap-2 border-b border-border px-3 py-1.5 text-sm max-md:min-h-10" data-testid="chat-picker-narrow">
              <Switch size="sm" checked={narrow.on} onCheckedChange={(v) => narrow.onChange(v)} />
              <span className="min-w-0 flex-1">{narrow.label}</span>
            </label>
          )}
          <CommandList>
            <CommandEmpty>{t('canvas.prompt.noChats')}</CommandEmpty>
            {narrow?.on && rows.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground" data-testid="chat-picker-narrow-empty">{narrow.empty}</p>}
            {allLabel && (
              <CommandItem
                value={ALL}
                keywords={[allLabel.toLowerCase()]}
                data-checked={value === null}
                onSelect={() => { setOpen(false); if (value !== null) onAll?.() }}
                className="gap-2 py-1.5 max-md:min-h-10"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{allLabel}</span>
                {note && <span className="shrink-0 text-xs text-muted-foreground">{note(null)}</span>}
              </CommandItem>
            )}
            {rows.map((r) => (
              <CommandItem
                key={r.id}
                value={r.id}
                keywords={[r.search]}
                data-checked={r.id === value}
                onSelect={() => { setOpen(false); if (r.id !== value) onChange(r.id) }}
                className={cn('gap-2 py-1.5', allLabel && 'max-md:min-h-10')}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="min-w-0 truncate text-sm">{r.main}</span>
                    {r.group && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        <UsersThree className="size-3" aria-hidden="true" />{t('canvas.prompt.group')}
                      </span>
                    )}
                  </span>
                  {r.second && <span className="block truncate text-xs text-muted-foreground">{r.second}</span>}
                  {r.preview && <span className="block truncate text-xs text-muted-foreground/80" data-testid="chat-picker-preview">{r.preview}</span>}
                </span>
                {note && <span className="shrink-0 text-xs text-muted-foreground">{note(r.id)}</span>}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
