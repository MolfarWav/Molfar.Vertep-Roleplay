// "DM in this chat" and the profile it runs on: replaces the six level radios of the Overview.
// A switch (off = level 'off'), a Profile select (the five built-in profiles and the player's own,
// each with its one-line description) and a button into the hub's Profiles tab.

import { useEffect } from 'react'
import { PencilSimple } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { refreshWorldProfiles, useWorldProfiles } from '@/lib/world-profiles'
import type { WorldLevel, WorldProfile } from '@/lib/world'
import { LEVEL_ICON, LEVEL_TONE, useProfileHint, useProfileName } from './world-common'

/** The profiles a chat can pick: built-ins whose level is finished, own ones on such a base. */
export function pickableProfiles(list: WorldProfile[], ready: WorldLevel[]): WorldProfile[] {
  return list.filter((p) => ready.includes(p.base))
}

export function WorldProfilePicker({
  on,
  profileId,
  ready,
  onToggle,
  onPick,
  onEdit,
  bare = false,
}: {
  on: boolean
  /** the profile in force (WorldView.profile); null when the DM is off */
  profileId: string | null
  ready: WorldLevel[]
  onToggle: (on: boolean) => void
  onPick: (id: string) => void
  onEdit: (id: string) => void
  /** only the Profile select (a new world: no chat to switch the DM on in, nothing to edit from here) */
  bare?: boolean
}) {
  const t = useT()
  const list = useWorldProfiles((s) => s.list)
  const nameOf = useProfileName()
  const hintOf = useProfileHint()
  useEffect(() => {
    void refreshWorldProfiles()
  }, [])
  const options = list ? pickableProfiles(list, ready) : []
  const picked = options.find((p) => p.id === profileId)
  const items = Object.fromEntries(options.map((p) => [p.id, nameOf(p)]))
  return (
    <section className="flex flex-col gap-3">
      {!bare && <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 text-body font-semibold">
          {t('world.dmHere')}
          <span className="block text-caption font-normal text-muted-foreground">{on ? t('world.dmHere.on') : t('world.dmHere.off')}</span>
        </span>
        <Switch checked={on} onCheckedChange={onToggle} aria-label={t('world.dmHere')} />
      </div>}

      <div className={cn('flex flex-col gap-1.5', !on && 'opacity-60')}>
        <label id="world-profile-label" className="text-body font-semibold">{t('world.profile')}</label>
        <Select
          value={on && picked ? picked.id : ''}
          items={items}
          disabled={!on || !list}
          onValueChange={(v) => { if (v && v !== profileId) onPick(v) }}
        >
          <SelectTrigger aria-labelledby="world-profile-label" className="h-10 w-full text-body md:h-9" data-testid="world-profile-select">
            <SelectValue placeholder={on ? t('world.profile.pick') : t('world.profile.off')}>
              {(v: string) => {
                const p = options.find((x) => x.id === v)
                if (!p) return null
                const Icon = LEVEL_ICON[p.base]
                return (
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon className={cn('size-4 shrink-0', LEVEL_TONE[p.base].icon)} aria-hidden="true" />
                    <span className="truncate">{nameOf(p)}</span>
                    {!p.builtIn && <OwnMark />}
                  </span>
                )
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} className="w-auto min-w-(--anchor-width) max-w-[min(26rem,calc(100vw-2rem))]">
            {options.map((p) => {
              const Icon = LEVEL_ICON[p.base]
              return (
                <SelectItem key={p.id} value={p.id} className="items-start py-1.5 max-md:min-h-11">
                  <Icon className={cn('mt-0.5 size-4 shrink-0', LEVEL_TONE[p.base].icon)} aria-hidden="true" />
                  <span className="flex min-w-0 flex-col whitespace-normal">
                    <span className="flex items-center gap-1.5 font-medium">
                      {nameOf(p)}
                      {!p.builtIn && <OwnMark />}
                    </span>
                    <span className="text-caption font-normal text-muted-foreground">{hintOf(p)}</span>
                  </span>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
        {on && picked && <p className="text-caption text-muted-foreground">{hintOf(picked)}</p>}
        {!on && <p className="text-caption text-muted-foreground">{t('world.profile.offHint')}</p>}
        {!bare && (
          <Button
            variant="outline"
            size="sm"
            className="mt-1 self-start max-md:h-10"
            disabled={!on || !picked}
            onClick={() => picked && onEdit(picked.id)}
          >
            <PencilSimple className="size-4" aria-hidden="true" />
            {t('world.profile.edit')}
          </Button>
        )}
      </div>
    </section>
  )
}

export function OwnMark({ className }: { className?: string }) {
  const t = useT()
  return (
    <span className={cn('shrink-0 rounded-full border border-border bg-muted px-1.5 text-caption font-medium leading-4 text-muted-foreground', className)}>
      {t('world.profile.own')}
    </span>
  )
}
