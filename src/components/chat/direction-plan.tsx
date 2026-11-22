// The Plan tab of the Direction sheet (plugins/direction, phase 3a, #496): the chat's beats in order, each with where it stands,
// and the inline editor. A beat is a planned moment ("Yuzu bursts in with news"): it waits for its condition, then for a scene
// boundary, then rides a reply. Every change sends the whole list back (PUT /direction/plan); the tab itself keeps no list.
import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, ArrowUUpLeft, CircleNotch, Lightning, ListPlus, PencilSimple, Plus, SkipForward, Sparkle, TrashSimple, Warning } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/ui/confirm'
import { NumTile, Segmented, SettingRow } from '@/components/ui/setting-row'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ToggleChip } from '@/components/ui/toggle-chip'
import { NextCallout } from '@/components/chat/direction-next'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import {
  BEAT_MAX, BEAT_PLACE_MAX, BEAT_REPLIES_MAX, BEAT_TEXT_MAX, draftDirectionPlan, fireDirectionBeat, setDirectionPlan, skipDirectionNext,
  type BeatDraft, type DirectionBeat, type DirectionBeatKind, type DirectionBeatTemplate, type DirectionDraft, type DirectionState, type DirectionTag,
} from '@/lib/direction'
import {
  BEAT_FINISHED, barMode, beatDot, beatFireBlockedKey, beatHoldText, beatStatusLine, beatTakesPart, beatWhenText, blankDraft, draftErrorKey, draftFromTemplate, draftIssue, draftOf, draftToggle, draftWhenKind,
  overCap, planDrafts, planMoved, planTags, planTemplates, planWithBeat, planWithDraft, planWithout, planWithSkip, tagKey, templateUsed, worldPeople,
} from '@/lib/direction-ui'

const fail = (e: unknown): void => { toast.error(String((e as Error)?.message ?? e)) }

/** The Plan tab with its actions wired to the plugin. A refused change shows the plugin's own message and keeps the editor open. */
export function PlanTab({ chatId, state }: { chatId: string; state: DirectionState }) {
  return (
    <PlanTabView
      state={state}
      onPlan={(beats) => setDirectionPlan(chatId, beats).then(() => true).catch((e: unknown) => { fail(e); return false })}
      onFire={(id) => fireDirectionBeat(chatId, id).then(() => undefined).catch(fail)}
      onSkipNext={() => skipDirectionNext(chatId).catch(fail)}
      onDraft={() => draftDirectionPlan(chatId)}
    />
  )
}

type Editing = { key: string; draft: BeatDraft }

/** The Plan tab itself: what it shows depends only on the state and the callbacks, so it is checked without a browser. */
export function PlanTabView({ state, onPlan, onFire, onSkipNext, onDraft, startEdit, startPicker, startBusy, startDraft, startDraftError }: {
  state: DirectionState
  /** the whole list after a change; true when the plugin took it */
  onPlan: (beats: BeatDraft[]) => Promise<boolean> | boolean
  onFire: (beat: string) => Promise<void> | void
  onSkipNext: () => Promise<void> | void
  /** phase 4: one model call that drafts beats from the members' cards (never rejects: a failure is `{ ok: false, reason }`) */
  onDraft?: () => Promise<DirectionDraft>
  /** open the editor at first (tests): a beat's id, or `new` */
  startEdit?: Editing
  /** open the ready-made beats list at first (tests) */
  startPicker?: boolean
  /** show the draft button as busy at first (tests) */
  startBusy?: boolean
  /** show a draft card at first (tests); `ticked` defaults to all */
  startDraft?: { beats: BeatDraft[]; ticked?: boolean[] }
  /** show a failed draft's line at first (tests) */
  startDraftError?: { reason?: string; message?: string }
}) {
  const t = useT()
  const [confirm, confirmDialog] = useConfirm()
  const plan = state.plan
  const beats = plan?.beats ?? []
  const max = plan?.max ?? BEAT_MAX
  const mode = barMode(state)
  const reason = mode === 'no-model' ? t('dir.plan.needModel') : mode === 'off' ? t('dir.plan.needDirection') : ''
  const blockedKey = beatFireBlockedKey(state)
  const [edit, setEdit] = useState<Editing | null>(startEdit ?? null)
  const [pending, setPending] = useState(false)
  const pickerId = useId()
  const [picker, setPicker] = useState(!!startPicker)
  const [drafting, setDrafting] = useState(!!startBusy)
  const [draft, setDraft] = useState<{ beats: BeatDraft[]; ticked: boolean[] } | null>(startDraft ? { beats: startDraft.beats, ticked: startDraft.ticked ?? startDraft.beats.map(() => true) } : null)
  const [draftError, setDraftError] = useState<{ reason?: string; message?: string } | null>(startDraftError ?? null)
  const draftRef = useRef<HTMLDivElement>(null)
  const templates = planTemplates(state)
  // an older plugin has neither the ready-made beats nor the draft route: nothing new shows
  const phase4 = !!plan && plan.templates !== undefined
  const noModel = !state.config.model
  const full = beats.length >= max
  const run = async (fn: () => Promise<unknown> | unknown): Promise<unknown> => {
    setPending(true)
    try {
      return await fn()
    } finally {
      setPending(false)
    }
  }
  const send = (list: BeatDraft[]) => run(() => onPlan(list))
  const save = async () => {
    if (!edit || draftIssue(edit.draft)) return
    const ok = await send(planWithBeat(planDrafts(state), edit.draft))
    if (ok !== false) setEdit(null)
  }
  const makeDraft = async () => {
    if (!onDraft || drafting) return
    setDrafting(true)
    setDraftError(null)
    try {
      const r = await onDraft()
      if (r.ok && r.beats?.length) setDraft({ beats: r.beats, ticked: r.beats.map(() => true) })
      else {
        setDraftError({ reason: r.reason, message: r.message })
        toast.error(r.message || t(draftErrorKey(r.reason)))
      }
    } finally {
      setDrafting(false)
    }
  }
  const keptDraft = draft ? draft.beats.filter((_, i) => draft.ticked[i]) : []
  const over = overCap(beats.length, keptDraft.length, max)
  const addDraft = async () => {
    if (!draft || keptDraft.length === 0 || over > 0) return
    const ok = await send(planWithDraft(planDrafts(state), keptDraft))
    if (ok !== false) {
      toast.success(t('dir.plan.draftAdded', { n: keptDraft.length }))
      setDraft(null)
    }
  }
  // a finished draft appears above the list: bring it into view, the player may be at the buttons below
  useEffect(() => {
    if (draft) draftRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [draft])
  const pickTemplate = (tpl: DirectionBeatTemplate) => {
    setPicker(false)
    setEdit({ key: 'new', draft: draftFromTemplate(tpl) })
  }
  const remove = async (b: DirectionBeat) => {
    const yes = await confirm({ title: t('dir.beat.deleteTitle'), description: t('dir.beat.deleteBody', { text: b.text }), actionLabel: t('dir.beat.delete') })
    if (yes) await send(planWithout(planDrafts(state), b.id))
  }
  const editor = (key: string, title: string) => edit && edit.key === key ? (
    <BeatEditor
      key={`edit-${key}`}
      state={state}
      title={title}
      draft={edit.draft}
      saving={pending}
      onChange={(draft) => setEdit({ key, draft })}
      onSave={() => void save()}
      onCancel={() => setEdit(null)}
    />
  ) : null

  return (
    <div className="flex flex-col gap-3" data-testid="plan-tab">
      <p className="text-body text-muted-foreground" data-testid="plan-hint">{t('dir.plan.hint')}</p>
      {reason && <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-caption text-muted-foreground" data-testid="plan-reason">{reason}</p>}
      <NextCallout state={state} testId="plan" onSkip={onSkipNext} />

      {draftError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-caption text-destructive" role="alert" data-testid="plan-draft-error">
          <Warning className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words">
            {t('dir.plan.draftFailed')}: {t(draftErrorKey(draftError.reason))}
            {draftError.message && <span className="block text-muted-foreground" data-testid="plan-draft-error-detail">{draftError.message}</span>}
          </span>
        </div>
      )}
      {draft && (
        <div ref={draftRef}>
          <DraftCard
            state={state}
            beats={draft.beats}
            ticked={draft.ticked}
            max={max}
            over={over}
            saving={pending}
            onTick={(i, v) => setDraft({ ...draft, ticked: draft.ticked.map((x, k) => (k === i ? v : x)) })}
            onAdd={() => void addDraft()}
            onDiscard={() => setDraft(null)}
          />
        </div>
      )}

      {beats.length === 0 && !edit && (
        <Card variant="padded" className="border-dashed" data-testid="plan-empty">
          <p className="text-body font-medium">{t('dir.plan.emptyTitle')}</p>
          <p className="text-body text-muted-foreground">{t('dir.plan.empty')}</p>
          <p className="text-caption text-muted-foreground">{t('dir.plan.example')}</p>
        </Card>
      )}

      {beats.map((b, i) => editor(b.id, t('dir.beat.editing')) ?? (
        <BeatCard
          key={b.id}
          state={state}
          beat={b}
          index={i}
          last={i === beats.length - 1}
          pending={pending}
          blocked={blockedKey ? t(blockedKey) : ''}
          onFire={() => void run(() => onFire(b.id))}
          onEdit={() => setEdit({ key: b.id, draft: draftOf(b) })}
          onSkip={() => void send(planWithSkip(planDrafts(state), b.id, b.status !== 'skipped'))}
          onMove={(d) => void send(planMoved(planDrafts(state), b.id, d))}
          onDelete={() => void remove(b)}
        />
      ))}

      {editor('new', t('dir.beat.new')) ?? (
        <div className="flex flex-col gap-2">
          <Button
            variant={beats.length === 0 ? 'default' : 'tonal'}
            className="w-full max-md:h-11"
            disabled={full || pending}
            onClick={() => { setPicker(false); setEdit({ key: 'new', draft: blankDraft() }) }}
            data-testid="plan-add"
          >
            <Plus className="size-4" aria-hidden="true" />{t('dir.plan.add')}
          </Button>
          {phase4 && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1">
                <Button
                  variant="outline"
                  className="w-full max-md:h-11"
                  disabled={templates.length === 0 || full || pending}
                  aria-expanded={picker}
                  aria-controls={pickerId}
                  onClick={() => setPicker((v) => !v)}
                  data-testid="plan-from-genre"
                >
                  <ListPlus className="size-4" aria-hidden="true" />{t('dir.plan.fromGenre')}
                </Button>
                {templates.length === 0 && <p className="text-caption text-muted-foreground" data-testid="plan-from-genre-reason">{t('dir.plan.fromGenreNone')}</p>}
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <Button
                  variant="outline"
                  className="w-full max-md:h-11"
                  disabled={noModel || drafting || full || pending}
                  aria-busy={drafting}
                  onClick={() => void makeDraft()}
                  data-testid="plan-draft-btn"
                >
                  {drafting ? <CircleNotch className="size-4 animate-spin" aria-hidden="true" /> : <Sparkle className="size-4" aria-hidden="true" />}
                  {t(drafting ? 'dir.plan.drafting' : 'dir.plan.draft')}
                </Button>
                {noModel && <p className="text-caption text-muted-foreground" data-testid="plan-draft-need-model">{t('dir.plan.draftNeedModel')}</p>}
                {drafting && <p className="text-caption text-muted-foreground" aria-live="polite" data-testid="plan-draft-wait">{t('dir.plan.draftWait')}</p>}
              </div>
            </div>
          )}
          {full && <p className="text-caption text-muted-foreground" data-testid="plan-full">{t('dir.plan.full', { max })}</p>}
          {phase4 && picker && !full && <TemplateList id={pickerId} state={state} templates={templates} onPick={pickTemplate} onClose={() => setPicker(false)} />}
        </div>
      )}
      {confirmDialog}
    </div>
  )
}

/** The genre's ready-made beats: a tap picks one and the editor opens filled in. One already in the plan is marked and not offered. */
function TemplateList({ id, state, templates, onPick, onClose }: { id: string; state: DirectionState; templates: DirectionBeatTemplate[]; onPick: (tpl: DirectionBeatTemplate) => void; onClose: () => void }) {
  const t = useT()
  const free = templates.filter((x) => !templateUsed(state, x))
  return (
    <Card variant="rows" id={id} data-testid="plan-templates">
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-body font-semibold">{t('dir.plan.fromGenreTitle')}</p>
          <p className="text-caption text-muted-foreground">{t('dir.plan.fromGenreHint')}</p>
        </div>
        <Button variant="ghost" size="sm" className="shrink-0 max-md:h-10" onClick={onClose} data-testid="plan-templates-close">{t('dir.plan.close')}</Button>
      </div>
      {templates.map((tpl) => {
        const used = templateUsed(state, tpl)
        return (
          <button
            key={tpl.id}
            type="button"
            disabled={used}
            onClick={() => onPick(tpl)}
            aria-label={t('dir.plan.templateAria', { text: tpl.text })}
            className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent"
            data-testid={`tpl-${tpl.id}`}
            data-used={used ? 'true' : undefined}
          >
            <span className="min-w-0 flex-1">
              <span className="block break-words text-body font-medium">{tpl.text}</span>
              <span className="block break-words text-caption text-muted-foreground">
                {beatWhenText(t, tpl.when)}{tpl.wait && (tpl.when.kind === 'replies' || tpl.when.kind === 'tag') ? ` · ${t('dir.beat.waits')}` : ''}{used ? ` · ${t('dir.plan.inPlan')}` : ''}
              </span>
            </span>
            {!used && <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
          </button>
        )
      })}
      {free.length === 0 && <p className="px-4 py-3 text-caption text-muted-foreground" data-testid="plan-templates-used">{t('dir.plan.fromGenreAllUsed')}</p>}
    </Card>
  )
}

/** A draft from the cards: one row per beat with a checkbox (all ticked), who and when in words; nothing is saved until "Add". */
function DraftCard({ state, beats, ticked, max, over, saving, onTick, onAdd, onDiscard }: {
  state: DirectionState
  beats: BeatDraft[]
  ticked: boolean[]
  max: number
  /** how many of the ticked beats do not fit under the cap */
  over: number
  saving: boolean
  onTick: (i: number, v: boolean) => void
  onAdd: () => void
  onDiscard: () => void
}) {
  const t = useT()
  const reasonId = useId()
  const n = ticked.filter(Boolean).length
  const reason = n === 0 ? t('dir.plan.draftNone') : over > 0 ? t('dir.plan.draftCap', { max, n: over }) : ''
  return (
    <Card variant="rows" className="border-cta/40" data-testid="plan-draft">
      <div className="flex flex-col gap-0.5 px-4 py-3">
        <p className="text-body font-semibold" data-testid="plan-draft-title">{t('dir.plan.draftTitle')}</p>
        <p className="text-caption text-muted-foreground" data-testid="plan-draft-hint">{t('dir.plan.draftHint')}</p>
      </div>
      {beats.map((b, i) => {
        const names = beatTakesPart(t, state, b)
        return (
          <label key={i} className="flex min-h-12 cursor-pointer items-start gap-3 px-4 py-3 max-md:min-h-14" data-testid={`draft-row-${i}`}>
            <Checkbox className="mt-0.5 size-5" checked={!!ticked[i]} onCheckedChange={(v) => onTick(i, v === true)} aria-label={t('dir.plan.draftPick', { text: b.text })} data-testid={`draft-tick-${i}`} />
            <span className="min-w-0 flex-1">
              <span className="block break-words text-body font-medium">{b.text}</span>
              <span className="mt-0.5 block break-words text-caption text-muted-foreground">
                {[names.length ? t('dir.beat.who', { names: names.join(', ') }) : '', beatWhenText(t, b.when)].filter(Boolean).join(' · ')}
              </span>
            </span>
          </label>
        )
      })}
      <div className="flex flex-col gap-2 px-4 py-3">
        {reason && <p id={reasonId} className="text-caption text-muted-foreground" data-testid="plan-draft-reason">{reason}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" className="h-9 max-md:h-10" onClick={onDiscard} disabled={saving} data-testid="plan-draft-discard">{t('dir.plan.draftDiscard')}</Button>
          <Button className="h-9 max-md:h-10" onClick={onAdd} disabled={n === 0 || over > 0 || saving} aria-describedby={reason ? reasonId : undefined} data-testid="plan-draft-add">{t('dir.plan.draftAdd', { n })}</Button>
        </div>
      </div>
    </Card>
  )
}

/** One beat: its number and text, who and when, where it stands (dot and words), and what can be done with it. */
function BeatCard({ state, beat, index, last, pending, blocked, onFire, onEdit, onSkip, onMove, onDelete }: {
  state: DirectionState
  beat: DirectionBeat
  index: number
  last: boolean
  pending: boolean
  /** why "Fire now" cannot be used, or "" */
  blocked: string
  onFire: () => void
  onEdit: () => void
  onSkip: () => void
  onMove: (delta: -1 | 1) => void
  onDelete: () => void
}) {
  const t = useT()
  const reasonId = useId()
  const finished = BEAT_FINISHED.includes(beat.status)
  const skipped = beat.status === 'skipped'
  const hold = beatHoldText(t, beat)
  const canFire = !finished && beat.status !== 'queued'
  const meta = [
    beat.who.length || beat.npc?.length ? t('dir.beat.who', { names: beatTakesPart(t, state, beat).join(', ') }) : '',
    beatWhenText(t, beat.when),
    beat.wait && (beat.when.kind === 'replies' || beat.when.kind === 'tag') ? t('dir.beat.waits') : '',
  ].filter(Boolean).join(' · ')
  const iconBtn = 'size-8 max-md:size-10'
  return (
    <Card variant="rows" data-testid={`beat-${beat.id}`} data-status={beat.status}>
      <div className="flex items-start gap-3 px-4 py-3">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-caption font-medium" aria-hidden="true">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <p className={cn('line-clamp-3 break-words text-body font-medium', (finished || skipped) && 'text-muted-foreground')} data-testid={`beat-text-${beat.id}`}>{beat.text}</p>
          <p className="mt-0.5 break-words text-caption text-muted-foreground" data-testid={`beat-meta-${beat.id}`}>{meta}</p>
        </div>
      </div>
      <div className="flex flex-col gap-1 px-4 py-2">
        <p className="flex min-w-0 items-start gap-2 text-caption text-foreground" data-testid={`beat-status-${beat.id}`}>
          <span className={cn('mt-1 size-2 shrink-0 rounded-full', beatDot(beat.status))} aria-hidden="true" />
          <span className="min-w-0">{beatStatusLine(t, beat, state.plan?.boundaryWait ?? 6)}</span>
        </p>
        {hold && <p className="text-caption text-muted-foreground" data-testid={`beat-hold-${beat.id}`}>{hold}</p>}
        {canFire && blocked && <p id={reasonId} className="text-caption text-muted-foreground" data-testid={`beat-blocked-${beat.id}`}>{blocked}</p>}
        <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
          {canFire && (
            <Button variant="ghost" size="sm" className="gap-1.5 max-md:h-10" disabled={!!blocked || pending} aria-describedby={blocked ? reasonId : undefined} onClick={onFire} data-testid={`beat-fire-${beat.id}`}>
              <Lightning className="size-3.5" aria-hidden="true" />{t('dir.rules.fire')}
            </Button>
          )}
          <Button variant="ghost" size="sm" className="gap-1.5 max-md:h-10" disabled={pending} onClick={onEdit} data-testid={`beat-edit-${beat.id}`}>
            <PencilSimple className="size-3.5" aria-hidden="true" />{t('dir.beat.edit')}
          </Button>
          {(skipped || !finished) && (
            <Button variant="ghost" size="sm" className="gap-1.5 max-md:h-10" disabled={pending} onClick={onSkip} data-testid={`beat-skip-${beat.id}`}>
              {skipped ? <ArrowUUpLeft className="size-3.5" aria-hidden="true" /> : <SkipForward className="size-3.5" aria-hidden="true" />}
              {t(skipped ? 'dir.beat.unskip' : 'dir.beat.skip')}
            </Button>
          )}
          <span className="ml-auto flex items-center">
            <Button variant="ghost" size="icon" className={iconBtn} disabled={index === 0 || pending} onClick={() => onMove(-1)} aria-label={t('dir.beat.up')} title={t('dir.beat.up')} data-testid={`beat-up-${beat.id}`}>
              <ArrowUp className="size-4" aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon" className={iconBtn} disabled={last || pending} onClick={() => onMove(1)} aria-label={t('dir.beat.down')} title={t('dir.beat.down')} data-testid={`beat-down-${beat.id}`}>
              <ArrowDown className="size-4" aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon" className={cn(iconBtn, 'text-destructive hover:text-destructive')} disabled={pending} onClick={onDelete} aria-label={t('dir.beat.delete')} title={t('dir.beat.delete')} data-testid={`beat-delete-${beat.id}`}>
              <TrashSimple className="size-4" aria-hidden="true" />
            </Button>
          </span>
        </div>
      </div>
    </Card>
  )
}

const KINDS: DirectionBeatKind[] = ['replies', 'tag', 'place', 'manual']

/** The inline editor of a beat (new or existing): text, who, when with its one value, the wait switch, Save and Cancel. */
export function BeatEditor({ state, title, draft, saving, onChange, onSave, onCancel }: {
  state: DirectionState
  title: string
  draft: BeatDraft
  saving?: boolean
  onChange: (draft: BeatDraft) => void
  onSave: () => void
  onCancel: () => void
}) {
  const t = useT()
  const textId = useId()
  const whoId = useId()
  const npcId = useId()
  const issueId = useId()
  const textMax = state.plan?.textMax ?? BEAT_TEXT_MAX
  const offered = planTags(state)
  // a beat made under another genre may wait for a kind this chat no longer offers: keep it in the list so it reads in words
  const tags = draft.when.kind === 'tag' && !offered.includes(draft.when.tag) ? [...offered, draft.when.tag] : offered
  const wait = state.plan?.boundaryWait ?? 6
  const issue = draftIssue(draft)
  const w = draft.when
  const toggleWho = (id: string) => onChange(draftToggle(draft, 'who', id))
  const people = worldPeople(state)
  // an id the World no longer has stays in the draft (the plugin skips it at firing time) until the player takes it off
  const gone = draft.npc.filter((id) => !people.some((p) => p.id === id))
  const toggleNpc = (id: string) => onChange(draftToggle(draft, 'npc', id))
  return (
    <Card variant="rows" className="border-cta/40" data-testid="beat-editor">
      <div className="flex flex-col gap-1.5 px-4 pt-3 pb-3">
        <p className="text-body font-semibold" data-testid="beat-editor-title">{title}</p>
        <label htmlFor={textId} className="text-body font-medium">{t('dir.beat.text')}</label>
        <Textarea
          id={textId}
          value={draft.text}
          maxLength={textMax}
          rows={3}
          placeholder={t('dir.beat.textPh')}
          onChange={(e) => onChange({ ...draft, text: e.target.value })}
          className="min-h-20 resize-y"
          data-testid="beat-text"
        />
        <p className="text-right text-caption text-muted-foreground">{t('dir.beat.textCount', { n: draft.text.length, max: textMax })}</p>
      </div>

      {state.members.length > 0 && (
        <div className="flex flex-col gap-2 px-4 py-3" role="group" aria-labelledby={whoId} data-testid="beat-who">
          <span id={whoId} className="text-body font-medium">{t('dir.beat.who.title')}</span>
          <div className="flex flex-wrap gap-1.5">
            {state.members.map((m) => (
              <ToggleChip key={m.id} pressed={draft.who.includes(m.id)} onPressedChange={() => toggleWho(m.id)} tone="violet">{m.name}</ToggleChip>
            ))}
          </div>
          <p className="text-caption text-muted-foreground">{t('dir.beat.who.hint')}</p>
        </div>
      )}

      {state.world && (
        <div className="flex flex-col gap-2 px-4 py-3" role="group" aria-labelledby={npcId} data-testid="beat-npc">
          <span id={npcId} className="text-body font-medium">{t('dir.beat.npc.title')}</span>
          {(people.length > 0 || gone.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {people.map((p) => (
                <ToggleChip key={p.id} pressed={draft.npc.includes(p.id)} onPressedChange={() => toggleNpc(p.id)} tone="sky">
                  {p.name}
                  {p.noReturn && <span className="font-normal text-muted-foreground" data-testid={`beat-npc-noreturn-${p.id}`}>· {t('world.rec.tag.noReturn')}</span>}
                </ToggleChip>
              ))}
              {gone.map((id) => (
                <ToggleChip key={id} pressed onPressedChange={() => toggleNpc(id)} tone="sky">{t('dir.beat.leftStory')}</ToggleChip>
              ))}
            </div>
          )}
          <p className="text-caption text-muted-foreground" data-testid="beat-npc-hint">{t(people.length > 0 ? 'dir.beat.npc.hint' : 'dir.beat.npc.none')}</p>
          {people.some((p) => p.noReturn) && <p className="text-caption text-muted-foreground">{t('dir.beat.npc.noReturnHint')}</p>}
        </div>
      )}

      <div className="flex flex-col gap-2 px-4 py-3" data-testid="beat-when">
        <span className="text-body font-medium">{t('dir.beat.when.title')}</span>
        <Segmented
          label={t('dir.beat.when.title')}
          value={w.kind}
          className="w-full flex-wrap [&>button]:flex-1 max-md:grid max-md:grid-cols-2"
          onChange={(k) => onChange(draftWhenKind(draft, k, tags))}
          options={KINDS.map((k) => ({ id: k, label: t(`dir.beat.kind.${k}` as const) }))}
        />
        {w.kind === 'replies' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <NumTile label={t('dir.beat.n')} hint={t('dir.beat.nHint')} value={w.n} min={0} max={BEAT_REPLIES_MAX} onCommit={(n) => onChange({ ...draft, when: { kind: 'replies', n } })} />
          </div>
        )}
        {w.kind === 'tag' && (
          <label className="flex flex-col gap-1 text-body">
            {t('dir.beat.tag')}
            <Select value={w.tag} onValueChange={(x) => x && onChange({ ...draft, when: { kind: 'tag', tag: String(x) as DirectionTag } })}>
              <SelectTrigger className="w-full max-md:data-[size=default]:h-10" data-testid="beat-tag"><SelectValue /></SelectTrigger>
              <SelectContent>
                {tags.map((tag) => <SelectItem key={tag} value={tag} className="max-md:min-h-10">{t(tagKey(tag))}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-caption text-muted-foreground">{t('dir.beat.tagHint')}</span>
          </label>
        )}
        {w.kind === 'place' && (
          <label className="flex flex-col gap-1 text-body">
            {t('dir.beat.place')}
            <Input
              value={w.place}
              maxLength={BEAT_PLACE_MAX}
              placeholder={t('dir.beat.placePh')}
              onChange={(e) => onChange({ ...draft, when: { kind: 'place', place: e.target.value } })}
              className="h-10 md:h-8"
              data-testid="beat-place"
            />
            <span className="text-caption text-muted-foreground">{t('dir.beat.placeHint')}</span>
          </label>
        )}
        {w.kind === 'manual' && <p className="text-caption text-muted-foreground" data-testid="beat-manual-line">{t('dir.beat.manualLine')}</p>}
      </div>

      {(w.kind === 'replies' || w.kind === 'tag') ? (
        <SettingRow label={t('dir.beat.waitLabel')} status={t('dir.beat.waitHint', { n: wait })}>
          <Switch checked={draft.wait} onCheckedChange={(v) => onChange({ ...draft, wait: v })} aria-label={t('dir.beat.waitLabel')} data-testid="beat-wait" />
        </SettingRow>
      ) : w.kind === 'place' ? (
        <p className="px-4 py-3 text-caption text-muted-foreground" data-testid="beat-place-line">{t('dir.beat.placeLine')}</p>
      ) : null}

      <div className="flex flex-col gap-2 px-4 py-3">
        {issue && <p id={issueId} className="text-caption text-muted-foreground" data-testid="beat-issue">{t(issue)}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" className="h-9 max-md:h-10" onClick={onCancel} disabled={saving} data-testid="beat-cancel">{t('dir.beat.cancel')}</Button>
          <Button className="h-9 max-md:h-10" onClick={onSave} disabled={!!issue || saving} aria-describedby={issue ? issueId : undefined} data-testid="beat-save">{t('dir.beat.save')}</Button>
        </div>
      </div>
    </Card>
  )
}
