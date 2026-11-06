// "Continue in a new chat" in one click (#262): the new chat gets everything the old one was set up with, and the
// earlier story rides along through the same link the Canvas draws. No dialog: the person keeps chatting.
import { toast } from 'sonner'
import { loadChatAgents, loadDefaultAgentSet } from '@/lib/agents'
import { listWorldChats } from '@/lib/world'
import { t } from '@/lib/i18n'
import { useApp, type AgentBindingOpt } from '@/lib/store'
import type { ID } from '@/lib/types'

/** Start the chat that continues `chatId` and open it. Carries the preset and its picks, the persona (if it still
 *  exists), the model, the agent set, a group's turns and the chat's World DM world. Returns false when the chat is gone. */
export async function continueInNewChat(chatId: ID): Promise<boolean> {
  const app = useApp.getState()
  const old = app.chats.find((c) => c.id === chatId)
  if (!old) return false

  // the agents the old chat runs now: the set it follows, or its own copy with where each result is shown.
  // Silent when the app has no agents plugin: the new chat then follows whatever default there is.
  let agents: AgentBindingOpt | undefined
  try {
    const [cur, def] = await Promise.all([loadChatAgents(old.id), loadDefaultAgentSet()])
    const b: AgentBindingOpt = {}
    // a chat that follows the default set keeps following it: only a set picked on purpose is carried
    if (cur.presetId && (!cur.followsPreset || cur.presetId !== def)) b.preset = cur.presetId
    if (!cur.followsPreset) {
      b.own = cur.items.map((i) => ({ agent: i.agent, on: i.on, ...(i.phase ? { phase: i.phase } : {}), ...(i.wait === false ? { wait: false } : {}) }))
      const show = Object.fromEntries(cur.items.filter((i) => i.show).map((i) => [i.agent, i.show as string]))
      const also = Object.fromEntries(cur.items.filter((i) => i.also).map((i) => [i.agent, true as const]))
      if (Object.keys(show).length) b.show = show
      if (Object.keys(also).length) b.also = also
    }
    if (b.preset || b.own) agents = b
  } catch { /* no agents plugin */ }

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
