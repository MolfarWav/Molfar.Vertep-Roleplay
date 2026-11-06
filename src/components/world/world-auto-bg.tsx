// "Change the background by scene": a chat switch (off by default) and the folder the Dashboard's
// sensor picks from. Used in the chat's background picker and in the World controls. The pick itself
// is applied after each Dashboard update (see applySceneBackground).

import { useEffect, useMemo, useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useT } from '@/hooks/use-t'
import { j } from '@/lib/engine'
import { useApp } from '@/lib/store'
import { loadWorldBackgrounds } from '@/lib/world'
import { ImageModelSection } from '@/components/world/world-image-model'

/** worldFolderId: the world's folder as the Backgrounds tab knows it right now (it can link one
 *  while this is open); without it the folder is read once from the engine. */
export function AutoBackground({ chatId, compact, worldFolderId }: { chatId: string; compact?: boolean; worldFolderId?: string | null }) {
  const t = useT()
  const auto = useApp((s) => s.chats.find((c) => c.id === chatId)?.autoBackground ?? null)
  const folders = useApp((s) => s.folders)
  const backgrounds = useApp((s) => s.backgrounds)
  const updateChat = useApp((s) => s.updateChat)
  const imageOn = useApp((s) => s.settings.imageGen?.enabled === true)
  const [loadedWorldFolder, setWorldFolder] = useState<string | null>(null)
  const [another, setAnother] = useState(false)
  const [dash, setDash] = useState<boolean | null>(null)
  const [styleText, setStyleText] = useState(auto?.style ?? '')
  useEffect(() => { setStyleText(auto?.style ?? '') }, [auto?.style])

  const bgFolders = useMemo(() => folders.filter((f) => f.scope === 'backgrounds'), [folders])
  useEffect(() => {
    let stale = false
    void loadWorldBackgrounds({ chatId }).then((r) => { if (!stale) setWorldFolder(r.folderId) }).catch(() => {})
    void j<{ exists?: boolean }>(`/dashboard/state?chatId=${encodeURIComponent(chatId)}&view=1`).then((r) => { if (!stale) setDash(!!r.exists) }).catch(() => { if (!stale) setDash(null) })
    return () => { stale = true }
  }, [chatId, auto?.on])

  const worldFolder = worldFolderId !== undefined ? worldFolderId : loadedWorldFolder
  const folderId = auto?.folderId && bgFolders.some((f) => f.id === auto.folderId) ? auto.folderId : ''
  // the usual case: the sensor picks from the world's own folder, shown as a line, not a second folder picker
  const worldBg = worldFolder ? bgFolders.find((f) => f.id === worldFolder) : undefined
  const fromWorld = !!worldBg && (!folderId || folderId === worldBg.id) && !another
  const countIn = (id: string) => backgrounds.filter((b) => b.folderId === id).length
  const defaultFolder = () => (worldFolder && bgFolders.some((f) => f.id === worldFolder) ? worldFolder : bgFolders[0]?.id ?? '')

  // both keep the "draw places" choice the chat already made (the spread)
  const toggle = (on: boolean) => updateChat(chatId, { autoBackground: { ...(auto ?? {}), on, folderId: folderId || defaultFolder() } })
  const pick = (id: string) => updateChat(chatId, { autoBackground: { ...(auto ?? {}), on: !!auto?.on, folderId: id } })
  const sceneOn = auto?.on === true
  const hasFolder = bgFolders.length > 0
  const drawOn = auto?.draw === true
  // the look of drawn backgrounds ("medieval fantasy, candlelight"): saved when the field loses focus, one write instead of one per key
  const saveStyle = () => {
    const style = styleText.replace(/\s+/g, ' ').trim()
    if (style === (auto?.style ?? '')) return
    updateChat(chatId, { autoBackground: { ...(auto ?? { on: false, folderId: defaultFolder() }), style: style || undefined } })
  }
  const setDraw = (draw: boolean) => auto && updateChat(chatId, { autoBackground: { ...auto, draw } })

  return (
    <div className="flex flex-col gap-2" data-testid="auto-background">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 text-sm">
          {t('world.bg.auto')}
          {!compact && <span className="block text-xs text-muted-foreground">{t('world.bg.autoHint')}</span>}
        </span>
        <Switch checked={!!auto?.on} onCheckedChange={toggle} aria-label={t('world.bg.auto')} data-testid="auto-background-switch" />
      </div>
      {compact && <p className="text-xs text-muted-foreground">{t('world.bg.autoHint')}</p>}
      {auto?.on && (
        bgFolders.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('world.bg.autoNoFolder')}</p>
        ) : fromWorld && worldBg ? (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground" data-testid="auto-background-world">
            <span className="min-w-0">{t('world.bg.autoFromWorld', { name: worldBg.name, n: countIn(worldBg.id) })}</span>
            {bgFolders.length > 1 && (
              <button type="button" className="min-h-10 shrink-0 font-semibold text-primary hover:underline md:min-h-0" onClick={() => setAnother(true)}>
                {t('world.bg.autoOther')}
              </button>
            )}
          </div>
        ) : (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted-foreground">{t('world.bg.autoFolder')}</span>
            <Select value={folderId || worldBg?.id || ''} onValueChange={(v) => v && pick(v)}>
              <SelectTrigger className="h-10 md:h-9" aria-label={t('world.bg.autoFolder')} data-testid="auto-background-folder"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {bgFolders.map((f) => <SelectItem key={f.id} value={f.id}>{f.name} ({countIn(f.id)}){f.id === worldBg?.id ? ` · ${t('world.bg.autoWorldMark')}` : ''}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>
        )
      )}
      {/* the drawing controls live in World > Backgrounds; the chat's Display sheet (compact) only links there */}
      {/* shown even while the scene switch is off (greyed, with the reason), so the option can be found before it is usable */}
      {!compact && (
        <div className="flex flex-col gap-2 border-t border-border pt-2" data-testid="auto-background-draw-block">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 text-sm">
              {t('world.bg.drawMissing')}
              <span className="block text-xs text-muted-foreground">{t('world.bg.drawHint')}</span>
            </span>
            <Switch checked={drawOn && imageOn} disabled={!sceneOn || !hasFolder || !imageOn} onCheckedChange={setDraw} aria-label={t('world.bg.drawMissing')} data-testid="auto-background-draw" />
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span>{t('world.bg.style')}</span>
            <Input
              className="h-10 md:h-9"
              value={styleText}
              maxLength={200}
              placeholder={t('world.bg.stylePh')}
              onChange={(e) => setStyleText(e.target.value)}
              onBlur={saveStyle}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
              data-testid="auto-background-style"
            />
            <span className="text-xs text-muted-foreground">{t('world.bg.styleHint')}</span>
          </label>
          {!sceneOn && <p className="text-xs text-muted-foreground" data-testid="auto-background-draw-need-scene">{t('world.bg.drawNeedScene')}</p>}
          {sceneOn && !hasFolder && <p className="text-xs text-muted-foreground" data-testid="auto-background-draw-need-folder">{t('world.bg.drawNeedFolder')}</p>}
          {sceneOn && hasFolder && !imageOn && <p className="text-xs text-muted-foreground" data-testid="auto-background-draw-off">{t('world.bg.drawNoImage')}</p>}
          {sceneOn && hasFolder && imageOn && drawOn && (
            <div className="flex flex-col gap-1" data-testid="auto-background-draw-model">
              <span className="text-xs text-muted-foreground">{t('world.bg.drawModel')}</span>
              <ImageModelSection chatId={chatId} />
            </div>
          )}
        </div>
      )}
      {auto?.on && dash === false && <p className="text-xs text-amber-700 dark:text-amber-300">{t('world.bg.autoNeedDash')}</p>}
    </div>
  )
}
