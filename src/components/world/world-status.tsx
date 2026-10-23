// The World DM's state in the chat header: a globe with a dot when the DM is on in this chat.
// Green = fine, red = the last run failed, pulsing = a run is going. It opens the DM sheet.

import { useEffect } from 'react'
import { GlobeHemisphereWest } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { loadWorld, useWorldLive } from '@/lib/world'

/** The World DM's state in this chat: null = off (or the plugin is missing). */
export type WorldDot = 'ok' | 'failed' | 'running' | null

export function useWorldDot(chatId: string, load = true): WorldDot {
  const view = useWorldLive((s) => s.views[chatId])
  const running = useWorldLive((s) => !!s.running[chatId])
  // once per opened chat; answers null without the plugin and nothing shows
  useEffect(() => {
    if (chatId && load) loadWorld(chatId).catch(() => {})
  }, [chatId, load])
  if (!view || view.settings.level === 'off') return null
  return running ? 'running' : view.lastError ? 'failed' : 'ok'
}

export function WorldStatusButton({ chatId, onClick, phone }: { chatId: string; onClick: () => void; phone?: boolean }) {
  const t = useT()
  const dot = useWorldDot(chatId, false)
  if (!dot) return null
  const running = dot === 'running'
  const failed = dot === 'failed'
  const label = running ? t('world.status.running') : failed ? t('world.status.failed') : t('world.status.on')
  return (
    <Button
      variant="ghost"
      size={phone ? 'icon' : 'icon-sm'}
      className={cn('relative', phone && 'size-10 shrink-0')}
      onClick={onClick}
      aria-label={label}
      title={label}
      data-testid="world-status"
      data-state={running ? 'running' : failed ? 'failed' : 'ok'}
    >
      <GlobeHemisphereWest aria-hidden="true" />
      <span
        aria-hidden="true"
        className={cn(
          'absolute right-1 top-1 size-2 rounded-full ring-2 ring-card',
          running ? 'animate-pulse bg-amber-500 motion-reduce:animate-none' : failed ? 'bg-destructive' : 'bg-emerald-500',
        )}
      />
    </Button>
  )
}
