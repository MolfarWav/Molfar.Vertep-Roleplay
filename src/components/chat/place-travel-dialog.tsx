import { useMemo, useState } from 'react'
import { NavigationArrow } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ToggleChip } from '@/components/ui/toggle-chip'
import { useT } from '@/hooks/use-t'
import { routeOf, setRouteInfo, type MapNode, type PlaceMapData } from '@/lib/place-map'
import { TRAVEL_MODES, cleanMinutes, cleanVia, footMinutes, minutesFor, travelDirection, type TravelMode } from '@/lib/place-travel'
import { useApp } from '@/lib/store'
import type { ID } from '@/lib/types'

/**
 * Travel by a tap (Molfar.Vertep#454, M3). The trip is the player's own move with a hidden direction riding on it (the way Skip
 * time works): the reply narrates the way and the arrival and the Dashboard clock follows the reply. The minutes come from the
 * distance on the board and can be changed; they and the road's name are kept on the road, so the next trip is the same one.
 * No model is called here.
 */
export function PlaceTravelDialog({ chatId, target, from, nodes, data, open, onOpenChange, onSaveMap, onSent }: {
  chatId: ID
  target: MapNode
  /** where the story is now (a place or a room of one), or null when the map does not know */
  from: MapNode | null
  nodes: MapNode[]
  data: PlaceMapData | null
  open: boolean
  onOpenChange: (v: boolean) => void
  /** the road's minutes and name changed: keep the map */
  onSaveMap: (next: PlaceMapData) => void
  /** the move was sent */
  onSent: () => void
}) {
  const t = useT()
  const sendMessage = useApp((s) => s.sendMessage)
  const wholeOf = (n: MapNode) => (n.parentId ? nodes.find((x) => x.id === n.parentId) ?? n : n)
  const fromWhole = from ? wholeOf(from) : null
  const toWhole = wholeOf(target)
  const within = !!fromWhole && fromWhole.id === toWhole.id
  const hasRoad = !!fromWhole && !within
  const road = hasRoad ? routeOf(data, fromWhole.id, toWhole.id) : null
  const foot = useMemo(() => (road?.minutes ?? (fromWhole ? footMinutes(fromWhole, toWhole) : 5)), [road?.minutes, fromWhole, toWhole])
  const [mode, setMode] = useState<TravelMode>('foot')
  const [minutes, setMinutes] = useState<string | null>(null)
  const [via, setVia] = useState(road?.via ?? '')
  const [words, setWords] = useState(t('placeMap.travelWordsDefault', { name: target.name }))
  const shownMinutes = minutes ?? String(minutesFor(foot, mode))
  const valid = !hasRoad || mode === 'skip' || cleanMinutes(Number(shownMinutes)) !== null

  const go = () => {
    if (!valid) return
    const mins = cleanMinutes(Number(shownMinutes)) ?? minutesFor(foot, mode)
    const name = cleanVia(via)
    if (hasRoad && fromWhole) {
      // the road keeps the walking time (a ride is derived from it) and its name; a skipped road is left as it is
      const info: { minutes?: number | null; via?: string | null } = {}
      if (mode === 'foot') info.minutes = mins
      if (mode !== 'skip') info.via = name
      if (info.minutes !== undefined || info.via !== undefined || !road) onSaveMap(setRouteInfo(data, fromWhole.id, toWhole.id, info))
    }
    const direction = travelDirection({ from: fromWhole && from ? from.bookName : null, to: target.bookName, mode, minutes: mins, via: mode === 'skip' ? null : name, within })
    const said = words.replace(/\[\[|\]\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 300)
    void sendMessage(chatId, said ? `${said} ${direction}` : direction)
    onOpenChange(false)
    onSent()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="place-travel-dialog">
        <DialogHeader>
          <DialogTitle>{t('placeMap.travelTitle', { name: target.name })}</DialogTitle>
          <DialogDescription>
            {within ? t('placeMap.travelWithin') : fromWhole ? t('placeMap.travelFrom', { name: fromWhole.name }) : t('placeMap.travelFromUnknown')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {hasRoad && (
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('placeMap.travelMode')}>
              {TRAVEL_MODES.map((m) => (
                <ToggleChip key={m} pressed={mode === m} onPressedChange={() => { setMode(m); setMinutes(null) }}>{t(`placeMap.travelMode.${m}`)}</ToggleChip>
              ))}
            </div>
          )}
          {hasRoad && mode !== 'skip' && (
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <Input
                  inputMode="numeric"
                  maxLength={5}
                  className="w-24"
                  value={shownMinutes}
                  aria-label={t('placeMap.travelMinutes')}
                  data-testid="place-travel-minutes"
                  onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))}
                />
                <span className="text-muted-foreground">{t('placeMap.travelMinutes')}</span>
              </label>
              <Input
                className="min-w-0 flex-1"
                value={via}
                maxLength={120}
                placeholder={t('placeMap.travelVia')}
                aria-label={t('placeMap.travelVia')}
                data-testid="place-travel-via"
                onChange={(e) => setVia(e.target.value)}
              />
            </div>
          )}
          {hasRoad && mode !== 'skip' && <p className="text-xs text-muted-foreground">{t('placeMap.travelKept')}</p>}
          <Textarea
            rows={2}
            value={words}
            maxLength={300}
            aria-label={t('placeMap.travelWords')}
            data-testid="place-travel-words"
            onChange={(e) => setWords(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go() } }}
          />
          <p className="text-xs text-muted-foreground">{t('placeMap.travelHint')}</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t('placeMap.travelCancel')}</Button>
          <Button onClick={go} disabled={!valid} data-testid="place-travel-go">
            <NavigationArrow className="size-4" aria-hidden="true" />{t('placeMap.travelGo')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
