// "Names from the catalog" (#373, step 3): the chat's switch for the shared catalog's names. With it on, each DM run (and a Start run in this
// chat) carries a short random list of names the world does not use yet, for new people, places and groups to take when one fits. The card
// picks the style (genres) and the name cultures; none picked means any. It says plainly when the catalog cannot be read.
import { useEffect, useRef, useState } from 'react'
import { Check, Tag } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Section } from '@/components/ui/section'
import { SettingRow } from '@/components/ui/setting-row'
import { Switch } from '@/components/ui/switch'
import { useT } from '@/hooks/use-t'
import type { MsgKey } from '@/lib/i18n'
import { loadCatalogInfo, tagLabel, type CatalogInfo } from '@/lib/names-pool'
import type { WorldView } from '@/lib/world'

const MAX_GENRES = 6
const MAX_CULTURES = 4
/** Up to this many picks the summary names them; more, and it counts them. */
const SUMMARY_NAMES = 3

type Key = 'namesGenres' | 'namesCultures'
type Pick = Record<Key, string[]>

export function NamesCard({ view, save, on }: {
  view: WorldView
  save: (patch: Partial<WorldView['settings']>) => Promise<unknown>
  /** the DM is on for this chat (off = the card is dimmed; the switch still works, the names wait for the DM) */
  on: boolean
}) {
  const t = useT()
  const [info, setInfo] = useState<CatalogInfo | null>(null)
  useEffect(() => {
    let live = true
    void loadCatalogInfo().then((i) => {
      if (live) setInfo(i)
    })
    return () => {
      live = false
    }
  }, [])

  /** A vocabulary word in the app's language; a word the app has no string for reads as plain words. */
  const label = (tag: string): string => {
    const s = t(`world.tag.${tag}` as MsgKey) as string | undefined
    return typeof s === 'string' && s ? s : tagLabel(tag)
  }

  const s = view.settings
  // the picks show at once and the saves go one after another, so a quick second tap is not lost while the first one is on its way
  const [local, setLocal] = useState<Pick | null>(null)
  const chain = useRef<Promise<unknown>>(Promise.resolve())
  const waiting = useRef(0)
  const sel: Pick = local ?? { namesGenres: s.namesGenres, namesCultures: s.namesCultures }
  const toggle = (key: Key, tag: string, max: number) => {
    const cur = sel[key]
    if (!cur.includes(tag) && cur.length >= max) return
    const next = cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag]
    setLocal({ ...sel, [key]: next })
    waiting.current += 1
    chain.current = chain.current
      .then(() => save({ [key]: next }))
      .catch(() => undefined)
      .finally(() => {
        waiting.current -= 1
        if (waiting.current === 0) setLocal(null)
      })
  }

  const enabled = s.names === true
  const available = info?.available === true
  const count = sel.namesGenres.length + sel.namesCultures.length
  const summary = !enabled
    ? t('world.names.off')
    : count === 0
      ? t('world.names.any')
      : count <= SUMMARY_NAMES
        ? [...sel.namesGenres, ...sel.namesCultures].map(label).join(' · ')
        : t('world.names.counts', { genres: sel.namesGenres.length, cultures: sel.namesCultures.length })

  const groups: { key: Key; title: string; all: string[]; max: number }[] = info
    ? [
        { key: 'namesGenres', title: t('world.names.style'), all: info.genres, max: MAX_GENRES },
        { key: 'namesCultures', title: t('world.names.culture'), all: info.cultures, max: MAX_CULTURES },
      ]
    : []

  return (
    <Section variant="tinted" tone="violet" icon={Tag} id="names" title={t('world.card.names')} chips={[summary]} dimmed={!on} note={on ? undefined : t('world.names.dmOff')}>
      <SettingRow label={t('world.names.switch')} info={t('world.names.hint')}>
        <Switch checked={enabled} disabled={!available && !enabled} onCheckedChange={(v) => void save({ names: v })} aria-label={t('world.names.switch')} data-testid="names-switch" />
      </SettingRow>
      <div className="flex flex-col gap-3 px-4 py-3" data-testid="names-body">
        {!info && <p className="text-caption text-muted-foreground" role="status">{t('world.names.checking')}</p>}
        {info && !available && <p className="text-caption text-muted-foreground" data-testid="names-unavailable">{t('world.names.unavailable')}</p>}
        {available && !enabled && <p className="text-caption text-muted-foreground">{t('world.names.offHint', { places: info.kinds.place, groups: info.kinds.organization, names: info.kinds.name })}</p>}
        {available && enabled && <p className="text-caption text-muted-foreground">{t('world.names.pickHint', { genres: MAX_GENRES, cultures: MAX_CULTURES })}</p>}
        {available && enabled &&
          groups.map((g) => (
            <div key={g.key} className="flex flex-col gap-1.5" data-testid={`names-${g.key}`}>
              <h4 className="text-caption font-medium text-foreground">{g.title} <span className="font-normal text-muted-foreground">· {sel[g.key].length}/{g.max}</span></h4>
              <div className="flex flex-wrap gap-2" role="group" aria-label={g.title}>
                {g.all.map((tag) => {
                  const active = sel[g.key].includes(tag)
                  return (
                    <Button key={tag} variant={active ? 'default' : 'outline'} size="sm" className="max-md:h-10" aria-pressed={active} disabled={!active && sel[g.key].length >= g.max} onClick={() => toggle(g.key, tag, g.max)}>
                      {active && <Check className="size-3.5" aria-hidden="true" />}
                      {label(tag)}
                    </Button>
                  )
                })}
              </div>
            </div>
          ))}
      </div>
    </Section>
  )
}
