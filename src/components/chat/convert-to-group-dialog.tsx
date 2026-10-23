
import { useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useApp } from '@/lib/store'
import type { Chat, Character } from '@/lib/types'
import { toast } from 'sonner'
import { DEFAULT_AVATAR } from '@/lib/utils'
import { useT } from '@/hooks/use-t'

export function ConvertToGroupDialog({
  chat, character, open, onOpenChange,
}: { chat: Chat; character: Character; open: boolean; onOpenChange: (o: boolean) => void }) {
  const characters = useApp((s) => s.characters)
  const convertToGroup = useApp((s) => s.convertToGroup)
  const openCard = useApp((s) => s.openCard)
  const t = useT()
  const [selected, setSelected] = useState<string[]>([])

  const candidates = characters.filter((c) => !c.isGroup && c.id !== character.id)

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const convert = () => {
    const picked = selected
    onOpenChange(false)
    setSelected([])
    void convertToGroup(chat.id, picked).then((gid) => {
      if (!gid) return
      toast.success('Converted to group chat', {
        action: { label: t('groups.editGroup'), onClick: () => openCard(gid) },
      })
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Convert to group chat</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {character.name} stays in the group; pick who joins. Chat history is preserved.
        </p>
        <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {candidates.map((c) => (
            <label key={c.id} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent">
              <Checkbox checked={selected.includes(c.id)} onCheckedChange={() => toggle(c.id)} aria-label={`Add ${c.name}`} />
              <Avatar className="size-7">
                <AvatarImage src={c.avatar || DEFAULT_AVATAR} alt="" />
                <AvatarFallback>{c.name.slice(0, 2)}</AvatarFallback>
              </Avatar>
              <span className="truncate text-sm">{c.name}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={selected.length === 0} onClick={convert}>
            Convert ({selected.length + 1} members)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
