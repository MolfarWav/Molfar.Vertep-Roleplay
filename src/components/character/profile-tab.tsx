import { useState } from 'react'
import { toast } from 'sonner'
import { Warning } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import type { Character } from '@/lib/types'
import {
  type Profile,
  profileOf,
  profileOutOfDate,
  applyProfile,
  startProfile,
  adoptHandEdits,
  acceptDraft,
  acceptFill,
} from '@/lib/profile'
import { ProfileForm } from '@/components/profile/profile-form'
import { ReadPictureDialog } from '@/components/profile/read-picture-dialog'
import { FillControls, ProfileDraftPanel, StructureButton, useFillEmpty, useProfileDraft, useVisionModel } from '@/components/character/structure-draft'

export function ProfileTab({ c, up }: { c: Character; up: (patch: Partial<Character>) => void }) {
  const p = profileOf(c)
  const [adoptMsg, setAdoptMsg] = useState<string | null>(null)
  const draft = useProfileDraft({ characterId: c.id }, (d) => {
    if (d.kind === 'fill') {
      up(acceptFill(c, d))
      toast.success(d.replace ? 'Appearance updated from the picture. The old text is in Versions.' : 'Empty fields filled. The old text is in Versions.')
    } else {
      up(acceptDraft(c, d))
      toast.success('Profile filled. The old text is in Versions.')
    }
  })
  const vision = useVisionModel()
  const fill = useFillEmpty(draft, p, c.avatar, vision)
  const [readOpen, setReadOpen] = useState(false)
  const [reading, setReading] = useState(false)
  const structureButton = <StructureButton busy={draft.busy === 'structure'} disabled={!!draft.busy} onClick={() => void draft.runStructure()} />
  const draftPanel = draft.draft && (
    <ProfileDraftPanel draft={draft.draft} before={c} mode="character" onAccept={draft.accept} onDiscard={draft.drop} />
  )

  if (!p) {
    return (
      <div className="flex flex-col gap-4">
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
        <label className="flex items-center gap-2 text-xs">
          <Switch checked={!!p.free} onCheckedChange={(v) => save({ ...p, free: v })} aria-label="Free write" />
          Free write: edit Description and Personality by hand; the profile stops writing them
        </label>
        {p.free && <p className="text-xs text-muted-foreground">Free write is on: the fields are saved but do not change the card's text.</p>}
        <div className="flex flex-wrap items-center gap-2">
          {structureButton}
          <FillControls busy={fill.busy} disabled={!!draft.busy} onFill={() => fill.run()} vision={vision} />
        </div>
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
        p={p}
        save={save}
        mode="character"
        fill={{ busy: fill.busy || !!draft.busy, run: fill.run, readPicture: { busy: reading, open: () => setReadOpen(true) } }}
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
