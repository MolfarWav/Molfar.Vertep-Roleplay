import { useMemo } from 'react'
import { useDisplayTexts } from '@/hooks/use-display-texts'
import { resolveDisplayScripts } from '@/lib/display-scripts'
import { cleanPreview, firstLine } from '@/lib/preview'
import { hideStateTag } from '@/lib/state-tag'
import { useApp } from '@/lib/store'
import type { Chat, Message } from '@/lib/types'

/**
 * A message's text as the chat shows it (#44): the chat's display regex runs first, as in the chat
 * itself, so what the chat hides (a reasoning block, a plan) never shows outside it either.
 */
export function useShownText(chat: Chat, raw: string, role: 'user' | 'assistant' | 'system' = 'assistant'): string {
  const regexScripts = useApp((s) => s.regexScripts)
  const characters = useApp((s) => s.characters)
  const personas = useApp((s) => s.personas)
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
  return useDisplayTexts([hideStateTag(raw)], scripts)[0] ?? raw
}

/** A chat's last words for a list row. */
export function ChatPreviewText({ chat, max, fallback = '' }: { chat: Chat; max: number; fallback?: string }) {
  const last = chat.messages[chat.messages.length - 1]
  // a chat whose messages are not loaded yet has only the index's preview: a reply as a rule
  const raw = last?.swipes[last.activeSwipe]?.content ?? chat.preview ?? ''
  const shown = useShownText(chat, raw, last?.role ?? 'assistant')
  return <>{cleanPreview(shown, max) || fallback}</>
}

/** One message of a chat, shown outside it (the Chats panel's last messages). */
export function MessagePreviewText({ chat, message, max }: { chat: Chat; message: Message; max: number }) {
  const shown = useShownText(chat, message.swipes[message.activeSwipe]?.content ?? '', message.role)
  return <>{cleanPreview(shown, max)}</>
}

/** The Home hero's quote: the first line of the chat's last words, as the chat shows them. */
export function ChatQuote({ chat, max, className }: { chat: Chat; max: number; className?: string }) {
  const last = chat.messages[chat.messages.length - 1]
  const raw = last?.swipes[last.activeSwipe]?.content ?? chat.preview ?? ''
  const quote = firstLine(useShownText(chat, raw, last?.role ?? 'assistant'), max)
  return quote ? <p className={className}>«{quote}»</p> : null
}
