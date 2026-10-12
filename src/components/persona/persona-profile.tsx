import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { CaretRight, ListChecks } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { InfoTip } from '@/components/ui/info-tip'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { useConfirm } from '@/components/ui/confirm'
type ConfirmOptions = Parameters<ReturnType<typeof useConfirm>[0]>[0]
import { estimateTokens, formatTokens } from '@/lib/tokens'
import type { Persona } from '@/lib/types'
import {
  acceptPersonaDraft,
  acceptPersonaFill,
  personaAdditions,
  personaEdited,
  personaProfile,
  writePersona,
  type Profile,
} from '@/lib/profile'
import { ProfileForm } from '@/components/profile/profile-form'
import { ReadPictureDialog } from '@/components/profile/read-picture-dialog'
import { FillControls, ProfileDraftPanel, StructureButton, useFillEmpty, useProfileDraft, useVisionModel } from '@/components/character/structure-draft'

/** The persona's Description with "Five questions", "Structure it" and the
 *  collapsible Profile form that writes it. Keyed by persona id by the caller,
 *  so the one-time "Replace your edits?" answer never carries over. */
export function PersonaDescription({ p, update, onAsk, confirm }: {
  p: Persona
  update: (patch: Partial<Persona>) => void
  onAsk: () => void
  confirm: (opts: ConfirmOptions) => Promise<boolean>
}) {
  const profile = personaProfile(p)
  const draft = useProfileDraft({ personaId: p.id }, (d) => {
    if (d.kind === 'fill') {
      update(acceptPersonaFill(p, d))
      toast.success(d.replace ? 'Appearance updated from the picture.' : 'Empty fields filled.')
    } else {
      update(acceptPersonaDraft(p, d))
      toast.success('Persona profile filled.')
    }
  })
  const vision = useVisionModel()
  const fill = useFillEmpty(draft, profile, p.avatar, vision)
  const [readOpen, setReadOpen] = useState(false)
  const [reading, setReading] = useState(false)
  const approved = useRef(false)
  const asking = useRef(false)

  // Text added by hand after the compiled lines joins the notes, as the questions do.
  const write = (next: Profile) => {
    const added = personaAdditions(p)
    const notes = added ? { ...next.notes, description: [next.notes?.description?.trim() ?? '', added].filter(Boolean).join('\n\n') } : next.notes
    update(writePersona(p, { ...next, notes }))
  }
  const save = (next: Profile) => {
    if (next.free) return update(writePersona(p, next))
    // an edit INSIDE the compiled lines would be replaced: ask once first
    if (approved.current || !(personaEdited(p) && personaAdditions(p) === null)) return write(next)
    if (asking.current) return
    asking.current = true
    void confirm({
      title: 'Replace your edits?',
      description: 'You changed the description by hand where the profile wrote it. Saving rewrites those lines from the profile.',
      actionLabel: 'Rewrite',
    }).then((yes) => {
      asking.current = false
      if (yes) { approved.current = true; write(next) }
    })
  }

  return (
    <>
      {/* a long description pushed the profile off screen: it folds, and starts folded once a profile writes it */}
      <Collapsible defaultOpen={!p.profile} className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <CollapsibleTrigger className="group flex items-center gap-2 text-left text-xs font-medium">
            <CaretRight className="size-3.5 transition-transform group-data-[panel-open]:rotate-90" aria-hidden="true" />
            <Label className="pointer-events-none text-xs">Description</Label>
            <Badge variant="outline" className="text-[10px]">{formatTokens(estimateTokens(p.description))} tok</Badge>
          </CollapsibleTrigger>
          <div className="ml-auto flex flex-wrap gap-1.5">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onAsk}>
              <ListChecks className="size-3.5" aria-hidden="true" />{p.profile ? 'Edit answers' : 'Five questions'}
            </Button>
            <StructureButton busy={draft.busy === 'structure'} disabled={!!draft.busy} onClick={() => void draft.runStructure()} />
          </div>
        </div>
        <CollapsibleContent>
          <Textarea value={p.description} rows={5} onChange={(e) => update({ description: e.target.value })} aria-label="Description" className="text-sm" />
        </CollapsibleContent>
      </Collapsible>
      {draft.draft && (
        <ProfileDraftPanel draft={draft.draft} before={{ description: p.description, personality: '' }} mode="persona" onAccept={draft.accept} onDiscard={draft.drop} />
      )}

      <Collapsible defaultOpen={!!p.profile} className="flex flex-col gap-3 rounded-lg border border-border p-3">
        <div className="flex items-center gap-1">
          <CollapsibleTrigger className="group flex items-center gap-2 text-left text-xs font-semibold uppercase text-muted-foreground">
            <CaretRight className="size-3.5 transition-transform group-data-[panel-open]:rotate-90" aria-hidden="true" />
            Profile
            <span className="font-normal normal-case">fields that write the description</span>
          </CollapsibleTrigger>
          <InfoTip label="About the profile">Fill in the fields and the description above is written from them, so you do not have to compose it yourself. Turn on Free write to edit the description by hand instead.</InfoTip>
        </div>
        <CollapsibleContent className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-xs">
            <Switch checked={!!profile.free} onCheckedChange={(v) => save({ ...profile, free: v })} aria-label="Free write" />
            Free write: edit the description by hand; the profile stops writing it
          </label>
          {profile.free && <p className="text-xs text-muted-foreground">Free write is on: the fields are saved but do not change the description.</p>}
          <FillControls busy={fill.busy} disabled={!!draft.busy} onFill={() => fill.run()} vision={vision} />
          <ProfileForm
            p={profile}
            save={save}
            mode="persona"
            fill={{ busy: fill.busy || !!draft.busy, run: fill.run, readPicture: { busy: reading, open: () => setReadOpen(true) } }}
          />
          <ReadPictureDialog
            open={readOpen}
            onOpenChange={setReadOpen}
            profile={profile}
            avatar={p.avatar}
            vision={vision}
            busy={reading}
            onRead={(fields, image, model, replace) => {
              setReading(true)
              void draft.runFill(fields, image, model, replace).finally(() => setReading(false))
            }}
          />
        </CollapsibleContent>
      </Collapsible>
    </>
  )
}
