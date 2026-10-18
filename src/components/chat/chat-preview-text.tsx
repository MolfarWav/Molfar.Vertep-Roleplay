import { useMemo } from 'react'
import { useDisplayTexts } from '@/hooks/use-display-texts'
import { resolveDisplayScripts } from '@/lib/display-scripts'
import { cleanPreview } from '@/lib/preview'
import { hideStateTag } from '@/lib/state-tag'
import { useApp } from '@/lib/store'
import type { Chat } from '@/lib/types'

/**
 * A chat's last words for a list row (#44): the chat's display regex runs first, as in the chat
 * itself, so what the chat hides (a reasoning block, a plan) never shows in the list either.
 */
export function ChatPreviewText({ chat, max, fallback = '' }: { chat: Chat; max: number; fallback?: string }) {
  const regexScripts = useApp((s) => s.regexScripts)
  const characters = useApp((s) => s.characters)
  const personas = useApp((s) => s.personas)
  const last = chat.messages[chat.messages.length - 1]
  // a chat whose messages are not loaded yet has only the index's preview: a reply as a rule
  const raw = last?.swipes[last.activeSwipe]?.content ?? chat.preview ?? ''
  const role = last?.role ?? 'assistant'
  const scripts = useMemo(() => {
    const character = characters.find((c) => c.id === chat.characterId)
    const persona = personas.find((p) => p.id === chat.personaId) ?? personas.find((p) => p.isDefault)
    return resolveDisplayScripts(regexScripts, {
      role,
      chatId: chat.id,
      characterId: chat.characterId,
      presetId: chat.presetId,
      members: character?.isGroup ? character.members ?? [] : [],
      depth: 0,
      userName: persona?.name ?? 'User',
      charName: character?.name ?? '',
    })
  }, [regexScripts, characters, personas, chat.id, chat.characterId, chat.personaId, chat.presetId, role])
  const shown = useDisplayTexts([hideStateTag(raw)], scripts)[0] ?? raw
  return <>{cleanPreview(shown, max) || fallback}</>
}
