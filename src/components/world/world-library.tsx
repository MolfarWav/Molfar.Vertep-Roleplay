// The Worlds tab: a master-detail library of saved worlds. Players can store the
// current chat's world, rename or delete stored copies, and start a new chat
// from any saved world.

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CircleNotch, Plus, Trash, WarningCircle } from '@phosphor-icons/react'
import { create } from 'zustand'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { useRelativeTime, useT } from '@/hooks/use-t'
import { ApiError } from '@/lib/engine'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import {
  deleteSavedWorld,
  listLibrary,
  renameSavedWorld,
  saveWorldToLibrary,
  type BuildingWorld,
  type SavedWorld,
} from '@/lib/world'
import { LevelChip } from './world-common'
import { WorldBackgrounds } from './world-backgrounds'

interface SavedWorldsState {
  list: SavedWorld[] | null | 'missing'
  /** worlds being built without a chat (their draft not yet accepted) */
  building: BuildingWorld[]
  error: string
  setList: (list: SavedWorld[] | null | 'missing') => void
  setBuilding: (building: BuildingWorld[]) => void
  setError: (error: string) => void
}

export const useSavedWorlds = create<SavedWorldsState>((set) => ({
  list: null,
  building: [],
  error: '',
  setList: (list) => set({ list }),
  setBuilding: (building) => set({ building }),
  setError: (error) => set({ error }),
}))

/** The id the Worlds tab selects for the "New world" form. */
export const NEW_WORLD = '__new_world__'

export async function refreshSavedWorlds(): Promise<void> {
  try {
    const lib = await listLibrary()
    useSavedWorlds.setState({ list: lib === null ? 'missing' : lib.worlds, building: lib?.building ?? [], error: '' })
  } catch (e) {
    useSavedWorlds.getState().setList(null)
    useSavedWorlds.getState().setError(e instanceof Error ? e.message : String(e))
  }
}

export function WorldList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const t = useT()
  const relative = useRelativeTime()
  const { list, building, error } = useSavedWorlds()

  useEffect(() => {
    void refreshSavedWorlds()
  }, [])

  if (error) {
    return (
      <div className="p-4 text-sm text-destructive">
        {t('world.list.loadError', { error })}
      </div>
    )
  }

  if (list === null) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {t('chats.panel.loading')}
      </div>
    )
  }

  if (list === 'missing') {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {t('world.missing')}
      </div>
    )
  }

  const row = (selected: boolean) =>
    cn(
      'flex min-h-12 flex-col items-start gap-0.5 rounded-md border border-transparent px-3 py-2 text-left text-sm transition-colors',
      selected ? 'bg-accent' : 'hover:bg-accent/50',
    )

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-1 p-2">
        <Button
          variant={selectedId === NEW_WORLD ? 'secondary' : 'outline'}
          className="mb-1 justify-start max-md:h-11"
          aria-current={selectedId === NEW_WORLD ? 'true' : undefined}
          onClick={() => onSelect(NEW_WORLD)}
          data-testid="new-world"
        >
          <Plus className="size-4" aria-hidden="true" />
          {t('world.new.button')}
        </Button>

        {building.length > 0 && (
          <>
            <h3 className="px-3 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('world.new.building')}</h3>
            {building.map((w) => {
              const selected = selectedId === w.id
              return (
                <button
                  key={w.id}
                  type="button"
                  data-testid="building-world"
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => onSelect(w.id)}
                  className={row(selected)}
                >
                  <span className="w-full truncate font-medium">{w.name}</span>
                  <span className={cn('flex items-center gap-1 text-xs', w.error ? 'text-destructive' : 'text-muted-foreground')}>
                    {w.error ? <WarningCircle className="size-3.5" aria-hidden="true" /> : w.done < w.total ? <CircleNotch className="size-3.5" aria-hidden="true" /> : null}
                    {w.error
                      ? t('world.new.stepFailed')
                      : w.done < w.total
                        ? t('world.new.steps', { done: w.done, total: w.total })
                        : t('world.new.toReview')}
                  </span>
                </button>
              )
            })}
            {list.length > 0 && <h3 className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('world.lib.title')}</h3>}
          </>
        )}

        {list.length === 0 && building.length === 0 && (
          <p className="px-3 py-2 text-sm text-muted-foreground">{t('world.lib.empty')}</p>
        )}

        {list.map((w) => {
          const selected = selectedId === w.id
          return (
            <button
              key={w.id}
              type="button"
              data-testid="saved-world"
              aria-current={selected ? 'true' : undefined}
              onClick={() => onSelect(w.id)}
              className={row(selected)}
            >
              <span className="w-full truncate font-medium">{w.name}</span>
              <span className="text-xs text-muted-foreground">
                {t('world.lib.counts', {
                  r: w.records,
                  f: w.fronts,
                  d: w.deck,
                })}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {w.from
                  ? `${t('world.lib.from', { chat: w.from.title })} · ${relative(w.at)}`
                  : relative(w.at)}
              </span>
            </button>
          )
        })}
      </div>
    </ScrollArea>
  )
}

export function WorldDetail({
  world,
  onNewChat,
  onGone,
  onOpenSettings,
}: {
  world: SavedWorld
  onNewChat: (w: SavedWorld) => void
  onGone: () => void
  onOpenSettings?: () => void
}) {
  const t = useT()
  const [confirm, confirmDialog] = useConfirm()
  const [name, setName] = useState(world.name)
  const [description, setDescription] = useState(world.description)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setName(world.name)
    setDescription(world.description)
  }, [world.id, world.name, world.description])

  const changed =
    name.trim() !== world.name.trim() ||
    description.trim() !== world.description.trim()
  const canSave = changed && name.trim() !== ''

  const handleSave = async () => {
    setBusy(true)
    try {
      const updated = await renameSavedWorld(world.id, {
        name: name.trim(),
        description: description.trim(),
      })
      useSavedWorlds.getState().setList(updated)
      toast.success(t('world.lib.saved'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (
      !(await confirm({
        title: t('world.lib.deleteTitle', { name: world.name }),
        description: t('world.lib.deleteWarn'),
        actionLabel: t('world.lib.delete'),
        destructive: true,
      }))
    ) {
      return
    }
    setBusy(true)
    try {
      const updated = await deleteSavedWorld(world.id)
      useSavedWorlds.getState().setList(updated)
      onGone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="font-heading text-xl">{world.name}</h2>
        <Button
          data-testid="world-new-chat"
          onClick={() => onNewChat(world)}
          disabled={busy}
          className="max-md:h-10"
        >
          {t('world.lib.newChat')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>
          {t('world.lib.stats', {
            r: world.records,
            f: world.fronts,
            d: world.deck,
          })}
        </span>
        <LevelChip level={world.level} />
      </div>

      {world.from && (
        <p className="text-sm text-muted-foreground">
          {t('world.lib.from', { chat: world.from.title })}
        </p>
      )}

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">{t('world.lib.name')}</span>
        <Input
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          className="h-10 md:h-9"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">{t('world.lib.desc')}</span>
        <Textarea
          value={description}
          maxLength={400}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => void handleSave()}
          disabled={!canSave || busy}
          className="max-md:h-10"
        >
          {t('world.lib.save')}
        </Button>
        <Button
          variant="outline"
          className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive max-md:h-10"
          onClick={() => void handleDelete()}
          disabled={busy}
        >
          <Trash className="size-4" aria-hidden="true" />
          {t('world.lib.delete')}
        </Button>
      </div>

      <section className="flex flex-col gap-2 border-t border-border pt-4" data-testid="world-detail-backgrounds">
        <h3 className="font-heading text-base">{t('world.tab.backgrounds')}</h3>
        <WorldBackgrounds wref={{ worldId: world.id }} worldName={world.name} onOpenSettings={onOpenSettings} />
      </section>

      {confirmDialog}
    </div>
  )
}

export function SaveWorldDialog({
  open,
  onOpenChange,
  chatId,
  defaultName,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  chatId: string
  defaultName: string
}) {
  const t = useT()
  const [name, setName] = useState(defaultName)
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setName(defaultName)
      setDescription('')
    }
  }, [open, defaultName])

  const canSubmit = name.trim() !== '' && !busy

  const handleSubmit = async () => {
    if (!canSubmit) return
    setBusy(true)
    try {
      const { id, worlds } = await saveWorldToLibrary(
        chatId,
        name.trim(),
        description.trim(),
      )
      useSavedWorlds.getState().setList(worlds)
      onOpenChange(false)
      toast.success(t('world.save.done'), {
        action: {
          label: t('world.save.open'),
          onClick: () => useApp.getState().focusWorldWorld(id),
        },
      })
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast.error(t('world.save.fail'))
      } else {
        toast.error(e instanceof Error ? e.message : String(e))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('world.save.title')}</DialogTitle>
          <DialogDescription>{t('world.save.lead')}</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void handleSubmit()
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">{t('world.save.name')}</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="h-10 md:h-9"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">{t('world.save.desc')}</span>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </label>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy}
              className="max-md:h-10"
            >
              {t('home.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              className="max-md:h-10"
            >
              {t('world.save.go')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
