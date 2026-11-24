import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Sword, Trash } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useT } from '@/hooks/use-t'
import { resolveLanguage } from '@/lib/i18n'
import type { MsgKey } from '@/lib/i18n'
import { openShellApp } from '@/lib/shell-bridge'
import { uid } from '@/lib/tokens'
import { ARCHETYPES, SKINS, fetchParty, fetchResults, markSeen, proposeFoes, sendEncounter, useRpgUi } from '@/lib/rpg'
import type { Archetype, FightFoe, FightMember, FightResultRow, Skin } from '@/lib/rpg'
import { useApp } from '@/lib/store'
import type { ID } from '@/lib/types'

/**
 * The Fight button of the chat and its two dialogs (Molfar.Vertep#486): start a fight in the optional RPG app, and read what it
 * sends back. The player's side is the persona plus whoever the Dashboard shows in the scene; the opponents come from a model's
 * proposal (or by hand); the numbers are the RPG app's business. The result comes back as a card with a short summary the player
 * puts into the composer as a stage direction, so the story model writes the prose from facts.
 */
export function RpgFight({ chatId, labelled }: { chatId: ID; labelled: boolean }) {
  const t = useT()
  const fightOpen = useRpgUi((s) => s.fightOpen)
  const resultId = useRpgUi((s) => s.resultId)
  const [rows, setRows] = useState<FightResultRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const reload = useCallback(() => {
    void fetchResults(chatId).then((r) => {
      setRows(r.results)
      setLoaded(true)
    })
  }, [chatId])
  useEffect(() => {
    // a card for a result that has just arrived must not read the list from before it came: wait for a fresh one
    if (resultId) setLoaded(false)
    reload()
  }, [reload, resultId, fightOpen])
  const waiting = rows.filter((r) => !r.seen)
  const press = () => {
    if (waiting.length) useRpgUi.getState().openResult(waiting[0].id)
    else useRpgUi.getState().setFightOpen(true)
  }
  const label = waiting.length ? t('rpg.result.waiting') : t('rpg.button.hint')
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button data-guide="chat.fight" variant={waiting.length ? 'default' : 'outline'} size={labelled ? 'sm' : 'icon-sm'} onClick={press} aria-label={label}>
              <Sword aria-hidden="true" />
              {labelled && <span>{t('rpg.button')}</span>}
              {waiting.length > 0 && <span className="ml-1 text-xs">●</span>}
            </Button>
          }
        />
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      {fightOpen && <FightDialog chatId={chatId} onDone={reload} />}
      {resultId && <ResultDialog chatId={chatId} loaded={loaded} row={rows.find((r) => r.id === resultId) ?? null} onChanged={reload} />}
    </>
  )
}

const DEFEAT: (1 | 2 | 3 | 4)[] = [1, 2, 3, 4]

function FightDialog({ chatId, onDone }: { chatId: ID; onDone: () => void }) {
  const t = useT()
  const language = resolveLanguage(useApp((s) => s.settings.language)) === 'uk' ? 'uk' : 'en'
  const close = () => useRpgUi.getState().setFightOpen(false)
  const [party, setParty] = useState<FightMember[]>([])
  const [place, setPlace] = useState('')
  const [foes, setFoes] = useState<(FightFoe & { key: string })[]>([])
  const [flee, setFlee] = useState(true)
  const [defeat, setDefeat] = useState<1 | 2 | 3 | 4>(2)
  const [skin, setSkin] = useState<Skin>('fantasy')
  const [busy, setBusy] = useState<'' | 'propose' | 'open'>('')
  const [message, setMessage] = useState('')
  useEffect(() => {
    let live = true
    void fetchParty(chatId)
      .then((r) => {
        if (!live) return
        setParty(r.party)
        setPlace(r.place)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [chatId])
  const withKey = (f: FightFoe) => ({ ...f, key: uid('foe') })
  const propose = async () => {
    setBusy('propose')
    setMessage('')
    try {
      const r = await proposeFoes(chatId)
      if (r.ok) setFoes(r.foes.map(withKey))
      else setMessage(r.code === 'no-model' ? t('rpg.foes.noModel') : t('rpg.foes.failed', { why: r.error }))
    } catch (e) {
      setMessage(t('rpg.foes.failed', { why: e instanceof Error ? e.message : String(e) }))
    } finally {
      setBusy('')
    }
  }
  const patch = (key: string, p: Partial<FightFoe>) => setFoes((list) => list.map((f) => (f.key === key ? { ...f, ...p } : f)))
  const open = async () => {
    const list = foes.filter((f) => f.name.trim()).map(({ key: _k, ...f }) => ({ ...f, name: f.name.trim() }))
    if (!list.length) {
      setMessage(t('rpg.needFoe'))
      return
    }
    setBusy('open')
    setMessage('')
    try {
      const r = await sendEncounter({ chatId, foes: list, stakes: { flee, defeat }, skin, language, place })
      if (!r.ok || !r.id) {
        setMessage(t('rpg.error', { why: r.error ?? '?' }))
        return
      }
      onDone()
      try {
        await openShellApp('rpg', r.id)
        close()
      } catch {
        // the fight is written; the RPG app finds it itself when the player opens it
        setMessage(t('rpg.noApp'))
      }
    } catch (e) {
      setMessage(t('rpg.error', { why: e instanceof Error ? e.message : String(e) }))
    } finally {
      setBusy('')
    }
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-3 overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base">{t('rpg.title')}</DialogTitle>
          <DialogDescription>{t('rpg.intro')}</DialogDescription>
        </DialogHeader>

        <section aria-label={t('rpg.party')} className="rounded-md border p-3">
          <h3 className="mb-1 text-sm font-medium">{t('rpg.party')}</h3>
          <p className="text-sm text-muted-foreground">
            {party.map((p) => p.name + (p.hero ? ` (${t('rpg.party.you')})` : '')).join(', ') || '…'}
          </p>
          {party.length === 1 && <p className="mt-1 text-xs text-muted-foreground">{t('rpg.party.empty')}</p>}
        </section>

        <section aria-label={t('rpg.foes')} className="rounded-md border p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium">{t('rpg.foes')}</h3>
            <span className="grow" />
            <Button size="sm" variant="outline" onClick={() => void propose()} disabled={busy !== ''}>
              {busy === 'propose' ? t('rpg.foes.proposing') : t('rpg.foes.propose')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setFoes((l) => [...l, withKey({ name: '', description: '', level: null, archetype: 'balanced' })])}>
              <Plus aria-hidden="true" /> {t('rpg.foes.add')}
            </Button>
          </div>
          <ul className="grid gap-2">
            {foes.map((f) => (
              <li key={f.key} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_1fr_auto]">
                <label className="grid gap-1 text-xs">
                  {t('rpg.foe.name')}
                  <Input value={f.name} maxLength={60} placeholder={t('rpg.foe.namePh')} onChange={(e) => patch(f.key, { name: e.target.value })} />
                </label>
                <label className="grid gap-1 text-xs">
                  {t('rpg.foe.desc')}
                  <Input value={f.description} maxLength={200} placeholder={t('rpg.foe.descPh')} onChange={(e) => patch(f.key, { description: e.target.value })} />
                </label>
                <Button size="icon-sm" variant="ghost" className="self-end" aria-label={t('rpg.foe.remove', { name: f.name || '…' })} onClick={() => setFoes((l) => l.filter((x) => x.key !== f.key))}>
                  <Trash aria-hidden="true" />
                </Button>
                <label className="grid gap-1 text-xs">
                  {t('rpg.foe.kind')}
                  <select className="h-9 rounded-md border bg-background px-2 text-sm" value={f.archetype} onChange={(e) => patch(f.key, { archetype: e.target.value as Archetype })}>
                    {ARCHETYPES.map((a) => <option key={a} value={a}>{t(`rpg.kind.${a}` as MsgKey)}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-xs">
                  {t('rpg.foe.level')}
                  <Input type="number" min={1} max={10} value={f.level ?? ''} placeholder="1-10" onChange={(e) => patch(f.key, { level: e.target.value === '' ? null : Math.min(10, Math.max(1, Number(e.target.value) || 1)) })} />
                </label>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label={t('rpg.stakes')} className="grid gap-2 rounded-md border p-3">
          <h3 className="text-sm font-medium">{t('rpg.stakes')}</h3>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={flee} onChange={(e) => setFlee(e.target.checked)} /> {t('rpg.flee')}
          </label>
          <label className="grid gap-1 text-sm">
            {t('rpg.defeat')}
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={defeat} onChange={(e) => setDefeat(Number(e.target.value) as 1 | 2 | 3 | 4)}>
              {DEFEAT.map((d) => <option key={d} value={d}>{t(`rpg.defeat.${d}` as MsgKey)}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            {t('rpg.skin')}
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={skin} onChange={(e) => setSkin(e.target.value as Skin)}>
              {SKINS.map((s) => <option key={s} value={s}>{t(`rpg.skin.${s}` as MsgKey)}</option>)}
            </select>
          </label>
        </section>

        {message && <p className="text-sm text-destructive" role="alert">{message}</p>}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={close}>{t('rpg.result.close')}</Button>
          <Button onClick={() => void open()} disabled={busy !== ''}>{busy === 'open' ? t('rpg.opening') : t('rpg.open')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ResultDialog({ chatId, row, loaded, onChanged }: { chatId: ID; row: FightResultRow | null; loaded: boolean; onChanged: () => void }) {
  const t = useT()
  const close = () => useRpgUi.getState().openResult(null)
  const r = row?.result
  const putNote = () => {
    if (!row?.note) return
    const text = `[[${row.note}]]`
    const draft = (() => { try { return localStorage.getItem(`chrysalis.roleplay.draft.${chatId}`) ?? '' } catch { return '' } })()
    useApp.setState((s) => ({ composerDrafts: { ...s.composerDrafts, [chatId]: { id: uid('fill'), chatId, text, base: draft, kind: 'note' } } }))
    toast(t('composer.noteOffer'))
    close()
  }
  const done = async () => {
    if (row) await markSeen(row.id)
    onChanged()
    close()
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-3 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">{t('rpg.result.title')}</DialogTitle>
          <DialogDescription>{r ? `${t(`rpg.outcome.${r.outcome}` as MsgKey)} · ${t('rpg.result.rounds', { n: r.rounds })}` : ''}</DialogDescription>
        </DialogHeader>
        {!row && loaded && <p className="text-sm text-muted-foreground">{t('rpg.result.gone')}</p>}
        {!row && !loaded && <p className="text-sm text-muted-foreground">…</p>}
        {row?.error && <p className="text-sm text-destructive" role="alert">{t('rpg.result.error', { why: row.error })}</p>}
        {r && (
          <>
            <ul className="grid gap-2">
              {r.party.map((p) => (
                <li key={p.id} className="rounded-md border p-2 text-sm">
                  <b>{p.name}</b>{' '}
                  <span className="text-muted-foreground">
                    {p.dead ? t('rpg.result.dead') : p.fled ? t('rpg.result.fled') : t('rpg.result.hp', { hp: p.hp, max: p.hpMax })}
                    {p.injuries.length > 0 && ' · ' + p.injuries.map((i) => `${t(`rpg.sev.${i.severity}` as MsgKey)}, ${t(`rpg.zone.${i.zone}` as MsgKey)}`).join('; ')}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sm">{r.loot.length ? `${t('rpg.result.loot')}: ${r.loot.map((l) => l.name).join(', ')}` : t('rpg.result.noLoot')}</p>
            <p className="rounded-md border border-dashed p-2 text-sm">{row?.note}</p>
            <p className="text-xs text-muted-foreground">{t('rpg.result.noteHint')}</p>
          </>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={close}>{t('rpg.result.close')}</Button>
          {row && <Button variant="outline" onClick={() => void done()}>{t('rpg.result.done')}</Button>}
          {r && <Button onClick={putNote}>{t('rpg.result.note')}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
