import { useT } from '@/hooks/use-t'
import type { PresetNote } from '@/lib/types'

/**
 * A muted line between messages: what changed in the preset at that point
 * ("Point of view → First · Tense → Present"). Not a message: no actions, never sent to the model.
 */
export function PresetNoteLine({ note }: { note: PresetNote }) {
  const t = useT()
  const shown = (s: string) => (s === 'on' ? t('pc.note.on') : s === 'off' ? t('pc.note.off') : s)
  const text = note.changes
    .map((c) => `${c.kind === 'preset' ? t('pc.note.preset') : c.label} → ${shown(c.shown)}`)
    .join(' · ')
  return (
    <p className="my-1 px-4 text-center text-[11px] leading-snug text-muted-foreground" data-testid="preset-note">
      {text}
    </p>
  )
}
