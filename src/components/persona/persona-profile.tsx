import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { ListChecks } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { useConfirm } from '@/components/ui/confirm'
type ConfirmOptions = Parameters<ReturnType<typeof useConfirm>[0]>[0]
import { useT } from '@/hooks/use-t'
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
import { CardModelPanel } from '@/components/character/card-model-panel'
import type { CardTasksState } from '@/components/character/use-card-tasks'
import { ProfileActionCell, ProfileActions, ProfileIntro } from '@/components/profile/profile-actions'
import { ProfileDraftPanel, hasPortrait, useFillEmpty, useProfileDraft, useVisionModel } from '@/components/character/structure-draft'
import { shortModel } from '@/lib/utils'

/** The persona's profile logic, held by the page so the Core and Profile tabs share one draft:
 *  "Structure it", "Fill empty" and the questionnaire all write through `write`/`save`, and an edit
 *  made by hand inside the lines the profile wrote is asked about once ("Replace your edits?"). */
export function usePersonaProfile(p: Persona, update: (patch: Partial<Persona>) => void, confirm: (opts: ConfirmOptions) => Promise<boolean>, tasks: CardTasksState) {
  const profile = personaProfile(p)
  const draft = useProfileDraft({ personaId: p.id }, (d) => {
    if (d.kind === 'fill') {
      update(acceptPersonaFill(p, d))
      toast.success(d.replace ? 'Appearance updated from the picture.' : 'Empty fields filled.')
    } else {
      update(acceptPersonaDraft(p, d))
      toast.success('Persona profile filled.')
    }
  }, (kind) => tasks.requestFor(kind, p.description))
  const vision = useVisionModel(tasks)
  const fill = useFillEmpty(draft, profile, p.avatar, vision, tasks, p.description)
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
  return { profile, draft, vision, fill, readOpen, setReadOpen, reading, setReading, save }
}
export type PersonaProfileState = ReturnType<typeof usePersonaProfile>

/** Core tab: the Description (the one text sent to the model), with its token count. */
export function PersonaDescriptionField({ p, update }: { p: Persona; update: (patch: Partial<Persona>) => void }) {
  const t = useT()
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-sm font-semibold" htmlFor="persona-description">{t('personas.page.description')}</Label>
        <Badge variant="outline" className="text-[10px]">{formatTokens(estimateTokens(p.description))} tok</Badge>
      </div>
      <Textarea id="persona-description" value={p.description} rows={10} onChange={(e) => update({ description: e.target.value })} aria-label="Description" className="text-sm" />
      <p className="text-xs text-muted-foreground">{t(p.profile ? 'personas.page.descriptionProfiled' : 'personas.page.descriptionHint')}</p>
    </div>
  )
}

/** Profile tab: the model for the card's tasks, Free write, Fill empty, Structure it, Edit answers and the folded form. */
export function PersonaProfilePanel({ p, state, tasks, onAsk }: { p: Persona; state: PersonaProfileState; tasks: CardTasksState; onAsk: () => void }) {
  const t = useT()
  const { profile, draft, vision, fill, readOpen, setReadOpen, reading, setReading, save } = state
  return (
    <div className="flex flex-col gap-3" data-testid="persona-profile-panel">
      <ProfileIntro mode="persona" free={!!profile.free} onFree={(v) => save({ ...profile, free: v })} />
      <CardModelPanel tasks={tasks} c={{ description: p.description }} vision={vision} hasPortrait={hasPortrait(p.avatar)} saves="now" />
      <ProfileActions
        textModel={tasks.resolved.model ? shortModel(tasks.resolved.model) : ''}
        vision={vision}
        hasPortrait={hasPortrait(p.avatar)}
        busy={!!draft.busy || fill.busy || reading}
        structure={{ run: () => void draft.runStructure(), busy: draft.busy === 'structure', progress: draft.progress }}
        fill={{ run: () => fill.run(), busy: fill.busy, member: false }}
        read={{ open: () => setReadOpen(true), busy: reading }}
        extra={
          <ProfileActionCell hint="Answer a few questions and the profile is written from your answers.">
            <Button variant="outline" size="sm" className="w-fit max-md:h-10" onClick={onAsk}>
              <ListChecks className="size-4" aria-hidden="true" />{p.profile ? t('personas.page.editAnswers') : t('personas.page.fiveQuestions')}
            </Button>
          </ProfileActionCell>
        }
      />
      {draft.draft && (
        <ProfileDraftPanel draft={draft.draft} before={{ description: p.description, personality: '' }} mode="persona" free={!!profile.free} onAccept={draft.accept} onDiscard={draft.drop} />
      )}
      <ProfileForm
        p={profile}
        save={save}
        mode="persona"
        fold
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
          void draft.runFillSteps([{ fields, image, model, replace, limits: tasks.requestForModel('fill', p.description, vision.reader) }]).finally(() => setReading(false))
        }}
      />
    </div>
  )
}
