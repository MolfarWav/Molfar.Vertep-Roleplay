import { useState } from 'react'
import { ArrowLeft, ArrowRight, IdentificationCard, SlidersHorizontal, ChatCenteredText, MicrophoneSlash, ArrowsLeftRight, Users, ArrowCounterClockwise } from '@phosphor-icons/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { useApp } from '@/lib/store'
import type { Character, Chat, ChatTurns } from '@/lib/types'
import { DEFAULT_AVATAR, cn } from '@/lib/utils'
import { useT } from '@/hooks/use-t'

type GroupSettings = NonNullable<Chat['groupSettings']>

/** The chat's settings, or the group's defaults while the chat has none worked out yet. */
function settingsOf(chat: Chat, group: Character): GroupSettings {
  return chat.groupSettings ?? {
    activation: group.group?.mode ?? 'natural', generationMode: group.group?.generationMode ?? 'swap',
    autoMode: group.group?.autoMode ?? false, autoDelaySec: group.group?.autoDelaySec ?? 5,
    allowSelfResponses: group.group?.allowSelfResponses ?? false, muted: group.group?.mutedIds ?? [],
    order: group.members ?? [],
  }
}

/** Only the user picks who speaks (a narrator always answers, so it never waits). */
export function waitsForPick(gs: GroupSettings): boolean {
  return gs.activation === 'manual' && gs.generationMode !== 'narrator'
}

function useMembers(chat: Chat, group: Character) {
  const characters = useApp((s) => s.characters)
  const byId = new Map(characters.map((c) => [c.id, c]))
  const gs = settingsOf(chat, group)
  return gs.order.map((id) => byId.get(id)).filter((c): c is Character => Boolean(c))
}

export function GroupMemberBar({ chat, group }: { chat: Chat; group: Character }) {
  const setChatTurns = useApp((s) => s.setChatTurns)
  const triggerMember = useApp((s) => s.triggerMember)
  const moveChatMember = useApp((s) => s.moveChatMember)
  const openCard = useApp((s) => s.openCard)
  const isStreaming = useApp((s) => s.streaming?.chatId === chat.id)
  const t = useT()

  const gs = settingsOf(chat, group)
  const members = useMembers(chat, group)

  const toggleMute = (id: string) => {
    const muted = gs.muted.includes(id) ? gs.muted.filter((m) => m !== id) : [...gs.muted, id]
    setChatTurns(chat.id, { mutedIds: muted })
  }

  return (
    <div className="relative z-10 flex items-center gap-1 border-b border-border bg-card/90 px-2 py-1.5 backdrop-blur">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        <Users className="mx-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        {members.map((m, i) => {
          const muted = gs.muted.includes(m.id)
          return (
            <Popover key={m.id}>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs transition-colors',
                      muted ? 'border-border opacity-45' : 'border-border hover:bg-accent',
                    )}
                  >
                    <Avatar className="size-6">
                      <AvatarImage src={m.avatar || DEFAULT_AVATAR} alt="" />
                      <AvatarFallback>{m.name.slice(0, 2)}</AvatarFallback>
                    </Avatar>
                    <span className="max-w-24 truncate">{m.name}</span>
                    {muted && <MicrophoneSlash className="size-3 text-muted-foreground" aria-label={t('turns.silent')} />}
                  </button>
                }
              />
              <PopoverContent className="w-64 p-3" align="start">
                <p className="mb-2 text-sm font-medium">{m.name}</p>
                <div className="flex flex-col gap-3">
                  <Field orientation="horizontal">
                    <FieldLabel htmlFor={`mute-${m.id}`}>{t('turns.silent')}</FieldLabel>
                    <Switch id={`mute-${m.id}`} checked={muted} onCheckedChange={() => toggleMute(m.id)} />
                  </Field>
                  <Button size="sm" variant="outline" disabled={isStreaming} onClick={() => triggerMember(chat.id, m.id)}>
                    <ChatCenteredText className="size-4" aria-hidden="true" /> {t('turns.answerNow')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => openCard(m.id)}
                  >
                    <IdentificationCard className="size-4" aria-hidden="true" /> {t('turns.viewCard')}
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      size="sm" variant="ghost" className="flex-1" disabled={i === 0}
                      aria-label={t('turns.moveEarlier', { name: m.name })}
                      onClick={() => moveChatMember(chat.id, m.id, -1)}
                    >
                      <ArrowLeft className="size-3.5" aria-hidden="true" /> {t('turns.left')}
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="flex-1" disabled={i === members.length - 1}
                      aria-label={t('turns.moveLater', { name: m.name })}
                      onClick={() => moveChatMember(chat.id, m.id, 1)}
                    >
                      {t('turns.right')} <ArrowRight className="size-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )
        })}
      </div>
      <TurnsButton chat={chat} gs={gs} onChange={(patch) => setChatTurns(chat.id, patch)} onOpenGroup={() => openCard(group.id)} />
    </div>
  )
}

function TurnsButton({ chat, gs, onChange, onOpenGroup }: {
  chat: Chat; gs: GroupSettings
  onChange: (patch: ChatTurns | null) => void
  onOpenGroup: () => void
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const own = !!chat.turns && Object.keys(chat.turns).length > 0
  const narrator = gs.generationMode === 'narrator'
  const short = narrator ? t('turns.short.narrator') : gs.activation === 'manual' ? t('turns.short.manual') : t('turns.short.each')

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 px-2.5 text-xs" aria-label={`${t('turns.title')}: ${short}${own ? `, ${t('turns.ownShort')}` : ''}`} data-testid="chat-turns">
            <ArrowsLeftRight className="size-3.5" aria-hidden="true" />
            <span className="max-w-28 truncate">{short}</span>
            {own && <span className="size-1.5 shrink-0 rounded-full bg-primary" title={t('turns.ownShort')} aria-hidden="true" />}
          </Button>
        }
      />
      <PopoverContent className="w-80 max-w-[calc(100vw-1rem)] p-3 sm:w-96" align="end">
        <p className="text-sm font-medium">{t('turns.title')}</p>
        <p className="mb-3 mt-0.5 text-xs text-muted-foreground">{own ? t('turns.own') : t('turns.follows')}</p>
        <div className="flex flex-col gap-3">
          <Field>
            <FieldLabel>{t('group.ed.generationMode')}</FieldLabel>
            <Select value={gs.generationMode ?? 'swap'} onValueChange={(v) => v && onChange({ generationMode: v as never })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {(['narrator', 'swap', 'append'] as const).map((v) => (
                    <SelectItem key={v} value={v}>
                      {t(v === 'narrator' ? 'group.ed.generationModeNarrator' : v === 'swap' ? 'group.ed.generationModeSwap' : 'group.ed.generationModeAppend')}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {!narrator && (
            <Field>
              <FieldLabel>{t('group.ed.whoAnswers')}</FieldLabel>
              <Select value={gs.activation} onValueChange={(v) => v && onChange({ mode: v as never })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(['natural', 'list', 'manual'] as const).map((v) => (
                      <SelectItem key={v} value={v}>
                        {t(`group.ed.${v}`)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {gs.activation === 'manual' && <FieldDescription>{t('turns.manualHint')}</FieldDescription>}
            </Field>
          )}
          {!narrator && gs.activation === 'natural' && (
            <SwitchRow id="gs-self" label={t('group.ed.allowSelfResponses')} hint={t('group.ed.allowSelfResponsesHint')}
              checked={gs.allowSelfResponses} onChange={(v) => onChange({ allowSelfResponses: v })} />
          )}
          {!waitsForPick(gs) && (
            <SwitchRow id="gs-auto" label={t('group.ed.autoMode')} hint={t('group.ed.autoModeHint')}
              checked={gs.autoMode} onChange={(v) => onChange({ autoMode: v })} />
          )}
          {gs.autoMode && !waitsForPick(gs) && (
            <Field>
              <FieldLabel>{t('turns.autoDelay', { n: gs.autoDelaySec })}</FieldLabel>
              <Slider
                value={[gs.autoDelaySec]}
                min={2}
                max={30}
                step={1}
                onValueChange={(v) => onChange({ autoDelaySec: Array.isArray(v) ? v[0] : (v as number) })}
              />
            </Field>
          )}
          <div className="flex flex-col gap-1.5 border-t border-border pt-3">
            {own && (
              <Button size="sm" variant="outline" className="w-full" onClick={() => onChange(null)} data-testid="chat-turns-reset">
                <ArrowCounterClockwise className="size-4" aria-hidden="true" /> {t('turns.reset')}
              </Button>
            )}
            <Button size="sm" variant="ghost" className="w-full" onClick={() => { setOpen(false); onOpenGroup() }}>
              <SlidersHorizontal className="size-4" aria-hidden="true" /> {t('turns.editDefaults')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function SwitchRow({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} className="mt-0.5 shrink-0" checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

/** Above the message box in a group where only the user picks who speaks:
 *  one tap makes that member answer. */
export function GroupPicker({ chat, group }: { chat: Chat; group: Character }) {
  const triggerMember = useApp((s) => s.triggerMember)
  const isStreaming = useApp((s) => s.streaming?.chatId === chat.id)
  const t = useT()
  const gs = settingsOf(chat, group)
  const members = useMembers(chat, group).filter((m) => !gs.muted.includes(m.id))
  if (!waitsForPick(gs) || !members.length) return null
  return (
    <div className="px-2">
    <div className="chat-column mb-1.5 flex items-center gap-1.5 overflow-x-auto px-2" data-testid="group-picker">
      <span className="shrink-0 text-xs text-muted-foreground">{t('turns.pick')}</span>
      {members.map((m) => (
        <Button
          key={m.id}
          size="sm"
          variant="outline"
          className="h-9 shrink-0 gap-1.5 rounded-full pl-1 pr-3 text-xs md:h-8"
          disabled={isStreaming}
          aria-label={t('turns.pickAria', { name: m.name })}
          onClick={() => triggerMember(chat.id, m.id)}
        >
          <Avatar className="size-6">
            <AvatarImage src={m.avatar || DEFAULT_AVATAR} alt="" />
            <AvatarFallback>{m.name.slice(0, 2)}</AvatarFallback>
          </Avatar>
          <span className="max-w-28 truncate">{m.name}</span>
        </Button>
      ))}
    </div>
    </div>
  )
}
