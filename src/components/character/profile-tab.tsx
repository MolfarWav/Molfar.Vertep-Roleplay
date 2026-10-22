import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash, Warning } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { Character } from '@/lib/types'
import {
  type Profile,
  castOf,
  profileName,
  profileOf,
  profileOutOfDate,
  applyProfile,
  startProfile,
  adoptHandEdits,
  acceptDraft,
  acceptFill,
} from '@/lib/profile'
import { ProfileForm } from '@/components/profile/profile-form'
import { CardModelPanel } from '@/components/character/card-model-panel'
import type { CardTasksState } from '@/components/character/use-card-tasks'
import { ReadPictureDialog } from '@/components/profile/read-picture-dialog'
import { FillControls, ProfileDraftPanel, StructureButton, useFillEmpty, useProfileDraft, useVisionModel } from '@/components/character/structure-draft'

export function ProfileTab({ c, up, tasks }: { c: Character; up: (patch: Partial<Character>) => void; tasks: CardTasksState }) {
  const p = profileOf(c)
  const [adoptMsg, setAdoptMsg] = useState<string | null>(null)
  // the working text goes with the request, so a proposal reads what is on screen, not only what was saved
  const draft = useProfileDraft({ characterId: c.id }, (d) => {
    if (d.kind === 'fill') {
      up(acceptFill(c, d))
      toast.success(d.replace ? 'Appearance updated from the picture. The old text is in Versions.' : 'Empty fields filled. The old text is in Versions.')
    } else {
      up(acceptDraft(c, d))
      toast.success('Profile filled. The old text is in Versions.')
    }
  }, (kind) => ({
    card: { name: c.name, description: c.description, personality: c.personality, scenario: c.scenario, mes_example: c.exampleDialogue },
    ...tasks.requestFor(kind, `${c.description}\n${c.personality}`),
  }))
  const vision = useVisionModel()
  const fill = useFillEmpty(draft, p, c.avatar, vision)
  // which character of the card the form shows: 0 the profile itself, n the cast's n-th
  const [sel, setSel] = useState(0)
  const [readOpen, setReadOpen] = useState(false)
  const [reading, setReading] = useState(false)
  const structureButton = <StructureButton busy={draft.busy === 'structure'} disabled={!!draft.busy} progress={draft.progress} onClick={() => void draft.runStructure()} />
  const modelPanel = <CardModelPanel tasks={tasks} c={c} />
  const draftPanel = draft.draft && (
    <ProfileDraftPanel draft={draft.draft} before={c} mode="character" onAccept={draft.accept} onDiscard={draft.drop} />
  )

  if (!p) {
    return (
      <div className="flex flex-col gap-4">
        {modelPanel}
        <p className="text-sm text-muted-foreground">
          A profile splits the card into fields (identity, looks, personality, background). It writes Description and Personality for you; the text they hold now is kept as notes.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="w-fit" onClick={() => up(applyProfile(c, startProfile(c)))}>Start a profile</Button>
          {structureButton}
        </div>
        <p className="text-xs text-muted-foreground">Structure it asks the model to sort the text into the fields; you see the result before anything changes.</p>
        {draftPanel}
      </div>
    )
  }

  const save = (next: Profile) => up(applyProfile(c, next))
  const cast = castOf(p)
  const at = sel > cast.length ? 0 : sel
  const shown = at === 0 ? p : cast[at - 1]!
  const saveShown = (next: Profile) => (at === 0 ? save(next) : save({ ...p, cast: cast.map((m, i) => (i === at - 1 ? next : m)) }))
  const addCharacter = () => {
    save({ ...p, cast: [...cast, {}] })
    setSel(cast.length + 1)
  }
  const removeShown = () => {
    if (at === 0) return
    const before = p
    const gone = profileName(shown, at)
    save({ ...p, cast: cast.filter((_, i) => i !== at - 1) })
    setSel(at - 1)
    toast(`${gone} removed from the profile.`, { action: { label: 'Undo', onClick: () => { save(before); setSel(at) } } })
  }
  // Structure it splits the card's whole text: with a cast it would put everyone into
  // the first character, so it is offered only for a one-character profile.
  // Fill empty and Read from picture fill the first character only, for now.
  const structurable = cast.length === 0
  const fillable = at === 0

  return (
    <div className="flex flex-col gap-4">
      {modelPanel}
      <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
        <label className="flex items-center gap-2 text-xs">
          <Switch checked={!!p.free} onCheckedChange={(v) => save({ ...p, free: v })} aria-label="Free write" />
          Free write: edit Description and Personality by hand; the profile stops writing them
        </label>
        {p.free && <p className="text-xs text-muted-foreground">Free write is on: the fields are saved but do not change the card's text.</p>}
        {fillable ? (
          <div className="flex flex-wrap items-center gap-2">
            {structurable && structureButton}
            <FillControls busy={fill.busy} disabled={!!draft.busy} onFill={() => fill.run()} vision={vision} />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Fill empty works on the first character only.</p>
        )}
        {!structurable && fillable && <p className="text-xs text-muted-foreground">Structure it is off while the profile has more than one character: it would put everyone into the first.</p>}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Characters in this profile">
          {[p, ...cast].map((m, i) => (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: members have no id; the place is the identity
              key={i}
              type="button"
              aria-pressed={i === at}
              onClick={() => setSel(i)}
              className={cn(
                'max-w-48 truncate border px-2.5 py-1 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                i === at ? 'border-primary bg-primary/15' : 'border-border hover:bg-muted',
              )}
            >
              {profileName(m, i)}
            </button>
          ))}
          <Button variant="ghost" size="sm" onClick={addCharacter}>
            <Plus aria-hidden="true" />Add character
          </Button>
          {at > 0 && (
            <Button variant="ghost" size="sm" className="text-destructive" onClick={removeShown}>
              <Trash aria-hidden="true" />Remove {profileName(shown, at)}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {cast.length
            ? 'Each character gets its own part in Description and Personality, under its name. Notes stay shared and come last.'
            : 'The first name is this card\'s own character. A narrator card can describe several: Add character, and each gets its own part of the text.'}
        </p>
      </div>
      {draftPanel}

      {!p.free && profileOutOfDate(c) && (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <div className="flex items-start gap-2">
            <Warning className="size-4 shrink-0 text-amber-500" aria-hidden="true" />
            <p className="text-sm">Description or Personality were edited by hand after the profile wrote them.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const a = adoptHandEdits(p, c)
                if (a) {
                  save(a)
                  setAdoptMsg(null)
                } else {
                  setAdoptMsg("Your edit changed the profile's own lines; use Free write or rewrite from the profile.")
                }
              }}
            >
              Keep my additions
            </Button>
            <Button variant="outline" size="sm" onClick={() => save(p)}>Rewrite from profile</Button>
            <Button variant="outline" size="sm" onClick={() => save({ ...p, free: true })}>Free write</Button>
          </div>
          {adoptMsg && <p className="text-xs text-amber-700 dark:text-amber-300">{adoptMsg}</p>}
        </div>
      )}

      <ProfileForm
        key={at}
        p={shown}
        save={saveShown}
        mode="character"
        fill={fillable ? { busy: fill.busy || !!draft.busy, run: fill.run, readPicture: { busy: reading, open: () => setReadOpen(true) } } : undefined}
      />
      <ReadPictureDialog
        open={readOpen}
        onOpenChange={setReadOpen}
        profile={p}
        avatar={c.avatar}
        vision={vision}
        busy={reading}
        onRead={(fields, image, model, replace) => {
          setReading(true)
          void draft.runFill(fields, image, model, replace).finally(() => setReading(false))
        }}
      />
    </div>
  )
}
