// "Change the background by scene": a chat switch (off by default) and the folder the Dashboard's
// sensor picks from. Used in the chat's background picker and in the World controls. The pick itself
// is applied after each Dashboard update (see applySceneBackground).

import { useEffect, useMemo, useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useT } from '@/hooks/use-t'
import { j } from '@/lib/engine'
import { useApp } from '@/lib/store'
import { loadWorldBackgrounds } from '@/lib/world'

/** worldFolderId: the world's folder as the Backgrounds tab knows it right now (it can link one
 *  while this is open); without it the folder is read once from the engine. */
export function AutoBackground({ chatId, compact, worldFolderId }: { chatId: string; compact?: boolean; worldFolderId?: string | null }) {
  const t = useT()
  const auto = useApp((s) => s.chats.find((c) => c.id === chatId)?.autoBackground ?? null)
  const folders = useApp((s) => s.folders)
  const backgrounds = useApp((s) => s.backgrounds)
  const updateChat = useApp((s) => s.updateChat)
  const [loadedWorldFolder, setWorldFolder] = useState<string | null>(null)
  const [another, setAnother] = useState(false)
  const [dash, setDash] = useState<boolean | null>(null)

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

  const toggle = (on: boolean) => updateChat(chatId, { autoBackground: { on, folderId: folderId || defaultFolder() } })
  const pick = (id: string) => updateChat(chatId, { autoBackground: { on: !!auto?.on, folderId: id } })

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
      {auto?.on && dash === false && <p className="text-xs text-amber-700 dark:text-amber-300">{t('world.bg.autoNeedDash')}</p>}
    </div>
  )
}
