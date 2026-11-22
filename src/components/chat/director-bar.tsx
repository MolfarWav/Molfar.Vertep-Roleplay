import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { DoorOpen, FilmSlate, ListBullets, Lock, Warning, X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { ModelMark } from '@/components/model-mark'
import { ModelPalette, setUpModels, useModelEntry } from '@/components/chat/model-palette'
import { GroupMemberBar } from '@/components/chat/group-member-bar'
import { useT } from '@/hooks/use-t'
import { useIsMobile } from '@/hooks/use-mobile'
import { relativeTime, resolveLanguage } from '@/lib/i18n'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { runDirection, saveDirectionModel, setDirectionChat, useDirectionLive, type DirectionState } from '@/lib/direction'
import { barMode, errorKey, lastRun, namesOf, nameOf, tagKey, useDirectionState } from '@/lib/direction-ui'
import type { Character, Chat } from '@/lib/types'

type T = ReturnType<typeof useT>

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
    />
  )
}

export function DirectorBarView({ state, running, onPickModel, onToggle, onReport, onRelease }: {
  state: DirectionState
  running: boolean
  onPickModel: (ref: string, label: string, provider: string) => void
  onToggle: (on: boolean) => void
  onReport: () => void
  onRelease: () => void
}) {
  const t = useT()
  const mode = barMode(state)
  const noModel = mode === 'no-model'
  const lock = state.chat.lock
  return (
    <div
      role="group"
      aria-label={t('dir.title')}
      data-testid="director-bar"
      data-mode={mode}
      className="relative z-10 flex items-center gap-1.5 overflow-x-auto border-b border-border bg-card/70 px-2 py-1 backdrop-blur"
    >
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

      {(mode === 'report' || mode === 'empty' || mode === 'error') && <SceneChip state={state} mode={mode} running={running} onReport={onReport} />}

      {mode !== 'off' && <ModelChip model={state.config.model} onPick={onPickModel} />}

      <label className="ml-auto flex shrink-0 items-center gap-2 pl-1 text-xs">
        {noModel && <span className="text-muted-foreground" data-testid="director-need-model">{t('dir.pickModelFirst')}</span>}
        {!noModel && <span className="font-medium">{t('dir.on')}</span>}
        <Switch size="default" checked={state.chat.on && !noModel} disabled={noModel} onCheckedChange={onToggle} aria-label={t('dir.switchAria')} data-testid="director-switch" />
      </label>

      {mode !== 'off' && !noModel && <LogButton state={state} />}
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
            {t(errorKey(run?.reason))}{run?.message ? ` (${run.message})` : ''} {t('dir.scene.fallback')}
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

function LogButton({ state }: { state: DirectionState }) {
  const t = useT()
  const mobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const trigger = (
    <Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1.5 px-2.5 text-xs max-md:h-10" data-testid="director-log" onClick={mobile ? () => setOpen(true) : undefined}>
      <ListBullets className="size-3.5" aria-hidden="true" />{t('dir.log')}
    </Button>
  )
  if (mobile) {
    return (
      <>
        {trigger}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="max-h-[80dvh] gap-2 p-0">
            <SheetHeader><SheetTitle>{t('dir.log.title')}</SheetTitle></SheetHeader>
            <div className="min-h-0 overflow-y-auto px-4 pb-4"><DirectionLog state={state} /></div>
          </SheetContent>
        </Sheet>
      </>
    )
  }
  return (
    <Popover>
      <PopoverTrigger render={trigger} />
      <PopoverContent className="w-96 max-w-[calc(100vw-1rem)] p-3" align="end">
        <p className="mb-2 text-sm font-medium">{t('dir.log.title')}</p>
        <DirectionLog state={state} />
      </PopoverContent>
    </Popover>
  )
}

/** The log in words, newest first: the director's reports and every switch, lock, release and error. */
export function DirectionLog({ state }: { state: DirectionState }) {
  const t = useT()
  const lang = resolveLanguage(useApp((s) => s.settings.language))
  if (state.log.length === 0) return <p className="text-xs text-muted-foreground" data-testid="director-log-empty">{t('dir.log.empty')}</p>
  return (
    <ol className="flex flex-col gap-1.5" data-testid="director-log-list">
      {state.log.map((e, i) => {
        let line: ReactNode
        let detail = ''
        if (e.kind === 'report') {
          line = `${t(tagKey(e.tag ?? null))}${e.present ? ` · ${namesOf(state, e.present, 4)}` : ''}`
          detail = [e.ms ? `${e.ms} ms` : '', e.usage ? `${e.usage.input}+${e.usage.output} ${t('dir.log.tokens')}` : '', e.retried ? t('dir.log.retried') : ''].filter(Boolean).join(' · ')
        } else if (e.kind === 'error') {
          line = `${t('dir.log.error')}: ${t(errorKey(e.reason))}`
          detail = e.message ?? ''
        } else if (e.kind === 'lock') line = t('dir.log.lock', { names: namesOf(state, e.ids ?? [], 4) })
        else if (e.kind === 'release') line = t('dir.log.release', { names: namesOf(state, e.ids ?? [], 4) })
        else if (e.kind === 'on') line = t('dir.log.on')
        else if (e.kind === 'off') line = t('dir.log.off')
        else line = e.kind
        return (
          <li key={`${e.at}-${i}`} className={cn('rounded-md border px-2 py-1 text-xs', e.kind === 'error' ? 'border-destructive/40 text-destructive' : 'border-border')}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 break-words font-medium">{line}</span>
              <span className="shrink-0 text-muted-foreground">{relativeTime(e.at, lang)}</span>
            </div>
            {detail && <p className="break-words text-muted-foreground">{detail}</p>}
          </li>
        )
      })}
    </ol>
  )
}
