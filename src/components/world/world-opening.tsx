// The chat's own opening: its scenario and first message, drafted by the DM from the chat's world and
// edited by the player. Used when a chat is made in a world (before it opens) and from a chat's Start
// tab and Overview. One dialog, mounted once in the app shell and opened through the store.

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Sparkle } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/hooks/use-t'
import { ApiError } from '@/lib/engine'
import { resolveLanguage } from '@/lib/i18n'
import { useApp } from '@/lib/store'
import { LANG_ENGLISH } from '@/lib/world-start'
import { draftWorldOpening, loadWorldScenario, setWorldOverride, type WorldErrorCode } from '@/lib/world'
import { WorldErrorCard } from './world-controls'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** The dialog the store opens (`worldOpening`); keyed by the chat so a second request starts clean. */
export function WorldOpeningDialog() {
  const o = useApp((s) => s.worldOpening)
  if (!o) return null
  return <OpeningBody key={`${o.chatId}:${o.fresh}`} chatId={o.chatId} fresh={o.fresh} />
}

function OpeningBody({ chatId, fresh }: { chatId: string; fresh: boolean }) {
  const t = useT()
  const lang = resolveLanguage(useApp((s) => s.settings.language))
  const close = useApp((s) => s.closeWorldOpening)
  const [started, setStarted] = useState(false)
  const [wish, setWish] = useState('')
  const [scenario, setScenario] = useState('')
  const [opening, setOpening] = useState('')
  const [append, setAppend] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<{ code: WorldErrorCode; message: string } | null>(null)
  const [ready, setReady] = useState(false)

  // the chat's own scenario, if it has one; and whether the player has written yet
  useEffect(() => {
    let live = true
    loadWorldScenario(chatId)
      .then((r) => {
        if (!live) return
        setStarted(r.started)
        if (r.scenario) {
          setScenario(r.scenario.text)
          setAppend(r.scenario.mode === 'append')
        }
      })
      .catch(() => {})
      .finally(() => { if (live) setReady(true) })
    return () => { live = false }
  }, [chatId])

  const draft = async () => {
    setDrafting(true)
    setErr(null)
    try {
      const r = await draftWorldOpening(chatId, { wish: wish.trim() || undefined, lang: LANG_ENGLISH[lang] })
      if (r.ok) {
        if (r.scenario) setScenario(r.scenario)
        if (r.opening && !started) setOpening(r.opening)
      } else {
        setErr({ code: r.code ?? 'other', message: r.error ?? '' })
      }
    } catch (e) {
      setErr({ code: 'other', message: errText(e) })
    } finally {
      setDrafting(false)
    }
  }

  const finish = () => {
    close()
    if (fresh) {
      void useApp.getState().reloadChat(chatId).finally(() => useApp.getState().openChat(chatId))
    }
  }

  const save = async () => {
    setSaving(true)
    const sc = scenario.trim() ? { text: scenario.trim(), mode: append ? ('append' as const) : ('replace' as const) } : null
    const first = opening.trim()
    try {
      try {
        await setWorldOverride(chatId, { scenario: sc, ...(first && !started ? { opening: first } : {}) })
        if (!fresh) toast.success(t('world.open.saved'))
      } catch (e) {
        // the player wrote in the meantime: keep what can still change
        if (e instanceof ApiError && e.status === 409) {
          await setWorldOverride(chatId, { scenario: sc })
          toast.info(t('world.open.started'))
        } else throw e
      }
      finish()
    } catch (e) {
      toast.error(errText(e))
      setSaving(false)
    }
  }

  const busy = drafting || saving
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) fresh ? finish() : close() }}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-3 overflow-y-auto sm:max-w-xl" data-testid="world-opening">
        <DialogHeader>
          <DialogTitle>{t('world.open.title')}</DialogTitle>
          <DialogDescription>{t('world.open.lead')}</DialogDescription>
        </DialogHeader>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t('world.open.wish')}</span>
          <Input value={wish} onChange={(e) => setWish(e.target.value)} placeholder={t('world.open.wishPh')} className="h-10 md:h-9" disabled={busy} />
        </label>
        <Button variant="outline" className="self-start max-md:h-10" disabled={busy || !ready} onClick={() => void draft()} data-testid="opening-draft">
          <Sparkle className="size-4" aria-hidden="true" />
          {drafting ? t('world.open.drafting') : scenario || opening ? t('world.open.draftAgain') : t('world.open.draft')}
        </Button>
        {err && <WorldErrorCard error={err} again={false} busy={busy} onRetry={() => void draft()} />}

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t('world.open.scenario')}</span>
          <Textarea value={scenario} onChange={(e) => setScenario(e.target.value)} rows={5} disabled={saving} data-testid="opening-scenario" />
          <span className="text-xs text-muted-foreground">{t('world.open.scenarioHint')}</span>
        </label>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="min-w-0">{t('world.open.append')}<span className="block text-xs text-muted-foreground">{t('world.open.appendHint')}</span></span>
          <Switch checked={append} onCheckedChange={setAppend} aria-label={t('world.open.append')} />
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t('world.open.first')}</span>
          <Textarea value={opening} onChange={(e) => setOpening(e.target.value)} rows={6} disabled={saving || started} data-testid="opening-first" />
          <span className="text-xs text-muted-foreground">{started ? t('world.open.firstLocked') : t('world.open.firstHint')}</span>
        </label>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
          {fresh ? (
            <Button variant="ghost" className="max-md:h-10" disabled={busy} onClick={finish} data-testid="opening-skip">{t('world.open.skip')}</Button>
          ) : (
            <Button variant="ghost" className="max-md:h-10" disabled={busy} onClick={close}>{t('home.cancel')}</Button>
          )}
          <Button className="max-md:h-10" disabled={busy || !ready} onClick={() => void save()} data-testid="opening-start">
            {fresh ? t('world.open.start') : t('world.open.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
