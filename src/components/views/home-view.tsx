
import { useMemo } from 'react'
import { Sparkle, Chats, Plus, Trophy, TrendUp, Star } from '@phosphor-icons/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useApp } from '@/lib/store'
import { cleanPreview } from '@/lib/preview'
import { timeAgo } from '@/lib/tokens'
import type { Achievement } from '@/lib/types'
import { toast } from 'sonner'
import { DEFAULT_AVATAR } from '@/lib/utils'

export function HomeView() {
  const characters = useApp((s) => s.characters)
  const chats = useApp((s) => s.chats)
  const lorebooks = useApp((s) => s.lorebooks)
  const openChat = useApp((s) => s.openChat)
  const startChatAndOpen = useApp((s) => s.startChatAndOpen)
  const setView = useApp((s) => s.setView)
  const openCharacter = useApp((s) => s.openCharacter)
  const updateCharacter = useApp((s) => s.updateCharacter)

  const recentByChar = useMemo(() => {
    const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt)
    const groups = new Map<string, typeof sorted>()
    for (const c of sorted) {
      const arr = groups.get(c.characterId) ?? []
      if (arr.length < 2) arr.push(c)
      groups.set(c.characterId, arr)
    }
    return [...groups.entries()].slice(0, 4)
  }, [chats])

  const cotd = useMemo(() => {
    const solo = characters.filter((c) => !c.isGroup)
    return solo[new Date().getDate() % Math.max(1, solo.length)]
  }, [characters])

  // Everything here comes off the chat list metas. Transcripts are not loaded
  // at boot any more, and the home screen is not worth reading every one back
  // to fill in a stat card.
  const stats = useMemo(() => {
    const size = (c: (typeof chats)[number]) => c.messageCount ?? c.messages.length
    return {
      messages: chats.reduce((n, c) => n + size(c), 0),
      longest: chats.reduce((n, c) => Math.max(n, size(c)), 0),
      chats: chats.length,
    }
  }, [chats])

  // Achievements are DERIVED from real usage — no seeded unlock states.
  const achievements = useMemo<Achievement[]>(() => {
    // Only what the list metas can answer. The four that needed every
    // transcript (words written, swipes, 3am activity, translations) went with
    // the boot payload that used to carry them.
    const firstContact = chats.some((c) => c.hasUser === true)
    const branching = chats.some((c) => c.parentChatId)
    const archivist = lorebooks.some((b) => b.entries.length >= 20)
    const marathon = stats.longest >= 500
    const puppeteer = characters.some((c) => c.isGroup && (c.members?.length ?? 0) >= 3)
    const list: [string, string, boolean][] = [
      ['First Contact', 'Send your first message', firstContact],
      ['Branching Out', 'Create your first branch', branching],
      ['Archivist', 'Create a lorebook with 20+ entries', archivist],
      ['Puppeteer', 'Run a group chat with 3+ members', puppeteer],
      ['Marathon', 'A single chat with 500 messages', marathon],
    ]
    return list.map(([name, description, unlocked], i) => ({ id: `ach_${i}`, name, description, icon: '', unlocked }))
  }, [stats, chats, lorebooks, characters])

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Chrysalis</h1>
            <p className="text-sm text-muted-foreground">Pick up a thread, or start a new one.</p>
          </div>
          <Button onClick={() => setView('characters')}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            New chat
          </Button>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          {cotd && (
            <Card className="md:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Sparkle className="size-4 text-primary" aria-hidden="true" />
                  Character of the day
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-2 text-center">
                <Avatar className="size-20 rounded-lg">
                  <AvatarImage src={cotd.avatar || DEFAULT_AVATAR} alt={cotd.name} />
                  <AvatarFallback>{cotd.name.slice(0, 2)}</AvatarFallback>
                </Avatar>
                <p className="font-medium">{cotd.name}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{cotd.description}</p>
                <Button size="sm" variant="outline" onClick={() => void startChatAndOpen(cotd.id)}>
                  Start chatting
                </Button>
              </CardContent>
            </Card>
          )}

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendUp className="size-4 text-primary" aria-hidden="true" />
                Your stats
              </CardTitle>
              <CardDescription>Across all chats and characters</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Messages" value={stats.messages.toLocaleString()} />
                <Stat label="Chats" value={stats.chats.toLocaleString()} />
                <Stat label="Characters" value={characters.length.toLocaleString()} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {achievements.filter((a) => a.unlocked).slice(0, 6).map((a) => (
                  <Badge key={a.id} variant="secondary" className="gap-1">
                    <Trophy className="size-3 text-primary" aria-hidden="true" />
                    {a.name}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <section aria-label="Quick load">
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Quick load</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {characters.slice(0, 6).map((c) => (
              <DropdownMenu key={c.id}>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      className="group flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card p-2 transition-colors hover:border-primary/50"
                    >
                      <Avatar className="size-12 rounded-md">
                        <AvatarImage src={c.avatar || DEFAULT_AVATAR} alt="" />
                        <AvatarFallback>{c.name.slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <span className="w-full truncate text-center text-xs">{c.name}</span>
                    </button>
                  }
                />
                <DropdownMenuContent>
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => void startChatAndOpen(c.id)}>New chat</DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        const latest = [...chats].filter((x) => x.characterId === c.id).sort((a, b) => b.updatedAt - a.updatedAt)[0]
                        if (latest) openChat(latest.id)
                        else void startChatAndOpen(c.id)
                      }}
                    >
                      Continue latest
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { openCharacter(c.id); setView('characters') }}>View card</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => {
                      updateCharacter(c.id, { favorite: !c.favorite })
                      toast.success(c.favorite ? `${c.name} removed from favorites` : `${c.name} favorited`)
                    }}>
                      <Star className="size-4" aria-hidden="true" />
                      {c.favorite ? 'Unfavorite' : 'Favorite'}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ))}
          </div>
        </section>

        <section aria-label="Recent chats">
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Recent chats</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {recentByChar.map(([charId, charChats]) => {
              const char = characters.find((c) => c.id === charId)
              if (!char) return null
              return (
                <Card key={charId} className="gap-2 py-4">
                  <CardHeader className="px-4">
                    <div className="flex items-center gap-2">
                      <Avatar className="size-8 rounded-md">
                        <AvatarImage src={char.avatar || DEFAULT_AVATAR} alt="" />
                        <AvatarFallback>{char.name.slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <CardTitle className="text-sm">{char.name}</CardTitle>
                      {char.isGroup && <Badge variant="outline">group</Badge>}
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-1 px-4">
                    {charChats.map((chat) => {
                      const lastMsg = chat.messages[chat.messages.length - 1]
                      // unloaded transcript: the list meta's preview stands in
                      const lastText = lastMsg?.swipes[lastMsg.activeSwipe]?.content ?? chat.preview ?? ''
                      return (
                        <button
                          key={chat.id}
                          type="button"
                          onClick={() => openChat(chat.id)}
                          className="flex flex-col gap-0.5 rounded-md p-2 text-left transition-colors hover:bg-accent"
                        >
                          <span className="flex items-center gap-2 text-xs font-medium">
                            <Chats className="size-3 text-muted-foreground" aria-hidden="true" />
                            {chat.title}
                            <span className="ml-auto text-[10px] text-muted-foreground">{timeAgo(chat.updatedAt)}</span>
                          </span>
                          <span className="line-clamp-1 text-xs text-muted-foreground">
                            {cleanPreview(lastText, 90)}
                          </span>
                        </button>
                      )
                    })}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>

      </div>
    </ScrollArea>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
