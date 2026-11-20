import { useMemo, useState } from 'react'
import { CircleNotch, NavigationArrow, Sparkle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { TONES } from '@/components/ui/tone'
import { cn } from '@/lib/utils'
import { ToggleChip } from '@/components/ui/toggle-chip'
import { useT } from '@/hooks/use-t'
import { routeOf, setRouteInfo, type MapNode, type MapScale, type PlaceMapData } from '@/lib/place-map'
import { CHANCE_DEFAULT, cleanEventText, cleanMinutes, cleanVia, footMinutes, loadEventPref, minutesFor, modesFor, rollRoadEvent, saveEventPref, travelDirection, type TravelMode } from '@/lib/place-travel'
import { useApp } from '@/lib/store'
import type { ID } from '@/lib/types'
import { askRoadEvent, askTravelTime } from '@/lib/world'

/** What the map needs to know about a trip that was sent, to read the road's name from the reply that tells it. */
export interface TravelSent { fromId: string | null; toId: string; from: string | null; to: string; mode: TravelMode; within: boolean; nameKnown: boolean }

/**
 * Travel by a tap (Molfar.Vertep#454, M3). The trip is the player's own move with a hidden direction riding on it (the way Skip
 * time works): the reply narrates the way and the arrival and the Dashboard clock follows the reply. The minutes come from the
 * distance on the board, or from the DM's model when the player asks; they and the road's name are kept on the road, so the next
 * trip is the same one. A road event (off by default) is the DM's own waiting event or a seeded die. Nothing here calls a model
 * unless the player presses "Ask the model".
 */
export function PlaceTravelDialog({ chatId, target, from, nodes, data, scale = 'town', dmOn, dmEvent, messageCount, open, onOpenChange, onSaveMap, onSent }: {
  chatId: ID
  target: MapNode
  /** where the story is now (a place or a room of one), or null when the map does not know */
  from: MapNode | null
  nodes: MapNode[]
  data: PlaceMapData | null
  /** how big the map is: a trip on it takes minutes, hours or days */
  scale?: MapScale
  /** the World DM is on: its model can estimate the time and read the road's name */
  dmOn: boolean
  /** the DM is holding an event that has not played yet */
  dmEvent: boolean
  /** how many messages the chat has: the seed of the road event's die */
  messageCount: number
  open: boolean
  onOpenChange: (v: boolean) => void
  /** the road's minutes and name changed: keep the map */
  onSaveMap: (next: PlaceMapData) => void
  /** the move was sent */
  onSent: (sent: TravelSent) => void
}) {
  const t = useT()
  const sendMessage = useApp((s) => s.sendMessage)
  const wholeOf = (n: MapNode) => (n.parentId ? nodes.find((x) => x.id === n.parentId) ?? n : n)
  const fromWhole = from ? wholeOf(from) : null
  const toWhole = wholeOf(target)
  const within = !!fromWhole && fromWhole.id === toWhole.id
  const hasRoad = !!fromWhole && !within
  const road = hasRoad ? routeOf(data, fromWhole.id, toWhole.id) : null
  const foot = useMemo(() => (road?.minutes ?? (fromWhole ? footMinutes(fromWhole, toWhole, scale) : 5)), [road?.minutes, fromWhole, toWhole, scale])
  const [mode, setMode] = useState<TravelMode>('foot')
  const [minutes, setMinutes] = useState<string | null>(null)
  const [modelFoot, setModelFoot] = useState<number | null>(null)
  const [asking, setAsking] = useState(false)
  const [via, setVia] = useState(road?.via ?? '')
  const [words, setWords] = useState(t('placeMap.travelWordsDefault', { name: target.name }))
  const [pref, setPref] = useState(() => loadEventPref(chatId, safeStorage()))
  const shownMinutes = minutes ?? String(minutesFor(foot, mode))
  const valid = !hasRoad || mode === 'skip' || cleanMinutes(Number(shownMinutes)) !== null
  const showsRoad = hasRoad && mode !== 'skip'

  // the road event: the DM's own waiting event, else a seeded die; shown before it is sent, and it ends up in the direction's chip
  const dice = useMemo(() => (fromWhole ? rollRoadEvent(`${chatId}|${messageCount}|${fromWhole.id}|${toWhole.id}`, pref.chance) : null), [chatId, messageCount, fromWhole, toWhole, pref.chance])
  // an event the DM's model made up from the book (on a button, only when the dice hit and the DM has no event of its own waiting)
  const [made, setMade] = useState<string | null>(null)
  const [making, setMaking] = useState(false)
  const concrete = pref.on && pref.concrete && dmOn && !dmEvent
  const event = showsRoad && pref.on ? (dmEvent ? ({ dm: true } as const) : dice?.hit && dice.kind ? (concrete && made ? { text: made } : { kind: dice.kind }) : null) : null
  const changePref = (next: typeof pref) => { setPref(next); saveEventPref(chatId, next, safeStorage()) }

  const makeEvent = async () => {
    if (!fromWhole || making) return
    setMaking(true)
    try {
      const text = cleanEventText(await askRoadEvent(chatId, { from: fromWhole.bookName, to: toWhole.bookName, ...(cleanVia(via) ? { via: cleanVia(via) as string } : {}), mode }))
      if (text) setMade(text)
    } catch (e) {
      toast.error(t('placeMap.travelEventFail', { message: e instanceof Error ? e.message : String(e) }))
    } finally {
      setMaking(false)
    }
  }
  const ask = async () => {
    if (!fromWhole || asking) return
    setAsking(true)
    try {
      const n = await askTravelTime(chatId, { from: fromWhole.bookName, to: toWhole.bookName, distance: Math.round(Math.hypot(fromWhole.x - toWhole.x, fromWhole.y - toWhole.y)), mode: mode === 'ride' ? 'ride' : 'foot', scale })
      setModelFoot(n)
      setMinutes(String(minutesFor(n, mode)))
    } catch (e) {
      toast.error(t('placeMap.travelAskFail', { message: e instanceof Error ? e.message : String(e) }))
    } finally {
      setAsking(false)
    }
  }

  const go = () => {
    if (!valid) return
    const mins = cleanMinutes(Number(shownMinutes)) ?? minutesFor(foot, mode)
    const name = cleanVia(via)
    if (hasRoad && fromWhole) {
      // the road keeps the walking time (a ride is derived from it) and its name; a skipped road is left as it is
      const info: { minutes?: number | null; via?: string | null } = {}
      if (mode === 'foot') info.minutes = mins
      else if (mode !== 'skip' && minutes === null && modelFoot) info.minutes = modelFoot
      if (mode !== 'skip') info.via = name
      if (info.minutes !== undefined || info.via !== undefined || !road) onSaveMap(setRouteInfo(data, fromWhole.id, toWhole.id, info))
    }
    const direction = travelDirection({ from: fromWhole && from ? from.bookName : null, to: target.bookName, mode, minutes: mins, via: mode === 'skip' ? null : name, within, event })
    const said = words.replace(/\[\[|\]\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 300)
    void sendMessage(chatId, said ? `${said} ${direction}` : direction)
    onOpenChange(false)
    onSent({ fromId: fromWhole?.id ?? null, toId: toWhole.id, from: fromWhole ? fromWhole.bookName : null, to: toWhole.bookName, mode, within, nameKnown: !!(name ?? road?.via) })
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
              {modesFor(scale).map((m) => (
                <ToggleChip key={m} pressed={mode === m} onPressedChange={() => { setMode(m); setMinutes(null); setModelFoot(null) }}>{t(`placeMap.travelMode.${m}`)}</ToggleChip>
              ))}
            </div>
          )}
          {showsRoad && (
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  className="w-28"
                  value={shownMinutes}
                  aria-label={t('placeMap.travelMinutes')}
                  data-testid="place-travel-minutes"
                  onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))}
                />
                <span className="text-muted-foreground">{t('placeMap.travelMinutes')}</span>
                {cleanMinutes(Number(shownMinutes)) !== null && Number(shownMinutes) >= 120 && <span className="text-xs text-muted-foreground" data-testid="place-travel-span">{t('placeMap.travelSpan', { span: spanShort(Number(shownMinutes), t('placeMap.unitDay'), t('placeMap.unitHour'), t('placeMap.unitMinute')) })}</span>}
              </label>
              <Button
                variant="outline"
                size="sm"
                disabled={!dmOn || asking}
                onClick={() => void ask()}
                title={dmOn ? t('placeMap.travelAskHint') : t('placeMap.travelAskOff')}
                className="max-md:min-h-10"
                data-testid="place-travel-ask"
              >
                <Sparkle className={cn('size-4', TONES.violet.ink)} weight="fill" aria-hidden="true" />{asking ? t('placeMap.travelAsking') : t('placeMap.travelAsk')}
              </Button>
              <Input
                className="min-w-0 basis-full"
                value={via}
                maxLength={120}
                placeholder={t('placeMap.travelVia')}
                aria-label={t('placeMap.travelVia')}
                data-testid="place-travel-via"
                onChange={(e) => setVia(e.target.value)}
              />
            </div>
          )}
          {showsRoad && <p className="text-xs text-muted-foreground">{t('placeMap.travelKept')}</p>}
          {showsRoad && (
            <div className="flex flex-col gap-1.5 rounded-md border border-border p-2" data-testid="place-travel-event">
              <div className="flex flex-wrap items-center gap-2">
                <ToggleChip pressed={pref.on} onPressedChange={(v) => changePref({ ...pref, on: v })}>{t('placeMap.travelEvent')}</ToggleChip>
                {pref.on && !dmEvent && (
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Input
                      inputMode="numeric"
                      maxLength={3}
                      className="h-8 w-16 max-md:h-10"
                      value={String(pref.chance)}
                      aria-label={t('placeMap.travelChance')}
                      data-testid="place-travel-chance"
                      onChange={(e) => changePref({ ...pref, chance: Number(e.target.value.replace(/\D/g, '')) || CHANCE_DEFAULT })}
                    />
                    %
                  </label>
                )}
                {pref.on && !dmEvent && (
                  <ToggleChip pressed={pref.concrete && dmOn} disabled={!dmOn} onPressedChange={(v) => changePref({ ...pref, concrete: v })}>{t('placeMap.travelEventConcrete')}</ToggleChip>
                )}
              </div>
              {pref.on && !dmEvent && !dmOn && <p className="text-xs text-muted-foreground">{t('placeMap.travelEventConcreteOff')}</p>}
              {concrete && dice?.hit && (
                <div className="flex flex-col gap-1.5" data-testid="place-travel-event-made">
                  <Button variant="outline" size="sm" className="self-start max-md:min-h-10" disabled={making} onClick={() => void makeEvent()} data-testid="place-travel-event-make">
                    {making ? <CircleNotch className="size-4 animate-spin" aria-hidden="true" /> : <Sparkle className={cn('size-4', TONES.violet.ink)} weight="fill" aria-hidden="true" />}
                    {making ? t('placeMap.travelEventMaking') : made ? t('placeMap.travelEventAgain') : t('placeMap.travelEventMake')}
                  </Button>
                  <p className="text-xs" data-testid="place-travel-event-text">{made ? made : t('placeMap.travelEventNotMade')}</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground" data-testid="place-travel-event-log">
                {!pref.on
                  ? t('placeMap.travelEventOff')
                  : dmEvent
                    ? t('placeMap.travelEventDm')
                    : dice?.hit && dice.kind
                      ? (concrete && made ? t('placeMap.travelEventHitMade', { roll: dice.roll, chance: dice.chance }) : t('placeMap.travelEventHit', { roll: dice.roll, chance: dice.chance, kind: dice.kind }))
                      : t('placeMap.travelEventMiss', { roll: dice?.roll ?? 0, chance: dice?.chance ?? pref.chance })}
              </p>
            </div>
          )}
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
            <NavigationArrow className="size-4" weight="fill" aria-hidden="true" />{t('placeMap.travelGo')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** "3 d 4 h", "5 h 30 min": a long trip in the interface's own short units. */
function spanShort(minutes: number, day: string, hour: string, min: string): string {
  const d = Math.floor(minutes / 1440)
  const h = Math.floor((minutes % 1440) / 60)
  const m = minutes % 60
  return [d ? `${d} ${day}` : '', h ? `${h} ${hour}` : '', !d && m ? `${m} ${min}` : ''].filter(Boolean).join(' ')
}

const safeStorage = (): Storage | null => { try { return localStorage } catch { return null } }
