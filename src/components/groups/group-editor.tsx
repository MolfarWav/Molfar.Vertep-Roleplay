import { useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Star,
  Chats,
  Info,
  Users,
  ChatCircleDots,
  BookOpenText,
  ArrowsLeftRight,
  Books,
  ChatCircleText,
  CaretUp,
  CaretDown,
  X,
  Plus,
  PencilSimple,
  MagnifyingGlass,
  Trash,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useApp } from '@/lib/store'
import { fileToDataUrl } from '@/lib/engine'
import { DEFAULT_AVATAR, cn } from '@/lib/utils'
import { cardTalkativeness, guessTalkativeness } from '@/lib/talkativeness'
import { useT } from '@/hooks/use-t'
import { CharacterBooks } from '@/components/character/character-books'
import type { Character, Chat, GroupConfig, GroupMemberSettings } from '@/lib/types'

const COLORS = ['#e06c75', '#e5c07b', '#98c379', '#56b6c2', '#61afef', '#c678dd', '#d19a66', '#abb2bf']

function MemberCollage({ members, size = 32, className }: { members: Character[]; size?: number; className?: string }) {
  const shown = members.slice(0, 4)
  return (
    <div
      className={cn('grid grid-cols-2 overflow-hidden rounded-md bg-muted', shown.length > 2 ? 'grid-rows-2' : 'grid-rows-1', className)}
      style={{ width: size, height: size }}
    >
      {shown.map((m, i) => (
        <img
          key={m.id}
          src={m.avatar || DEFAULT_AVATAR}
          alt=""
          className={cn('size-full min-h-0 min-w-0 object-cover', shown.length === 3 && i === 0 && 'row-span-2')}
        />
      ))}
    </div>
  )
}

/** Local value while dragging; one write when the thumb is released. */
function TalkSlider({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [v, setV] = useState(value)
  const num = (x: number | readonly number[]) => (Array.isArray(x) ? x[0] : (x as number)) ?? 0
  return (
    <Slider
      // the group hue, like the member's talkativeness chip
      className="[--primary:var(--group)] [--ring:var(--group)]"
      value={[v]}
      min={0}
      max={1}
      step={0.05}
      onValueChange={(x) => setV(num(x))}
      onValueCommitted={(x) => onCommit(Math.round(num(x) * 100) / 100)}
    />
  )
}

export function GroupEditor({ group, onClose }: { group: Character; onClose: () => void }) {
  const g = group.group!
  const t = useT()

  const characters = useApp((s) => s.characters)
  const chats = useApp((s) => s.chats)
  const updateGroup = useApp((s) => s.updateGroup)
  const updateCharacter = useApp((s) => s.updateCharacter)
  const reorderGroupMember = useApp((s) => s.reorderGroupMember)
  const deleteCharacter = useApp((s) => s.deleteCharacter)
  const startChatAndOpen = useApp((s) => s.startChatAndOpen)
  const openChat = useApp((s) => s.openChat)
  const deleteChat = useApp((s) => s.deleteChat)

  const byId = useMemo(() => new Map(characters.map((c) => [c.id, c])), [characters])
  const members = useMemo(
    () => g.memberIds.map((id) => byId.get(id)).filter((c): c is Character => Boolean(c)),
    [g.memberIds, byId],
  )
  const groupChats = useMemo(
    () =>
      chats
        .filter((ch): ch is Chat => ch.characterId === group.id)
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
    [chats, group.id],
  )

  const fileRef = useRef<HTMLInputElement>(null)

  const [draftName, setDraftName] = useState(group.name)
  const [draftTags, setDraftTags] = useState(() => (g.tags ?? []).join(', '))
  const [draftNote, setDraftNote] = useState(g.note ?? '')
  const [draftScenario, setDraftScenario] = useState(g.scenario ?? '')
  const [draftOpenings, setDraftOpenings] = useState<string[]>(g.openings ?? [])

  const [draftDelay, setDraftDelay] = useState(String(g.autoDelaySec ?? 5))
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [addOpen, setAddOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [warnRemove, setWarnRemove] = useState<string | null>(null)

  const tabs = [
    { id: 'overview', icon: Info, label: t('group.ed.overview') },
    { id: 'members', icon: Users, label: t('group.ed.members') },
    { id: 'scene', icon: BookOpenText, label: t('group.ed.scene') },
    { id: 'turns', icon: ArrowsLeftRight, label: t('group.ed.turns') },
    { id: 'lore', icon: Books, label: t('group.ed.lore') },
    { id: 'chats', icon: ChatCircleText, label: t('group.ed.chats') },
  ]

  const saveName = () => {
    const v = draftName.trim()
    if (!v) {
      setDraftName(group.name)
      return
    }
    if (v !== group.name) {
      updateCharacter(group.id, { name: v })
    }
  }

  const saveTags = () => {
    const arr = draftTags
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const prev = g.tags ?? []
    if (JSON.stringify(arr) !== JSON.stringify(prev)) {
      updateGroup(group.id, { tags: arr })
    }
  }

  const saveNote = () => {
    if (draftNote !== (g.note ?? '')) {
      updateGroup(group.id, { note: draftNote })
    }
  }

  const handlePictureChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const url = await fileToDataUrl(file)
      updateCharacter(group.id, { avatar: url })
    } catch {
      toast.error(t('group.ed.pictureFail'))
    }
    e.target.value = ''
  }

  const toggleFavorite = () => {
    updateCharacter(group.id, { favorite: !group.favorite })
  }

  const patchMemberSetting = (id: string, patch: Partial<GroupMemberSettings>) => {
    const ms = g.memberSettings ?? {}
    updateGroup(group.id, { memberSettings: { ...ms, [id]: { ...ms[id], ...patch } } })
  }

  const resetMemberKey = (id: string, key: keyof GroupMemberSettings) => {
    const ms = { ...(g.memberSettings ?? {}) }
    if (!ms[id]) return
    const copy = { ...ms[id] }
    delete copy[key]
    if (Object.keys(copy).length === 0) {
      delete ms[id]
    } else {
      ms[id] = copy
    }
    updateGroup(group.id, { memberSettings: ms })
  }

  const toggleMute = (id: string) => {
    const muted = g.mutedIds ?? []
    const next = muted.includes(id) ? muted.filter((m) => m !== id) : [...muted, id]
    updateGroup(group.id, { mutedIds: next })
  }

  const removeMember = (id: string) => {
    const nextIds = g.memberIds.filter((m) => m !== id)
    if (nextIds.length < 1) return
    const nextMuted = (g.mutedIds ?? []).filter((m) => m !== id)
    const nextSettings = { ...(g.memberSettings ?? {}) }
    delete nextSettings[id]
    updateGroup(group.id, { memberIds: nextIds, mutedIds: nextMuted, memberSettings: nextSettings })
    setWarnRemove(null)
  }

  const askRemove = (id: string) => {
    if (g.memberIds.length <= 2) {
      setWarnRemove(id)
    } else {
      removeMember(id)
    }
  }

  const addMember = (id: string) => {
    updateGroup(group.id, { memberIds: [...g.memberIds, id] })
    setAddOpen(false)
    setSearch('')
  }

  const saveDelay = () => {
    const n = Math.min(120, Math.max(1, Math.round(Number(draftDelay)) || (g.autoDelaySec ?? 5)))
    setDraftDelay(String(n))
    if (n !== (g.autoDelaySec ?? 5)) updateGroup(group.id, { autoDelaySec: n })
  }

  const saveScenario = () => {
    if (draftScenario !== (g.scenario ?? '')) {
      updateGroup(group.id, { scenario: draftScenario })
    }
  }

  const updateOpeningDraft = (i: number, text: string) => {
    const next = [...draftOpenings]
    next[i] = text
    setDraftOpenings(next)
  }

  /** The server keeps only filled openings; empty rows live in the draft until typed into. */
  const persistOpenings = (drafts: string[]) => {
    const next = drafts.filter((x) => x.trim() !== '')
    if (JSON.stringify(next) !== JSON.stringify(g.openings ?? [])) updateGroup(group.id, { openings: next })
  }

  const saveOpening = () => persistOpenings(draftOpenings)

  const deleteOpening = (i: number) => {
    const drafts = draftOpenings.filter((_, idx) => idx !== i)
    setDraftOpenings(drafts)
    persistOpenings(drafts)
  }

  const addOpening = () => setDraftOpenings([...draftOpenings, ''])

  const greetingLabel = (text: string, index?: number) => {
    const first = text.trim().slice(0, 40).replace(/\s+/g, ' ')
    const suffix = text.trim().length > 40 ? '…' : ''
    if (index === undefined) return t('group.ed.openingFirst', { text: first + suffix })
    return t('group.ed.openingGreeting', { n: index, text: first + suffix })
  }

  const candidates = useMemo(
    () => characters.filter((c) => !c.isGroup && !g.memberIds.includes(c.id)),
    [characters, g.memberIds],
  )
  const filtered = useMemo(
    () => candidates.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())),
    [candidates, search],
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <Button variant="ghost" size="sm" onClick={onClose} aria-label={t('group.ed.back')}>
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Button>

        {g.avatar ? (
          <img src={g.avatar} alt="" className="size-8 rounded-md object-cover" />
        ) : (
          <MemberCollage members={members} size={32} />
        )}

        <h1 className="min-w-0 max-w-40 truncate text-sm font-semibold sm:max-w-xs">{group.name}</h1>

        <Badge variant="secondary">{t('group.ed.membersCount', { n: g.memberIds.length })}</Badge>
        <Badge variant="outline">{t('group.ed.chatsCount', { n: groupChats.length })}</Badge>

        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          <Button variant="ghost" size="sm" onClick={toggleFavorite} aria-pressed={group.favorite}>
            <Star
              weight={group.favorite ? 'fill' : 'regular'}
              className={cn('size-4', group.favorite && 'text-primary')}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">
              {t(group.favorite ? 'group.ed.unfavorite' : 'group.ed.favorite')}
            </span>
          </Button>

          <Button size="sm" onClick={() => void startChatAndOpen(group.id)}>
            <Chats className="size-4" aria-hidden="true" />
            {t('group.ed.chat')}
          </Button>
        </div>
      </header>

      <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
        <div className="max-w-full overflow-x-auto overscroll-x-contain px-3 py-2 no-scrollbar">
          <TabsList className="h-8 w-max flex-nowrap">
            {tabs.map(({ id, icon: Icon, label }) => (
              <TabsTrigger key={id} value={id} className="flex-none gap-1.5 px-2.5 text-xs">
                <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <TabsContent value="overview" className="space-y-4 max-w-3xl px-3 pb-6">
            <div className="flex items-center gap-4">
              {g.avatar ? (
                <img src={g.avatar} alt="" className="size-32 rounded-lg object-cover" />
              ) : (
                <MemberCollage members={members} size={128} className="rounded-lg" />
              )}
              <div className="flex flex-col gap-2">
                <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
                  <PencilSimple className="size-3.5" aria-hidden="true" />
                  {t('group.ed.changePicture')}
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePictureChange}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => updateCharacter(group.id, { avatar: '' })}
                >
                  {t('group.ed.useMemberPortraits')}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="group-name">{t('group.ed.name')}</Label>
              <Input
                id="group-name"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                }}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="group-tags">{t('group.ed.tags')}</Label>
              <Input
                id="group-tags"
                value={draftTags}
                onChange={(e) => setDraftTags(e.target.value)}
                onBlur={saveTags}
                placeholder={t('group.ed.tagsHint')}
              />
              <p className="text-xs text-muted-foreground">{t('group.ed.tagsHint')}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="group-note">{t('group.ed.note')}</Label>
              <Textarea
                id="group-note"
                rows={4}
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                onBlur={saveNote}
              />
              <p className="text-xs text-muted-foreground">{t('group.ed.noteHint')}</p>
            </div>
          </TabsContent>

          <TabsContent value="members" className="space-y-3 max-w-3xl px-3 pb-6">
            <div className="space-y-2">
              {members.map((m, idx) => {
                const id = m.id
                const muted = (g.mutedIds ?? []).includes(id)
                const ms = g.memberSettings?.[id] ?? {}
                const color = ms.color
                // the weight the engine really uses: this group's, else the card's, else a guess from its text
                const ownTalk = cardTalkativeness((m.cardExtras?.extensions as { talkativeness?: unknown } | undefined)?.talkativeness)
                const baseTalk = ownTalk ?? guessTalkativeness(`${m.description}\n${m.personality}`)
                const talk = ms.talkativeness ?? baseTalk
                const isOpen = expanded[id]

                const openingOptions = [
                  { value: 'group', label: t('group.ed.openingGroup') },
                  { value: 'none', label: t('group.ed.openingNone') },
                ]
                if (m.firstMessage) {
                  openingOptions.push({ value: '0', label: greetingLabel(m.firstMessage) })
                }
                m.altGreetings?.forEach((text, i) => {
                  openingOptions.push({ value: String(i + 1), label: greetingLabel(text, i + 1) })
                })

                const openingValue =
                  ms.opening === undefined || ms.opening === 'group'
                    ? 'group'
                    : ms.opening === 'none'
                      ? 'none'
                      : String(ms.opening)

                return (
                  <div key={id} className="rounded-lg border border-border bg-card">
                    <div className="flex items-center gap-2 p-2">
                      <img
                        src={m.avatar || DEFAULT_AVATAR}
                        alt=""
                        className="size-10 rounded-md object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                          <span className="truncate">{m.name}</span>
                          <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-group/15 px-1.5 text-[10px] font-medium tabular-nums text-group" title={t('group.ed.talkativeness')}>
                            <ChatCircleDots className="size-3" weight="fill" aria-hidden="true" />
                            <span className="sr-only">{t('group.ed.talkativeness')}: </span>{Math.round(talk * 100)}%
                          </span>
                        </p>
                        {color ? (
                          <div
                            className="mt-1 h-1.5 w-4 rounded-full"
                            style={{ backgroundColor: color }}
                          />
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={idx === 0}
                          aria-label={t('group.ed.moveUp')}
                          onClick={() => reorderGroupMember(group.id, id, -1)}
                        >
                          <CaretUp className="size-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={idx === members.length - 1}
                          aria-label={t('group.ed.moveDown')}
                          onClick={() => reorderGroupMember(group.id, id, 1)}
                        >
                          <CaretDown className="size-3.5" aria-hidden="true" />
                        </Button>

                        <div className="flex items-center gap-1.5">
                          <Switch
                            id={`mute-${id}`}
                            checked={muted}
                            onCheckedChange={() => toggleMute(id)}
                          />
                          <Label htmlFor={`mute-${id}`} className="sr-only">
                            {t('group.ed.muted')}
                          </Label>
                        </div>

                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={g.memberIds.length === 1}
                          aria-label={t('group.ed.remove')}
                          onClick={() => askRemove(id)}
                        >
                          <X className="size-3.5" aria-hidden="true" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t('group.ed.inThisGroup')}
                          onClick={() => setExpanded((p) => ({ ...p, [id]: !p[id] }))}
                        >
                          {isOpen ? (
                            <CaretUp className="size-3.5" aria-hidden="true" />
                          ) : (
                            <CaretDown className="size-3.5" aria-hidden="true" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="space-y-4 border-t border-border p-3">
                        <p className="text-xs font-medium uppercase text-muted-foreground">
                          {t('group.ed.inThisGroup')}
                        </p>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>{t('group.ed.talkativeness')}</Label>
                            {ms.talkativeness == null ? (
                              <span className="text-xs text-muted-foreground">
                                {t(ownTalk == null ? 'group.ed.guessedValue' : 'group.ed.cardValue')}: <span className="tabular-nums text-foreground">{Math.round(baseTalk * 100)}%</span>
                              </span>
                            ) : (
                              <span className="text-xs tabular-nums">
                                {Math.round(ms.talkativeness * 100)}%
                              </span>
                            )}
                          </div>
                          <TalkSlider
                            key={`${id}-${ms.talkativeness ?? 'card'}`}
                            value={talk}
                            onCommit={(val) => patchMemberSetting(id, { talkativeness: val })}
                          />
                          <p className="text-[11px] leading-snug text-muted-foreground">{t('group.ed.talkHint')}</p>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={ms.talkativeness == null}
                            onClick={() => resetMemberKey(id, 'talkativeness')}
                          >
                            {t('group.ed.useCardValue')}
                          </Button>
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor={`opening-${id}`}>{t('group.ed.opening')}</Label>
                          <Select
                            value={openingValue}
                            onValueChange={(val) => {
                              if (val === 'group') {
                                patchMemberSetting(id, { opening: 'group' })
                              } else if (val === 'none') {
                                patchMemberSetting(id, { opening: 'none' })
                              } else {
                                patchMemberSetting(id, { opening: Number(val) })
                              }
                            }}
                          >
                            <SelectTrigger id={`opening-${id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {openingOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1.5">
                          <Label>{t('group.ed.color')}</Label>
                          <div className="flex flex-wrap items-center gap-2">
                            {COLORS.map((c) => (
                              <button
                                key={c}
                                type="button"
                                aria-label={c}
                                onClick={() => patchMemberSetting(id, { color: c })}
                                className={cn(
                                  'size-6 rounded-full border-2',
                                  color === c ? 'border-foreground' : 'border-transparent',
                                )}
                                style={{ backgroundColor: c }}
                              />
                            ))}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => resetMemberKey(id, 'color')}
                            >
                              {t('group.ed.colorCard')}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger render={<Button size="sm" variant="secondary" />}>
                  <Plus className="size-4" aria-hidden="true" />
                  {t('group.ed.addMember')}
                </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>{t('group.ed.addMember')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="relative">
                    <MagnifyingGlass
                      className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t('group.ed.addMemberSearch')}
                      className="pl-8"
                    />
                  </div>
                  <ScrollArea className="h-64">
                    <div className="space-y-1">
                      {filtered.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => addMember(c.id)}
                          className="flex w-full items-center gap-2 rounded-md p-2 text-left hover:bg-accent"
                        >
                          <img
                            src={c.avatar || DEFAULT_AVATAR}
                            alt=""
                            className="size-8 rounded-md object-cover"
                          />
                          <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                          <Plus className="size-3.5 text-muted-foreground" aria-hidden="true" />
                        </button>
                      ))}
                      {filtered.length === 0 && (
                        <p className="text-sm text-muted-foreground">{t('group.ed.noCharacters')}</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </DialogContent>
            </Dialog>

            <AlertDialog open={warnRemove !== null} onOpenChange={(o) => !o && setWarnRemove(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('group.ed.removeWarningTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('group.ed.removeWarningDesc', {
                      name: members.find((m) => m.id === warnRemove)?.name ?? '',
                    })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('group.ed.cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => warnRemove && removeMember(warnRemove)}>
                    {t('group.ed.confirm')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </TabsContent>

          <TabsContent value="scene" className="space-y-5 max-w-3xl px-3 pb-6">
            <div className="space-y-1.5">
              <Label htmlFor="group-scenario">{t('group.ed.sharedScenario')}</Label>
              <Textarea
                id="group-scenario"
                rows={6}
                value={draftScenario}
                onChange={(e) => setDraftScenario(e.target.value)}
                onBlur={saveScenario}
              />
              <p className="text-xs text-muted-foreground">{t('group.ed.scenarioHint')}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t('group.ed.openings')}</Label>
                <Button size="sm" variant="secondary" onClick={addOpening}>
                  <Plus className="size-3.5" aria-hidden="true" />
                  {t('group.ed.addOpening')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t('group.ed.openingsHint')}</p>

              <div className="space-y-2">
                {draftOpenings.map((text, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Textarea
                      rows={2}
                      value={text}
                      onChange={(e) => updateOpeningDraft(i, e.target.value)}
                      onBlur={saveOpening}
                      aria-label={`${t('group.ed.openings')} ${i + 1}`}
                      className="min-w-0 flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => deleteOpening(i)}
                      aria-label={t('group.ed.remove')}
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button disabled>
                {t('group.ed.generateScene')}
              </Button>
              <Badge variant="outline">{t('group.ed.soon')}</Badge>
            </div>
          </TabsContent>

          <TabsContent value="turns" className="space-y-5 max-w-3xl px-3 pb-6">
            <div className="space-y-1.5">
              <Label htmlFor="generation-mode">{t('group.ed.generationMode')}</Label>
              <Select
                value={g.generationMode ?? 'swap'}
                onValueChange={(v) =>
                  updateGroup(group.id, { generationMode: v as GroupConfig['generationMode'] })
                }
              >
                <SelectTrigger id="generation-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="narrator">{t('group.ed.generationModeNarrator')}</SelectItem>
                  <SelectItem value="swap">{t('group.ed.generationModeSwap')}</SelectItem>
                  <SelectItem value="append">{t('group.ed.generationModeAppend')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <Label htmlFor="color-dialogue" className="mb-0">{t('group.ed.colorDialogue')}</Label>
                <p className="text-xs text-muted-foreground">{t('group.ed.colorDialogueHint')}</p>
              </div>
              <Switch
                id="color-dialogue"
                checked={g.colorDialogue !== false}
                onCheckedChange={(v) => updateGroup(group.id, { colorDialogue: v })}
              />
            </div>

            {g.generationMode !== 'narrator' && (<>
            <div className="space-y-1.5">
              <Label htmlFor="who-answers">{t('group.ed.whoAnswers')}</Label>
              <Select
                value={g.mode ?? 'natural'}
                onValueChange={(v) => updateGroup(group.id, { mode: v as GroupConfig['mode'] })}
              >
                <SelectTrigger id="who-answers">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="natural">{t('group.ed.natural')}</SelectItem>
                  <SelectItem value="list">{t('group.ed.list')}</SelectItem>
                  <SelectItem value="manual">{t('group.ed.manual')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <Label htmlFor="self-responses" className="mb-0">
                {t('group.ed.allowSelfResponses')}
              </Label>
              <Switch
                id="self-responses"
                checked={g.allowSelfResponses ?? false}
                onCheckedChange={(v) => updateGroup(group.id, { allowSelfResponses: v })}
              />
            </div>
            </>)}

            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="auto-mode" className="mb-0">
                  {t('group.ed.autoMode')}
                </Label>
                <Switch
                  id="auto-mode"
                  checked={g.autoMode ?? false}
                  onCheckedChange={(v) => updateGroup(group.id, { autoMode: v })}
                />
              </div>

              {g.autoMode && (
                <div className="space-y-1.5">
                  <Label htmlFor="auto-delay">{t('group.ed.autoDelay')}</Label>
                  <Input
                    id="auto-delay"
                    type="number"
                    min={1}
                    max={120}
                    value={draftDelay}
                    onChange={(e) => setDraftDelay(e.target.value)}
                    onBlur={saveDelay}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    }}
                  />
                  <p className="text-xs text-muted-foreground">{t('group.ed.autoDelayHint')}</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="lore" className="space-y-5 max-w-3xl px-3 pb-6">
            <div className="space-y-2">
              <h3 className="text-sm font-medium">{t('group.ed.ownBooks')}</h3>
              <CharacterBooks c={group} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="member-books">{t('group.ed.membersBooks')}</Label>
              <Select
                value={g.memberBooks ?? 'all'}
                onValueChange={(v) =>
                  updateGroup(group.id, { memberBooks: v as GroupConfig['memberBooks'] })
                }
              >
                <SelectTrigger id="member-books">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('group.ed.membersBooksAll')}</SelectItem>
                  <SelectItem value="speaker">{t('group.ed.membersBooksSpeaker')}</SelectItem>
                  <SelectItem value="off">{t('group.ed.membersBooksOff')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t('group.ed.membersBooksHint')}</p>
            </div>
          </TabsContent>

          <TabsContent value="chats" className="space-y-3 max-w-3xl px-3 pb-6">
            <Button size="sm" onClick={() => void startChatAndOpen(group.id)}>
              <Plus className="size-4" aria-hidden="true" />
              {t('group.ed.newChat')}
            </Button>

            <div className="space-y-2">
              {groupChats.map((ch) => (
                <div
                  key={ch.id}
                  className="flex items-center gap-2 rounded-md border border-border p-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{ch.title || t('group.ed.untitled')}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('group.ed.messageCount', { n: (ch.messages.length || ch.messageCount || 0) })} ·{' '}
                      {ch.updatedAt ? new Date(ch.updatedAt).toLocaleDateString() : ''}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openChat(ch.id)}>
                    {t('group.ed.open')}
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t('group.ed.deleteChat')} />}>
                        <Trash className="size-4 text-destructive" aria-hidden="true" />
                      </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('group.ed.deleteChat')}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('group.ed.deleteChatConfirm')}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('group.ed.cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteChat(ch.id)}>
                          {t('group.ed.confirm')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
              {groupChats.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('group.ed.noChats')}</p>
              )}
            </div>

            <div className="border-t border-border pt-6">
              <AlertDialog>
                <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
                    <Trash className="size-4" aria-hidden="true" />
                    {t('group.ed.deleteGroup')}
                  </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('group.ed.deleteGroupConfirmTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('group.ed.deleteGroupConfirmDesc')}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('group.ed.cancel')}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        deleteCharacter(group.id)
                        onClose()
                      }}
                    >
                      {t('group.ed.confirm')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  )
}
