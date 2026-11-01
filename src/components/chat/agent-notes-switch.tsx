import { useState } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { useT } from '@/hooks/use-t'
import { setSilentNotes, useAgentsLive } from '@/lib/agents'
import { cn } from '@/lib/utils'

/**
 * One switch for the notes of every agent in every chat (agents/settings.json `silentNotes`). On = notes are shown.
 * Choices, panels and the Agents line are not affected, so the person never loses a button they need.
 */
export function AgentNotesSwitch({ className }: { className?: string }) {
  const t = useT()
  const silent = useAgentsLive((s) => s.silentNotes)
  const [busy, setBusy] = useState(false)
  const flip = async (show: boolean) => {
    setBusy(true)
    try { await setSilentNotes(!show) } catch (e) { toast.error(t('ag.saveFailed', { why: String((e as Error)?.message ?? e) })) } finally { setBusy(false) }
  }
  return (
    <label className={cn('flex cursor-pointer items-start gap-2.5 max-md:min-h-10', className)} data-testid="agent-notes-switch">
      <Switch size="sm" className="mt-0.5 max-md:after:-inset-y-3.5" checked={!silent} disabled={busy} onCheckedChange={(on) => void flip(on)} aria-label={t('ag.silent.label')} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium">{t('ag.silent.label')}</span>
        <span className="block text-[11px] leading-snug text-muted-foreground">{t('ag.silent.hint')}</span>
      </span>
    </label>
  )
}
