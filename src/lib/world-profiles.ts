// The DM profiles the World section lists (plugins/world, GET /world/profiles): one shared copy,
// so the chat's picker, the hub's Profiles tab and the sheet agree after any save.

import { create } from 'zustand'
import { deleteWorldProfile, listWorldProfiles, saveWorldProfile, type WorldBlockKey, type WorldProfile, type WorldProfileDefaults, type WorldProfileOptions } from '@/lib/world'

interface ProfilesState {
  list: WorldProfile[] | null
  /** the plugin is missing (404) or the read failed */
  error: string
}

export const useWorldProfiles = create<ProfilesState>(() => ({ list: null, error: '' }))

export async function refreshWorldProfiles(): Promise<WorldProfile[] | null> {
  try {
    const list = await listWorldProfiles()
    useWorldProfiles.setState({ list, error: '' })
    return list
  } catch (e) {
    useWorldProfiles.setState({ error: e instanceof Error ? e.message : String(e) })
    return null
  }
}

/** What a draft of a profile holds; the editor edits one of these. */
export interface ProfileDraft {
  name: string
  description: string
  defaults: WorldProfileDefaults
  options: WorldProfileOptions
  /** the text of every block, as typed */
  blocks: Record<string, string>
}

export const draftOf = (p: WorldProfile): ProfileDraft => ({
  name: p.name,
  description: p.description,
  defaults: { ...p.defaults },
  options: { ...p.options },
  blocks: Object.fromEntries(p.blocks.map((b) => [b.key, b.text])),
})

const same = (a: string, b: string) => a.replace(/\r\n/g, '\n').trim() === b.replace(/\r\n/g, '\n').trim()

/** Blocks whose typed text differs from what is saved. */
export function dirtyBlocks(p: WorldProfile, d: ProfileDraft): WorldBlockKey[] {
  return p.blocks.filter((b) => !same(d.blocks[b.key] ?? '', b.text)).map((b) => b.key)
}

export function isDirty(p: WorldProfile, d: ProfileDraft): boolean {
  if (dirtyBlocks(p, d).length) return true
  if (JSON.stringify(d.defaults) !== JSON.stringify(p.defaults)) return true
  if (JSON.stringify(d.options) !== JSON.stringify(p.options)) return true
  return !p.builtIn && (d.name.trim() !== p.name || d.description.trim() !== p.description)
}

/** The event block must keep {event}; an empty block means "the default" and is fine. */
export const eventBlockOk = (text: string) => !text.trim() || text.includes('{event}')

/** A block's patch value: its text, or null (back to the default) when it is empty or equal to the default. */
export function blockPatch(p: WorldProfile, key: WorldBlockKey, text: string): string | null {
  const dflt = p.blocks.find((b) => b.key === key)?.default ?? ''
  return !text.trim() || same(text, dflt) ? null : text
}

export async function saveProfileDraft(p: WorldProfile, d: ProfileDraft): Promise<WorldProfile[]> {
  const blocks: Partial<Record<WorldBlockKey, string | null>> = {}
  for (const k of dirtyBlocks(p, d)) blocks[k] = blockPatch(p, k, d.blocks[k] ?? '')
  const res = await saveWorldProfile({
    id: p.id,
    ...(p.builtIn ? {} : { name: d.name.trim() || p.name, description: d.description.trim() }),
    blocks,
    defaults: d.defaults,
    options: d.options,
  })
  useWorldProfiles.setState({ list: res.profiles, error: '' })
  return res.profiles
}

/** One block back to its default, at once (the other typed blocks stay as they are). */
export async function resetProfileBlock(p: WorldProfile, key: WorldBlockKey): Promise<WorldProfile[]> {
  const res = await saveWorldProfile({ id: p.id, blocks: { [key]: null } })
  useWorldProfiles.setState({ list: res.profiles, error: '' })
  return res.profiles
}

/** A new own profile on `base`; blocks that differ from that level's defaults are sent. */
export async function createProfile(input: { name: string; description: string; base: WorldProfile['base']; defaults: WorldProfileDefaults; options: WorldProfileOptions; blocks: Record<string, string>; levelDefaults: Record<string, string> }): Promise<{ id: string; profiles: WorldProfile[] }> {
  const blocks: Partial<Record<WorldBlockKey, string>> = {}
  for (const [k, text] of Object.entries(input.blocks)) {
    if (text.trim() && !same(text, input.levelDefaults[k] ?? '')) blocks[k as WorldBlockKey] = text
  }
  const res = await saveWorldProfile({ name: input.name.trim(), description: input.description.trim(), base: input.base, defaults: input.defaults, options: input.options, blocks })
  useWorldProfiles.setState({ list: res.profiles, error: '' })
  return res
}

export async function removeProfile(id: string): Promise<WorldProfile[]> {
  const list = await deleteWorldProfile(id)
  useWorldProfiles.setState({ list, error: '' })
  return list
}
