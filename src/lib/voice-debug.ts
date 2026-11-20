// "Show who speaks and why": a small mark after every quote of a reply painted by voices, naming the speaker the colour was
// taken from and the rule that chose it. For the owner and for whoever tunes the colours on real chats (Molfar.Vertep#477);
// off by default, kept in this browser.
import { useSyncExternalStore } from 'react'
import { create } from 'zustand'

const KEY = 'rp.voiceDebug'

const read = (): boolean => {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export const useVoiceDebug = create<{ on: boolean }>(() => ({ on: read() }))

/** The switch as a hook. The server snapshot is the current value too, so a page rendered to a string (the tests) sees it. */
export const useVoiceDebugOn = (): boolean => useSyncExternalStore(useVoiceDebug.subscribe, () => useVoiceDebug.getState().on, () => useVoiceDebug.getState().on)

export function setVoiceDebug(on: boolean): void {
  useVoiceDebug.setState({ on })
  try {
    if (on) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    // a browser that refuses storage keeps the switch for this page only
  }
}

/** The rule that chose a speaker, as the mark shows it. */
export type SpeakerWhy = 'label' | 'label-new' | 'name' | 'tag' | 'pronoun' | 'carry' | 'none'

/** What each rule means, for the title of the mark (English: it is a tool for tuning, not for reading a story). */
export const WHY_TEXT: Record<SpeakerWhy, string> = {
  label: 'the line opens with this name and a colon',
  'label-new': 'the line opens with a name nobody listed: a colour of its own',
  name: 'this voice is named in the line',
  tag: 'a name beside a speech verb: a speaker nobody listed',
  pronoun: 'a pronoun points at the one voice of that gender named earlier',
  carry: 'the line names nobody: the previous speaker',
  none: 'nobody is named yet: the theme colour',
}
