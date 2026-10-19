// "New chat in this world": pick the character, make the chat with a copy of the world, then the opening dialog.

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useT } from '@/hooks/use-t'
import { useApp } from '@/lib/store'

export type WorldSource = { worldId: string } | { fromChatId: string }

/** The character a chat in `chatId`'s world starts with by default: that chat's own (a group chat uses its group). */
export function useChatCharacterId(chatId: string | null | undefined): string | null {
  return useApp((s) => (chatId ? s.chats.find((c) => c.id === chatId)?.characterId ?? null : null))
}

export function NewWorldChatDialog({ open, onOpenChange, source, defaultCharId, onCreate }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  source: WorldSource
  defaultCharId: string | null
  /** called when the chat is about to be made (the chat's sheet closes itself) */
  onCreate?: () => void
}) {
  const t = useT()
  const characters = useApp((s) => s.characters)
  const startChatWith = useApp((s) => s.startChatWith)
  // single characters, plus the source chat's own group (a group chat may start another group chat)
  const options = useMemo(() => characters.filter((c) => !c.isGroup || c.id === defaultCharId), [characters, defaultCharId])
  const [charId, setCharId] = useState<string>('')
  useEffect(() => {
    if (!open) return
    setCharId(options.some((c) => c.id === defaultCharId) ? (defaultCharId as string) : options[0]?.id ?? '')
  }, [open, defaultCharId, options])

  const create = () => {
    if (!charId) return
    onOpenChange(false)
    onCreate?.()
    void startChatWith(charId, 0, { world: source })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="new-world-chat">
        <DialogHeader>
          <DialogTitle>{t('world.newchat.title')}</DialogTitle>
          <DialogDescription>{t('world.newchat.lead')}</DialogDescription>
        </DialogHeader>
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('world.newchat.none')}</p>
        ) : (
          <div className="flex flex-col gap-1.5 text-sm">
            <span id="new-world-char" className="font-medium">{t('world.newchat.char')}</span>
            <Select value={charId} onValueChange={(v) => v && setCharId(v)}>
              <SelectTrigger aria-labelledby="new-world-char" className="h-10 w-full md:h-9" data-testid="new-world-char">
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {options.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" className="max-md:h-10" onClick={() => onOpenChange(false)}>{t('home.cancel')}</Button>
          <Button type="button" className="max-md:h-10" disabled={!charId} onClick={create} data-testid="new-world-chat-create">{t('world.newchat.create')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
