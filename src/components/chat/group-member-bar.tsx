
import { useState } from 'react'
import { ArrowLeft, ArrowRight, IdentificationCard, SlidersHorizontal, ChatCenteredText, MicrophoneSlash, GearSix, Users } from '@phosphor-icons/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Field, FieldLabel } from '@/components/ui/field'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useApp } from '@/lib/store'
import type { Character, Chat } from '@/lib/types'
import { DEFAULT_AVATAR, cn } from '@/lib/utils'
import { useT } from '@/hooks/use-t'

export function GroupMemberBar({ chat, group }: { chat: Chat; group: Character }) {
  const characters = useApp((s) => s.characters)
  const updateChat = useApp((s) => s.updateChat)
  const triggerMember = useApp((s) => s.triggerMember)
  const reorderGroupMember = useApp((s) => s.reorderGroupMember)
  const openCharacter = useApp((s) => s.openCharacter)
  const setView = useApp((s) => s.setView)
  const [strategyOpen, setStrategyOpen] = useState(false)
  const t = useT()

  const gs = chat.groupSettings ?? { activation: 'natural' as const, generationMode: 'swap' as const, autoMode: false, autoDelaySec: 5, allowSelfResponses: false, muted: [] }
  const byId = new Map(characters.map((c) => [c.id, c]))
  const members = (group.members ?? []).map((id) => byId.get(id)).filter((c): c is Character => Boolean(c))
  const isStreaming = useApp((s) => s.streaming?.chatId === chat.id)

  const toggleMute = (id: string) => {
    const muted = gs.muted.includes(id) ? gs.muted.filter((m) => m !== id) : [...gs.muted, id]
    updateChat(chat.id, { groupSettings: { ...gs, muted } })
  }

  return (
    <div className="relative z-10 flex items-center gap-1 overflow-x-auto border-b border-border bg-card/90 px-2 py-1.5 backdrop-blur">
      <Users className="mx-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      {members.map((m) => {
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
                  {muted && <MicrophoneSlash className="size-3 text-muted-foreground" aria-hidden="true" />}
                </button>
              }
            />
            <PopoverContent className="w-64 p-3" align="start">
              <p className="mb-2 text-sm font-medium">{m.name}</p>
              <div className="flex flex-col gap-3">
                <Field orientation="horizontal">
                  <FieldLabel htmlFor={`mute-${m.id}`}>Muted</FieldLabel>
                  <Switch id={`mute-${m.id}`} checked={muted} onCheckedChange={() => toggleMute(m.id)} />
                </Field>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isStreaming}
                  onClick={() => triggerMember(chat.id, m.id)}
                >
                  <ChatCenteredText className="size-4" aria-hidden="true" /> Trigger reply
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => { openCharacter(m.id); setView('characters') }}
                >
                  <IdentificationCard className="size-4" aria-hidden="true" /> View card
                </Button>
                <div className="flex gap-2">
                  <Button
                    size="sm" variant="ghost" className="flex-1"
                    aria-label={`Move ${m.name} earlier in list order`}
                    onClick={() => reorderGroupMember(group.id, m.id, -1)}
                  >
                    <ArrowLeft className="size-3.5" aria-hidden="true" /> Left
                  </Button>
                  <Button
                    size="sm" variant="ghost" className="flex-1"
                    aria-label={`Move ${m.name} later in list order`}
                    onClick={() => reorderGroupMember(group.id, m.id, 1)}
                  >
                    Right <ArrowRight className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )
      })}
      <div className="ml-auto shrink-0">
        <Popover open={strategyOpen} onOpenChange={setStrategyOpen}>
          <Tooltip>
            <TooltipTrigger
              render={
                <PopoverTrigger
                  render={
                    <Button variant="ghost" size="icon-sm" aria-label="Group strategy settings">
                      <GearSix aria-hidden="true" />
                    </Button>
                  }
                />
              }
            />
            <TooltipContent>Group strategy</TooltipContent>
          </Tooltip>
          <PopoverContent className="w-72 p-3" align="end">
            <p className="mb-2 text-sm font-medium">Reply strategy</p>
            <div className="flex flex-col gap-3">
              <Field>
                <FieldLabel>Activation</FieldLabel>
                <Select
                  value={gs.activation}
                  onValueChange={(v) => v && updateChat(chat.id, { groupSettings: { ...gs, activation: v as never } })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="natural">Natural: whoever you name, else by talkativeness</SelectItem>
                      <SelectItem value="list">List: everyone answers, in order</SelectItem>
                      <SelectItem value="manual">Manual: tap a member to make them speak</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Generation mode</FieldLabel>
                <Select
                  value={gs.generationMode ?? 'swap'}
                  onValueChange={(v) => v && updateChat(chat.id, { groupSettings: { ...gs, generationMode: v as never } })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="swap">Swap character cards (individual turns)</SelectItem>
                      <SelectItem value="append">Join character cards (merged)</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field orientation="horizontal">
                <FieldLabel htmlFor="gs-auto">Auto mode</FieldLabel>
                <Switch
                  id="gs-auto"
                  checked={gs.autoMode}
                  onCheckedChange={(v) => updateChat(chat.id, { groupSettings: { ...gs, autoMode: v } })}
                />
              </Field>
              {gs.autoMode && (
                <Field>
                  <FieldLabel>Auto delay: {gs.autoDelaySec}s</FieldLabel>
                  <Slider
                    value={[gs.autoDelaySec]}
                    min={2}
                    max={30}
                    step={1}
                    onValueChange={(v) => updateChat(chat.id, { groupSettings: { ...gs, autoDelaySec: (Array.isArray(v) ? v[0] : (v as number)) } })}
                  />
                </Field>
              )}
              <Field orientation="horizontal">
                <FieldLabel htmlFor="gs-self">Allow self responses</FieldLabel>
                <Switch
                  id="gs-self"
                  checked={gs.allowSelfResponses}
                  onCheckedChange={(v) => updateChat(chat.id, { groupSettings: { ...gs, allowSelfResponses: v } })}
                />
              </Field>
              <Button
                size="sm" variant="outline" className="w-full"
                onClick={() => { setStrategyOpen(false); openCharacter(group.id); setView('characters') }}
              >
                <SlidersHorizontal className="size-4" aria-hidden="true" /> {t('groups.settings')}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
