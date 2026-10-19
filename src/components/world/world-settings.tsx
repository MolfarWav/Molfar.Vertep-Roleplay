import { useEffect, useState } from 'react'
import { Check } from '@phosphor-icons/react'
import { NeedsYouSwitch } from '@/components/shell/needs-you-switch'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { fetchImageModels, type ImageModelInfo } from '@/lib/engine'
import { useApp } from '@/lib/store'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SoulModelPicker } from '@/components/dashboard/soul-model-picker'
import { useT } from '@/hooks/use-t'
import { canOpenModelSettings, openModelSettings } from '@/lib/shell-bridge'
import { FROM_KEY, formatSeconds } from '@/components/world/world-common'
import { WorldErrorCard } from '@/components/world/world-controls'
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
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  chatId: string | null
  chatTitle: string
}) {
  const t = useT()
  const [config, setConfig] = useState<WorldConfig | null>(null)
  const [overriding, setOverriding] = useState(false)
  const [testResult, setTestResult] = useState<WorldTest | null>(null)
  const [testing, setTesting] = useState(false)
  const [imageModels, setImageModels] = useState<ImageModelInfo[]>([])
  const [imgOverride, setImgOverride] = useState(false)
  const appImageModel = useApp((s) => s.settings.imageGen?.model ?? '')
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
        setImgOverride(c.imageModel !== '')
      })
      .catch((e) => {
        if (live) toast.error(errText(e))
      })
    void fetchImageModels().then((m) => { if (live) setImageModels(m) })
    if (chatId) {
      loadWorld(chatId).catch((e) => toast.error(errText(e)))
    }
    return () => {
      live = false
    }
  }, [open, chatId])

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

  const saveImage = async (patch: { imageModel?: string; autoBackground?: boolean }) => {
    try {
      setConfig(await saveWorldConfig(patch, chatId ?? undefined))
    } catch (e) {
      toast.error(errText(e))
    }
  }
  const imageName = (ref: string) => {
    const m = imageModels.find((x) => `${x.provider}/${x.id}` === ref)
    return m ? m.favorite?.name || m.label : ref
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
          <div className="flex flex-col gap-5">
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{t('world.settings.play')}</h3>
              <div className="flex flex-col gap-1">
                <p className="break-all font-mono text-sm">{config.play.model || t('world.chatModel')}</p>
                <p className="text-xs text-muted-foreground">{t(FROM_KEY[config.play.from])}</p>
                <p className="text-xs text-muted-foreground">{t('world.settings.playHint')}</p>
                {chatId && (
                  <p className="text-xs text-muted-foreground">
                    {t('world.settings.forChat', { title: chatTitle })}
                  </p>
                )}
              </div>

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
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{t('world.settings.limit')}</h3>
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
            </section>

            <section className="flex flex-col gap-2" data-testid="world-settings-image">
              <h3 className="text-sm font-medium">{t('world.settings.image')}</h3>
              <p className="break-all text-sm">
                {config.imageModel
                  ? <><span className="font-mono">{imageName(config.imageModel)}</span> <span className="text-xs text-muted-foreground">({t('world.bg.modelWorld')})</span></>
                  : appImageModel
                    ? <><span className="font-mono">{imageName(appImageModel)}</span> <span className="text-xs text-muted-foreground">({t('world.settings.imageApp')})</span></>
                    : <span className="text-muted-foreground">{t('world.settings.imageNone')}</span>}
              </p>
              <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm">
                <Checkbox
                  checked={imgOverride}
                  onCheckedChange={(v) => {
                    setImgOverride(!!v)
                    if (!v && config.imageModel) void saveImage({ imageModel: '' })
                  }}
                  aria-label={t('world.settings.imageOverride')}
                />
                <span className="min-w-0">{t('world.settings.imageOverride')}</span>
              </label>
              {imgOverride && imageModels.length > 0 && (
                <Select value={config.imageModel || undefined} onValueChange={(v) => v && void saveImage({ imageModel: v })}>
                  <SelectTrigger className="h-10 md:h-9" aria-label={t('world.settings.image')} data-testid="world-settings-image-model">
                    <SelectValue placeholder={t('world.settings.image')}>{(v) => imageName(String(v))}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {imageModels.map((m) => (
                        <SelectItem key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
                          <span className="text-xs">{m.favorite?.name || m.label}</span>
                          <span className="ml-1.5 text-[10px] text-muted-foreground">{m.connectionName ?? m.provider}</span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 text-sm">
                  {t('world.settings.autoBg')}
                  <span className="block text-xs text-muted-foreground">{t('world.settings.autoBgHint')}</span>
                </span>
                <Switch checked={config.autoBackground} onCheckedChange={(v) => void saveImage({ autoBackground: v })} aria-label={t('world.settings.autoBg')} data-testid="world-settings-autobg" />
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <Button
                variant="outline"
                className="self-start max-md:h-10"
                disabled={testing}
                onClick={() => void runTest()}
              >
                {testing ? t('world.settings.testing') : t('world.settings.test')}
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
            </section>

            <section>
              <NeedsYouSwitch kind="failed" label="attn.set.failed" hint="attn.set.failedHint" />
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
