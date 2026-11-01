// Customize's pieces: the bar of tools every block gets in edit mode, and the panel with the hidden tray,
// the Marketplace switch, Reset and Done. Presentational: HomeView owns the layout and writes it to the settings.

import { ArrowCounterClockwise, ArrowsOutSimple, CaretDown, CaretUp, EyeSlash } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SettingRow } from '@/components/ui/setting-row'
import { Switch } from '@/components/ui/switch'
import { useT } from '@/hooks/use-t'
import type { HomeSize } from '@/lib/home-layout'
import type { MsgKey } from '@/lib/i18n'

const SIZE_KEY: Record<HomeSize, MsgKey> = { sm: 'home.edit.sizeSm', md: 'home.edit.sizeMd', lg: 'home.edit.sizeLg' }

export interface EditBarProps {
  /** the block's name, for the group's label */
  name: string
  canEarlier: boolean
  canLater: boolean
  size: HomeSize
  onEarlier: () => void
  onLater: () => void
  onSize: () => void
  onHide: () => void
}

/** The tools above a block in edit mode. Targets are 40 px on a phone (a 32 px icon button otherwise). */
export function EditBar({ name, canEarlier, canLater, size, onEarlier, onLater, onSize, onHide }: EditBarProps) {
  const t = useT()
  const tool = 'size-8 max-md:size-10'
  return (
    <div role="group" aria-label={name} className="flex items-center justify-end gap-1.5">
      <Button variant="outline" size="icon" className={tool} aria-label={t('home.edit.earlier')} title={t('home.edit.earlier')} disabled={!canEarlier} onClick={onEarlier}>
        <CaretUp aria-hidden="true" />
      </Button>
      <Button variant="outline" size="icon" className={tool} aria-label={t('home.edit.later')} title={t('home.edit.later')} disabled={!canLater} onClick={onLater}>
        <CaretDown aria-hidden="true" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className={tool}
        aria-label={t('home.edit.size', { size: t(SIZE_KEY[size]) })}
        title={t('home.edit.size', { size: t(SIZE_KEY[size]) })}
        onClick={onSize}
      >
        <ArrowsOutSimple aria-hidden="true" />
      </Button>
      <Button variant="outline" size="icon" className={tool} aria-label={t('home.edit.hide')} title={t('home.edit.hide')} onClick={onHide}>
        <EyeSlash aria-hidden="true" />
      </Button>
    </div>
  )
}

export interface HiddenItem {
  id: string
  name: string
}

/** The hidden blocks, each with a Restore button. */
export function HiddenTray({ items, onRestore }: { items: HiddenItem[]; onRestore: (id: string) => void }) {
  const t = useT()
  if (items.length === 0) return <p className="text-caption text-muted-foreground">{t('home.edit.noHidden')}</p>
  return (
    <ul className="flex flex-wrap gap-2" aria-label={t('home.edit.hidden')}>
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-2 rounded-lg border border-dashed border-border py-1 pr-1 pl-3">
          <span className="text-body">{item.name}</span>
          <Button variant="outline" size="sm" className="max-md:h-10" aria-label={t('home.edit.restoreName', { name: item.name })} onClick={() => onRestore(item.id)}>
            {t('home.edit.restore')}
          </Button>
        </li>
      ))}
    </ul>
  )
}

export interface CustomizeProps {
  hidden: HiddenItem[]
  marketSuggest: boolean
  onRestore: (id: string) => void
  onMarketSuggest: (on: boolean) => void
  onReset: () => void
  onDone: () => void
}

/** The Customize panel above the grid: a hint, the Marketplace switch, the hidden tray, Reset and Done. */
export function CustomizePanel({ hidden, marketSuggest, onRestore, onMarketSuggest, onReset, onDone }: CustomizeProps) {
  const t = useT()
  return (
    <Card className="gap-0 py-0" aria-label={t('home.customize')}>
      <p className="border-b border-border px-4 py-3 text-caption text-muted-foreground">{t('home.edit.hint')}</p>
      <div className="flex flex-col">
        <SettingRow label={t('home.suggestMarket')} info={t('home.suggestMarketHint')}>
          <Switch checked={marketSuggest} onCheckedChange={(v) => onMarketSuggest(v === true)} aria-label={t('home.suggestMarket')} />
        </SettingRow>
      </div>
      <div className="flex flex-col gap-2 border-t border-border px-4 py-3">
        <p className="text-body font-medium">{t('home.edit.hidden')}</p>
        <HiddenTray items={hidden} onRestore={onRestore} />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3">
        <Button variant="outline" className="max-md:h-10" onClick={onReset}>
          <ArrowCounterClockwise aria-hidden="true" /> {t('home.reset')}
        </Button>
        <Button variant="tonal" className="max-md:h-10" onClick={onDone}>
          {t('home.done')}
        </Button>
      </div>
    </Card>
  )
}
