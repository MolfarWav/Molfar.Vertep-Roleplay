import { useState } from 'react'
import { toast } from 'sonner'
import { ClockCountdown, DoorOpen, FilmSlate, Lock, SlidersHorizontal, Warning, X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { ModelMark } from '@/components/model-mark'
import { ModelPalette, setUpModels, useModelEntry } from '@/components/chat/model-palette'
import { GroupMemberBar } from '@/components/chat/group-member-bar'
import { DirectionSheet, type DirectionTab } from '@/components/chat/direction-sheet'
import { useT } from '@/hooks/use-t'
import { relativeTime, resolveLanguage } from '@/lib/i18n'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { runDirection, saveDirectionModel, setDirectionChat, skipDirectionNext, useDirectionLive, type DirectionState } from '@/lib/direction'
import { barMode, beatOf, beatShort, errorKey, lastRun, nameOf, namesOf, nextAct, tagKey, useDirectionState } from '@/lib/direction-ui'
import type { Character, Chat } from '@/lib/types'

export { DirectionLog } from '@/components/chat/direction-log'

const chipCls =
  'inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-2.5 text-xs outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 max-md:min-h-10'

/** The member bar and the director bar under it: one read of the scene feeds both. */
export function GroupBars({ chat, group }: { chat: Chat; group: Character }) {
  const last = chat.messages[chat.messages.length - 1]
  const sig = `${chat.messages.length}:${last?.id ?? ''}:${last?.activeSwipe ?? 0}`
  const { state } = useDirectionState(chat.id, sig)
  return (
    <>
      <GroupMemberBar chat={chat} group={group} scene={state?.scene ?? null} />
      {state && <DirectorBar chat={chat} state={state} />}
    </>
  )
}

/** The container: the actions go to the plugin's routes; the bar itself is `DirectorBarView`. */
export function DirectorBar({ chat, state }: { chat: Chat; state: DirectionState }) {
  const t = useT()
  const running = useDirectionLive((s) => s.running === chat.id)
  return (
    <DirectorBarView
      chatId={chat.id}
      state={state}
      running={running}
      onPickModel={(ref, label, provider) => {
        void saveDirectionModel(ref).then(() => toast.success(t('dir.model.set', { name: label }), { description: provider })).catch((e: unknown) => toast.error(String((e as Error).message ?? e)))
      }}
      onToggle={(on) => {
        void setDirectionChat(chat.id, { on }).then(() => { if (on) void runDirection(chat.id) }).catch((e: unknown) => toast.error(String((e as Error).message ?? e)))
      }}
      onReport={() => {
        void runDirection(chat.id, true).then((r) => { if (!r.ok) toast.error(r.message || t(errorKey(r.reason))) })
      }}
      onRelease={() => { void setDirectionChat(chat.id, { lock: null }).catch((e: unknown) => toast.error(String((e as Error).message ?? e))) }}
      onSkip={() => { void skipDirectionNext(chat.id).catch((e: unknown) => toast.error(String((e as Error).message ?? e))) }}
    />
  )
}

export function DirectorBarView({ chatId, state, running, onPickModel, onToggle, onReport, onRelease, onSkip }: {
  /** the chat the Direction sheet works on (without it the bar shows no sheet) */
  chatId?: string
  state: DirectionState
  running: boolean
  onPickModel: (ref: string, label: string, provider: string) => void
  onToggle: (on: boolean) => void
  onReport: () => void
  onRelease: () => void
  /** drop the note queued for the next reply */
  onSkip?: () => void
}) {
  const t = useT()
  const lang = resolveLanguage(useApp((s) => s.settings.language))
  const [sheet, setSheet] = useState<{ open: boolean; tab: DirectionTab }>({ open: false, tab: 'rules' })
  const mode = barMode(state)
  const noModel = mode === 'no-model'
  const lock = state.chat.lock
  const next = mode !== 'off' && !noModel && state.next?.due ? state.next : null
  return (
    <div
      role="group"
      aria-label={t('dir.title')}
      data-testid="director-bar"
      data-mode={mode}
      className="relative z-10 flex items-center gap-1.5 border-b border-border bg-card/70 px-2 py-1 backdrop-blur"
    >
      {/* the chips scroll inside this strip; the switch stays in view beside it */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
      <span className="flex shrink-0 items-center gap-1.5 pl-1 pr-0.5 text-xs font-medium text-muted-foreground" aria-label={t('dir.title')}>
        <FilmSlate className="size-4" aria-hidden="true" />
        <span className="max-[479px]:hidden">{mode === 'off' ? t('dir.offLabel') : t('dir.title')}</span>
      </span>

      {mode !== 'off' && lock && (
        <span className="inline-flex min-h-8 shrink-0 items-center rounded-full border border-cta/40 bg-cta/15 text-xs font-medium max-md:min-h-10" data-testid="director-lock">
          <Lock className="ml-2.5 size-3.5 shrink-0" aria-hidden="true" />
          <span className="px-1.5">{t('dir.lock.chip', { names: namesOf(state, lock.ids) })}</span>
          <button
            type="button"
            onClick={onRelease}
            aria-label={t('dir.lock.release')}
            title={t('dir.lock.release')}
            className="mr-0.5 flex size-7 items-center justify-center rounded-full hover:bg-cta/25 focus-visible:ring-3 focus-visible:ring-ring/50 max-md:size-9"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </span>
      )}

      {next && (
        <span className="inline-flex min-h-8 shrink-0 items-center rounded-full border border-border bg-background text-xs max-md:min-h-10" data-testid="director-next" aria-label={t('dir.next.aria', { act: nextAct(t, state, next, lang) })}>
          <ClockCountdown className="ml-2.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className={cn('truncate px-1.5 font-medium', next.kind === 'beat' ? 'max-w-52' : 'max-w-40')}>{next.kind === 'beat' ? t('dir.next.chipBeat', { text: beatShort(beatOf(state, next.rule)?.text ?? '', 40) }) : t('dir.next.chip', { names: namesOf(state, next.who, 2, t, next.npc) })}</span>
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              aria-label={t('dir.next.skip')}
              title={t('dir.next.skip')}
              data-testid="director-next-skip"
              className="mr-0.5 flex size-7 items-center justify-center rounded-full hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 max-md:size-10"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </span>
      )}

      {(mode === 'report' || mode === 'empty' || mode === 'error') && <SceneChip state={state} mode={mode} running={running} onReport={onReport} />}

      {mode !== 'off' && <ModelChip model={state.config.model} onPick={onPickModel} />}
      </div>
      {mode !== 'off' && !noModel && (
        <Button
          variant="ghost"
          size="sm"
          className="relative h-8 shrink-0 gap-1.5 px-2.5 text-xs max-md:h-10 max-[479px]:w-10 max-[479px]:px-0"
          data-testid="director-rules"
          aria-label={state.rules?.on ? `${t('dir.rules.aria')}: ${t('dir.rules.on')}` : t('dir.rules.aria')}
          onClick={() => setSheet({ open: true, tab: 'rules' })}
        >
          <SlidersHorizontal className="size-3.5" aria-hidden="true" /><span className="max-[479px]:sr-only">{t('dir.rules')}</span>
          {state.rules?.on && <span className="size-1.5 rounded-full bg-cta max-[479px]:absolute max-[479px]:right-2 max-[479px]:top-2" aria-hidden="true" />}
        </Button>
      )}
      {chatId && mode !== 'off' && !noModel && (
        <DirectionSheet chatId={chatId} state={state} open={sheet.open} onOpenChange={(open) => setSheet((s) => ({ ...s, open }))} tab={sheet.tab} onTab={(tab) => setSheet((s) => ({ ...s, tab }))} />
      )}

      <label className="flex shrink-0 items-center gap-2 pl-1 text-xs">
        {noModel && <span className="text-muted-foreground" data-testid="director-need-model">{t('dir.pickModelFirst')}</span>}
        {!noModel && <span className="font-medium max-[479px]:sr-only">{t('dir.on')}</span>}
        <Switch size="default" checked={state.chat.on && !noModel} disabled={noModel} onCheckedChange={onToggle} aria-label={t('dir.switchAria')} data-testid="director-switch" />
      </label>
    </div>
  )
}

function SceneChip({ state, mode, running, onReport }: { state: DirectionState; mode: 'report' | 'empty' | 'error'; running: boolean; onReport: () => void }) {
  const t = useT()
  const lang = resolveLanguage(useApp((s) => s.settings.language))
  const { scene } = state
  const present = scene.present
  const failed = mode === 'error'
  const label = failed ? t('dir.scene.failed') : mode === 'empty' ? t('dir.scene.empty') : t(tagKey(scene.tag))
  const who = failed || mode === 'empty' || scene.source === 'none' ? '' : present.length === 1 ? t('dir.scene.with', { name: nameOf(state, present[0]) }) : present.length > 1 ? t('dir.scene.count', { n: present.length }) : ''
  const away = state.members.filter((m) => !present.includes(m.id))
  const run = lastRun(state.log)
  const at = state.report?.at
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(chipCls, running && 'animate-pulse', failed && 'border-destructive/50 text-destructive', mode === 'empty' && 'text-muted-foreground')}
            data-testid="director-scene"
            aria-label={`${t('dir.scene.aria')}: ${label}${who ? `, ${who}` : ''}`}
          >
            {failed && <Warning className="size-3.5 shrink-0" aria-hidden="true" />}
            <span className="font-medium">{running ? t('dir.scene.reading') : label}</span>
            {who && !running && <span className="max-w-32 truncate text-muted-foreground">{who}</span>}
          </button>
        }
      />
      <PopoverContent className="w-72 max-w-[calc(100vw-1rem)] p-3" align="start">
        <p className="text-sm font-medium">{t('dir.scene.title')}</p>
        {failed && (
          <p className="mt-1 text-xs text-destructive" data-testid="director-error">
            {t(errorKey(run?.reason))}{run?.message ? ` (${run.message})` : ''}. {t('dir.scene.fallback')}
          </p>
        )}
        {mode === 'empty' && <p className="mt-1 text-xs text-muted-foreground">{t('dir.scene.emptyHint')}</p>}
        {scene.source !== 'none' && (
          <div className="mt-2 flex flex-col gap-2 text-xs">
            <div>
              <p className="mb-1 font-medium">{t('dir.here')}</p>
              <ul className="flex flex-wrap gap-1">
                {present.map((id) => <li key={id} className="rounded-full bg-muted px-2 py-0.5">{nameOf(state, id)}</li>)}
                {present.length === 0 && <li className="text-muted-foreground">—</li>}
              </ul>
            </div>
            {away.length > 0 && (
              <div>
                <p className="mb-1 font-medium">{t('dir.away')}</p>
                <ul className="flex flex-wrap gap-1">
                  {away.map((m) => (
                    <li key={m.id} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-muted-foreground">
                      <DoorOpen className="size-3" aria-hidden="true" />{m.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-muted-foreground">{t(`dir.source.${scene.source}`)}</p>
          </div>
        )}
        {at ? <p className="mt-2 text-xs text-muted-foreground">{t('dir.scene.last', { time: relativeTime(at, lang) })}</p> : null}
        <Button size="sm" variant="outline" className="mt-3 w-full max-md:h-10" disabled={running} onClick={onReport} data-testid="director-report-now">
          {running ? t('dir.scene.reading') : t('dir.report')}
        </Button>
      </PopoverContent>
    </Popover>
  )
}

function ModelChip({ model, onPick }: { model: string; onPick: (ref: string, label: string, provider: string) => void }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const { current, label } = useModelEntry(model)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          model ? (
            <button type="button" className={cn(chipCls, 'max-w-48')} data-testid="director-model" aria-label={t('dir.model.aria', { name: label ?? model })}>
              <ModelMark model={current?.ref ?? model} className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate">{label}</span>
            </button>
          ) : (
            <Button variant="tonal" size="sm" className="h-8 shrink-0 rounded-full px-3 text-xs max-md:h-10" data-testid="director-model">
              <ModelMark model="" className="size-3.5" />{t('dir.pickModel')}
            </Button>
          )
        }
      />
      <PopoverContent className="w-80 max-w-[calc(100vw-1rem)] p-0" align="start">
        <div className="border-b border-border px-3 py-2">
          <p className="text-sm font-medium">{t('dir.model.title')}</p>
          <p className="text-xs text-muted-foreground">{t('dir.model.hint')}</p>
        </div>
        <ModelPalette value={model} onPick={(ref, name, provider) => { setOpen(false); onPick(ref, name, provider) }} onSettings={() => { setOpen(false); setUpModels(null) }} />
      </PopoverContent>
    </Popover>
  )
}
