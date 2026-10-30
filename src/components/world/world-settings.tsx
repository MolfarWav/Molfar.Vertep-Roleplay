import { useEffect, useRef, useState } from 'react'
import { Check } from '@phosphor-icons/react'
import { NeedsYouSwitch } from '@/components/shell/needs-you-switch'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SoulModelPicker } from '@/components/dashboard/soul-model-picker'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { canOpenModelSettings, openModelSettings } from '@/lib/shell-bridge'
import { FROM_KEY, formatSeconds } from '@/components/world/world-common'
import { WorldErrorCard } from '@/components/world/world-controls'
import { ImageModelSection } from '@/components/world/world-image-model'
import {
  loadWorld,
  loadWorldConfig,
  saveWorldConfig,
  testWorldModel,
  useWorldLive,
  type WorldConfig,
  type WorldTest,
} from '@/lib/world'
import { toast } from 'sonner'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function WorldSettingsDialog({
  open,
  onOpenChange,
  chatId,
  chatTitle,
  focus = null,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** 'build': scroll to the Build model row and mark it for a moment */
  focus?: 'build' | null
  chatId: string | null
  chatTitle: string
}) {
  const t = useT()
  const [config, setConfig] = useState<WorldConfig | null>(null)
  const [overriding, setOverriding] = useState(false)
  const [testResult, setTestResult] = useState<WorldTest | null>(null)
  const [testing, setTesting] = useState(false)
  const [flash, setFlash] = useState(false)
  const buildRef = useRef<HTMLDivElement>(null)
  const live = useWorldLive((s) => (chatId ? s.views[chatId] : undefined))
  const lastLimit = live?.lastRun?.limit

  useEffect(() => {
    if (!open) return
    setTestResult(null)
    let live = true
    loadWorldConfig(chatId ?? undefined)
      .then((c) => {
        if (!live) return
        setConfig(c)
        setOverriding(c.model !== '')
      })
      .catch((e) => {
        if (live) toast.error(errText(e))
      })
    if (chatId) {
      loadWorld(chatId).catch((e) => toast.error(errText(e)))
    }
    return () => {
      live = false
    }
  }, [open, chatId])

  // "Pick another model" next to a world build lands on the Build model row
  const ready = config !== null
  useEffect(() => {
    if (!open || focus !== 'build' || !ready) return
    const go = window.setTimeout(() => {
      buildRef.current?.scrollIntoView({ block: 'center' })
      buildRef.current?.focus({ preventScroll: true })
      setFlash(true)
    }, 150)
    const stop = window.setTimeout(() => setFlash(false), 3000)
    return () => {
      window.clearTimeout(go)
      window.clearTimeout(stop)
      setFlash(false)
    }
  }, [open, focus, ready])

  const handleBuildPick = async (ref: string) => {
    try {
      setConfig(await saveWorldConfig({ buildModel: ref }, chatId ?? undefined))
    } catch (e) {
      toast.error(errText(e))
    }
  }

  const handleOverrideCheck = async (checked: boolean) => {
    if (!config) return
    if (!checked) {
      try {
        const c = await saveWorldConfig({ model: '' }, chatId ?? undefined)
        setConfig(c)
        setOverriding(false)
        if (chatId) void loadWorld(chatId)
      } catch (e) {
        toast.error(errText(e))
      }
    } else {
      setOverriding(true)
    }
  }

  const handlePick = async (ref: string) => {
    try {
      const c = await saveWorldConfig({ model: ref }, chatId ?? undefined)
      setConfig(c)
      setOverriding(true)
      if (chatId) await loadWorld(chatId)
    } catch (e) {
      toast.error(errText(e))
    }
  }

  const saveAutoBg = async (autoBackground: boolean) => {
    try {
      setConfig(await saveWorldConfig({ autoBackground }, chatId ?? undefined))
    } catch (e) {
      toast.error(errText(e))
    }
  }

  const openConnections = () => {
    if (!config) return
    if (!canOpenModelSettings()) {
      toast.info(t('world.connectionsHint'))
      return
    }
    void openModelSettings(config.play.model).catch(() => toast.info(t('world.connectionsHint')))
  }

  const runTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const r = await testWorldModel('play', chatId ?? undefined)
      setTestResult(r)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setTesting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('world.settings.title')}</DialogTitle>
          <DialogDescription>{t('world.settings.lead')}</DialogDescription>
        </DialogHeader>

        {!config ? (
          <p className="text-sm text-muted-foreground">{t('chats.panel.loading')}</p>
        ) : (
          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-3" data-testid="world-settings-text">
              <h3 className="border-b pb-1 text-base font-semibold">{t('world.settings.secText')}</h3>
              <div className="flex flex-col gap-2">
                <h4 className="text-sm font-medium">{t('world.settings.play')}</h4>
                <p className="break-all font-mono text-sm">{config.play.model || t('world.chatModel')}</p>
                <p className="text-xs text-muted-foreground">{t(FROM_KEY[config.play.from])}</p>
                <p className="text-xs text-muted-foreground">{t('world.settings.playHint')}</p>
                {chatId && (
                  <p className="text-xs text-muted-foreground">
                    {t('world.settings.forChat', { title: chatTitle })}
                  </p>
                )}
                <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm">
                  <Checkbox
                    checked={overriding}
                    onCheckedChange={(v) => void handleOverrideCheck(!!v)}
                    aria-label={t('world.settings.override')}
                  />
                  <span className="min-w-0">{t('world.settings.override')}</span>
                </label>
                {overriding && (
                  <div className="flex flex-wrap items-center gap-2">
                    <SoulModelPicker label={t('dash.set.chooseModel')} onPick={(ref) => void handlePick(ref)} />
                    {config.model && <span className="break-all font-mono text-xs">{config.model}</span>}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <h4 className="text-sm font-medium">{t('world.settings.limit')}</h4>
                {lastLimit ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm text-muted-foreground">
                      {lastLimit.fromModel
                        ? t('world.settings.limitModel', { max: lastLimit.max })
                        : t('world.settings.limitDefault', { max: lastLimit.max })}
                    </p>
                    {!lastLimit.fromModel && (
                      <Button variant="outline" size="sm" className="max-md:h-10" onClick={openConnections}>
                        {t('world.openConnections')}
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('world.settings.limitNone')}</p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Button variant="outline" className="self-start max-md:h-10" disabled={testing} onClick={() => void runTest()}>
                  {testing ? t('world.settings.testing') : t('world.settings.testPlay')}
                </Button>
                {testResult && (
                  <div className="text-sm">
                    {testResult.ok ? (
                      <p className="flex items-start gap-2 text-emerald-600 dark:text-emerald-400">
                        <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 break-words">
                          {t('world.settings.works', {
                            model: testResult.model,
                            sec: formatSeconds(testResult.ms),
                            max: testResult.limit?.max ?? '–',
                          })}
                          {testResult.thinks ? ` · ${t('world.settings.thinks')}` : ''}
                        </span>
                      </p>
                    ) : (
                      <WorldErrorCard
                        again={false}
                        model={config.play.model}
                        error={{
                          code: testResult.code ?? 'other',
                          message: testResult.message ?? '',
                          details: testResult.details,
                          limit: testResult.limit,
                        }}
                      />
                    )}
                  </div>
                )}
              </div>

              <div
                ref={buildRef}
                tabIndex={-1}
                className={cn('-m-2 flex flex-col gap-2 rounded-md p-2 outline-none transition-colors', flash && 'bg-primary/10 ring-1 ring-primary/50')}
                data-testid="world-settings-build"
              >
                <h4 className="text-sm font-medium">{t('world.settings.build')}</h4>
                <p className="break-all font-mono text-sm" data-testid="world-settings-build-model">{config.build.model || t('world.chatModel')}</p>
                <p className="text-xs text-muted-foreground" data-testid="world-settings-build-from">{t(FROM_KEY[config.build.from])}</p>
                <p className="text-xs text-muted-foreground">{t('world.settings.buildHint')}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <SoulModelPicker label={t('dash.set.chooseModel')} onPick={(ref) => void handleBuildPick(ref)} />
                  {config.buildModel && (
                    <Button variant="outline" size="sm" className="max-md:h-10" onClick={() => void handleBuildPick('')} data-testid="world-settings-build-clear">
                      {t('world.settings.buildDefault')}
                    </Button>
                  )}
                </div>
              </div>
            </section>

            <section className="flex flex-col gap-3" data-testid="world-settings-image">
              <h3 className="border-b pb-1 text-base font-semibold">{t('world.settings.secImages')}</h3>
              <h4 className="text-sm font-medium">{t('world.settings.image')}</h4>
              <ImageModelSection chatId={chatId} />
            </section>

            <section className="flex flex-col gap-3">
              <h3 className="border-b pb-1 text-base font-semibold">{t('world.settings.secBg')}</h3>
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 text-sm">
                  {t('world.settings.autoBg')}
                  <span className="block text-xs text-muted-foreground">{t('world.settings.autoBgHint')}</span>
                </span>
                <Switch checked={config.autoBackground} onCheckedChange={(v) => void saveAutoBg(v)} aria-label={t('world.settings.autoBg')} data-testid="world-settings-autobg" />
              </div>
            </section>

            <section className="flex flex-col gap-3">
              <h3 className="border-b pb-1 text-base font-semibold">{t('world.settings.secFailures')}</h3>
              <NeedsYouSwitch kind="failed" label="attn.set.failed" hint="attn.set.failedHint" />
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
