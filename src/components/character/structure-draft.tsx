import { useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { CircleNotch, MagicWand } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fetchModels, fetchVisionModel, j } from '@/lib/engine'
import { readImage } from '@/lib/charx'
import { estimateTokens, formatTokens } from '@/lib/tokens'
import { DEFAULT_AVATAR } from '@/lib/utils'
import { compileProfile, compileProfileText, emptyFields, type Profile, type ProfileDraft } from '@/lib/profile'
import { fieldLabel, type SectionKey } from '@/components/profile/profile-form'
import type { ModelInfo } from '@/lib/types'

/** Whose draft: a character's or a persona's (plugins/profile files one per target). */
export type DraftTarget = { characterId: string } | { personaId: string }
type Busy = null | 'structure' | 'fill'
export type Image = { data: string; mimeType: string }

/** "Structure it" and "Fill empty": one model call each (plugins/profile). The
 *  result is a draft shown in the panel below; nothing changes until Accept. */
export function useProfileDraft(target: DraftTarget, onAccept: (d: ProfileDraft) => void) {
  const [draft, setDraft] = useState<ProfileDraft | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const ids: Record<string, string> = 'characterId' in target ? { characterId: target.characterId } : { personaId: target.personaId }
  const [[idKey, idValue]] = Object.entries(ids) as [[string, string]]
  const query = `/profile/draft?${idKey}=${encodeURIComponent(idValue)}`

  useEffect(() => {
    let alive = true
    setDraft(null)
    j<{ draft: ProfileDraft | null }>(query).then((r) => { if (alive) setDraft(r.draft) }).catch(() => { /* no plugin: no draft */ })
    return () => { alive = false }
  }, [query])

  const post = async (kind: 'structure' | 'fill', body: Record<string, unknown>, what: string): Promise<boolean> => {
    setBusy(kind)
    try {
      const r = await j<{ ok?: boolean; draft?: ProfileDraft; error?: string }>(`/profile/${kind}`, { method: 'POST', body: JSON.stringify({ [idKey]: idValue, ...body }) })
      if (r.ok && r.draft) { setDraft(r.draft); return true }
      toast.error(`${what} failed: ${r.error ?? 'no answer'}`)
    } catch (e) {
      toast.error(`${what} failed: ${String((e as Error).message ?? e)}`)
    } finally {
      setBusy(null)
    }
    return false
  }
  const runStructure = () => post('structure', {}, 'Structure it')
  const runFill = (fields: Record<string, string[]>, image?: Image, model?: string, replace = false) =>
    post('fill', { fields, ...(image ? { image } : {}), ...(model ? { model } : {}), ...(replace ? { replace: true } : {}) }, replace ? 'Read from picture' : 'Fill empty')
  const drop = () => { setDraft(null); void j(query, { method: 'DELETE' }).catch(() => {}) }
  const accept = () => {
    if (!draft) return
    onAccept(draft)
    drop()
  }
  return { draft, busy, runStructure, runFill, drop, accept }
}
export type ProfileDraftState = ReturnType<typeof useProfileDraft>

const VISION_KEY = 'rp.profile.visionModel'

/** Connected models that read pictures, and the one chosen for the portrait ('' = don't read). */
/** Which model reads pictures. 'settings' (the default) = the engine's Vision model,
 *  'none' = don't read (Fill empty only), or a model ref picked here for this app. */
export function useVisionModel() {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [engineRef, setEngineRef] = useState<string | null>(null)
  const [value, setValueState] = useState<string>(() => {
    try { return localStorage.getItem(VISION_KEY) ?? 'settings' } catch { return 'settings' }
  })
  useEffect(() => {
    let alive = true
    void fetchModels().then((r) => { if (alive) setModels(r.models.filter((m) => m.images === true)) })
    void fetchVisionModel().then((ref) => { if (alive) setEngineRef(ref) })
    return () => { alive = false }
  }, [])
  const setValue = (v: string) => {
    setValueState(v)
    try { if (v && v !== 'settings') localStorage.setItem(VISION_KEY, v); else localStorage.removeItem(VISION_KEY) } catch { /* storage blocked */ }
  }
  // a remembered model that is no longer connected falls back to Settings
  const value2 = value === 'none' || value === 'settings' || models.some((m) => m.ref === value) ? value : 'settings'
  const override = value2 === 'none' || value2 === 'settings' ? undefined : value2
  // the model that will read: '' = none (pictures are not sent)
  const active = value2 === 'none' ? '' : (override ?? engineRef ?? '')
  const named = (ref: string | null) => {
    const m = models.find((x) => x.ref === ref)
    return m ? `${m.provider} · ${m.id}` : (ref ?? '').replace(/^c_[^/]*\//, '')
  }
  const settingsLabel = engineRef ? `From Settings: ${named(engineRef)}` : 'From Settings: none reads pictures'
  return { models, value: value2, setValue, engineRef, override, active, settingsLabel }
}
export type VisionModel = ReturnType<typeof useVisionModel>

export const hasPortrait = (url: string | undefined): url is string => !!url && url !== DEFAULT_AVATAR && !url.endsWith('avatar-default.png')

export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/** "Fill empty" for the whole profile or one section: asks only for the empty
 *  fields, with the portrait when a vision model is chosen and there is one. */
export function useFillEmpty(d: ProfileDraftState, profile: Profile | null, avatar: string | undefined, vision: VisionModel) {
  const run = async (section?: SectionKey) => {
    const fields = emptyFields(profile ?? {}, section)
    if (!Object.keys(fields).length) { toast.info('Nothing is empty here.'); return }
    let image: Image | undefined
    let model: string | undefined
    let textOnly = false
    if (vision.active) {
      const img = hasPortrait(avatar) ? await readImage(avatar) : null
      if (img) {
        image = { data: toBase64(img.bytes), mimeType: `image/${img.ext}` }
        // no model = the engine's Vision model reads it
        model = vision.override
      } else textOnly = true
    }
    const ok = await d.runFill(fields, image, model)
    if (ok && textOnly) toast.warning('No portrait could be read: the proposal comes from the text only.')
  }
  return { busy: d.busy === 'fill', run: (section?: SectionKey) => { void run(section) } }
}

export function StructureButton({ busy, onClick, variant = 'outline', disabled }: { busy: boolean; onClick: () => void; variant?: 'outline' | 'default'; disabled?: boolean }) {
  return (
    <Button variant={variant} size="sm" className="w-fit" disabled={busy || disabled} onClick={onClick} title="A model reads the text and proposes the fields; you review before anything changes">
      {busy ? <CircleNotch className="size-4 animate-spin" aria-hidden="true" /> : <MagicWand className="size-4" aria-hidden="true" />}
      {busy ? 'Reading the card…' : 'Structure it'}
    </Button>
  )
}

/** The whole-profile "Fill empty" button and the portrait model picker. */
export function FillControls({ busy, disabled, onFill, vision }: { busy: boolean; disabled?: boolean; onFill: () => void; vision: VisionModel }) {
  const none = vision.models.length === 0 && !vision.engineRef
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" className="w-fit" disabled={busy || disabled} onClick={onFill} title="A model proposes values for the empty fields of the sections that are on; you review before anything changes">
        {busy ? <CircleNotch className="size-4 animate-spin" aria-hidden="true" /> : <MagicWand className="size-4" aria-hidden="true" />}
        {busy ? 'Filling…' : 'Fill empty'}
      </Button>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground" title={none ? 'No connected model reads pictures; Fill empty uses the text only.' : 'A model that reads the portrait for Fill empty'}>
        Portrait:
        <Select value={none ? 'none' : vision.value} onValueChange={(v) => vision.setValue(v ? String(v) : 'settings')} disabled={none}>
          <SelectTrigger size="sm" className="h-7 max-w-60 text-xs" aria-label="Portrait model"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="settings">{vision.settingsLabel}</SelectItem>
            <SelectItem value="none">Don't read</SelectItem>
            {vision.models.map((m) => <SelectItem key={m.ref} value={m.ref}>{`${m.provider} · ${m.id}`}</SelectItem>)}
          </SelectContent>
        </Select>
      </span>
    </div>
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
export function ProfileDraftPanel({ draft, before, mode, onAccept, onDiscard }: {
  draft: ProfileDraft
  before: { description: string; personality: string }
  mode: 'character' | 'persona'
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
  const by = draft.model ? ` by ${modelName(draft.model)}` : ''
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
      ? `${lines.length} value${lines.length === 1 ? '' : 's'} read from the picture${by}. Accepting replaces these fields${mode === 'character' ? '; the old text goes to Versions' : ''}.`
      : `${lines.length} value${lines.length === 1 ? '' : 's'} proposed${by}. Only empty fields get them; nothing you wrote is replaced.${mode === 'character' ? ' The current text goes to Versions.' : ''}`
    body = (
      <ul className="flex max-h-72 flex-col gap-1 overflow-auto rounded-md border border-border bg-background/60 p-2 text-xs">
        {lines.map((l) => <li key={l} className="break-words">{l}</li>)}
      </ul>
    )
  } else {
    const next = { ...draft.profile, notes: draft.leftover }
    const filled = Object.keys(draft.profile).length
    summary = `${filled} section${filled === 1 ? '' : 's'} filled${by}. Text that fit no field stays as notes. Accepting rewrites ${mode === 'persona' ? 'the description' : 'Description and Personality'} as shown${mode === 'character' ? '; the current text goes to Versions' : ''}.`
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
