import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { FilmSlate } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { ModelMark } from '@/components/model-mark'
import { GenreSelect } from '@/components/chat/genre-select'
import { ModelPalette, setUpModels, useModelEntry } from '@/components/chat/model-palette'
import { useT } from '@/hooks/use-t'
import { directionModel, FALLBACK_SETS, fetchDirectionSets, saveDirectionModel, useDirectionLive, type DirectionSetInfo } from '@/lib/direction'
import { useApp } from '@/lib/store'
import type { Character } from '@/lib/types'

/**
 * The group editor's Direction tab: whether this group's new chats start with Direction on (stored on the group as
 * `direction`, absent = on), and the director's model, which is one for every chat (the same one the chat's director bar sets).
 */
export function GroupDirectionTab({ group }: { group: Character }) {
  const t = useT()
  const updateGroup = useApp((s) => s.updateGroup)
  const stamp = useDirectionLive((s) => s.stamp)
  const [model, setModel] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let live = true
    void directionModel().then((m) => { if (live) setModel(m) })
    return () => { live = false }
  }, [stamp])
  // the genres the plugin ships (nine from phase 4); the rom-com entry alone until the list arrives or when the route is missing
  const [sets, setSets] = useState<DirectionSetInfo[]>(FALLBACK_SETS)
  useEffect(() => {
    let live = true
    void fetchDirectionSets().then((list) => { if (live) setSets(list) })
    return () => { live = false }
  }, [])
  const { current, label } = useModelEntry(model)
  const on = group.group?.direction !== false
  const set = sets.some((s) => s.id === group.group?.directionSet) ? (group.group?.directionSet ?? '') : ''

  return (
    <div className="space-y-4" data-testid="group-direction-tab">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-medium"><FilmSlate className="size-4" aria-hidden="true" />{t('group.dir.title')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t('group.dir.intro')}</p>
      </div>
      <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
        <div className="min-w-0">
          <label htmlFor="group-direction-default" className="text-sm font-medium">{t('group.dir.default')}</label>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('group.dir.defaultHint')}</p>
          {model === '' && <p className="mt-1 text-xs text-muted-foreground" data-testid="group-direction-need-model">{t('group.dir.needModel')}</p>}
        </div>
        <Switch id="group-direction-default" className="mt-0.5 shrink-0" checked={on} onCheckedChange={(v) => updateGroup(group.id, { direction: v })} />
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-3" data-testid="group-direction-genre">
        <div className="min-w-0 flex-[1_1_12rem]">
          <p className="text-sm font-medium">{t('group.dir.genre')}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('group.dir.genreHint')}</p>
        </div>
        <GenreSelect
          label={t('group.dir.genre')}
          value={set}
          sets={sets}
          className="sm:w-56"
          onChange={(v) => updateGroup(group.id, { directionSet: v })}
          testId="group-direction-genre-select"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t('group.dir.model')}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="group-direction-model">
            {model ? (
              <>
                <ModelMark model={current?.ref ?? model} className="size-3.5 shrink-0" />
                <span className="truncate">{label}</span>
              </>
            ) : model === '' ? t('group.dir.noModel') : '…'}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('group.dir.modelHint')}</p>
        </div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={<Button variant={model ? 'outline' : 'tonal'} size="sm" className="max-md:h-10" data-testid="group-direction-change">{model ? t('group.dir.change') : t('dir.pickModel')}</Button>}
          />
          <PopoverContent className="w-80 max-w-[calc(100vw-1rem)] p-0" align="end">
            <ModelPalette
              value={model}
              onPick={(ref, name, provider) => {
                setOpen(false)
                void saveDirectionModel(ref).then(() => toast.success(t('dir.model.set', { name }), { description: provider })).catch((e: unknown) => toast.error(String((e as Error).message ?? e)))
              }}
              onSettings={() => { setOpen(false); setUpModels(null) }}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
