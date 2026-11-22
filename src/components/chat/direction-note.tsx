// A small mark under the reply that carried a Direction rule's note (the genre rules, plugins/direction): who came, which rule,
// what the dice said, and how it ended. Found by the firing's `carrier` (`<message id>#<swipe>`), so a swipe shows its own note.
import { DoorOpen } from '@phosphor-icons/react'
import { useT } from '@/hooks/use-t'
import { resolveLanguage } from '@/lib/i18n'
import { useApp } from '@/lib/store'
import { useDirectionMarks, type DirectionMarks } from '@/lib/direction'
import { fireFor, markText } from '@/lib/direction-ui'
import type { Message } from '@/lib/types'

export function DirectionNote({ chatId, message }: { chatId: string; message: Message }) {
  const marks = useDirectionMarks((s) => s.chat)
  return <DirectionNoteView chatId={chatId} message={message} marks={marks} />
}

/** The mark itself, from the loaded chat's firings (a test passes them in). */
export function DirectionNoteView({ chatId, message, marks }: { chatId: string; message: Message; marks: DirectionMarks | null }) {
  const t = useT()
  const lang = resolveLanguage(useApp((s) => s.settings.language))
  if (message.role === 'user') return null
  const fire = fireFor(marks, chatId, message.id, message.activeSwipe ?? 0)
  if (!fire || !marks) return null
  const names = [...fire.who.map((id) => marks.members[id] ?? id), ...(fire.npc ?? []).map((id) => marks.people?.[id] ?? t('dir.someone'))]
  return (
    <div className="px-4 py-1" data-testid="direction-note">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <DoorOpen className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
        <span>{markText(t, fire, marks.rules[fire.rule] ?? fire.rule, names, lang)}</span>
      </p>
    </div>
  )
}
