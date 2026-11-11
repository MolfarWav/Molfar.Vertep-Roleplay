// Continue from someone's view (src/components/chat/pov-menu.tsx): the pure parts.

const NAME_MAX = 60

/** The stage direction for one name: brackets cut out of the name so it cannot end the direction early. */
export function povDirection(name: string): string {
  const clean = name.replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
  return `[[Continue the story from ${clean}'s point of view.]]`
}

export interface PovPerson { name: string; inScene: boolean }

/**
 * Who can be followed: the Dashboard's characters (the people in the scene first, then the others it knows;
 * the player's own persona is never among them), then the chat's card or group members it does not list.
 * One row per name, whatever the case.
 */
export function povCast(dash: { order: string[]; present: string[] } | null, cardNames: string[]): PovPerson[] {
  const seen = new Set<string>()
  const out: PovPerson[] = []
  const add = (name: string, inScene: boolean) => {
    const n = name.trim()
    const key = n.toLowerCase()
    if (!n || seen.has(key)) return
    seen.add(key)
    out.push({ name: n, inScene })
  }
  const present = new Set((dash?.present ?? []).map((n) => n.toLowerCase()))
  const order = dash?.order ?? []
  for (const n of order) if (present.has(n.toLowerCase())) add(n, true)
  for (const n of order) add(n, false)
  for (const n of cardNames) add(n, present.has(n.toLowerCase()))
  return out
}

