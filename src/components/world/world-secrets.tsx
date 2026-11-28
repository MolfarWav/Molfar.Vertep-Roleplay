// "Secret threads" (#545): the chat's World DM card for the hidden through-lines the DM keeps and plays. The switch (how many),
// the hint timer, a mark under hinted replies, one status line that gives nothing away, and behind a spoiler: the threads
// (edit, drop, send the next hint) and the log of what was sent or held and why.
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { EyeSlash } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Fold } from '@/components/ui/fold'
import { Section } from '@/components/ui/section'
import { NumControl, Segmented, SettingRow } from '@/components/ui/setting-row'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useRelativeTime, useT } from '@/hooks/use-t'
import type { MsgKey } from '@/lib/i18n'
import { loadWorld, loadWorldSecrets, postWorldSecret, refreshDice, type WorldSecret, type WorldSecretLine, type WorldSecrets, type WorldView } from '@/lib/world'
import { isRevealed, markRevealed } from '@/lib/world-reveal'

type T = ReturnType<typeof useT>

/** The one line above the spoiler: counts and the timer, never what a thread holds. */
export function secretStatusLine(t: T, view: Pick<WorldView, 'secrets' | 'settings'>): string {
  const s = view.secrets
  if (!s || !s.count) return t('world.secret.none')
  const n = t('world.secret.count', { n: s.count })
  if (!view.settings.insert) return `${n} · ${t('world.secret.noInsert')}`
  if (s.held) return `${n} · ${t('world.secret.heldNow', { why: t(`world.secret.why.${s.held}` as MsgKey) })}`
  if (s.nextIn === 1) return `${n} · ${t('world.secret.nextNow')}`
  if (s.nextIn) return `${n} · ${t('world.secret.nextIn', { n: s.nextIn })}`
  return `${n} · ${t(view.settings.hintEvery === 0 ? 'world.secret.eventsOnly' : 'world.secret.noHint')}`
}

export function secretLogLine(t: T, l: WorldSecretLine): string {
  if (l.what === 'held') return t('world.secret.log.held', { id: l.id, why: t(`world.secret.why.${l.why}` as MsgKey) })
  const line = t(`world.secret.log.${l.what}` as MsgKey, { id: l.id })
  return l.text ? `${line}: ${l.text}` : line
}

function EditDialog({ thread, onClose, onSave }: { thread: WorldSecret; onClose: () => void; onSave: (idea: string, hint: string) => Promise<boolean> }) {
  const t = useT()
  const [idea, setIdea] = useState(thread.idea)
  const [hint, setHint] = useState(thread.hint)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    if (await onSave(idea.trim(), hint.trim())) onClose()
    else setBusy(false)
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md" data-testid="secret-edit">
        <DialogHeader>
          <DialogTitle>{t('world.secret.editTitle')}</DialogTitle>
        </DialogHeader>
        <label className="flex flex-col gap-1 text-body">
          <span className="font-medium">{t('world.secret.idea')}</span>
          <Textarea value={idea} maxLength={300} rows={4} onChange={(e) => setIdea(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-body">
          <span className="font-medium">{t('world.secret.hint')}</span>
          <Textarea value={hint} maxLength={200} rows={2} onChange={(e) => setHint(e.target.value)} />
        </label>
        <DialogFooter>
          <Button variant="outline" className="max-md:h-11" onClick={onClose}>{t('home.cancel')}</Button>
          <Button className="max-md:h-11" disabled={busy || !idea.trim()} onClick={() => void submit()}>{t('world.secret.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The spoiler: read when opened, so nothing of a thread is in the page before the player asks. */
function Spoiler({ chatId, stamp }: { chatId: string; stamp: string }) {
  const t = useT()
  const relativeTime = useRelativeTime()
  const [data, setData] = useState<WorldSecrets | null>(null)
  const [editing, setEditing] = useState<WorldSecret | null>(null)
  const [confirm, confirmDialog] = useConfirm()
  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : String(e))

  const load = useCallback(() => {
    loadWorldSecrets(chatId).then(setData).catch(fail)
  }, [chatId])
  useEffect(() => { load() }, [load, stamp])

  const act = async (op: 'edit' | 'drop' | 'next', id: string, extra?: { idea: string; hint: string }) => {
    try {
      setData(await postWorldSecret(chatId, op, id, extra))
      await loadWorld(chatId)
      return true
    } catch (e) {
      fail(e)
      return false
    }
  }

  if (!data) return <p className="px-4 py-3 text-caption text-muted-foreground">{t('chats.panel.loading')}</p>
  const log = data.log
  return (
    <div className="flex flex-col divide-y divide-border" data-testid="secret-spoiler">
      {confirmDialog}
      {editing && <EditDialog thread={editing} onClose={() => setEditing(null)} onSave={(idea, hint) => act('edit', editing.id, { idea, hint })} />}
      {data.secrets.map((x) => (
        <div key={x.id} className="flex flex-col gap-1.5 px-4 py-3" data-testid={`secret-${x.id}`}>
          <p className="text-body break-words">
            <span className="mr-1.5 font-semibold text-muted-foreground">{x.id}</span>
            {x.idea}
            {x.status === 'done' && <Badge variant="outline" className="ml-2 text-xs">{t('world.secret.done')}</Badge>}
          </p>
          {x.surfaced.length > 0 && <p className="text-caption text-muted-foreground break-words">{t('world.secret.surfaced', { text: x.surfaced.join(' · ') })}</p>}
          {x.status === 'active' && (
            <p className="text-caption text-muted-foreground break-words">
              {x.hint ? t(x.hintUsed ? 'world.secret.hintUsed' : 'world.secret.hintNext', { text: x.hint }) : t('world.secret.hintNone')}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="max-md:h-10" onClick={() => setEditing(x)}>{t('world.secret.edit')}</Button>
            {x.status === 'active' && x.hint && (
              <Button variant="outline" size="sm" className="max-md:h-10" disabled={data.next === x.id} onClick={() => void act('next', x.id)}>
                {t(data.next === x.id ? 'world.secret.queued' : 'world.secret.sendNext')}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive max-md:h-10"
              onClick={() => void confirm({ title: t('world.secret.dropTitle'), description: t('world.secret.dropWarn'), actionLabel: t('world.secret.drop') }).then((yes) => { if (yes) void act('drop', x.id) })}
            >
              {t('world.secret.drop')}
            </Button>
          </div>
        </div>
      ))}
      {data.secrets.length === 0 && <p className="px-4 py-3 text-caption text-muted-foreground">{t('world.secret.none')}</p>}
      <div data-testid="secret-log">
        <Fold id="secret-log" title={t('world.secret.log')} summary={log.length ? secretLogLine(t, log[0]!) : t('world.secret.log.empty')} flat>
          <div className="flex flex-col gap-1 px-4 py-2">
            {log.length === 0 && <p className="text-caption text-muted-foreground">{t('world.secret.log.empty')}</p>}
            {log.length > 0 && (
              <ul className="flex flex-col gap-1 text-caption">
                {log.map((l, i) => (
                  <li key={`${l.at}-${i}`} className="break-words text-foreground">
                    {secretLogLine(t, l)} <span className="text-muted-foreground">· {relativeTime(l.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Fold>
      </div>
    </div>
  )
}

export function SecretsCard({ chatId, view, save, on }: {
  chatId: string
  view: WorldView
  save: (patch: Partial<WorldView['settings']>) => Promise<unknown>
  /** the DM is on for this chat (off = the card is dimmed and its controls are disabled) */
  on: boolean
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [confirm, confirmDialog] = useConfirm()
  const count = view.settings.secrets ?? 0
  const every = view.settings.hintEvery ?? 6
  const stamp = `${view.lastRunAt ?? 0}|${view.usage.runs}|${view.secrets?.count}|${view.secrets?.held}`
  // the spoiler key is kept apart from the world book's, once per session like it
  const ref = { chatId: `secrets:${chatId}` }

  const show = async () => {
    if (!isRevealed(ref)) {
      if (!(await confirm({ title: t('world.secret.revealTitle'), description: t('world.secret.revealWarn'), actionLabel: t('world.secret.revealGo'), destructive: false }))) return
      markRevealed(ref)
    }
    setOpen(true)
  }

  return (
    <Section
      variant="tinted"
      tone="sky"
      icon={EyeSlash}
      id="secrets"
      title={t('world.secret.title')}
      chips={[count ? t(every ? 'world.secret.chip' : 'world.secret.chipEvents', { n: count, every }) : t('world.secret.off')]}
      dimmed={!on}
      note={on ? undefined : t('world.secret.offNote')}
    >
      {confirmDialog}
      <div className="flex flex-col gap-2 px-4 py-3">
        <span className="text-body font-semibold">{t('world.secret.threads')}</span>
        <Segmented
          label={t('world.secret.threads')}
          value={String(count)}
          className="w-full [&>button]:flex-1"
          options={['0', '1', '2', '3'].map((id) => ({ id, label: id === '0' ? t('world.secret.off') : id }))}
          onChange={(v) => void save({ secrets: Number(v) })}
          disabled={!on}
        />
        <p className="text-caption text-muted-foreground">{t('world.secret.threadsHint')}</p>
      </div>
      {count > 0 && (
        <>
          <SettingRow label={t('world.secret.every')} info={t('world.secret.everyHint')}>
            <NumControl label={t('world.secret.every')} value={every} min={0} max={30} disabled={!on} onCommit={(n) => void save({ hintEvery: n })} />
          </SettingRow>
          <SettingRow label={t('world.secret.show')} info={t('world.secret.showHint')}>
            <Switch
              checked={view.settings.secretShow === true}
              disabled={!on}
              onCheckedChange={(v) => void save({ secretShow: v }).then(() => refreshDice(chatId, true))}
              aria-label={t('world.secret.show')}
            />
          </SettingRow>
          <div className="flex flex-col gap-2 px-4 py-3">
            <p className="text-caption text-muted-foreground" aria-live="polite" data-testid="secret-status">{secretStatusLine(t, view)}</p>
            <Button variant="outline" className="w-full max-md:h-11" aria-expanded={open} onClick={() => (open ? setOpen(false) : void show())} data-testid="secret-reveal">
              {t(open ? 'world.secret.hide' : 'world.secret.reveal')}
            </Button>
          </div>
          {open && <Spoiler chatId={chatId} stamp={stamp} />}
        </>
      )}
    </Section>
  )
}
