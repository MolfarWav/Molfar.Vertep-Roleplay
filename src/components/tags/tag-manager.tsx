import { useState } from 'react'
import { Trash } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useT } from '@/hooks/use-t'
import { useApp } from '@/lib/store'
import type { Tag } from '@/lib/types'

/** The tag manager: colour, visibility, "folder" and a name per tag, new tags and delete.
 *  Characters and Personas use the same dialog over their own tag list (`scope`), so a tag
 *  made in one section never shows up in the other. `tags` is already that section's list;
 *  `usage` says how many cards carry a tag. */
export function TagManager({ open, onOpenChange, tags, usage, scope }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  tags: Tag[]
  usage: (name: string) => number
  scope?: 'persona'
}) {
  const updateTag = useApp((s) => s.updateTag)
  const addTag = useApp((s) => s.addTag)
  const deleteTag = useApp((s) => s.deleteTag)
  const tr = useT()
  const [newName, setNewName] = useState('')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tag manager</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New tag name" aria-label="New tag name" className="h-8" />
          <Button size="sm" onClick={() => { if (newName.trim()) { addTag(newName.trim(), scope); setNewName('') } }}>Add</Button>
        </div>
        <p className="text-xs text-muted-foreground">{tr(scope === 'persona' ? 'personas.tag.folderHint' : 'chars.tag.folderHint')}</p>
        <ul className="flex flex-col gap-1.5">
          {[...tags].sort((a, b) => a.order - b.order).map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border px-2 py-1.5">
              <Input
                value={t.name}
                onChange={(e) => updateTag(t.id, { name: e.target.value })}
                className="h-7 w-32 text-xs"
                aria-label={`Rename tag ${t.name}`}
              />
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                bg
                <input type="color" value={t.color} onChange={(e) => updateTag(t.id, { color: e.target.value })} aria-label={`${t.name} background color`} className="size-6 cursor-pointer rounded border-0 bg-transparent p-0" />
              </label>
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                text
                <input type="color" value={t.textColor} onChange={(e) => updateTag(t.id, { textColor: e.target.value })} aria-label={`${t.name} text color`} className="size-6 cursor-pointer rounded border-0 bg-transparent p-0" />
              </label>
              <span className="ml-auto text-[11px] text-muted-foreground">{usage(t.name)}</span>
              <Switch checked={t.visible} onCheckedChange={(v) => updateTag(t.id, { visible: v })} aria-label={`Toggle visibility of ${t.name}`} />
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground max-md:min-h-10">
                {tr('chars.tag.folder')}
                <Checkbox checked={t.asFolder} onCheckedChange={(v) => updateTag(t.id, { asFolder: !!v })} aria-label={tr(scope === 'persona' ? 'personas.tag.folderAria' : 'chars.tag.folderAria', { name: t.name })} />
              </label>
              <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => deleteTag(t.id)} aria-label={`Delete tag ${t.name}`}>
                <Trash className="size-3.5" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
