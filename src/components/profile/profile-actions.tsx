import type { ReactNode } from 'react'
import { CircleNotch, Image as ImageIcon, MagicWand } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useT } from '@/hooks/use-t'
import type { VisionModel } from '@/components/character/structure-draft'

/** What the Profile tab is, in one line, and the Free write switch. Always shown, so a user who opens the tab
 *  with a profile already there still learns that these fields write the text chats read (GitHub #530). */
export function ProfileIntro({ mode, free, onFree }: { mode: 'character' | 'persona'; free: boolean; onFree: (on: boolean) => void }) {
  const text = mode === 'persona' ? "the persona's description" : "the card's Description and Personality"
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3" data-testid="profile-intro">
      <p className="text-xs text-muted-foreground">
        These fields write {text}, which is what chats read. Every filled field adds tokens to every chat, so switch a section off (&ldquo;In chats&rdquo; on its header) when a story does not need it: its fields are kept, but chats do not see them.
      </p>
      <label className="flex min-h-10 items-start gap-2 text-xs md:min-h-0">
        <Switch className="mt-0.5" checked={free} onCheckedChange={onFree} aria-label="Free write" />
        <span className="font-normal">
          <span className="font-semibold">Free write</span>: I write {mode === 'persona' ? 'the description' : 'Description and Personality'} myself, and the fields stop changing {mode === 'persona' ? 'it' : 'them'}.
          {free && <span className="block text-muted-foreground">Free write is on: the fields are kept, but chats do not see them.</span>}
        </span>
      </label>
    </div>
  )
}

function Cell({ children, hint }: { children: ReactNode; hint: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1.5">
      {children}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

/** The Profile tab's actions in one row, each with a line saying what it does and which model runs it (#528, #530).
 *  `structure`, `fill` and `read` are left out when the action is not offered (another character of a narrator card). */
export function ProfileActions({ textModel, vision, hasPortrait, busy, structure, fill, read, extra }: {
  /** the card's task model, short name ('' = none set) */
  textModel: string
  vision: VisionModel
  hasPortrait: boolean
  /** a model call is running: every button waits */
  busy: boolean
  structure?: { run: () => void; busy: boolean; progress: { part: number; parts: number } | null }
  fill?: { run: () => void; busy: boolean; member: boolean }
  read?: { open: () => void; busy: boolean }
  /** more cells of the same kind (a persona's questionnaire) */
  extra?: ReactNode
}) {
  const t = useT()
  const text = textModel || 'no model set (see Models)'
  const picture = vision.value === 'none'
    ? ' The portrait is not sent (Models: Don\'t read).'
    : !vision.active
      ? ' No connected model reads pictures, so Appearance comes from the text.'
      : hasPortrait
        ? ` Appearance reads the portrait with ${vision.named(vision.active)}.`
        : ' This card has no portrait, so Appearance comes from the text.'
  const readerName = vision.reader ? vision.named(vision.reader) : ''
  return (
    <div className="@container" data-testid="profile-actions">
      <div className="grid gap-3 @lg:grid-cols-3">
        {structure && (
          <Cell hint={`Sorts the text into the fields. Text model: ${text}. You review the result before anything changes.`}>
            <Button variant="outline" size="sm" className="w-fit max-md:h-10" disabled={busy} onClick={structure.run} title={t('ct.structureTip')}>
              {structure.busy ? <CircleNotch className="size-4 animate-spin" aria-hidden="true" /> : <MagicWand className="size-4" aria-hidden="true" />}
              {structure.busy ? (structure.progress ? t('ct.reading', structure.progress) : t('ct.readingBare')) : t('ct.structure')}
            </Button>
          </Cell>
        )}
        {fill && (
          <Cell hint={fill.member ? `Finds this character in the text by name and fills empty fields only. Text model: ${text}.` : `Fills empty fields only. Text model: ${text}.${picture}`}>
            <Button variant="outline" size="sm" className="w-fit max-md:h-10" disabled={busy} onClick={fill.run} title={t('ct.fillTip')}>
              {fill.busy ? <CircleNotch className="size-4 animate-spin" aria-hidden="true" /> : <MagicWand className="size-4" aria-hidden="true" />}
              {fill.busy ? t('ct.filling') : t('ct.fill')}
            </Button>
          </Cell>
        )}
        {read && (
          <Cell hint={readerName ? `Rewrites the Appearance fields from the portrait, or a picture you attach. Picture model: ${readerName}.` : 'Needs a model that reads pictures; none is connected (see Models).'}>
            <Button variant="outline" size="sm" className="w-fit max-md:h-10" disabled={busy || read.busy} onClick={read.open} title={t('ct.readPictureTip')}>
              {read.busy ? <CircleNotch className="size-4 animate-spin" aria-hidden="true" /> : <ImageIcon className="size-4" aria-hidden="true" />}
              {read.busy ? t('ct.readingPicture') : t('ct.readPicture')}
            </Button>
          </Cell>
        )}
        {extra}
      </div>
    </div>
  )
}

export { Cell as ProfileActionCell }
