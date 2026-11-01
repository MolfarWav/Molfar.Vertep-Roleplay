// What the Allow dialog shows for an installed agent and what it sends when the person presses the button.
// Pure, so a test can hold it. Permissions come from the agent's cards (`needs`); the models are the person's own choice and
// never change `needs`, but they decide who receives the chat text, so the preview carries them.

import type { AgentInfo } from './agents'

export interface PermRow {
  token: string
  /** this version of the runner can give it; an unsupported one is shown but cannot be switched on */
  supported: boolean
  granted: boolean
  /** the agent was allowed before and this version asks for more: only these need a decision */
  isNew: boolean
}

type PermAgent = Pick<AgentInfo, 'needs' | 'granted' | 'unsupported'>

export function permissionRows(agent: PermAgent): PermRow[] {
  const had = agent.granted.length > 0
  return agent.needs.map((token) => {
    const supported = !agent.unsupported.includes(token)
    const granted = agent.granted.includes(token)
    return { token, supported, granted, isNew: had && supported && !granted }
  })
}

/** The switches the dialog starts with: what is already allowed. */
export const startDraft = (agent: PermAgent): string[] => agent.needs.filter((n) => !agent.unsupported.includes(n) && agent.granted.includes(n))

/** The tokens to send: the draft, in the agent's order, without anything the agent does not ask for or this version cannot give. */
export const tokensToSend = (agent: PermAgent, draft: Iterable<string>): string[] => {
  const on = new Set(draft)
  return agent.needs.filter((n) => on.has(n) && !agent.unsupported.includes(n))
}

/** What the agent would still wait for if the draft were sent. */
export const stillWaiting = (agent: PermAgent, draft: Iterable<string>): string[] => {
  const sent = new Set(tokensToSend(agent, draft))
  return agent.needs.filter((n) => !agent.unsupported.includes(n) && !sent.has(n))
}

/** The draft after the agent's `needs` changed under an open dialog (an update): a switch for something it no longer asks for goes. */
export const trimDraft = (agent: PermAgent, draft: Iterable<string>): string[] => tokensToSend(agent, draft)

/** The model chosen for each role the agent names; null = none chosen, so the app's default model answers. */
export function modelLines(agent: Pick<AgentInfo, 'models' | 'own'>): { role: string; ref: string | null }[] {
  return Object.keys(agent.models ?? {}).map((role) => ({ role, ref: agent.own?.models?.[role] || null }))
}

/**
 * Stands for what the person is being asked to approve: the permissions and the model each role would send text to.
 * When it changes under an open dialog, the dialog says so before the button is pressed.
 */
export const previewKey = (agent: Pick<AgentInfo, 'needs' | 'unsupported' | 'models' | 'own'>): string =>
  JSON.stringify([agent.needs, agent.unsupported, modelLines(agent)])
