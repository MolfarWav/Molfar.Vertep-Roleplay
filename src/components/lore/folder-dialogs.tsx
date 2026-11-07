import { useEffect, useState, type FormEvent } from 'react'
import { Check, FolderSimple, FolderSimplePlus } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useT } from '@/hooks/use-t'
import { FOLDER_NAME_MAX, cleanFolder, resolveFolderName, type FolderInfo } from '@/lib/lore-folders'

/**
 * "Move to folder": the book's folders as a list, "No folder" on top, and a box to start a new one. The same dialog
 * serves the select-several bar and the entry panel. `current` is the folder the entry sits in ('' = none, null =
 * the selected entries are not all in the same one). A typed name an existing folder has (any letter case) joins it.
 */
export function MoveToFolderDialog({ open, onOpenChange, title, folders, current, onPick }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  folders: FolderInfo[]
  current: string | null
  /** '' = no folder */
  onPick: (folder: string) => void
}) {
  const t = useT()
  const [name, setName] = useState('')
  useEffect(() => { if (open) setName('') }, [open])
  const typed = cleanFolder(name)
  const pick = (folder: string) => { onPick(folder); onOpenChange(false) }
  const submit = (ev: FormEvent) => {
    ev.preventDefault()
    if (typed) pick(resolveFolderName(typed, folders.map((f) => f.name)))
  }
  const row = 'w-full justify-start gap-2 max-md:h-10'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80dvh] overflow-y-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t('lore.folder.moveHint')}</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1" data-testid="folder-pick-list">
          <li>
            <Button variant="outline" size="sm" className={row} onClick={() => pick('')} aria-current={current === '' ? 'true' : undefined}>
              <FolderSimple className="size-4 text-muted-foreground" aria-hidden="true" />
              {t('lore.folder.none')}
              {current === '' && <Check className="ml-auto size-4" aria-hidden="true" />}
            </Button>
          </li>
          {folders.map((f) => (
            <li key={f.name}>
              <Button variant="outline" size="sm" className={row} onClick={() => pick(f.name)} aria-current={current === f.name ? 'true' : undefined}>
                <FolderSimple className="size-4 shrink-0" weight="fill" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-left">{f.name}</span>
                <span className="shrink-0 text-caption text-muted-foreground">{f.total}</span>
                {current === f.name && <Check className="size-4 shrink-0" aria-hidden="true" />}
              </Button>
            </li>
          ))}
        </ul>
        <form onSubmit={submit} className="flex items-center gap-2 border-t border-border pt-3">
          <Input
            value={name}
            onChange={(ev) => setName(ev.target.value)}
            maxLength={FOLDER_NAME_MAX}
            placeholder={t('lore.folder.newPlaceholder')}
            aria-label={t('lore.folder.newLabel')}
            className="h-8 min-w-0 flex-1 max-md:h-10"
          />
          <Button type="submit" size="sm" disabled={!typed} className="max-md:h-10">
            <FolderSimplePlus className="size-4" aria-hidden="true" />{t('lore.folder.create')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Rename a folder. A name another folder has joins the two, and the dialog says so. */
export function RenameFolderDialog({ folder, folders, onOpenChange, onRename }: {
  /** the folder being renamed; null = closed */
  folder: string | null
  folders: FolderInfo[]
  onOpenChange: (o: boolean) => void
  onRename: (from: string, to: string) => void
}) {
  const t = useT()
  const [name, setName] = useState('')
  useEffect(() => { if (folder !== null) setName(folder) }, [folder])
  const typed = cleanFolder(name)
  const target = folder === null ? '' : resolveFolderName(typed, folders.map((f) => f.name))
  const merges = folder !== null && typed !== '' && target !== folder && folders.some((f) => f.name === target)
  const submit = (ev: FormEvent) => {
    ev.preventDefault()
    if (folder === null || !typed) return
    if (target !== folder) onRename(folder, target)
    onOpenChange(false)
  }
  return (
    <Dialog open={folder !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle>{t('lore.folder.renameTitle', { name: folder ?? '' })}</DialogTitle>
          </DialogHeader>
          <Input
            value={name}
            onChange={(ev) => setName(ev.target.value)}
            maxLength={FOLDER_NAME_MAX}
            aria-label={t('lore.folder.newLabel')}
            className="max-md:h-10"
            autoFocus
          />
          {merges && <p className="text-caption text-muted-foreground">{t('lore.folder.mergeNote', { name: target })}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" className="max-md:h-10" onClick={() => onOpenChange(false)}>{t('lore.folder.cancel')}</Button>
            <Button type="submit" disabled={!typed} className="max-md:h-10">{t('lore.folder.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** "New folder": a name, and the folder exists (empty) until entries are moved in. A name a folder already has opens
 *  that one instead of making a second. */
export function NewFolderDialog({ open, onOpenChange, existing, onCreate }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  existing: string[]
  onCreate: (name: string) => void
}) {
  const t = useT()
  const [name, setName] = useState('')
  useEffect(() => { if (open) setName('') }, [open])
  const typed = cleanFolder(name)
  const submit = (ev: FormEvent) => {
    ev.preventDefault()
    if (!typed) return
    onCreate(resolveFolderName(typed, existing))
    onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle>{t('lore.folder.newTitle')}</DialogTitle>
            <DialogDescription>{t('lore.folder.newHint')}</DialogDescription>
          </DialogHeader>
          <Input
            value={name}
            onChange={(ev) => setName(ev.target.value)}
            maxLength={FOLDER_NAME_MAX}
            placeholder={t('lore.folder.newPlaceholder')}
            aria-label={t('lore.folder.newLabel')}
            className="max-md:h-10"
            autoFocus
          />
          <DialogFooter>
            <Button type="button" variant="outline" className="max-md:h-10" onClick={() => onOpenChange(false)}>{t('lore.folder.cancel')}</Button>
            <Button type="submit" disabled={!typed} className="max-md:h-10">{t('lore.folder.createEmpty')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
