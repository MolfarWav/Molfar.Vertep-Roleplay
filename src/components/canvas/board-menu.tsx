import { useMemo, useState } from 'react'
import { Check, PencilSimple, Plus, Stack, Trash } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useConfirm } from '@/components/ui/confirm'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { useApp } from '@/lib/store'
import {
  BOARD_NAME_MAX, MAX_BOARDS, allBoards, boardsOf, deleteBoard, renameBoard, startBoard, switchBoard, toSettings,
  type BoardsState,
} from '@/canvas-kit/boards/saved-boards'

const newId = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/**
 * The Chat links board's named boards: a button with the name of the board on screen that opens the list.
 * A board is a picture (which chats, where); the links between chats are shared by all of them. Edits go to
 * the board on screen, so there is nothing to save: "New board" sets an empty one beside the old one.
 */
export function BoardMenu({ onChanged }: { onChanged: () => void }) {
  const t = useT()
  const [confirm, confirmDialog] = useConfirm()
  const canvasBoard = useApp((s) => s.settings.canvasBoard)
  const canvasBoards = useApp((s) => s.settings.canvasBoards)
  const updateSettings = useApp((s) => s.updateSettings)
  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [newName, setNewName] = useState('')

  const mainName = t('canvas.saved.main')
  const state = useMemo(() => boardsOf(canvasBoard, canvasBoards, mainName), [canvasBoard, canvasBoards, mainName])
  const rows = allBoards(state)
  const full = rows.length >= MAX_BOARDS

  const apply = (next: BoardsState) => {
    updateSettings(toSettings(next))
    onChanged()
  }

  const commitRename = (id: string) => {
    setRenaming(null)
    if (draft.trim()) updateSettings(toSettings(renameBoard(state, id, draft)))
  }

  const create = () => {
    if (full) return
    apply(startBoard(state, newName, newId))
    setNewName('')
    setOpen(false)
    toast(t('canvas.saved.started'))
  }

  return (
    <>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setRenaming(null) }}>
        <PopoverTrigger
          data-guide="canvas.saved"
          aria-label={t('canvas.saved.menu')}
          title={t('canvas.saved.menu')}
          className="flex h-8 max-w-52 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-sm hover:bg-accent/50"
        >
          <Stack className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 truncate">{state.active.name}</span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 gap-3 p-3">
          <p className="text-xs text-muted-foreground">{t('canvas.saved.hint')}</p>
          <ul className="flex max-h-64 flex-col gap-1 overflow-auto" aria-label={t('canvas.saved.menu')}>
            {rows.map((b) => (
              <li key={b.id} className="flex items-center gap-1">
                {renaming === b.id ? (
                  <Input
                    autoFocus
                    value={draft}
                    maxLength={BOARD_NAME_MAX}
                    aria-label={t('canvas.saved.rename')}
                    className="h-9 flex-1"
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => commitRename(b.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(b.id)
                      if (e.key === 'Escape') setRenaming(null)
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    aria-current={b.isActive ? 'true' : undefined}
                    className={cn(
                      'flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent/60',
                      b.isActive && 'bg-accent font-semibold',
                    )}
                    onClick={() => {
                      if (b.isActive) return setOpen(false)
                      apply(switchBoard(state, b.id))
                      setOpen(false)
                    }}
                  >
                    <Check className={cn('size-4 shrink-0', !b.isActive && 'opacity-0')} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{b.name}</span>
                    <span className="shrink-0 text-xs font-normal text-muted-foreground">{t('canvas.saved.count', { n: b.placed.length })}</span>
                  </button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  aria-label={`${t('canvas.saved.rename')}: ${b.name}`}
                  title={t('canvas.saved.rename')}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setRenaming(b.id); setDraft(b.name) }}
                >
                  <PencilSimple className="size-4" />
                </Button>
                {!b.isActive && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9"
                    aria-label={`${t('canvas.saved.delete')}: ${b.name}`}
                    title={t('canvas.saved.delete')}
                    onClick={async () => {
                      const ok = await confirm({
                        title: t('canvas.saved.deleteTitle', { name: b.name }),
                        description: t('canvas.saved.deleteBody'),
                        actionLabel: t('canvas.saved.delete'),
                      })
                      if (ok) updateSettings(toSettings(deleteBoard(state, b.id)))
                    }}
                  >
                    <Trash className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <form
            className="flex items-center gap-2 border-t border-border pt-3"
            onSubmit={(e) => { e.preventDefault(); create() }}
          >
            <Input
              value={newName}
              maxLength={BOARD_NAME_MAX}
              placeholder={t('canvas.saved.newName')}
              aria-label={t('canvas.saved.newName')}
              className="h-9 flex-1"
              disabled={full}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Button type="submit" size="sm" className="h-9" disabled={full} title={full ? t('canvas.saved.full', { n: MAX_BOARDS }) : undefined}>
              <Plus className="mr-1 size-4" />
              {t('canvas.saved.new')}
            </Button>
          </form>
        </PopoverContent>
      </Popover>
      {confirmDialog}
    </>
  )
}
