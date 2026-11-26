import { useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { CircleNotch, MagicWand } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { CardTasksState } from '@/components/character/use-card-tasks'
import { fetchModels, fetchVisionModel, j } from '@/lib/engine'
import { useT } from '@/hooks/use-t'
import { readImage } from '@/lib/charx'
import { estimateTokens, formatTokens } from '@/lib/tokens'
import { DEFAULT_AVATAR } from '@/lib/utils'
import { compileProfile, compileProfileText, emptyFields, profileName, type Profile, type ProfileDraft } from '@/lib/profile'
import { fieldLabel, type SectionKey } from '@/components/profile/profile-form'
import type { ModelInfo } from '@/lib/types'

/** Whose draft: a character's or a persona's (plugins/profile files one per target). */
export type DraftTarget = { characterId: string } | { personaId: string }
type Busy = null | 'structure' | 'fill'
export type Image = { data: string; mimeType: string }
/** One of the card's other characters, for a fill: its place in the cast (1 = the first) and the name to find in the text. */
export type Member = { index: number; name: string }
/** One call of a Fill empty: the fields it asks for, and the model, picture and limits it runs with. */
export type FillStep = {
  fields: Record<string, string[]>
  image?: Image
  /** no model = the card's task model, or the engine's Vision model when a picture goes along */
  model?: string
  /** characters of the card and tokens of the reply for the model that runs THIS call */
  limits?: { inputChars: number; outputTokens: number }
  /** Read from picture: the fields are replaced, filled or not */
  replace?: boolean
  member?: Member
  /** what a failure toast calls this call */
  what?: string
}

/** "Structure it" and "Fill empty": one model call each (plugins/profile). The
 *  result is a draft shown in the panel below; nothing changes until Accept. */
export function useProfileDraft(target: DraftTarget, onAccept: (d: ProfileDraft) => void, extra?: (kind: 'structure' | 'fill') => Record<string, unknown>) {
  const [draft, setDraft] = useState<ProfileDraft | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  /** Which part of a long card Structure it is on: { part: 2, parts: 4 }. */
  const [progress, setProgress] = useState<{ part: number; parts: number } | null>(null)
  const ids: Record<string, string> = 'characterId' in target ? { characterId: target.characterId } : { personaId: target.personaId }
  const [[idKey, idValue]] = Object.entries(ids) as [[string, string]]
  const query = `/profile/draft?${idKey}=${encodeURIComponent(idValue)}`

  useEffect(() => {
    let alive = true
    setDraft(null)
    j<{ draft: ProfileDraft | null }>(query).then((r) => { if (alive) setDraft(r.draft) }).catch(() => { /* no plugin: no draft */ })
    return () => { alive = false }
  }, [query])

  /** One /profile/fill call; the draft it filed, or null after a toast about what went wrong. */
  const postFill = async (step: FillStep, mergeAt: number | undefined): Promise<ProfileDraft | null> => {
    const what = step.what ?? (step.replace ? 'Read from picture' : 'Fill empty')
    const body = {
      fields: step.fields,
      ...(step.image ? { image: step.image } : {}),
      ...(step.model ? { model: step.model } : {}),
      ...(step.limits ? { limits: step.limits } : {}),
      ...(step.replace ? { replace: true } : {}),
      ...(step.member ? { member: step.member } : {}),
      ...(mergeAt !== undefined ? { mergeAt } : {}),
    }
    try {
      const r = await j<{ ok?: boolean; draft?: ProfileDraft; error?: string }>('/profile/fill', { method: 'POST', body: JSON.stringify({ [idKey]: idValue, ...extra?.('fill'), ...body }) })
      if (r.ok && r.draft) { setDraft(r.draft); return r.draft }
      toast.error(`${what} failed: ${r.error ?? 'no answer'}`)
    } catch (e) {
      toast.error(`${what} failed: ${String((e as Error).message ?? e)}`)
    }
    return null
  }
  /** A card longer than one call holds is read in parts, one request each; the plugin merges them into one proposal. */
  const runStructure = async (): Promise<boolean> => {
    setBusy('structure')
    try {
      for (let part = 0; ; ) {
        const r = await j<{ ok?: boolean; draft?: ProfileDraft; error?: string; part?: number; parts?: number; done?: boolean }>('/profile/structure', { method: 'POST', body: JSON.stringify({ [idKey]: idValue, ...extra?.('structure'), part }) })
        if (!r.ok || !r.draft) { toast.error(`Structure it failed: ${r.error ?? 'no answer'}`); return false }
        if (r.done === false && typeof r.parts === 'number') {
          part = (r.part ?? part) + 1
          setProgress({ part: part + 1, parts: r.parts })
          continue
        }
        setDraft(r.draft)
        return true
      }
    } catch (e) {
      toast.error(`Structure it failed: ${String((e as Error).message ?? e)}`)
      return false
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }
  /** One Fill empty: a call for each step, one after the other. A later step joins the draft the earlier one filed, so the
   *  user reviews one proposal. A step that fails says so and the others still run. True when any step filed something. */
  const runFillSteps = async (steps: FillStep[]): Promise<boolean> => {
    setBusy('fill')
    try {
      let at: number | undefined
      for (const step of steps) {
        const filed = await postFill(step, at)
        if (filed) at = filed.at
      }
      return at !== undefined
    } finally {
      setBusy(null)
    }
  }
  const drop = () => { setDraft(null); void j(query, { method: 'DELETE' }).catch(() => {}) }
  const accept = () => {
    if (!draft) return
    onAccept(draft)
    drop()
  }
  return { draft, busy, progress, runStructure, runFillSteps, drop, accept }
}
export type ProfileDraftState = ReturnType<typeof useProfileDraft>

/** Where an older build kept the picture model (one choice for every card, in this browser). It is still read as the
 *  starting value of a card that has no choice of its own; nothing writes it any more. */
const LEGACY_VISION_KEY = 'rp.profile.visionModel'

/** Which model reads this card's portrait. The choice is part of the card's task settings (`CardTasks.visionModel`,
 *  saved with Save changes): 'settings' = the engine's Vision model, 'none' = Fill empty never sends the portrait,
 *  or a model ref. Read from picture is a deliberate act: it reads with the model chosen here, and with the engine's
 *  Vision model when the choice is 'none'. */
export function useVisionModel(tasks: Pick<CardTasksState, 'edit' | 'setEdit'>) {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [engineRef, setEngineRef] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [legacy] = useState<string | null>(() => {
    try { return localStorage.getItem(LEGACY_VISION_KEY) } catch { return null }
  })
  useEffect(() => {
    let alive = true
    void Promise.all([
      fetchModels().then((r) => { if (alive) setModels(r.models.filter((m) => m.images === true)) }),
      fetchVisionModel().then((ref) => { if (alive) setEngineRef(ref) }),
    ]).catch(() => {}).finally(() => { if (alive) setReady(true) })
    return () => { alive = false }
  }, [])
  const raw = tasks.edit.visionModel ?? legacy ?? 'settings'
  // a saved model that is no longer connected falls back to Settings; until the list has loaded the choice is trusted,
  // so a press right after the tab opens does not go to another model
  const value = raw === 'none' || raw === 'settings' || !ready || models.some((m) => m.ref === raw) ? raw : 'settings'
  const setValue = (v: string) => tasks.setEdit({ visionModel: v || 'settings' })
  const override = value === 'none' || value === 'settings' ? undefined : value
  /** the model Fill empty sends the portrait to: '' = it does not */
  const active = value === 'none' ? '' : (override ?? engineRef ?? '')
  /** the model Read from picture uses: '' = no connected model reads pictures */
  const reader = override ?? engineRef ?? ''
  const named = (ref: string | null) => {
    const m = models.find((x) => x.ref === ref)
    return m ? `${m.provider} · ${m.id}` : (ref ?? '').replace(/^c_[^/]*\//, '')
  }
  const settingsLabel = engineRef ? `From Settings: ${named(engineRef)}` : 'From Settings: none reads pictures'
  return { models, value, setValue, engineRef, override, active, reader, ready, named, settingsLabel }
}
export type VisionModel = ReturnType<typeof useVisionModel>

export const hasPortrait = (url: string | undefined): url is string => !!url && url !== DEFAULT_AVATAR && !url.endsWith('avatar-default.png')

export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/** "Fill empty" for the whole profile or one section: asks only for the empty fields. The portrait goes along
 *  only with the Appearance fields (a picture says nothing about goals or fears), to the card's picture model and
 *  with that model's own limits; every other field goes to the card's task model, text only. A request for both is
 *  two calls that file one proposal. `text` is the card's text, for sizing the limits. */
export function useFillEmpty(d: ProfileDraftState, profile: Profile | null, avatar: string | undefined, vision: VisionModel, tasks: Pick<CardTasksState, 'requestForModel'>, text: string, member?: Member) {
  const run = async (section?: SectionKey) => {
    const fields = emptyFields(profile ?? {}, section)
    if (!Object.keys(fields).length) { toast.info('Nothing is empty here.'); return }
    // another character of the card: the portrait is not theirs, so the text alone is read (found by name)
    if (member) { await d.runFillSteps([{ fields, member }]); return }
    const { appearance, ...rest } = fields
    let image: Image | undefined
    if (appearance && vision.active && hasPortrait(avatar)) {
      const img = await readImage(avatar)
      if (img) image = { data: toBase64(img.bytes), mimeType: `image/${img.ext}` }
      else toast.warning('The portrait could not be read: Appearance comes from the text only.')
    }
    const steps: FillStep[] = []
    const textFields = image ? rest : fields
    if (Object.keys(textFields).length) steps.push({ fields: textFields })
    // no model = the engine's Vision model reads it
    if (image && appearance) steps.push({ fields: { appearance }, image, model: vision.override, limits: tasks.requestForModel('fill', text, vision.active), what: 'Fill empty (Appearance from the portrait)' })
    await d.runFillSteps(steps)
  }
  return { busy: d.busy === 'fill', run: (section?: SectionKey) => { void run(section) } }
}

export function StructureButton({ busy, onClick, variant = 'outline', disabled, progress }: { busy: boolean; onClick: () => void; variant?: 'outline' | 'default'; disabled?: boolean; progress?: { part: number; parts: number } | null }) {
  const t = useT()
  return (
    <Button variant={variant} size="sm" className="w-fit" disabled={busy || disabled} onClick={onClick} title={t('ct.structureTip')}>
      {busy ? <CircleNotch className="size-4 animate-spin" aria-hidden="true" /> : <MagicWand className="size-4" aria-hidden="true" />}
      {busy ? (progress ? t('ct.reading', progress) : t('ct.readingBare')) : t('ct.structure')}
    </Button>
  )
}

const modelName = (ref?: string) => (ref ? ref.replace(/^c_[^/]*\//, '') : '')

/** Every value a fill draft proposes, as "Section · Field: value". */
function fillLines(profile: Profile): string[] {
  const out: string[] = []
  for (const [key, bag] of Object.entries(profile)) {
    if (!bag || typeof bag !== 'object' || Array.isArray(bag)) continue
    for (const [field, v] of Object.entries(bag as Record<string, unknown>)) {
      const value = Array.isArray(v) ? v.filter((x) => typeof x === 'string').join(', ') : typeof v === 'string' ? v : ''
      if (value.trim()) out.push(`${fieldLabel(key, field)}: ${value.trim()}`)
    }
  }
  return out
}

/** The proposal: the text it would write (Structure it) or the values for the
 *  empty fields (Fill empty), with Accept and Discard. */
export function ProfileDraftPanel({ draft, before, mode, free, onAccept, onDiscard }: {
  draft: ProfileDraft
  before: { description: string; personality: string }
  mode: 'character' | 'persona'
  /** Free write is on: Accept on a Fill empty leaves the text alone, on a Structure it switches Free write off */
  free?: boolean
  onAccept: () => void
  onDiscard: () => void
}) {
  const fill = draft.kind === 'fill'
  // the panel opens at the top of the card, often far above the section whose
  // "Fill empty" was pressed: bring it into view so the proposal is not missed
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ref.current?.scrollIntoView?.({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
  }, [draft])
  const names = [...new Set((draft.models?.length ? draft.models : draft.model ? [draft.model] : []).map(modelName))]
  const by = names.length ? ` by ${names.join(' and ')}` : ''
  const partial = fill && draft.read
    ? ` Only part of the card fit the model's window: it read ${draft.read.used.toLocaleString()} of ${draft.read.total.toLocaleString()} characters of Description and Personality, picked for these fields. A model with a bigger window, or a higher "Card text per call" under Models, reads more.`
    : ''
  const block = (title: string, now: string, after: string) => (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
        {title}
        <Badge variant="outline" className="text-[10px]">{formatTokens(estimateTokens(now))} → {formatTokens(estimateTokens(after))} tok</Badge>
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background/60 p-2 font-sans text-xs">{after || '(empty)'}</pre>
    </div>
  )
  let body: ReactNode
  let summary: string
  if (fill) {
    const lines = fillLines(draft.profile)
    summary = draft.replace
      ? `${lines.length} value${lines.length === 1 ? '' : 's'} read from the picture${by}. Accepting replaces these fields${mode === 'character' ? (free ? '; Free write is on, so Description and Personality stay as they are' : '; the old text goes to Versions') : ''}.${partial}`
      : `${lines.length} value${lines.length === 1 ? '' : 's'} proposed${by}. Only empty fields get them; nothing you wrote is replaced.${mode === 'character' ? (free ? ' Free write is on, so Description and Personality stay as they are.' : ' The current text goes to Versions.') : ''}${partial}`
    body = (
      <ul className="flex max-h-72 flex-col gap-1 overflow-auto rounded-md border border-border bg-background/60 p-2 text-xs">
        {lines.map((l) => <li key={l} className="break-words">{l}</li>)}
      </ul>
    )
  } else {
    const next = { ...draft.profile, ...(draft.cast?.length ? { cast: draft.cast } : {}), notes: draft.leftover }
    const filled = Object.keys(draft.profile).length
    const people = draft.cast?.length ? `${draft.cast.length + 1} characters found (${[draft.profile, ...draft.cast].map((m, i) => profileName(m, i)).join(', ')})` : ''
    summary = `${people}${draft.cast?.length ? '' : `${filled} section${filled === 1 ? '' : 's'} filled`}${by}. Text that fit no field stays as notes. Accepting rewrites ${mode === 'persona' ? 'the description' : 'Description and Personality'}${draft.cast?.length ? ', one part per character,' : ''} as shown${mode === 'character' ? '; the current text goes to Versions' : ''}.${free ? ' This also switches Free write off.' : ''}`
    if (mode === 'persona') {
      const notes = [draft.leftover?.description ?? '', draft.leftover?.personality ?? ''].map((x) => x.trim()).filter(Boolean).join('\n\n')
      body = block('Description would become', before.description, compileProfileText({ ...draft.profile, notes: { description: notes } }))
    } else {
      const c = compileProfile(next)
      body = (
        <div className="grid gap-3 md:grid-cols-2">
          {block('Description would become', before.description, c.description)}
          {block('Personality would become', before.personality, c.personality)}
        </div>
      )
    }
  }
  return (
    <section ref={ref} className="flex min-w-0 flex-col gap-3 rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 scroll-mt-4" data-testid="structure-draft">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">{fill ? (draft.replace ? 'Appearance from the picture' : 'Proposed values for empty fields') : 'Proposed profile'}</h2>
        <p className="text-xs text-muted-foreground">{summary}</p>
        {draft.note && <p className="text-xs italic text-muted-foreground">{draft.note}</p>}
      </div>
      {body}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onAccept}>Accept</Button>
        <Button size="sm" variant="outline" onClick={onDiscard}>Discard</Button>
      </div>
    </section>
  )
}
