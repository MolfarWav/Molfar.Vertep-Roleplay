import { useMemo } from 'react'
import { usageBySet } from '@/lib/agent-usage'
import { useAgentsLive } from '@/lib/agents'
import { useApp } from '@/lib/store'

/** How many chats follow each agent set (set id -> count), from the chat list and the lists the agents panel keeps fresh. */
export function useSetUsage(defaultSet: string | null): Map<string, number> {
  const chats = useApp((s) => s.chats)
  const live = useAgentsLive((s) => s.chats)
  return useMemo(() => usageBySet(chats, live, defaultSet), [chats, live, defaultSet])
}
