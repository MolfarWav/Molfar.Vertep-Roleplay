// "Continue in a new chat" in one click (#262): the new chat gets everything the old one was set up with, and the
// earlier story rides along through the same link the Canvas draws. No dialog: the person keeps chatting.
import { toast } from 'sonner'
import { listAgentSets, loadDefaultAgentSet, useAgentsLive } from '@/lib/agents'
import { lastSetFor } from '@/lib/agent-usage'
import { listWorldChats } from '@/lib/world'
import { t } from '@/lib/i18n'
import { useApp } from '@/lib/store'
import type { ID } from '@/lib/types'

/** Start the chat that continues `chatId` and open it. Carries the preset and its picks, the persona (if it still
 *  exists), the model, the agent set, a group's turns and the chat's World DM world. Returns false when the chat is gone. */
export async function continueInNewChat(chatId: ID): Promise<boolean> {
  const app = useApp.getState()
  const old = app.chats.find((c) => c.id === chatId)
  if (!old) return false

  // the agent set the old chat used: silent when the app has no agents plugin
  let agents: { preset: string } | { own: [] } | undefined
  try {
    const [sets, def] = await Promise.all([listAgentSets(), loadDefaultAgentSet()])
    const last = lastSetFor([old], useAgentsLive.getState().chats, old.characterId, def, new Set(sets.map((x) => x.id)))
    if (last.pick === 'none') agents = { own: [] }
    else if (last.pick !== 'default') agents = { preset: last.pick }
  } catch { /* no agents plugin: the new chat follows whatever default there is */ }

  // a world the old chat holds comes along; a failed lookup only means it does not
  let world: { fromChatId: ID } | undefined
  try {
    const worlds = await listWorldChats()
    if (worlds?.some((w) => w.chatId === old.id && w.records > 0)) world = { fromChatId: old.id }
  } catch { /* the World plugin is off */ }

  const presetOk = !!old.presetId && app.presets.some((p) => p.id === old.presetId)
  const personaOk = !!old.personaId && app.personas.some((p) => p.id === old.personaId)
  await app.startChatWith(old.characterId, 0, {
    ...(presetOk ? { presetId: old.presetId!, presetVars: old.presetVars?.[old.presetId!] ?? {} } : {}),
    ...(agents ? { agents } : {}),
    ...(old.turns ? { turns: old.turns } : {}),
    ...(personaOk ? { personaId: old.personaId } : {}),
    ...(old.model ? { model: old.model } : {}),
    ...(world ? { world, quietWorld: true } : {}),
    continues: old.id,
  })
  // startChatWith opens the new chat, or shows its own error and stays here
  if (useApp.getState().activeChatId !== old.id) toast.success(t('req.started'))
  return true
}
