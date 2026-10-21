// "Add from existing": pictures that already sit in other folders (other worlds' chats, the general
// backgrounds library) are copied into this folder. The file is shared, only the library entry is new,
// so deleting one copy never touches the other.

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Check } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useT } from '@/hooks/use-t'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { copiesInto, existingGroups } from '@/lib/world-backgrounds'

export function AddExistingDialog({ open, onOpenChange, folderId, folderName }: { open: boolean; onOpenChange: (o: boolean) => void; folderId: string; folderName: string }) {
  const t = useT()
  const backgrounds = useApp((s) => s.backgrounds)
  const folders = useApp((s) => s.folders)
  const addBackground = useApp((s) => s.addBackground)
  const updateBackground = useApp((s) => s.updateBackground)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())

  // a fresh pick each time the dialog opens
  useEffect(() => {
    if (open) { setQuery(''); setPicked(new Set()) }
  }, [open])

  const noFolder = t('world.bg.existingNoFolder')
  const groups = useMemo(() => existingGroups(backgrounds, folders, folderId, query, noFolder), [backgrounds, folders, folderId, query, noFolder])
  const anyElsewhere = useMemo(() => existingGroups(backgrounds, folders, folderId, '', '').length > 0, [backgrounds, folders, folderId])

  const toggle = (id: string) => setPicked((p) => {
    const n = new Set(p)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })

  const add = () => {
    const items = backgrounds.filter((b) => picked.has(b.id))
    const copies = copiesInto(items, backgrounds, folderId)
    for (const c of copies) {
      const id = addBackground(c.name, c.url)
      updateBackground(id, { folderId, fitting: c.fitting, ...(c.tags ? { tags: c.tags } : {}) })
    }
    toast.success(t('world.bg.existingAdded', { n: copies.length, folder: folderName }))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-2xl" data-testid="bg-existing-dialog">
        <DialogHeader>
          <DialogTitle>{t('world.bg.existingTitle')}</DialogTitle>
          <DialogDescription>{t('world.bg.existingHint')}</DialogDescription>
        </DialogHeader>
        {!anyElsewhere ? (
          <p className="py-6 text-sm text-muted-foreground">{t('world.bg.existingNone')}</p>
        ) : (
          <>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('world.bg.existingSearch')}
              aria-label={t('world.bg.existingSearch')}
              className="h-10 md:h-9"
            />
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1" data-testid="bg-existing-list">
              {groups.length === 0 && <p className="text-sm text-muted-foreground">{t('world.bg.existingNoMatch')}</p>}
              {groups.map((g) => (
                <section key={g.folderId ?? 'none'} className="flex flex-col gap-2">
                  <h4 className="text-xs font-medium text-muted-foreground">{g.name} ({g.items.length})</h4>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {g.items.map((b) => {
                      const on = picked.has(b.id)
                      return (
                        <button
                          key={b.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggle(b.id)}
                          title={b.name}
                          className={cn(
                            'group relative flex flex-col overflow-hidden rounded-md border text-left',
                            on ? 'border-primary ring-2 ring-primary' : 'border-border hover:border-muted-foreground',
                          )}
                        >
                          <span className="aspect-video w-full bg-cover bg-center" style={{ backgroundImage: `url(${b.url})` }} aria-hidden="true" />
                          <span className="truncate px-2 py-1 text-xs">{b.name}</span>
                          {on && (
                            <span className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-hidden="true">
                              <Check className="size-3.5" weight="bold" />
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" className="max-md:h-10" onClick={() => onOpenChange(false)}>{t('world.bg.existingCancel')}</Button>
          <Button className="max-md:h-10" disabled={picked.size === 0} onClick={add} data-testid="bg-existing-add">
            {t('world.bg.existingAdd', { n: picked.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
