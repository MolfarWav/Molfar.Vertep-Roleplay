// Engine-backed studio store. Every server-owned entity (characters, chats,
// personas, presets, lorebooks, regex, groups, the model catalog) lives in the
// Chrysalis engine and flows through src/lib/engine.ts; this store hydrates
// from the engine on boot and mirrors mutations optimistically, refreshing
// from the server after writes. Purely client-side concerns (themes, quick
// replies, tags/folders, achievements, appearance settings) persist to
// localStorage — they genuinely run locally.
//
// Generation is REAL: POST /chats/:id/{send,swipe,continue,next} stays open
// while the kernel runs the model; text deltas stream in over the WS bus
// (app_stream) and render live. Stop aborts the request.
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { readDraft, unsavedKeys } from './drafts'
import { toast } from 'sonner'
import { resolveLanguage, t, type Lang } from './i18n'
import { fetchModelParams, modelLimits, moveSamplersToModel, type ModelParams } from './model-params'
import type {
  Character, Chat, Message, Persona, Preset, Lorebook, QuickReplySet, RegexScript,
  Connection, Extension, ThemePreset, BackgroundItem, Tag, Folder, AppSettings,
  ConnectionProfile, DataBankFile, ID, ModelInfo, ChatBranch, ToolPart,
  PresetChoiceBody, PresetCosts, PresetMemory, GroupConfig, ChatTurns,
} from './types'
import {
  seedThemes, defaultSettings, withBuiltinThemes,
  buildDefaultPreset, DEFAULT_MAIN_PROMPT, DEFAULT_UTILITY_PROMPTS,
} from './seed'
import { uid } from './tokens'
import { DEFAULT_AVATAR } from './utils'
import { compileIfWrittenElsewhere } from './profile'
import { shellLocale } from './shell-bridge'
import {
  j, fetchModels, fetchEngineConnections, type ModelFavorite, fetchBootstrap, connectStreams, ApiError, reloadWithReason,
  cardToCharacter, cardPatch, characterToCard, groupToCharacter,
  engineChatToUI, chatPatchOf, chatGroupSettings, mergeChatTurns,
  type EngineChatMeta, type EngineMessage, type EngineConnectionInfo,
  enginePersonaToUI, presetToEngine, enginePresetToUI,
  lorebookToEngine, engineLorebookToUI, regexToEngine, engineRegexToUI,
} from './engine'
import { MOBILE_BREAKPOINT } from '@/hooks/use-mobile'
import { buildImagePrompt, generateImage, postPicture, type GeneratedImage } from './image-gen'
import { triggerDashUpdate } from './dash-live'
import { presetImport, regexImport } from './import-shapes'
import { migrateLook } from './migrate-look'

export type ViewKey =
  | 'home' | 'chats' | 'characters' | 'marketplace' | 'personas' | 'presets' | 'lorebooks' | 'litopys' | 'canvas'
  | 'quickreplies' | 'extensions' | 'connections' | 'settings' | 'chat'

/** Sections that can be a drawer (see opensAsDrawer). Home and the chat
 *  surfaces are always pages. */
export const DRAWER_VIEWS = new Set<ViewKey>([
  'characters', 'marketplace', 'personas', 'presets', 'lorebooks', 'litopys', 'canvas', 'quickreplies', 'extensions', 'connections', 'settings',
])

const isDesktopViewport = () =>
  typeof window !== 'undefined' && window.matchMedia(`(min-width: ${MOBILE_BREAKPOINT}px)`).matches

/** Sections slide over the page on desktop (Home, Chats or a chat stays put
 *  underneath), and over an open chat on phones; any other phone page is
 *  replaced by the section. */
const opensAsDrawer = (page: ViewKey) => isDesktopViewport() || page === 'chat'

export type BootState = 'loading' | 'ready' | 'error'

/** Books the engine should scan for a chat: every global book plus the ones
 *  of the chat's character (its own book and the linked ones; in a group, every
 *  member's). The engine honors meta.lorebookIds as the scope. */
export function scopeBookIds(books: Lorebook[], chat: Chat | undefined, characters: Character[]): string[] {
  if (!chat) return []
  const exists = new Set(books.map((b) => b.id))
  const ids = new Set(books.filter((b) => b.globalActive).map((b) => b.id))
  const char = characters.find((c) => c.id === chat.characterId)
  const cast = char?.isGroup ? (char.members ?? []).map((id) => characters.find((c) => c.id === id)) : [char]
  for (const c of cast) {
    if (c?.embeddedLorebookId) ids.add(c.embeddedLorebookId)
    for (const lid of c?.linkedLorebookIds ?? []) ids.add(lid)
  }
  // a group's own books; the engine leaves members' books out by the group's memberBooks choice
  if (char?.group?.embeddedLorebookId) ids.add(char.group.embeddedLorebookId)
  for (const lid of char?.group?.linkedLorebookIds ?? []) ids.add(lid)
  // a deleted book's id may linger on a card
  return [...ids].filter((id) => exists.has(id))
}


/** Text waiting for a chat's composer (see AppState.composerDrafts). */
export type ComposerFill = { id: string; chatId: ID; text: string; base: string; kind: 'impersonate' | 'unsent'; attachments?: Message['attachments'] }
export type SendOutcome = 'sent' | 'not-sent' | 'stopped'

interface AppState {
  boot: BootState
  bootError: string | null
  /** true once the ENGINE hydrate finished (kept for the settings export) */
  hydrated: boolean
  // server-backed data
  characters: Character[]
  chats: Chat[]
  personas: Persona[]
  presets: Preset[]
  lorebooks: Lorebook[]
  regexScripts: RegexScript[]
  models: ModelInfo[]
  /** The engine's quick switch (starred models, set in the shell's Settings); every picker offers it first. */
  favorites: ModelFavorite[]
  /** The model a chat runs on: its own, else the one chosen last. */
  modelFor: (chatId: ID | null | undefined) => string | null
  /** Pick a chat's model; it also becomes the one new chats start with. */
  setChatModel: (chatId: ID, ref: string) => Promise<void>
  /** The engine's parameters per model (model-params.ts); {} on an engine without them. */
  modelParams: ModelParams
  /** Re-read them (after Settings changed a model); also runs the one-time move of the preset's samplers. */
  refreshModelParams: () => Promise<void>
  /** engine API connections (models "auto" discovery lives engine-side) */
  engineConnections: EngineConnectionInfo[]
  /** engine settings.model — the default generation model */
  model: string | null
  // local-only data (persisted)
  qrSets: QuickReplySet[]
  connections: Connection[]
  extensions: Extension[]
  themes: ThemePreset[]
  backgrounds: BackgroundItem[]
  tags: Tag[]
  folders: Folder[]
  dataBank: DataBankFile[]
  connectionProfiles: ConnectionProfile[]
  settings: AppSettings
  // ui state
  view: ViewKey
  /** open section drawer (null = closed): any page on desktop, only over an open chat on phones */
  drawer: ViewKey | null
  activeChatId: ID | null
  activeCharacterId: ID | null
  focusPresetId: ID | null
  /** one-shot: the Library opens its Litopys settings (set by Settings > Memory) */
  litopysSettings: boolean
  focusPersonaId: ID | null
  /** set by "Open" on a card's book: the Lorebooks view selects that book and clears it */
  focusLorebookId: ID | null
  /** set by Home's Branches button: the chat view opens that chat's branch tree and clears it */
  branchTreeFor: ID | null
  openBranchTree: (chatId: ID) => void
  selectedSettingsSection: string
  streaming: { chatId: ID; messageId: ID; full: string; shown: number; startedAt: number; adopted?: boolean; thinking?: string; thinkingT0?: number; thinkingMs?: number; marks?: Array<{ kind: 'tool'; at: number; name: string; args: Record<string, unknown>; done?: boolean; resultText?: string; isError?: boolean } | { kind: 'think'; at: number; text: string; t0: number; ms?: number }> } | null
  /** one-shot: suppress the swipe animation for this messageId:swipeIndex
   *  (set when a cancelled regen appends its frozen swipe) */
  swipeFxSkip: string | null
  consumeSwipeFxSkip: (key: string) => void
  /** Whether each thinking block is open, by message id then block index.
   *  It lives here, not in the row, because a staged reply COMMITS UNDER A
   *  NEW ID: the row unmounts and a closed reasoning box would spring back
   *  open the moment the reply finished. */
  thinkOpen: Record<ID, Record<number, boolean>>
  setThinkOpen: (messageId: ID, index: number, open: boolean) => void
  inputHistory: string[]
  /** Text waiting for a chat's composer: a "Write for me" result or a message that was not sent,
   *  keyed by its chat. The composer applies it only while that chat's draft still reads `base`;
   *  otherwise it is offered, never forced (GitHub #29, #30). */
  composerDrafts: Record<ID, ComposerFill>
  deleteMode: boolean
  /** /help reference dialog (commands + macros) */
  helpOpen: boolean
  setHelpOpen: (v: boolean) => void
  /** the user collapsed the labeled nav rail to its slim icon form (wide
   *  windows only); persisted between sessions */
  railCollapsed: boolean
  setRailCollapsed: (v: boolean) => void
  /** the desktop section drawer fills the screen beside the rail; persisted */
  drawerFull: boolean
  setDrawerFull: (v: boolean) => void
  // lifecycle
  hydrate: () => Promise<void>
  /** Refresh ONLY the lorebooks list — the light path imports and single-book
   *  changes take; a full hydrate here would refetch every chat transcript. */
  refreshLorebooks: () => Promise<void>
  setModel: (model: string | null) => Promise<void>
  setView: (v: ViewKey) => void
  closeDrawer: () => void
  navigate: (v: ViewKey) => void
  openChat: (chatId: ID) => void
  ensureChatMessages: (chatId: ID) => Promise<void>
  closeChat: () => void
  openCharacter: (charId: ID | null) => void
  /** Opens a card's editor on a given tab (the chat's "souls proposed" toast uses it). */
  openCharacterOnTab: (charId: ID, tab: string) => void
  /** A tab the character editor should switch to once; it clears the field. */
  characterEditorTab: string | null
  /** Counter, not persisted: bumped by openDashboard(); the mounted dashboard sheet opens when it changes. */
  dashOpen: number
  /** Asks the open chat's dashboard to open (wide sheet on desktop, bottom sheet on a phone). */
  openDashboard: () => void
  focusPreset: (presetId: ID) => void
  focusPersona: (personaId: ID) => void
  focusLorebook: (bookId: ID) => void
  setSettingsSection: (s: string) => void
  updateSettings: (patch: Partial<AppSettings>) => void
  // chat actions
  /** noEmptySend: an empty send stays empty (the preset's send_if_empty text is not used), for
   *  "Story, move", which wants the character to continue with no user turn at all */
  /** 'not-sent': the message is not in the chat (refused before sending, or the request failed
   *  before the engine stored it): the composer gets the text back. */
  sendMessage: (chatId: ID, content: string, opts?: { attachments?: Message['attachments']; noEmptySend?: boolean }) => Promise<SendOutcome>
  stopStreaming: () => void
  tickStream: () => void
  /** `guidance`: a direction for this one reply (Regenerate with a hint); never saved */
  regenerate: (chatId: ID, messageId?: ID, guidance?: string) => void
  /** Drop a chat's waiting fill once its composer took it (only that fill: a newer one stays). */
  dropComposerDraft: (chatId: ID, id: string) => void
  addSwipe: (chatId: ID) => void
  setSwipe: (chatId: ID, messageId: ID, index: number) => void
  deleteSwipe: (chatId: ID, messageId: ID, swipeIndex: number) => void
  editMessage: (chatId: ID, messageId: ID, content: string) => void
  /** edit the model's thinking on its own, without touching the reply text */
  editReasoning: (chatId: ID, messageId: ID, text: string) => void
  /** edit one think segment of a tool-using reply */
  editThinkPart: (chatId: ID, messageId: ID, partIndex: number, text: string) => void
  deleteMessage: (chatId: ID, messageId: ID, mode?: 'this' | 'above' | 'below') => void
  deleteMessages: (chatId: ID, messageIds: ID[]) => void
  setDeleteMode: (on: boolean) => void
  toggleHidden: (chatId: ID, messageId: ID) => void
  setMessageTranslation: (chatId: ID, messageId: ID, translation: string | null) => void
  toggleBookmark: (chatId: ID, messageId: ID, label?: string) => void
  moveMessage: (chatId: ID, messageId: ID, dir: -1 | 1) => void
  impersonate: (chatId: ID) => void
  continueReply: (chatId: ID) => void
  forkChat: (chatId: ID, messageId: ID) => Promise<ID>
  forkAndOpen: (chatId: ID, messageId: ID) => Promise<void>
  updateChat: (chatId: ID, patch: Partial<Chat>) => void
  /** opts: the preset and picks the new-chat step chose (absent = the character's memory, else the default preset) */
  newChat: (charId: ID, greetingIndex?: number, opts?: { presetId?: ID; presetVars?: Record<string, string | string[]>; turns?: ChatTurns }) => Promise<ID>
  startChatAndOpen: (charId: ID, greetingIndex?: number) => Promise<void>
  /** the open new-chat step (preset and choices before a chat starts); null = none */
  newChatStep: { charId: ID; greetingIndex?: number } | null
  closeNewChatStep: () => void
  /** create the chat (with the step's preset and picks, if any) and open it */
  startChatWith: (charId: ID, greetingIndex?: number, opts?: { presetId?: ID; presetVars?: Record<string, string | string[]>; turns?: ChatTurns }) => Promise<void>
  /** Change THIS chat's preset and/or picks (POST /chats/:id/preset); the meta it returns replaces the chat's copy. */
  setChatPreset: (chatId: ID, body: PresetChoiceBody) => Promise<void>
  /** only: 'total' skips the per-option costs (slow in the engine's sandbox) */
  fetchPresetCosts: (presetId: ID, body?: { chatId?: ID; vars?: Record<string, string | string[] | null>; only?: 'total' }) => Promise<PresetCosts>
  fetchPresetMemory: (characterId: ID) => Promise<PresetMemory>
  /** the user's own default choices per preset (null until loaded) */
  presetDefaults: Record<ID, Record<string, string | string[]>> | null
  loadPresetDefaults: () => Promise<Record<ID, Record<string, string | string[]>>>
  /** save these choices as the user's default for the preset; null forgets it */
  setPresetDefault: (presetId: ID, vars: Record<string, string | string[]> | null) => Promise<void>
  createGroup: (name: string, memberIds: ID[]) => Promise<ID>
  convertToGroup: (chatId: ID, addMemberIds: ID[]) => Promise<ID | null>
  reorderGroupMember: (groupId: ID, memberId: ID, dir: -1 | 1) => void
  /** Change a group's file (the group editor). Arrays and memberSettings go whole. */
  updateGroup: (groupId: ID, patch: Partial<GroupConfig>) => void
  /** change this group chat's own turn settings (merged in); null = follow the group again */
  setChatTurns: (chatId: ID, patch: ChatTurns | null) => void
  /** move a member earlier or later in this chat's order */
  moveChatMember: (chatId: ID, memberId: ID, dir: -1 | 1) => void
  triggerMember: (chatId: ID, memberId: ID) => void
  deleteChat: (chatId: ID) => void
  pushInputHistory: (s: string) => void
  /** Fire quick replies whose auto-execute flag matches the event (real hooks). */
  runAutoExecutes: (event: 'onStartup' | 'onUser' | 'onAi' | 'onChatChange', chatId?: ID | null) => void
  /** Import a portable preset file; regex scripts it carries become scripts
   *  bound to the new preset. `base` fills whatever the file leaves out. */
  importPreset: (json: unknown, name: string, base?: Preset) => Promise<{ preset: Preset; scripts: number }>
  /** Post a generated picture as the chat's last speaker (and keep it in
   *  that character's gallery when the setting says so). */
  postPicture: (chatId: ID, image: GeneratedImage) => Promise<void>
  // entity CRUD
  updateCharacter: (id: ID, patch: Partial<Character>) => void
  newCharacter: () => ID
  duplicateCharacter: (id: ID) => void
  /** withBook: also delete the card's own lorebook when no other card uses it */
  deleteCharacter: (id: ID, opts?: { withBook?: boolean }) => void
  /** Make a card playable as the user: name, description and avatar move to a
   *  persona ({{char}}/{{user}} trade places). Null when a same-name persona
   *  exists and the caller has not confirmed with { overwrite: true }. */
  convertCharacterToPersona: (id: ID, opts?: { overwrite?: boolean }) => ID | null
  updatePersona: (id: ID, patch: Partial<Persona>) => void
  usePersona: (id: ID) => void
  addPersona: (init?: Partial<Persona> & { id?: ID }) => ID
  duplicatePersona: (id: ID) => ID
  deletePersona: (id: ID) => void
  updatePreset: (id: ID, patch: Partial<Preset>) => void
  duplicatePreset: (id: ID) => ID
  deletePreset: (id: ID) => void
  updateLorebook: (id: ID, patch: Partial<Lorebook>) => void
  /** A new empty book; the name gets " 2", " 3"… when a book already has it */
  addLorebook: (name?: string) => ID
  duplicateLorebook: (id: ID) => ID
  deleteLorebook: (id: ID) => void
  updateRegex: (id: ID, patch: Partial<RegexScript>) => void
  addRegex: (scope: RegexScript['scope']) => ID
  deleteRegex: (id: ID) => void
  updateQRSet: (id: ID, patch: Partial<QuickReplySet>) => void
  addQRSet: () => ID
  deleteQRSet: (id: ID) => void
  updateConnection: (id: ID, patch: Partial<Connection>) => void
  addConnection: () => ID
  deleteConnection: (id: ID) => void
  updateExtension: (id: ID, patch: Partial<Extension>) => void
  uploadDataBankFile: (name: string, content: string, scope?: DataBankFile['scope'], scopeTargetId?: ID | null) => Promise<void>
  updateDataBankFile: (id: ID, patch: Partial<DataBankFile>) => void
  deleteDataBankFile: (id: ID) => void
  addConnectionProfile: (p: Omit<ConnectionProfile, 'id'>) => ID
  updateConnectionProfile: (id: ID, patch: Partial<Omit<ConnectionProfile, 'id'>>) => void
  deleteConnectionProfile: (id: ID) => void
  updateBackground: (id: ID, patch: Partial<BackgroundItem>) => void
  addBackground: (name: string, url: string) => ID
  deleteBackground: (id: ID) => void
  addFolder: (name: string, scope: Folder['scope']) => ID
  deleteFolder: (id: ID) => void
  updateTag: (id: ID, patch: Partial<Tag>) => void
  addTag: (name: string) => void
  deleteTag: (id: ID) => void
  resetAll: () => void
}

// ── local-only seed (themes run client-side for real) ──
function localSeed() {
  return {
    qrSets: [] as QuickReplySet[],
    connections: [] as Connection[],
    extensions: [] as Extension[],
    themes: seedThemes,
    backgrounds: [],
    tags: [],
    folders: [],
    dataBank: [] as DataBankFile[],
    connectionProfiles: [] as ConnectionProfile[],
    settings: defaultSettings(),
  }
}

let stopStreams: (() => void) | null = null
/** Text deltas coalesce into ONE store write per animation frame: a fast
 *  model emits deltas far faster than the screen refreshes, and every write
 *  re-renders (and re-parses the markdown of) the growing reply. Set while a
 *  stream is connected; Stop calls it so the frozen bytes include the tail
 *  that had not been flushed yet. */
let flushStreamDeltas: (() => void) | null = null
let uiSyncTimer: ReturnType<typeof setTimeout> | undefined
/** The shell's language for an app whose user never picked one: undefined = not asked yet (0.9.5). */
let shellLang: 'en' | 'uk' | null | undefined
/** single-flight + trailing queue for hydrate: concurrent hydrates interleave
 *  their set() calls, so a look_changed burst (our own writes echo back from
 *  the engine) can briefly revert optimistic local mutations */
let hydrateRunning = false
let hydrateQueued = false
/** Mutation epoch: bumped by EVERY optimistic write to server-backed data.
 *  A read that STARTED before a mutation (hydrate, refreshChat, refreshLists)
 *  snapshots pre-mutation state; if it APPLIES after the optimistic write it
 *  briefly reverts it — the swipe "2/4 → 3/4 → 2/4" bounce, and the same
 *  glitch for any optimistic edit. Readers capture the epoch at start and
 *  drop their apply when it moved mid-flight; the mutation's own write echoes
 *  back as look_changed and re-hydrates the committed truth. */
let mutateSeq = 0
const bumpMutate = () => { mutateSeq++ }
/** look_changed coalescing — bursts collapse into one trailing hydrate */
let lookHydrateTimer: ReturnType<typeof setTimeout> | undefined
/** a dist build landed while the tab was hidden — reload once it's visible */
let distReloadPending = false
let distReloadArmed = false
/** in-flight generation controllers by chat — Stop aborts the matching one */
const activeGens = new Map<ID, AbortController>()

/** The relationship dashboard notes when its prompt insert did not fit the
 *  user's token limit; say so once, so the user knows to raise it. */
const shownInsertNotice = new Map<ID, number>()
async function noticeInsertTrim(chatId: ID, lang: Lang) {
  try {
    const { notice } = await j<{ notice: { at: number; trimmed: string[]; wanted: number; budget: number } | null }>(
      `/dashboard/notice?chatId=${encodeURIComponent(chatId)}`,
    )
    if (!notice || Date.now() - notice.at > 5 * 60_000 || notice.at <= (shownInsertNotice.get(chatId) ?? 0)) return
    shownInsertNotice.set(chatId, notice.at)
    const what = notice.trimmed.map((k) => t(k === 'others' ? 'dashboard.trim.others' : 'dashboard.trim.notebooks', lang)).join(', ')
    toast.warning(t('dashboard.trimmed', lang, { need: notice.wanted, limit: notice.budget, what }), { duration: 12_000 })
  } catch {
    // no dashboard plugin in this app: nothing to say
  }
}
/** A proposal for souls is waiting for a card of this chat: say so once per proposal,
 *  with a button that opens the card's Soul tab. "Seen" is the proposal's timestamp, kept
 *  per card in localStorage (and in memory when storage is unavailable). */
const soulSeenMem = new Map<ID, number>()
export async function checkSoulProposals(chatId: ID) {
  const st = useApp.getState()
  const chat = st.chats.find((c) => c.id === chatId)
  const holder = chat ? st.characters.find((c) => c.id === chat.characterId) : undefined
  const cardIds = !holder ? [] : holder.isGroup ? (holder.members ?? []) : [holder.id]
  const lang = resolveLanguage(st.settings.language)
  for (const cardId of cardIds) {
    try {
      const { draft } = await j<{ draft: { at?: number; characters?: Record<string, unknown>; dismissedAt?: number; error?: string } | null }>(
        `/dashboard/soul-draft?characterId=${encodeURIComponent(cardId)}`,
      )
      const n = draft?.characters ? Object.keys(draft.characters).length : 0
      const failed = !!draft && !draft.dismissedAt && typeof draft.error === 'string' && draft.error !== ''
      if (!draft || draft.dismissedAt || (!failed && n === 0)) continue
      const at = Number(draft.at) || 0
      const key = `rp.soulDraftSeen.${cardId}`
      let seen = soulSeenMem.get(cardId) ?? 0
      try { seen = Math.max(seen, Number(localStorage.getItem(key)) || 0) } catch { /* storage unavailable */ }
      if (at <= seen) continue
      soulSeenMem.set(cardId, at)
      try { localStorage.setItem(key, String(at)) } catch { /* storage unavailable */ }
      const card = st.characters.find((c) => c.id === cardId)?.name ?? ''
      if (failed) {
        const raw = String(draft.error).replace(/\s+/g, ' ').slice(0, 120)
        // the model's answer was not readable JSON: say that in plain words, not the parser's
        const reason = /not JSON/i.test(raw) ? t('soul.reasonUnreadable', lang) : raw
        toast.warning(t('soul.noticeFailed', lang, { card, reason }), {
          duration: 15_000,
          action: { label: t('soul.open', lang), onClick: () => useApp.getState().openCharacterOnTab(cardId, 'soul') },
        })
        continue
      }
      toast(t('soul.notice', lang, { n, card }), {
        duration: 15_000,
        action: { label: t('soul.review', lang), onClick: () => useApp.getState().openCharacterOnTab(cardId, 'soul') },
      })
    } catch {
      // no dashboard plugin in this app: nothing to say
    }
  }
}
/** chats created this client session — off-limits to the boot sweep (the
 *  user may still come back to them before the page closes) */
const sessionNewChats = new Set<ID>()
/** chats opened this client session — off-limits to the boot sweep, even if
 *  they look abandoned (opening one while a hydrate is mid-flight must never
 *  end with the chat deleted under the user's feet) */
const sessionOpenedChats = new Set<ID>()
/** the abandoned-chat sweep runs ONCE per page load; re-hydrates (look_changed
 *  storms, tab focus) only multiply the windows where a chat the user just
 *  opened could be judged abandoned from a stale snapshot */
let sweepDone = false
/** The unpinned-chat persona migration, once per page load. On every hydrate
 *  it re-applied a persona switch to every chat that had not pinned one, so
 *  the switch leaked out of the chat it was made in. */
let personaPinDone = false
/** reentrancy guard for quick-reply automation hooks */
let autoExecDepth = 0
/** last-issued swipe request per message id (see setSwipe) */
const swipeReqs = new Map<ID, number>()
/** last auto version-snapshot per character (throttle so typing doesn't
 *  snapshot every keystroke — one per 10 minutes at most) */
const lastVersionSnap = new Map<ID, number>()
const SNAP_FIELDS = ['description', 'personality', 'scenario', 'firstMessage', 'exampleDialogue', 'systemPromptOverride', 'postHistoryInstructions'] as const

/** Persist runs after every set(), stream ticks included: a value equal to the stored one is not
 *  written again. In the shell each write is a message to the host and a URL rewrite, and stream
 *  ticks used up the rewrites a reload needs (GitHub #25). A value the shell refused is written
 *  again: it may fit now. */
const quietStorage = {
  getItem: (k: string) => localStorage.getItem(k),
  setItem: (k: string, v: string) => {
    if (localStorage.getItem(k) === v && !unsavedKeys().includes(k)) return
    localStorage.setItem(k, v)
  },
  removeItem: (k: string) => localStorage.removeItem(k),
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      boot: 'loading',
      bootError: null,
      hydrated: false,
      characters: [],
      chats: [],
      personas: [],
      presets: [],
      lorebooks: [],
      regexScripts: [],
      models: [],
      favorites: [],
      modelParams: {},
      engineConnections: [],
      model: null,
      ...localSeed(),
      view: 'home',
      drawer: null,
      activeChatId: null,
      activeCharacterId: null,
      characterEditorTab: null,
      dashOpen: 0,
      openDashboard: () => set((s) => ({ dashOpen: s.dashOpen + 1 })),
      focusPresetId: null,
      litopysSettings: false,
      focusPersonaId: null,
      focusLorebookId: null,
      branchTreeFor: null,
      openBranchTree: (chatId) => {
        get().openChat(chatId)
        set({ branchTreeFor: chatId })
      },
      selectedSettingsSection: 'appearance',
      streaming: null,
      swipeFxSkip: null,
      consumeSwipeFxSkip: (key) => set((s) => (s.swipeFxSkip === key ? { swipeFxSkip: null } : {})),
      thinkOpen: {},
      setThinkOpen: (messageId, index, open) => set((s) => ({
        thinkOpen: { ...s.thinkOpen, [messageId]: { ...s.thinkOpen[messageId], [index]: open } },
      })),
      inputHistory: [],
      composerDrafts: {},
      deleteMode: false,
      newChatStep: null,
      closeNewChatStep: () => set({ newChatStep: null }),
      helpOpen: false,
      railCollapsed: false,
      setRailCollapsed: (v) => set({ railCollapsed: v }),
      drawerFull: false,
      setDrawerFull: (v) => set({ drawerFull: v }),

      // ─────────────────────────────────────────────────────────── lifecycle ──
      hydrate: async () => {
        if (hydrateRunning) { hydrateQueued = true; return }
        hydrateRunning = true
        const seqAtStart = mutateSeq
        try {
        // First boot shows the loading screen; RE-hydrates (look_changed
        // live sync, tab focus) swap data in place — flashing the loader
        // every second would make the app look like it reloads endlessly.
        if (get().boot !== 'ready') set({ boot: 'loading', bootError: null })
        try {
          // ONE plugin dispatch for the whole app state: every route call
          // rebuilds the plugin sandbox, so the old shape (ten collection
          // calls, then one transcript call per chat) paid that cost ~25
          // times and took seconds. The engine's own model/connection lists
          // are separate routes and stay parallel to it.
          const [boot, modelList, engineConnections] = await Promise.all([
            // the chat about to be shown rides along, so the first paint needs
            // no follow-up fetch
            fetchBootstrap(get().activeChatId),
            fetchModels(),
            fetchEngineConnections(),
          ])
          const settings = boot.settings
          const models = modelList.models
          const library = boot.library
          const databankRes = boot.databank
          const chatMetas = { chats: boot.chats }
          const solo = boot.characters.map((c) => cardToCharacter(c, c.id ?? ''))
          const groups = boot.groups
            .map((g) => groupToCharacter(g, solo))
            .filter((c) => c.id)
          const characters = [...solo, ...groups]
          const personas = boot.personas.map((p) => enginePersonaToUI(p, settings.personaId))
          const presets = boot.presets
            .map((p) => enginePresetToUI(p as never, String(p.id ?? '')))
            .sort((a, b) => (a.id === 'default' ? -1 : b.id === 'default' ? 1 : a.name.localeCompare(b.name)))
          // First boot on an empty workspace: seed the default preset — a
          // fully editable working copy whose main prompt and utility prompts
          // carry their shipped text (there is no hidden engine-side default
          // behind an empty box anymore).
          if (!presets.length) {
            const seeded = buildDefaultPreset()
            presets.push(seeded)
            // hydrate-time repairs stay quiet: the user did not ask for them,
            // and the next boot runs the same repair again
            void j(`/presets/default`, { method: 'PUT', body: JSON.stringify({ ...presetToEngine(seeded), id: 'default' }) }).catch(() => {})
          } else {
            // One-time legacy migration: presets written before the studio bag
            // carried no sections bag and often relied on engine fallbacks.
            // Normalize to the full shape; the DEFAULT preset also picks up
            // the shipped main/utility prompt texts when its copies are empty.
            boot.presets.forEach((raw, i) => {
              const p = presets[i]
              if (!p) return
              const legacy = !(raw as { studio?: { sections?: unknown[] } }).studio?.sections
              let changed = legacy
              if (p.id === 'default') {
                const main = p.sections.find((s) => s.marker === 'main')
                if (main && !main.content.trim()) { main.content = DEFAULT_MAIN_PROMPT; changed = true }
                const utils = p.utilityPrompts
                if (!utils.impersonation.trim() && !utils.continueNudge.trim() && !utils.newChat.trim() && !utils.groupNudge.trim()) {
                  p.utilityPrompts = { ...DEFAULT_UTILITY_PROMPTS }
                  changed = true
                }
              }
              if (changed) void j(`/presets/${encodeURIComponent(p.id)}`, { method: 'PUT', body: JSON.stringify({ ...presetToEngine(p), id: p.id }) }).catch(() => {})
            })
          }
          const lorebooks = boot.lorebooks.map((b) => engineLorebookToUI(b as never, String(b.id ?? '')))
          const regexScripts = boot.regex.map((r) => engineRegexToUI(r as never, String(r.id ?? '')))
          // Transcripts are NOT in the boot payload: chats start unloaded and
          // fill in on open (ensureChatMessages). Lists read preview/
          // messageCount off the meta, so nothing here needs the messages —
          // except the chat the user is about to look at, which rode along.
          const inlineId = boot.activeChat?.meta?.id ?? null
          const chatsFull = boot.chats.map((m) =>
            inlineId && m.id === inlineId
              ? engineChatToUI(boot.activeChat!.meta, boot.activeChat!.messages ?? [])
              : engineChatToUI(m, []),
          )
          // abandoned empty chats (created, never touched — at most a
          // greeting, no user turn, never marked tainted server-side) are
          // deleted ONCE per page load instead of piling up. Re-hydrates skip
          // the sweep entirely: every extra pass is another window where a
          // chat the user just opened gets judged abandoned and deleted under
          // them (the "opened a chat and got kicked out" race). Created- or
          // opened-this-session chats are always exempt, and the active-chat
          // check reads the store LIVE at decision time — the snapshot taken
          // when the hydrate started is stale by the time fetches land.
          const kept = sweepDone ? chatsFull : chatsFull.filter((c, i) => {
            const meta = chatMetas.chats[i]
            // An unknown transcript (failed fetch) or a list that saw lines
            // the snapshot lost (torn read mid-save) means "don't know",
            // never "empty" — both are off-limits to the sweep. A chat the
            // list saw with 2+ lines can't be never-touched: creation seeds
            // at most one message.
            // The sweep can no longer read a transcript it never loaded, so it
            // judges from the list meta: abandoned means the engine counted at
            // most one line AND none of them was a user turn. A meta carrying
            // no count at all is "don't know" — never "empty".
            if (typeof meta?.messageCount !== 'number') return true
            if (meta.messageCount > 1 || meta.hasUser === true) return true
            if (c.id !== get().activeChatId && !sessionNewChats.has(c.id) && !sessionOpenedChats.has(c.id) && meta.tainted !== true) {
              void j(`/chats/${encodeURIComponent(c.id)}`, { method: 'DELETE' }).catch(() => undefined)
              return false
            }
            return true
          })
          sweepDone = true
          // Chats on a STOCK preset used to be dragged onto the user's
          // default copy here, and written back — on every hydrate, and a
          // hydrate runs on every look_changed. Picking the stock preset for
          // a chat undid itself a moment later, on disk. The migration this
          // was for now runs at the moment of the switch (updatePreset),
          // where a migration can still be told apart from a choice.
          const withBranches = attachBranches(kept)
          // A dead preset binding shows the preset the engine will really
          // assemble with (it falls back on its own), but the repair is NOT
          // written back: one preset file that momentarily fails to load
          // drops out of the boot payload, and writing would re-point every
          // chat that rode it at the default, for good.
          {
            const presetIds = new Set(presets.map((p) => p.id))
            const defId = presets.find((p) => p.isDefault && !p.readOnly)?.id ?? presets[0]?.id
            if (defId) {
              for (const c of withBranches) {
                if (c.presetId && !presetIds.has(c.presetId)) c.presetId = defId
              }
            }
          }
          // chats that never stored a persona rode the default, so picking a
          // persona anywhere swapped them all — pin each to the persona it
          // shows right now; from here only an explicit switch changes it.
          // Once per load: a switch made while the app is open pins the
          // chats it leaves behind itself (see updatePersona), and a heal
          // running again afterwards would drag them onto the new default.
          if (!personaPinDone) {
            personaPinDone = true
            const defId = personas.find((p) => p.isDefault)?.id
            if (defId) {
              for (const c of withBranches) {
                if (!c.personaId) {
                  c.personaId = defId
                  void j(`/chats/${encodeURIComponent(c.id)}`, { method: 'PATCH', body: JSON.stringify({ personaId: defId }) })
                    .catch(() => undefined)
                }
              }
            }
          }
          // how each group chat plays: the group's defaults with the chat's
          // own turns on top (a group chat's characterId IS the group id)
          const groupCfgById = new Map(boot.groups.map((g) => [String(g.id ?? ''), g]))
          for (const c of withBranches) {
            const g = groupCfgById.get(c.characterId)
            if (!g) continue
            c.groupSettings = chatGroupSettings(g, c.turns)
          }
          // a local optimistic mutation landed while we were fetching — this
          // snapshot is stale; applying it would revert the mutation until
          // its own echo re-hydrates. Drop it; the echo covers us.
          if (mutateSeq !== seqAtStart) return
          // a chat with a generation in flight is AHEAD of the server (the
          // engine writes no transcript until the model answers — only the
          // in-use taint mark, whose file write is what triggered this very
          // hydrate). Swapping in the server snapshot would wipe the staged
          // turn and the live bubble mid-stream; keep the local copy and let
          // the commit's own refreshChat reconcile when the run lands.
          const liveChatId = get().streaming?.chatId ?? null
          const liveLocal = liveChatId ? get().chats.find((c) => c.id === liveChatId) ?? null : null
          const chatsOut = liveLocal
            ? withBranches.map((c) => (c.id === liveChatId ? liveLocal : c))
            : withBranches
          // lastChatAt for character cards
          const byId = new Map(characters.map((c) => [c.id, c]))
          for (const c of withBranches) {
            const owner = byId.get(c.characterId)
            if (owner && c.updatedAt > (owner.lastChatAt ?? 0)) owner.lastChatAt = c.updatedAt
          }
          set({
            characters, chats: chatsOut, personas, presets, lorebooks, regexScripts,
            models, favorites: modelList.favorites, engineConnections, model: settings.model, dataBank: databankRes.files ?? [],
            boot: 'ready', hydrated: true, bootError: null,
            // engine-side UI settings (agent-editable, data/settings.json `ui`)
          })
          // a reload mid-reply lands back in the chat: show the reply the engine is still writing (#13)
          const openId = get().view === 'chat' ? get().activeChatId : null
          if (openId) void adoptRunningGeneration(set, get, openId)
          // a profile Molfar (or a hand edit) wrote without `compiled`: write the card's text from it
          // now, so the prompt carries the new fields (DATA-FORMATS, "The profile"); quiet like the
          // other hydrate-time repairs, and the old text lands in the card's versions
          for (const c of solo) {
            const patch = compileIfWrittenElsewhere(c)
            if (patch) get().updateCharacter(c.id, patch)
          }
          if (settings.ui) {
            const ui = settings.ui as Record<string, unknown>
            // Object-valued bags (tts, translation, …) merge ONE level deep:
            // a partial bag on disk (hand-edited or from an older build) must
            // never nuke the seeded defaults — a missing speed once crashed
            // the whole Tools page on render.
            set((s) => {
              const merged: Record<string, unknown> = { ...s.settings }
              for (const [k, v] of Object.entries(ui)) {
                const cur = merged[k]
                if (v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object' && !Array.isArray(cur)) {
                  merged[k] = { ...(cur as object), ...(v as object) }
                } else {
                  merged[k] = v
                }
              }
              return { settings: merged as unknown as typeof s.settings }
            })
          }
          // 0.9.5: until the user picks a language here, the app follows the shell's (asked once, re-applied on
          // every hydrate; the value may reach settings.json with other settings, languageChosen alone decides)
          if (!get().settings.languageChosen) {
            const follow = (lang: 'en' | 'uk' | null) => {
              if (lang && !get().settings.languageChosen && get().settings.language !== lang) set((s) => ({ settings: { ...s.settings, language: lang } }))
            }
            if (shellLang !== undefined) follow(shellLang)
            else void shellLocale().then((loc) => { shellLang = loc === 'uk' ? 'uk' : loc ? 'en' : null; follow(shellLang) })
          }
          // chat look: the old prose defaults move to the stage look once. The
          // engine copy's own version decides (its `ui` was merged over the local
          // values above, so the local version alone could claim a move it never had)
          const lookFrom = settings.ui ? ((settings.ui as { lookVersion?: number }).lookVersion ?? 1) : (get().settings.lookVersion ?? 1)
          const look = migrateLook(get().settings, lookFrom)
          if (look.changed) set({ settings: look.settings })
          // the normalized shape must reach the ENGINE too — assemble() reads
          // settings.json directly (write-back only when it actually changed)
          if (look.changed) {
            void j('/settings', { method: 'PUT', body: JSON.stringify({ ui: get().settings }) }).catch(() => undefined)
          }
          // library.json — the local collections, agent-editable in ONE file
          const lib = library as Partial<Pick<AppState, 'qrSets' | 'themes' | 'backgrounds' | 'tags' | 'folders' | 'connectionProfiles'>>
          if (Object.keys(lib).length) {
            // built-in themes shipped after this library was written join it
            // (the write-through persists them); the active theme and every
            // existing entry stay untouched
            set((s) => ({ ...s, ...lib, ...(Array.isArray(lib.themes) ? { themes: withBuiltinThemes(lib.themes) } : {}) }))
            libraryOnDisk = JSON.stringify(lib) // echo guard: this IS the disk content
          } else {
            // first boot: materialize data/library.json so agents find every
            // collection on disk from the start
            const cur = get()
            void j('/library', { method: 'PUT', body: JSON.stringify({
              qrSets: cur.qrSets, themes: cur.themes, backgrounds: cur.backgrounds,
              tags: cur.tags, folders: cur.folders, connectionProfiles: cur.connectionProfiles,
            }) }).catch(() => undefined)
            libraryOnDisk = libraryJson()
          }
          // live generation deltas over the kernel WS bus
          stopStreams?.()
          let deltaBuf = ''
          let thinkBuf = ''
          let deltaChatId: ID | null = null
          let deltaFrame = 0
          const armFrame = () => {
            if (!deltaFrame) deltaFrame = requestAnimationFrame(() => { deltaFrame = 0; flushStreamDeltas?.() })
          }
          const flushThinking = (chatId: ID, delta: string) => {
            // reasoning-model thinking arrives live (no typewriter pacing —
            // watching it grow IS the point); the first delta starts the clock,
            // so the wait before the model answers never reads as thinking.
            // Marks keep it IN SEQUENCE: thinking anchors after the last tool
            // call (or at the top), so round-two thinking renders below the
            // tool row it followed, never hoisted above everything.
            const st = get().streaming
            if (!st || st.chatId !== chatId) return
            const marks = (st.marks ?? []).slice()
            const lastToolAt = [...marks].reverse().find((m) => m.kind === 'tool')?.at ?? 0
            const last = marks[marks.length - 1]
            if (last && last.kind === 'think' && last.at === lastToolAt) marks[marks.length - 1] = { ...last, text: last.text + delta }
            else marks.push({ kind: 'think', at: lastToolAt, text: delta, t0: Date.now() })
            set({ streaming: { ...st, thinking: (st.thinking ?? '') + delta, marks, ...(st.thinking == null ? { thinkingT0: Date.now() } : {}) } })
          }
          flushStreamDeltas = () => {
            if (deltaFrame) { cancelAnimationFrame(deltaFrame); deltaFrame = 0 }
            const chatId = deltaChatId
            const think = thinkBuf
            const delta = deltaBuf
            deltaBuf = ''
            thinkBuf = ''
            deltaChatId = null
            if (!chatId) return
            // thinking lands first: within one frame it always preceded the
            // text that closed it
            if (think) flushThinking(chatId, think)
            if (!delta) return
            const st = get().streaming
            if (!st || st.chatId !== chatId) return
            // the chat's preset can turn live rendering OFF (Samplers tab):
            // deltas still accumulate but nothing is revealed until commit
            const chat = get().chats.find((c) => c.id === chatId)
            const preset = chat ? get().presets.find((p) => p.id === chat.presetId) : null
            if (preset && preset.samplers?.streaming === false) return
            // the user's own choice: replies appear only when finished
            if (get().settings.replyDisplay === 'whole') return
            const full = st.full + delta
            // first text token ends the thinking phase — freeze its span so the
            // live block can say "Thought for Xs" WHILE the reply streams
            const thinkingMs = st.thinking && st.thinkingMs == null
              ? Date.now() - (st.thinkingT0 ?? Date.now())
              : st.thinkingMs
            // typewriter reveal chases the arriving text; text after a think
            // mark closes it (its duration freezes, the block relabels)
            const marks = st.marks?.slice()
            const lastMark = marks?.[marks.length - 1]
            if (lastMark && lastMark.kind === 'think' && lastMark.ms == null) {
              marks![marks!.length - 1] = { ...lastMark, ms: Date.now() - lastMark.t0 }
            }
            set({ streaming: { ...st, full, shown: Math.min(full.length, st.shown + Math.ceil(delta.length * 1.5)), ...(marks ? { marks } : {}), ...(thinkingMs != null ? { thinkingMs } : {}) } })
          }
          stopStreams = connectStreams((chatId, _name, delta) => {
            const st = get().streaming
            if (!st || st.chatId !== chatId) return
            // a delta for a different chat than the buffer holds cannot be
            // merged into it: land what is buffered first
            if (deltaChatId && deltaChatId !== chatId) flushStreamDeltas?.()
            deltaChatId = chatId
            deltaBuf += delta
            armFrame()
          }, (paths) => {
            // look_changed with a dist/ path = a fresh BUILD landed (watcher
            // rebuilt the app) — the running bundle is stale, so reload the
            // page instead of re-hydrating data. Anything else is a data-tree
            // change (agent edit, git ops, another tab — and echoes of our own
            // writes): coalesce bursts into one trailing hydrate; a mid-burst
            // re-hydrate would read half-written state and revert optimistic
            // local updates.
            if (paths?.some((p) => p.startsWith('dist'))) {
              // a fresh build landed: the running bundle is stale. Hidden tab
              // defers the reload until it's next seen (same contract as the
              // engine build stamp), and the pending flag stays set — clearing
              // it on a timer would strand the tab on old code forever.
              distReloadPending = true
              const reload = () => reloadWithReason('Reloaded: a new build of the app landed')
              if (document.visibilityState === 'visible') reload()
              else if (!distReloadArmed) {
                distReloadArmed = true
                document.addEventListener('visibilitychange', () => {
                  distReloadArmed = false
                  if (document.visibilityState === 'visible' && distReloadPending) reload()
                }, { once: true })
              }
              return
            }
            // the dashboard's own state and debug files change on every update:
            // no reason to re-hydrate the whole data tree for them
            const QUIET = ['data/dashboard', 'data/_debug']
            const quiet = (p: string) => { const n = p.replace(/\\/g, '/'); return QUIET.some((d) => n === d || n.startsWith(d + '/')) }
            if (paths && paths.length > 0 && paths.every(quiet)) return
            clearTimeout(lookHydrateTimer)
            lookHydrateTimer = setTimeout(() => void get().hydrate(), 250)
          }, (chatId, delta) => {
            const st = get().streaming
            if (!st || st.chatId !== chatId) return
            if (deltaChatId && deltaChatId !== chatId) flushStreamDeltas?.()
            deltaChatId = chatId
            thinkBuf += delta
            armFrame()
          }, (chatId, ev) => {
            // tool-call progress: the mark's `at` anchors it in the text
            // stream (where the model paused); end fills the row's result.
            // The buffered frame lands first — a tool row must not jump ahead
            // of the text and thinking that came before it.
            flushStreamDeltas?.()
            const st = get().streaming
            if (!st || st.chatId !== chatId) return
            const marks = (st.marks ?? []).slice()
            if (ev.phase === 'start') {
              // a tool call after a think mark closes it too
              const lastMark = marks[marks.length - 1]
              if (lastMark && lastMark.kind === 'think' && lastMark.ms == null) {
                marks[marks.length - 1] = { ...lastMark, ms: Date.now() - lastMark.t0 }
              }
              marks.push({ kind: 'tool', at: st.full.length, name: ev.name, args: ev.args })
            } else {
              for (let i = marks.length - 1; i >= 0; i--) {
                const m = marks[i]!
                if (m.kind === 'tool' && !m.done) {
                  marks[i] = { ...m, done: true, resultText: ev.result?.text ?? '', isError: ev.result?.isError }
                  break
                }
              }
            }
            set({ streaming: { ...st, marks } })
          }, () => {
            // a connection was added/changed engine-side (usually from another
            // tab): the model catalog and connection list are stale — the
            // engine emits AFTER discovery finished, so a plain hydrate lands
            // the fresh list, no view re-entry needed
            void get().hydrate()
          })
          get().runAutoExecutes('onStartup')
          void get().refreshModelParams()
        } catch (e) {
          const msg = e instanceof ApiError && e.status === 401
            ? 'Session expired, log in to Molfar Vertep again.'
            : String((e as Error).message ?? e)
          // a failed REFRESH keeps the data already on screen: only the first
          // boot has nothing to show but the error
          if (get().boot === 'ready') toast.error(`Couldn't refresh: ${msg}`)
          else set({ boot: 'error', bootError: msg })
        }
        } finally {
          hydrateRunning = false
          if (hydrateQueued) { hydrateQueued = false; void get().hydrate() }
        }
      },

      refreshLorebooks: async () => {
        const seqAtStart = mutateSeq
        try {
          const res = await j<{ items: Record<string, unknown>[] }>('/lorebooks')
          if (mutateSeq !== seqAtStart) return
          set({ lorebooks: res.items.map((b) => engineLorebookToUI(b as never, String(b.id ?? ''))) })
        } catch { /* offline — keep the current list */ }
      },

      modelFor: (chatId) => {
        const own = chatId ? get().chats.find((c) => c.id === chatId)?.model : null
        return own || get().model
      },

      setChatModel: async (chatId, ref) => {
        get().updateChat(chatId, { model: ref })
        await get().setModel(ref)
      },

      refreshModelParams: async () => {
        void moveProfilesToFavorites(get, set)
        const params = await fetchModelParams()
        if (!params) return
        set({ modelParams: params })
        const st = get()
        if (st.settings.modelParamsMigrated || !st.model) return
        // once: the default preset's samplers become the current model's Chat block (what the
        // model already has stays); the flag is set even when there was nothing to move
        const preset = st.presets.find((p) => p.isDefault) ?? st.presets[0]
        try {
          const moved = preset ? await moveSamplersToModel(st.model, preset, params) : null
          if (moved) {
            set({ modelParams: moved })
            toast.info(t('model.samplersMoved', resolveLanguage(get().settings.language), { preset: preset!.name }))
          }
          get().updateSettings({ modelParamsMigrated: true })
        } catch {
          // the engine refused (an untrusted install, a bad value): try again on the next start
        }
      },

      setModel: async (model) => {
        bumpMutate()
        set({ model })
        try { await j('/settings', { method: 'PUT', body: JSON.stringify({ model }) }) } catch { /* hydrate resyncs */ }
      },

      setView: (v) => {
        if (DRAWER_VIEWS.has(v) && opensAsDrawer(get().view)) { set({ drawer: v }); return }
        set({ view: v, drawer: null })
      },
      closeDrawer: () => set({ drawer: null }),
      navigate: (v) => {
        if (v !== 'chats') {
          get().setView(v); return
        }
        const { activeChatId, chats } = get()
        const last = activeChatId ? chats.find((c) => c.id === activeChatId) : null
        if (last) set({ view: 'chat', activeChatId: last.id, activeCharacterId: last.characterId, drawer: null })
        else set({ view: 'chats', activeChatId: null, drawer: null })
      },
      dropComposerDraft: (chatId, id) => set((s) => {
        if (s.composerDrafts[chatId]?.id !== id) return {}
        const next = { ...s.composerDrafts }
        delete next[chatId]
        return { composerDrafts: next }
      }),
      openChat: (chatId) => {
        sessionOpenedChats.add(chatId)
        const chat = get().chats.find((c) => c.id === chatId)
        set({ view: 'chat', activeChatId: chatId, activeCharacterId: chat?.characterId ?? null, drawer: null })
        void get().ensureChatMessages(chatId).then(() => {
          void adoptRunningGeneration(set, get, chatId)
          return get().runAutoExecutes('onChatChange', chatId)
        })
      },
      ensureChatMessages: async (chatId) => {
        const chat = get().chats.find((c) => c.id === chatId)
        if (!chat || chat.messages.length > 0) return
        const seqAtStart = mutateSeq
        try {
          const r = await j<{ meta: EngineChatMeta; messages: EngineMessage[] }>(`/chats/${encodeURIComponent(chatId)}`)
          if (mutateSeq !== seqAtStart) return
          set((s) => ({ chats: s.chats.map((c) => (c.id === chatId ? uiChat(get, r.meta, r.messages ?? []) : c)) }))
        } catch { /* the list payload already gave us what it could */ }
      },
      closeChat: () => {
        // drawer stays as-is: closing the chat under an open section drawer
        // (this fires when the active chat vanishes mid-view, not just from
        // the back button) must not slam the drawer shut in the same frame
        // it opened — an exit before the enter transition paints wedges the
        // sheet portal over the whole page
        set({ view: 'chats', activeChatId: null })
      },
      openCharacter: (charId) => set({ activeCharacterId: charId }),
      openCharacterOnTab: (charId, tab) => {
        set({ activeCharacterId: charId, characterEditorTab: tab })
        get().setView('characters')
      },
      focusPreset: (presetId) => {
        if (opensAsDrawer(get().view)) set({ focusPresetId: presetId, drawer: 'presets' })
        else set({ view: 'presets', focusPresetId: presetId })
      },
      focusLorebook: (bookId) => {
        if (opensAsDrawer(get().view)) set({ focusLorebookId: bookId, drawer: 'lorebooks' })
        else set({ view: 'lorebooks', focusLorebookId: bookId })
      },
      focusPersona: (personaId) => {
        if (opensAsDrawer(get().view)) set({ focusPersonaId: personaId, drawer: 'personas' })
        else set({ view: 'personas', focusPersonaId: personaId })
      },
      setSettingsSection: (s) => {
        if (opensAsDrawer(get().view)) set({ selectedSettingsSection: s, drawer: 'settings' })
        else set({ selectedSettingsSection: s, view: 'settings' })
      },
      updateSettings: (patch) => {
        bumpMutate()
        set((s) => ({ settings: { ...s.settings, ...patch } }))
        // write-through: the full settings object rides in the app's
        // data/settings.json (`ui` key) so agents can read AND edit it on
        // disk — open clients pick agent edits up via look_changed → hydrate
        const ui = get().settings
        clearTimeout(uiSyncTimer)
        uiSyncTimer = setTimeout(() => {
          writeThrough('settings', j('/settings', { method: 'PUT', body: JSON.stringify({ ui }) }))
        }, 500)
      },

      // ─────────────────────────────────────────── generation (real, streamed) ──
      sendMessage: async (chatId, content, opts) => {
        const { chats, presets } = get()
        const chat = chats.find((c) => c.id === chatId)
        if (!chat || get().streaming?.chatId === chatId) return 'not-sent'
        const activePreset =
          presets.find((p) => p.id === chat.presetId) ?? presets.find((p) => p.isDefault) ?? presets[0]
        // `send_if_empty`: an empty box is replaced by this
        // text; when the replacement is also blank, NO user turn is added and
        // the model just continues (engine: allowEmpty send).
        const effective = content.trim() || (opts?.noEmptySend ? '' : activePreset?.utilityPrompts.emptySend.trim() || '')
        get().runAutoExecutes('onUser', chatId)
        // auto-translate inputs: the outgoing turn is translated into the
        // model's language BEFORE it is sent — the model reads the
        // translation, and the typed original is attached as the message's
        // displayed translation (under what the model actually received)
        const outMode = get().settings.translation.autoMode
        let sendText = effective
        let typedOriginal: string | null = null
        if ((outMode === 'inputs' || outMode === 'both') && effective.trim()) {
          const tr = get().settings.translation
          try {
            const r = await j<{ text: string }>('/translate', {
              method: 'POST',
              body: JSON.stringify({ text: effective, target: tr.internalLanguage, provider: tr.provider, deeplKey: tr.deeplKey }),
            })
            if (r.text.trim() && r.text.trim() !== effective.trim()) {
              typedOriginal = effective
              sendText = r.text.trim()
            }
          } catch { /* provider failed — send exactly what was typed */ }
        }
        const before = new Set(chat.messages.map((m) => m.id))
        stoppedRuns.delete(chatId)
        const run = runGeneration(set, get, chatId, 'send', {
          ...(sendText ? { text: sendText } : { text: '', allowEmpty: true }),
          ...(opts?.attachments?.length ? { attachments: opts.attachments } : {}),
        }, { userText: sendText, attachments: opts?.attachments })
        if (typedOriginal) {
          const attach = () => {
            const cur = get().chats.find((c) => c.id === chatId)
            const lastUser = cur?.messages.slice().reverse().find((m) => m.role === 'user')
            if (lastUser && !lastUser.translation) get().setMessageTranslation(chatId, lastUser.id, typedOriginal)
          }
          attach() // the staged bubble shows it immediately
          void run.then(attach, attach) // and again once the commit replaced the staged row
        }
        const ok = await run.catch(() => false)
        if (ok || !sendText.trim()) return 'sent'
        // stopped by the user: the engine may have stored the turn already; leave the box alone
        if (stoppedRuns.delete(chatId)) return 'stopped'
        // the run failed: the transcript is refreshed by now; the turn either landed or it did not
        const landed = get().chats.find((c) => c.id === chatId)?.messages.some((m) =>
          m.role === 'user' && !before.has(m.id) && !m.id.startsWith('pending-') && m.swipes[m.activeSwipe]?.content === sendText)
        return landed ? 'sent' : 'not-sent'
      },
      stopStreaming: () => {
        flushStreamDeltas?.()
        const st = get().streaming
        if (!st) return
        if (st.adopted) {
          // a run this page did not start (it was reloaded mid-reply): we cannot cancel it the
          // client-authoritative way (the user's message is not stored yet), so stop waiting only
          dropAdopted(set, get, st.chatId, st.messageId)
          toast.info('Stopped waiting. The server is still writing this reply; it shows up when it is saved.')
          return
        }
        activeGens.get(st.chatId)?.abort()
        // cancel is CLIENT-AUTHORITATIVE: freeze NOW on the bytes on screen
        // (the fetch abort clears streaming moments later, so there is
        // nothing to wait for), then tell the engine to discard its own
        // completion and commit these exact bytes through the cancelled
        // route — identical by construction, no race between two versions
        const stagedUser = get().chats.find((c) => c.id === st.chatId)
          ?.messages.find((m) => m.id.startsWith('pending-') && m.role === 'user')
        const frozen = freezeCancelledStream(set, get, st)
        if (get().streaming?.chatId === st.chatId) set({ streaming: null })
        void (async () => {
          try { await j('/__abort', { method: 'POST', body: JSON.stringify({ chatId: st.chatId }) }) } catch { /* already gone */ }
          if (!frozen.keep) return
          try {
            await j(`/chats/${encodeURIComponent(st.chatId)}/cancelled`, {
              method: 'POST',
              body: JSON.stringify({
                text: frozen.text,
                genMs: frozen.genMs,
                ...(get().modelFor(st.chatId) ? { model: get().modelFor(st.chatId) } : {}),
                ...(frozen.parts.length ? { parts: frozen.parts } : {}),
                ...(frozen.isStaged
                  ? {
                      ...(stagedUser?.swipes[0]?.content ? { userText: stagedUser.swipes[0].content } : {}),
                      ...(stagedUser?.attachments?.length ? { attachments: stagedUser.attachments } : {}),
                    }
                  : { targetMessageId: st.messageId, ...(frozen.expectedSwipes != null ? { expectedSwipes: frozen.expectedSwipes } : {}) }),
              }),
            })
          } catch { /* 409: a real commit beat the abort — the reconcile shows it */ }
          // reconcile fast with targeted single-chat refreshes
          for (const delay of [500, 1500]) {
            await new Promise((r) => setTimeout(r, delay))
            if (get().streaming || !get().chats.some((c) => c.id === st.chatId)) return
            await refreshChat(set, get, st.chatId)
          }
        })()
      },
      tickStream: () => {
        const st = get().streaming
        if (!st) return
        if (st.shown >= st.full.length) return
        // a steady typewriter, but never far behind the model: a backlog drains
        // in about a dozen ticks (a fast model or a slow phone's timers)
        const step = Math.max(3, Math.ceil((st.full.length - st.shown) / 12))
        set({ streaming: { ...st, shown: Math.min(st.full.length, st.shown + step) } })
      },
      regenerate: (chatId, messageId, guidance) => {
        const chat = get().chats.find((c) => c.id === chatId)
        if (!chat || get().streaming?.chatId === chatId) return
        const lastChar = [...chat.messages].reverse().find((m) => m.role === 'assistant' && !m.picture)
        if (messageId && messageId !== lastChar?.id) {
          toast.error('Only the latest reply can be regenerated: engine prompts are built from the newest turn')
          return
        }
        if (!lastChar) return
        const hint = guidance?.trim()
        void runGeneration(set, get, chatId, 'swipe', { dir: 1, ...(hint ? { guidance: hint } : {}) }, { regenerateInto: lastChar.id })
      },
      addSwipe: (chatId) => get().regenerate(chatId),
      setSwipe: (chatId, messageId, index) => {
        const chat = get().chats.find((c) => c.id === chatId)
        const msg = chat?.messages.find((m) => m.id === messageId)
        const swipe = msg?.swipes[index]
        if (!chat || !msg || !swipe) return
        bumpMutate()
        // optimistic flip: expand the name macros locally so greetings render
        // correctly at once; the engine POST below is authoritative and
        // reconciles the exact text when it lands (single round trip, no
        // full-chat refetch — that trio of awaits was the swipe lag)
        const persona = get().personas.find((p) => p.id === chat.personaId)
        const char = get().characters.find((c) => c.id === msg.characterId)
        const text = swipe.content
          .replace(/\{\{user\}\}/gi, persona?.name ?? 'User')
          .replace(/\{\{char\}\}/gi, char?.name ?? msg.authorName ?? '')
        set((s) => ({
          chats: s.chats.map((c) => (c.id === chatId
            ? { ...c, messages: c.messages.map((m) => (m.id === messageId
              ? { ...m, activeSwipe: index, swipes: m.swipes.map((sw, i) => (i === index ? { ...sw, content: text } : sw)) }
              : m)) }
            : c)),
        }))
        void (async () => {
          // rapid swipe spam: only the LAST issued request may apply — an
          // older response resolving after a newer one must not win
          const mySeq = (swipeReqs.get(messageId) ?? 0) + 1
          swipeReqs.set(messageId, mySeq)
          try {
            const r = await j<{ message: { text?: string }; swipe: number; count: number }>(
              `/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/swipe`,
              { method: 'POST', body: JSON.stringify({ index }) },
            )
            if (swipeReqs.get(messageId) !== mySeq) return
            set((s) => ({
              chats: s.chats.map((c) => (c.id === chatId
                ? { ...c, messages: c.messages.map((m) => (m.id === messageId
                  ? { ...m, activeSwipe: r.swipe, swipes: m.swipes.map((sw, i) => (i === r.swipe ? { ...sw, content: String(r.message?.text ?? sw.content) } : sw)) }
                  : m)) }
                : c)),
            }))
            // the dashboard follows the swipe now showing as the newest message
            if (get().chats.find((c) => c.id === chatId)?.messages.at(-1)?.id === messageId) {
              void triggerDashUpdate(chatId, 'swipe', () => get().streaming?.chatId === chatId)
            }
          } catch (e) {
            toast.error(String((e as Error).message ?? e))
            void refreshChat(set, get, chatId)
          }
        })()
      },
      deleteSwipe: (chatId, messageId, swipeIndex) => {
        void (async () => {
          try {
            await j(`/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/swipes/${swipeIndex}`, { method: 'DELETE' })
            await refreshChat(set, get, chatId)
          } catch (e) { toast.error(String((e as Error).message ?? e)) }
        })()
      },
      editReasoning: (chatId, messageId, text) => {
        bumpMutate()
        // optimistic, then commit — same shape as editMessage but for the
        // thinking block only (active swipe)
        set((s) => ({ chats: s.chats.map((c) => c.id !== chatId ? c : {
          ...c, messages: c.messages.map((m) => m.id === messageId
            ? { ...m, swipes: m.swipes.map((sw, i) => (i === m.activeSwipe ? { ...sw, reasoning: text } : sw)) }
            : m),
        }) }))
        void j(`/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`, {
          method: 'PATCH', body: JSON.stringify({ reasoning: text }),
        }).catch((e) => { toast.error(String((e as Error).message ?? e)); void refreshChat(set, get, chatId) })
      },
      editThinkPart: (chatId, messageId, partIndex, text) => {
        bumpMutate()
        set((s) => ({ chats: s.chats.map((c) => c.id !== chatId ? c : {
          ...c, messages: c.messages.map((m) => m.id === messageId
            ? { ...m, swipes: m.swipes.map((sw, i) => (i === m.activeSwipe && sw.parts
              ? { ...sw, parts: sw.parts.map((p, pi) => (pi === partIndex && p.type === 'thinking' ? { ...p, text } : p)) }
              : sw)) }
            : m),
        }) }))
        void j(`/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`, {
          method: 'PATCH', body: JSON.stringify({ think: { index: partIndex, text } }),
        }).catch((e) => { toast.error(String((e as Error).message ?? e)); void refreshChat(set, get, chatId) })
      },
      editMessage: (chatId, messageId, content) => {
        bumpMutate()
        // optimistic edit, then commit
        set((s) => ({ chats: s.chats.map((c) => c.id !== chatId ? c : {
          ...c, messages: c.messages.map((m) => m.id === messageId
            ? { ...m, edited: true, swipes: m.swipes.map((sw, i) => (i === m.activeSwipe ? { ...sw, content } : sw)) }
            : m),
        }) }))
        void (async () => {
          try {
            await j(`/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`, {
              method: 'PATCH', body: JSON.stringify({ text: content }),
            })
            // an edit of the newest message changes what the dashboard should read
            if (get().chats.find((c) => c.id === chatId)?.messages.at(-1)?.id === messageId) {
              void triggerDashUpdate(chatId, 'edit', () => get().streaming?.chatId === chatId)
            }
          } catch (e) {
            toast.error(String((e as Error).message ?? e))
            await refreshChat(set, get, chatId)
          }
        })()
      },
      deleteMessage: (chatId, messageId, mode = 'this') => {
        bumpMutate()
        set((s) => ({ chats: s.chats.map((c) => {
          if (c.id !== chatId) return c
          const idx = c.messages.findIndex((m) => m.id === messageId)
          if (idx < 0) return c
          let messages = c.messages
          if (mode === 'this') messages = c.messages.filter((m) => m.id !== messageId)
          else if (mode === 'above') messages = c.messages.slice(idx)
          // below keeps the anchor — only what comes after it dies
          else messages = c.messages.slice(0, idx + 1)
          return { ...c, messages }
        }) }))
        void (async () => {
          try {
            const scope = mode === 'this' ? 'one' : mode
            await j(`/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}?scope=${scope}`, { method: 'DELETE' })
            void refreshLists(set, get)
          } catch (e) { toast.error(String((e as Error).message ?? e)); await refreshChat(set, get, chatId) }
        })()
      },
      deleteMessages: (chatId, messageIds) => {
        const kill = new Set(messageIds)
        if (kill.size === 0) return
        bumpMutate()
        set((s) => ({ chats: s.chats.map((c) => c.id === chatId ? { ...c, messages: c.messages.filter((m) => !kill.has(m.id)) } : c) }))
        void (async () => {
          for (const mid of messageIds) {
            try { await j(`/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(mid)}`, { method: 'DELETE' }) } catch { /* already gone */ }
          }
          void refreshLists(set, get)
        })()
      },
      setDeleteMode: (on) => set({ deleteMode: on }),
      setHelpOpen: (v) => set({ helpOpen: v }),
      toggleHidden: (chatId, messageId) => {
        const chat = get().chats.find((c) => c.id === chatId)
        const msg = chat?.messages.find((m) => m.id === messageId)
        if (!msg) return
        bumpMutate()
        set((s) => ({ chats: s.chats.map((c) => c.id !== chatId ? c : {
          ...c, messages: c.messages.map((m) => (m.id === messageId ? { ...m, hidden: !m.hidden } : m)),
        }) }))
        void j(`/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`, {
          method: 'PATCH', body: JSON.stringify({ hidden: !msg.hidden }),
        }).catch((e) => toast.error(String((e as Error).message ?? e)))
      },
      setMessageTranslation: (chatId, messageId, translation) => {
        bumpMutate()
        set((s) => ({ chats: s.chats.map((c) => c.id !== chatId ? c : {
          ...c, messages: c.messages.map((m) => (m.id === messageId ? { ...m, translation: translation ?? undefined } : m)),
        }) }))
        void j(`/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`, {
          method: 'PATCH', body: JSON.stringify({ translation }),
        }).catch(() => undefined) // translation is cosmetic — no error toast
      },
      toggleBookmark: (chatId, messageId, label) => {
        const chat = get().chats.find((c) => c.id === chatId)
        const msg = chat?.messages.find((m) => m.id === messageId)
        if (!msg) return
        const next = !msg.bookmarked
        bumpMutate()
        set((s) => ({ chats: s.chats.map((c) => c.id !== chatId ? c : {
          ...c, messages: c.messages.map((m) => (m.id === messageId ? { ...m, bookmarked: next, bookmarkLabel: label ?? m.bookmarkLabel } : m)),
        }) }))
        void j(`/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`, {
          method: 'PATCH', body: JSON.stringify({ bookmarked: next, bookmarkLabel: label ?? msg.bookmarkLabel }),
        }).catch((e) => toast.error(String((e as Error).message ?? e)))
      },
      moveMessage: (chatId, messageId, dir) => {
        bumpMutate()
        set((s) => ({ chats: s.chats.map((c) => {
          if (c.id !== chatId) return c
          const idx = c.messages.findIndex((m) => m.id === messageId)
          const to = idx + dir
          if (idx < 0 || to < 0 || to >= c.messages.length) return c
          const messages = [...c.messages]
          const tmp = messages[idx]!
          messages[idx] = messages[to]!
          messages[to] = tmp
          return { ...c, messages }
        }) }))
        void j(`/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/move`, {
          method: 'POST', body: JSON.stringify({ dir }),
        }).catch((e) => { toast.error(String((e as Error).message ?? e)); void refreshChat(set, get, chatId) })
      },
      impersonate: (chatId) => {
        if (get().streaming?.chatId === chatId) return
        // the result belongs to this chat and to the draft as it reads now (GitHub #29): the
        // composer applies it only while that draft is unchanged
        const id = uid('fill')
        const base = readDraft(chatId)
        const marker = `impersonate-${id}`
        const clear = (s: AppState) => (s.streaming?.messageId === marker ? { streaming: null } : {})
        set({ streaming: { chatId, messageId: marker, full: '', shown: 0, startedAt: Date.now() } })
        void (async () => {
          try {
            const r = await j<{ text: string }>(`/chats/${encodeURIComponent(chatId)}/impersonate`, {
              method: 'POST', body: JSON.stringify(get().modelFor(chatId) ? { model: get().modelFor(chatId) } : {}),
            })
            set((s) => ({ composerDrafts: { ...s.composerDrafts, [chatId]: { id, chatId, text: r.text, base, kind: 'impersonate' } }, ...clear(s) }))
          } catch (e) {
            set(clear)
            toast.error(String((e as Error).message ?? e))
          }
        })()
      },
      continueReply: (chatId) => {
        // continue extends the LAST assistant message — stream it in place
        const chat = get().chats.find((c) => c.id === chatId)
        const lastAsst = [...(chat?.messages ?? [])].reverse().find((m) => m.role === 'assistant' && !m.picture)
        void runGeneration(set, get, chatId, 'continue', {}, lastAsst ? { regenerateInto: lastAsst.id } : undefined)
      },
      forkChat: async (chatId, messageId) => {
        const r = await j<{ meta: EngineChatMeta; messages: EngineMessage[] }>(`/chats/${encodeURIComponent(chatId)}/fork`, {
          method: 'POST', body: JSON.stringify({ messageId }),
        })
        bumpMutate()
        const forked = uiChat(get, r.meta, r.messages ?? [])
        set((s) => ({ chats: attachBranches([forked, ...s.chats]) }))
        toast.success('Forked into a new chat')
        return forked.id
      },
      forkAndOpen: async (chatId, messageId) => {
        const id = await get().forkChat(chatId, messageId)
        get().openChat(id)
      },
      updateChat: (chatId, patch) => {
        bumpMutate()
        set((s) => ({ chats: s.chats.map((c) => (c.id === chatId ? { ...c, ...patch } : c)) }))
        const body = chatPatchOf(patch)
        void (async () => {
          try {
            if (Object.keys(body).length) {
              await j(`/chats/${encodeURIComponent(chatId)}`, { method: 'PATCH', body: JSON.stringify(body) })
            }
          } catch (e) { toast.error(String((e as Error).message ?? e)) }
        })()
      },
      setChatPreset: async (chatId, body) => {
        const before = get().chats.find((c) => c.id === chatId)
        if (!before) return
        bumpMutate()
        // show the pick at once; the engine's meta (with the note) replaces it a moment later
        const nextPresetId = body.presetId ?? before.presetId
        const optimistic = (() => {
          if (!nextPresetId) return before.presetVars
          const all = { ...(before.presetVars ?? {}) }
          const cur: Record<string, string | string[]> = body.reset ? {} : { ...(all[nextPresetId] ?? {}) }
          for (const [k, v] of Object.entries(body.vars ?? {})) {
            if (v === null) delete cur[k]
            else cur[k] = v
          }
          if (Object.keys(cur).length) all[nextPresetId] = cur
          else delete all[nextPresetId]
          return all
        })()
        set((s) => ({ chats: s.chats.map((c) => (c.id === chatId ? { ...c, presetId: nextPresetId ?? c.presetId, presetVars: optimistic } : c)) }))
        try {
          const meta = await j<EngineChatMeta>(`/chats/${encodeURIComponent(chatId)}/preset`, { method: 'POST', body: JSON.stringify(body) })
          set((s) => ({
            chats: s.chats.map((c) => (c.id === chatId
              ? { ...c, presetId: meta.presetId ?? c.presetId, presetVars: meta.presetVars, presetNotes: meta.presetNotes?.length ? meta.presetNotes : undefined }
              : c)),
          }))
        } catch (e) {
          set((s) => ({ chats: s.chats.map((c) => (c.id === chatId ? { ...c, presetId: before.presetId, presetVars: before.presetVars } : c)) }))
          toast.error(String((e as Error).message ?? e))
        }
      },
      fetchPresetCosts: (presetId, body) =>
        j<PresetCosts>(`/preset-costs/${encodeURIComponent(presetId)}`, { method: 'POST', body: JSON.stringify(body ?? {}) }),
      fetchPresetMemory: async (characterId) => {
        try { return await j<PresetMemory>(`/preset-memory/${encodeURIComponent(characterId)}`) }
        catch { return { presetId: null, vars: {} } }
      },
      presetDefaults: null,
      loadPresetDefaults: async () => {
        const have = get().presetDefaults
        if (have) return have
        try {
          const all = await j<Record<ID, Record<string, string | string[]>>>('/preset-defaults')
          set({ presetDefaults: all ?? {} })
          return all ?? {}
        } catch { return {} }
      },
      setPresetDefault: async (presetId, vars) => {
        try {
          const all = await j<Record<ID, Record<string, string | string[]>>>(`/preset-defaults/${encodeURIComponent(presetId)}`, { method: 'PUT', body: JSON.stringify({ vars }) })
          set({ presetDefaults: all ?? {} })
        } catch (e) {
          toast.error(String((e as Error).message ?? e))
        }
      },
      newChat: async (charId, greetingIndex = 0, opts) => {
        const { personas, model } = get()
        const char = get().characters.find((c) => c.id === charId)
        // a persona bound to THIS character wins over the default; an
        // auto-locked persona wins even when another persona is also bound
        const bound = personas.filter((p) => p.binding === 'character' && p.boundCharacterIds.includes(charId))
        const persona = bound.find((p) => p.autoLock) ?? bound[0] ?? personas.find((p) => p.isDefault)
        const personaId = persona?.id ?? null
        const r = await j<{ meta: EngineChatMeta; messages: EngineMessage[] }>('/chats', {
          method: 'POST',
          body: JSON.stringify({
            ...(char?.isGroup ? { groupId: charId } : { characterId: charId }),
            ...(personaId ? { personaId } : {}),
            ...(model ? { model } : {}),
            ...(opts?.presetId ? { presetId: opts.presetId, presetVars: opts.presetVars ?? {} } : {}),
            ...(char?.isGroup && opts?.turns ? { turns: opts.turns } : {}),
          }),
        })
        let chat = uiChat(get, r.meta, r.messages ?? [])
        // greeting picker: rotate the seeded greeting swipes to the chosen one
        if (greetingIndex > 0) {
          const mid = chat.messages[0]?.id
          if (mid) {
            try {
              await j(`/chats/${encodeURIComponent(chat.id)}/messages/${encodeURIComponent(mid)}/swipe`, {
                method: 'POST', body: JSON.stringify({ index: greetingIndex }),
              })
              const fresh = await j<{ meta: EngineChatMeta; messages: EngineMessage[] }>(`/chats/${encodeURIComponent(chat.id)}`)
              chat = uiChat(get, fresh.meta, fresh.messages ?? [])
            } catch { /* greeting rotation is best-effort */ }
          }
        }
        bumpMutate()
        set((s) => ({ chats: attachBranches([chat, ...s.chats]) }))
        return chat.id
      },
      startChatAndOpen: async (charId, greetingIndex) => {
        // a short step with the preset and its choices, unless the user turned it off or there is
        // nothing to choose (one preset without variables)
        const { settings, presets } = get()
        if (settings.askPresetOnNewChat !== false && presets.length > 0) {
          const pre = presets.find((p) => p.isDefault) ?? presets[0]
          if (presets.length > 1 || pre.variables.length > 0) {
            set({ newChatStep: { charId, greetingIndex } })
            return
          }
        }
        await get().startChatWith(charId, greetingIndex)
      },
      startChatWith: async (charId, greetingIndex, opts) => {
        try {
          const id = await get().newChat(charId, greetingIndex, opts)
          sessionNewChats.add(id)
          get().openChat(id)
        } catch (e) { toast.error(String((e as Error).message ?? e)) }
      },
      createGroup: async (name, memberIds) => {
        const gid = uid('grp')
        await j(`/groups/${encodeURIComponent(gid)}`, {
          method: 'PUT',
          body: JSON.stringify({ id: gid, name, memberIds, mode: 'natural', mutedIds: [], generationMode: 'narrator' }),
        })
        const members = get().characters.filter((c) => memberIds.includes(c.id))
        bumpMutate()
        set((s) => ({ characters: [...s.characters, groupToCharacter({ id: gid, name, memberIds, mode: 'natural', mutedIds: [], generationMode: 'narrator' }, members)] }))
        const chatId = await get().newChat(gid)
        return chatId
      },
      convertToGroup: async (chatId, addMemberIds) => {
        const chat = get().chats.find((c) => c.id === chatId)
        const solo = get().characters.find((c) => c.id === chat?.characterId)
        if (!chat || !solo || solo.isGroup) return null
        const memberIds = [solo.id, ...addMemberIds.filter((id) => id !== solo.id)]
        const gid = uid('grp')
        await j(`/groups/${encodeURIComponent(gid)}`, {
          method: 'PUT',
          body: JSON.stringify({ id: gid, name: `${solo.name} & co.`, memberIds, mode: 'natural', mutedIds: [], generationMode: 'narrator' }),
        })
        await j(`/chats/${encodeURIComponent(chatId)}`, { method: 'PATCH', body: JSON.stringify({ groupId: gid, characterId: null }) })
        const members = get().characters.filter((c) => memberIds.includes(c.id))
        bumpMutate()
        set((s) => ({
          characters: [...s.characters, groupToCharacter({ id: gid, name: `${solo.name} & co.`, memberIds, mode: 'natural', mutedIds: [], generationMode: 'narrator' }, members)],
          chats: s.chats.map((c) => (c.id === chatId ? { ...c, characterId: gid, groupSettings: chatGroupSettings({ name: '', memberIds, mode: 'natural', mutedIds: [], generationMode: 'narrator' }, c.turns) } : c)),
          activeCharacterId: s.activeCharacterId === solo.id ? gid : s.activeCharacterId,
        }))
        return gid
      },
      updateGroup: (groupId, patch) => {
        const g = get().characters.find((c) => c.id === groupId)
        if (!g?.isGroup || !g.group) return
        const next: GroupConfig = { ...g.group, ...patch, id: groupId }
        const solo = get().characters.filter((c) => !c.isGroup)
        bumpMutate()
        set((s) => ({
          characters: s.characters.map((c) => (c.id === groupId ? groupToCharacter(next, solo) : c)),
          // chats follow the group's defaults wherever they have no turns of their own
          chats: s.chats.map((c) => (c.characterId !== groupId ? c : { ...c, groupSettings: chatGroupSettings(next, c.turns) })),
        }))
        writeThrough('the group', j(`/groups/${encodeURIComponent(groupId)}`, { method: 'PATCH', body: JSON.stringify(patch) }))
      },
      reorderGroupMember: (groupId, memberId, dir) => {
        const g = get().characters.find((c) => c.id === groupId)
        if (!g?.isGroup || !g.group) return
        const members = [...g.group.memberIds]
        const idx = members.indexOf(memberId)
        const to = idx + dir
        if (idx < 0 || to < 0 || to >= members.length) return
        members[idx] = members[to]!
        members[to] = memberId
        // PATCH-merge just the member order (a GET-then-PUT here once raced the look_changed echo)
        get().updateGroup(groupId, { memberIds: members })
      },
      setChatTurns: (chatId, patch) => {
        const chat = get().chats.find((c) => c.id === chatId)
        const g = chat && get().characters.find((c) => c.id === chat.characterId)?.group
        if (!chat || !g) return
        const turns = patch === null ? undefined : mergeChatTurns(g, chat.turns, patch)
        bumpMutate()
        set((s) => ({ chats: s.chats.map((c) => (c.id === chatId ? { ...c, turns, groupSettings: chatGroupSettings(g, turns) } : c)) }))
        writeThrough('this chat\'s turns', j(`/chats/${encodeURIComponent(chatId)}`, { method: 'PATCH', body: JSON.stringify({ turns: turns ?? null }) }))
      },
      moveChatMember: (chatId, memberId, dir) => {
        const order = [...(get().chats.find((c) => c.id === chatId)?.groupSettings?.order ?? [])]
        const idx = order.indexOf(memberId)
        const to = idx + dir
        if (idx < 0 || to < 0 || to >= order.length) return
        order[idx] = order[to]!
        order[to] = memberId
        get().setChatTurns(chatId, { order })
      },
      triggerMember: (chatId, memberId) => {
        void runGeneration(set, get, chatId, 'next', { charId: memberId })
      },
      deleteChat: (chatId) => {
        bumpMutate()
        set((s) => ({
          chats: attachBranches(s.chats.filter((c) => c.id !== chatId)),
          activeChatId: s.activeChatId === chatId ? null : s.activeChatId,
          // only leave the page when it IS the deleted chat; deleting the last-opened
          // chat from Home or Chats must not move you
          view: s.activeChatId === chatId && s.view === 'chat' ? 'chats' : s.view,
        }))
        void j(`/chats/${encodeURIComponent(chatId)}`, { method: 'DELETE' }).catch(() => void get().hydrate())
      },
      pushInputHistory: (str) => set((s) => ({ inputHistory: [str, ...s.inputHistory.filter((x) => x !== str)].slice(0, 50) })),

      runAutoExecutes: (event, chatId) => {
        // Automation hooks: enabled quick replies with the
        // matching auto-execute flag fire when the event happens. Slash forms
        // map to the same store actions the composer uses; plain text sends.
        if (autoExecDepth > 2) return // a hook must never recurse into itself
        const cid = chatId ?? get().activeChatId
        if (!cid) return
        const replies = get().qrSets
          .filter((set) => set.enabled)
          .flatMap((set) => set.replies)
          .filter((r) => r.mode === 'send' && r.autoExecute?.[event])
        for (const r of replies) {
          const t = r.message.trim()
          if (get().streaming?.chatId === cid) break
          autoExecDepth++
          try {
            if (t === '/continue') get().continueReply(cid)
            else if (t === '/impersonate') get().impersonate(cid)
            else if (t === '/regenerate' || t === '/regen' || t === '/swipe') get().regenerate(cid)
            else if (t.startsWith('/')) warnUnrunnableShortcut(r.label, t)
            else get().sendMessage(cid, t)
          } finally {
            autoExecDepth--
          }
        }
      },
      importPreset: async (json, name, base) => {
        const fill = base ?? get().presets.find((p) => !p.readOnly) ?? get().presets[0]
        const preset = fill ? presetImport(json, name, fill) : null
        if (!preset) throw new Error('Not a recognizable preset file')
        await j(`/presets/${encodeURIComponent(preset.id)}`, { method: 'PUT', body: JSON.stringify({ ...presetToEngine(preset), id: preset.id }) })
        bumpMutate()
        set((s) => ({ presets: [...s.presets, preset] }))
        const embedded = (json as { extensions?: { regex_scripts?: unknown[] } }).extensions?.regex_scripts
        const scripts: RegexScript[] = []
        for (const item of Array.isArray(embedded) ? embedded : []) {
          const rx = regexImport(item)
          if (!rx) continue
          const script: RegexScript = { ...rx, id: uid('rx'), scope: 'preset', scopeTargetId: preset.id, order: scripts.length }
          await j(`/regex/${encodeURIComponent(script.id)}`, { method: 'PUT', body: JSON.stringify({ ...regexToEngine(script), id: script.id }) })
          scripts.push(script)
        }
        if (scripts.length) set((s) => ({ regexScripts: [...s.regexScripts, ...scripts] }))
        return { preset, scripts: scripts.length }
      },
      postPicture: async (chatId, image) => {
        const chat = get().chats.find((c) => c.id === chatId)
        if (!chat) return
        // the picture speaks for whoever spoke last, so a group scene shows it
        // under the member it belongs to
        const lastSpeaker = [...chat.messages].reverse().find((m) => m.role === 'assistant' && m.characterId)?.characterId ?? null
        const owner = get().characters.find((c) => c.id === (lastSpeaker ?? chat.characterId))
        const charId = owner && !owner.isGroup ? owner.id : null
        await postPicture(chatId, image, charId)
        await refreshChat(set, get, chatId)
        if (owner && !owner.isGroup && get().settings.imageGen?.saveToGallery !== false) {
          get().updateCharacter(owner.id, {
            gallery: [...owner.gallery, { id: uid('gal'), url: image.url, type: 'image', caption: image.prompt.slice(0, 200) }],
          })
        }
      },

      // ─────────────────────────────────────────────────────── entity CRUD ──
      updateCharacter: (id, patch) => {
        bumpMutate()
        const before = get().characters.find((x) => x.id === id)
        set((s) => ({ characters: s.characters.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
        let c = get().characters.find((x) => x.id === id)
        if (!c) return
        if (c.isGroup) {
          // the card-shaped fields a group has live in its group file (so card widgets such as the
          // book links work for a group); everything else goes through updateGroup
          const gp: Partial<GroupConfig> = {}
          if (patch.name != null) gp.name = patch.name
          if (patch.favorite != null) gp.favorite = patch.favorite
          if (patch.avatar != null) gp.avatar = patch.avatar
          if (patch.tags != null) gp.tags = patch.tags
          if (patch.embeddedLorebookId !== undefined) gp.embeddedLorebookId = patch.embeddedLorebookId
          if (patch.linkedLorebookIds != null) gp.linkedLorebookIds = patch.linkedLorebookIds
          if (Object.keys(gp).length) get().updateGroup(id, gp)
          return
        }
        // self-filling version history: snapshot the writing fields when they
        // actually changed, throttled to one per 10 min (the manual "Save
        // current as version" button in the editor is always available)
        if (before && SNAP_FIELDS.some((f) => before[f] !== c![f]) && Date.now() - (lastVersionSnap.get(id) ?? 0) > 10 * 60_000) {
          // snapshot the PREVIOUS writing state so Restore brings it back
          const snapshot = {
            description: before.description, personality: before.personality, scenario: before.scenario,
            firstMessage: before.firstMessage, exampleDialogue: before.exampleDialogue,
            systemPromptOverride: before.systemPromptOverride, postHistoryInstructions: before.postHistoryInstructions,
          }
          const newest = c.versions[0]?.snapshot
          const differs = !newest || SNAP_FIELDS.some((f) => (newest as never)[f] !== snapshot[f])
          if (differs) {
            lastVersionSnap.set(id, Date.now())
            const withVersion = { ...c, versions: [
              { id: uid('v'), label: `Auto: ${new Date().toLocaleString()}`, savedAt: Date.now(), snapshot },
              ...c.versions,
            ].slice(0, 20) }
            set((s) => ({ characters: s.characters.map((x) => (x.id === id ? withVersion : x)) }))
            c = withVersion
          }
        }
        // only the changed fields: a whole card with its emotion images inside
        // passes the engine's 1 MB cap on app requests
        const diff = before ? cardPatch(characterToCard(before), characterToCard(c)) : null
        if (before && !diff) return
        const body = JSON.stringify(diff ?? characterToCard(c))
        // a failed save must not leave the change on screen: it vanished on the next refresh and
        // looked saved until then (GitHub #17). Put back what this edit changed, unless a later
        // edit changed it again.
        const saved = c
        const rollBack = (msg: string) => {
          toast.error(msg)
          if (!before) return
          set((s) => ({ characters: s.characters.map((x) => {
            if (x.id !== id) return x
            const back: Partial<Character> = {}
            for (const k of Object.keys(patch) as (keyof Character)[]) if (x[k] === saved[k]) (back as Record<string, unknown>)[k] = before[k]
            return { ...x, ...back }
          }) }))
        }
        // the engine answers an oversized body by closing the connection, which reads as
        // "connection lost": say the real reason before sending
        if (body.length > APP_BODY_CAP) {
          rollBack(`Not saved: this change is ${(body.length / 1048576).toFixed(1)} MB, more than the ${APP_BODY_CAP / 1048576} MB a save can carry.`)
          return
        }
        const req = j(`/characters/${encodeURIComponent(id)}`, { method: diff ? 'PATCH' : 'PUT', body })
        void req.catch((e) => rollBack(String((e as Error).message ?? e)))
      },
      newCharacter: () => {
        bumpMutate()
        const id = uid('char')
        const char: Character = {
          id, name: 'New character', avatar: DEFAULT_AVATAR, altAvatars: [],
          description: '', personality: '', scenario: '', firstMessage: '', altGreetings: [], groupGreetings: [],
          exampleDialogue: '', systemPromptOverride: '', postHistoryInstructions: '',
          depthPrompt: { text: '', depth: 4, role: 'system' }, creatorNotes: '', creator: '', version: '1.0',
          tags: [], favorite: false, folderId: null, createdAt: Date.now(), lastChatAt: 0, css: '',
          embeddedLorebookId: null, linkedLorebookIds: [], colors: { name: '', dialogue: '', bubble: '' },
          stats: [], isGroup: false, descVariants: [], personalityVariants: [], scenarioVariants: [],
          versions: [], voiceProvider: '', voiceId: '', gallery: [], expressions: [],
          defaultExpression: 'neutral', characterRegexIds: [],
        }
        set((s) => ({ characters: [...s.characters, char] }))
        void j(`/characters/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(characterToCard(char)) })
          .catch((e) => toast.error(String((e as Error).message ?? e)))
        return id
      },
      duplicateCharacter: (id) => {
        const c = get().characters.find((x) => x.id === id)
        if (!c || c.isGroup) return
        bumpMutate()
        const nid = uid('char')
        const copy: Character = { ...c, id: nid, name: `${c.name} (copy)`, createdAt: Date.now(), favorite: false }
        set((s) => ({ characters: [...s.characters, copy] }))
        void j(`/characters/${encodeURIComponent(nid)}`, { method: 'PUT', body: JSON.stringify(characterToCard(copy)) })
          .then(() => toast.success(`Duplicated ${c.name}`))
          .catch((e) => { toast.error(String((e as Error).message ?? e)); void get().hydrate() })
      },
      deleteCharacter: (id, opts) => {
        if (get().characters.find((c) => c.id === id)?.isGroup) {
          // a group lives in groups/, and the engine takes its chats with it; the members stay
          bumpMutate()
          set((s) => ({
            characters: s.characters.filter((c) => c.id !== id),
            chats: attachBranches(s.chats.filter((c) => c.characterId !== id)),
            activeCharacterId: s.activeCharacterId === id ? null : s.activeCharacterId,
          }))
          void j(`/groups/${encodeURIComponent(id)}`, { method: 'DELETE' })
            .then(() => void refreshLists(set, get))
            .catch((e) => { toast.error(String((e as Error).message ?? e)); void get().hydrate() })
          return
        }
        // a deleted card leaves the groups it was in (the engine skips a missing member, the editor would not)
        for (const g of get().characters) {
          if (g.isGroup && g.group && g.group.memberIds.includes(id)) {
            const ms = { ...(g.group.memberSettings ?? {}) }
            delete ms[id]
            get().updateGroup(g.id, {
              memberIds: g.group.memberIds.filter((x) => x !== id),
              mutedIds: (g.group.mutedIds ?? []).filter((x) => x !== id),
              memberSettings: ms,
            })
          }
        }
        const own = opts?.withBook ? get().characters.find((c) => c.id === id)?.embeddedLorebookId ?? null : null
        const shared = own != null && get().characters.some((c) => c.id !== id && (c.embeddedLorebookId === own || c.linkedLorebookIds.includes(own)))
        if (own && !shared) {
          // not deleteLorebook(): that rewrites the cards that pointed at the book,
          // and its write for THIS card can land after the card's delete and bring it back
          bumpMutate()
          set((st) => ({ lorebooks: st.lorebooks.filter((b) => b.id !== own) }))
          writeThrough('the lorebook deletion', j(`/lorebooks/${encodeURIComponent(own)}`, { method: 'DELETE' }))
          for (const per of get().personas) {
            if (per.lorebookIds.includes(own)) get().updatePersona(per.id, { lorebookIds: per.lorebookIds.filter((x) => x !== own) })
          }
        }
        bumpMutate()
        set((s) => ({
          characters: s.characters.filter((c) => c.id !== id),
          chats: attachBranches(s.chats.filter((c) => c.characterId !== id)),
          activeCharacterId: s.activeCharacterId === id ? null : s.activeCharacterId,
        }))
        void j(`/characters/${encodeURIComponent(id)}`, { method: 'DELETE' })
          .then(() => void refreshLists(set, get))
          .catch((e) => { toast.error(String((e as Error).message ?? e)); void get().hydrate() })
      },
      convertCharacterToPersona: (id, opts) => {
        const c = get().characters.find((x) => x.id === id)
        if (!c) return null
        // the card speaks as {{char}}; as a persona the user takes that role,
        // so the two macros trade places
        const description = c.description.replace(
          /\{\{(char|user)\}\}/gi,
          (_, which: string) => (which.toLowerCase() === 'char' ? '{{user}}' : '{{char}}'),
        )
        const avatar = c.avatar && c.avatar !== DEFAULT_AVATAR ? { avatar: c.avatar } : {}
        const existing = get().personas.find((p) => p.name === c.name)
        if (existing) {
          if (opts?.overwrite !== true) return null
          get().updatePersona(existing.id, { description, ...avatar })
          return existing.id
        }
        return get().addPersona({ name: c.name, description, ...avatar })
      },
      updatePersona: (id, patch) => {
        bumpMutate()
        // A chat that never pinned a persona reads the default, so promoting
        // one rewrote {{user}} in all of them — switching persona in one chat
        // changed every other. Pin them to the persona they speak as now,
        // BEFORE the default moves. (Presets follow the same rule.)
        if (patch.isDefault) {
          const prevDefault = get().personas.find((p) => p.id !== id && p.isDefault)
          if (prevDefault) {
            const riders = get().chats.filter((c) => !c.personaId)
            if (riders.length) {
              set((s2) => ({ chats: s2.chats.map((c) => (c.personaId ? c : { ...c, personaId: prevDefault.id })) }))
              for (const c of riders) {
                writeThrough('the chats that rode the old persona', j(`/chats/${encodeURIComponent(c.id)}`, { method: 'PATCH', body: JSON.stringify({ personaId: prevDefault.id }) }))
              }
            }
          }
        }
        set((s) => ({
          personas: s.personas.map((p) => {
            if (p.id === id) return { ...p, ...patch }
            // exactly one default: promoting one demotes the rest
            return patch.isDefault ? { ...p, isDefault: false } : p
          }),
        }))
        const p = get().personas.find((x) => x.id === id)
        if (!p) return
        writeThrough('persona', j(`/personas/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ ...p, id }) }))
        if (patch.isDefault) writeThrough('the default persona', j('/settings', { method: 'PUT', body: JSON.stringify({ personaId: id }) }))
      },
      usePersona: (id) => {
        const { personas, chats, activeChatId } = get()
        const persona = personas.find((x) => x.id === id)
        if (!persona) return
        // speaking as this persona from now on: new chats start with it and
        // the open chat swaps to it on the spot
        if (!persona.isDefault) get().updatePersona(id, { isDefault: true })
        const chat = activeChatId ? chats.find((c) => c.id === activeChatId) : null
        if (chat && chat.personaId !== id) get().updateChat(chat.id, { personaId: id })
      },
      addPersona: (init) => {
        bumpMutate()
        const id = init?.id ?? uid('pers')
        const persona: Persona = {
          id, name: 'New Persona', avatar: DEFAULT_AVATAR, title: '', description: '',
          pronouns: '', lorebookIds: [], isDefault: get().personas.length === 0, folderId: null,
          binding: 'default', boundCharacterIds: [], autoLock: false, createdAt: Date.now(),
          ...init,
        }
        set((s) => ({ personas: [...s.personas, persona] }))
        writeThrough('persona', j(`/personas/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ ...persona, id }) }))
        return id
      },
      duplicatePersona: (id) => {
        const p = get().personas.find((x) => x.id === id)
        const newId = uid('pers')
        bumpMutate()
        if (p) {
          const copy = { ...p, id: newId, name: `${p.name} (copy)`, isDefault: false, createdAt: Date.now() }
          set((s) => ({ personas: [...s.personas, copy] }))
          writeThrough('the new persona', j(`/personas/${encodeURIComponent(newId)}`, { method: 'PUT', body: JSON.stringify({ ...copy, id: newId }) }))
        }
        return newId
      },
      deletePersona: (id) => {
        bumpMutate()
        set((s) => ({ personas: s.personas.filter((p) => p.id !== id) }))
        writeThrough('the persona deletion', j(`/personas/${encodeURIComponent(id)}`, { method: 'DELETE' }))
      },

      updatePreset: (id, patch) => {
        // stock presets are immutable — only switching "currently using" onto
        // one is allowed; everything else requires an editable copy
        const target = get().presets.find((x) => x.id === id)
        if (target?.readOnly && Object.keys(patch).some((k) => k !== 'isDefault')) {
          toast.error('Stock preset, create an editable copy to change it')
          return
        }
        bumpMutate()
        // default is exclusive — remember which others to clear so their files persist too
        const prevDefaults = patch.isDefault ? get().presets.filter((x) => x.id !== id && x.isDefault) : []
        // chats pinned to the OLD default follow the switch: a default that
        // only applies to chats created after it is a trap (every shaping
        // setting silently ignores the copy the user just made). Chats the
        // user explicitly pointed elsewhere keep theirs.
        if (patch.isDefault && prevDefaults.length) {
          const oldIds = new Set<string | null>(prevDefaults.map((x) => x.id))
          const riders = get().chats.filter((c) => oldIds.has(c.presetId))
          if (riders.length) {
            set((s2) => ({ chats: s2.chats.map((c) => (oldIds.has(c.presetId) ? { ...c, presetId: id } : c)) }))
            for (const c of riders) {
              writeThrough('the chats that rode the old default', j(`/chats/${encodeURIComponent(c.id)}`, { method: 'PATCH', body: JSON.stringify({ presetId: id as string }) }))
            }
          }
        }
        set((s) => ({
          presets: s.presets.map((p) => {
            if (p.id === id) return { ...p, ...patch }
            return patch.isDefault && p.isDefault ? { ...p, isDefault: false } : p
          }),
        }))
        const p = get().presets.find((x) => x.id === id)
        if (!p) return
        void j(`/presets/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ ...presetToEngine(p), id }) })
          .catch((e) => toast.error(String((e as Error).message ?? e)))
        for (const other of prevDefaults) {
          writeThrough('preset', j(`/presets/${encodeURIComponent(other.id)}`, { method: 'PUT', body: JSON.stringify({ ...presetToEngine({ ...other, isDefault: false }), id: other.id }) }))
        }
      },
      duplicatePreset: (id) => {
        const p = get().presets.find((x) => x.id === id)
        const newId = uid('preset')
        bumpMutate()
        if (p) {
          const copy = { ...p, id: newId, name: `${p.name} (copy)`, readOnly: false, isDefault: false, createdAt: Date.now() }
          set((s) => ({ presets: [...s.presets, copy] }))
          writeThrough('the new preset', j(`/presets/${encodeURIComponent(newId)}`, { method: 'PUT', body: JSON.stringify({ ...presetToEngine(copy), id: newId }) }))
        }
        return newId
      },
      deletePreset: (id) => {
        if (id === 'default') { toast.error('The default preset is required by the engine'); return }
        bumpMutate()
        set((s) => ({ presets: s.presets.filter((p) => p.id !== id) }))
        writeThrough('the preset deletion', j(`/presets/${encodeURIComponent(id)}`, { method: 'DELETE' }))
      },

      updateLorebook: (id, patch) => {
        bumpMutate()
        set((s) => ({ lorebooks: s.lorebooks.map((b) => (b.id === id ? { ...b, ...patch } : b)) }))
        const b = get().lorebooks.find((x) => x.id === id)
        if (!b) return
        void j(`/lorebooks/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ ...lorebookToEngine(b), id }) })
          .catch((e) => toast.error(String((e as Error).message ?? e)))
      },
      addLorebook: (name) => {
        bumpMutate()
        const id = uid('book')
        const book: Lorebook = {
          id, name: uniqueName(name?.trim() || 'New Lorebook', get().lorebooks.map((b) => b.name)), folderId: null, globalActive: false, linkedCharacterIds: [], entries: [],
          settings: { scanDepth: 4, contextPercent: 25, budgetCap: 0, minActivations: 0, maxRecursion: 2, insertionStrategy: 'character_first', caseSensitive: false, wholeWords: true, groupScoring: false, recursiveScan: true, includeNames: true, overflowAlert: true },
          vectorized: { embedding: 'all-MiniLM-L6-v2', queryMessages: 2, scoreThreshold: 0.35, topK: 10 }, isEmbedded: false,
          formatTemplate: '',
        }
        set((s) => ({ lorebooks: [...s.lorebooks, book] }))
        writeThrough('lorebook', j(`/lorebooks/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ ...lorebookToEngine(book), id }) }))
        return id
      },
      duplicateLorebook: (id) => {
        const b = get().lorebooks.find((x) => x.id === id)
        const newId = uid('book')
        bumpMutate()
        if (b) {
          const copy = { ...b, id: newId, name: `${b.name} (copy)`, globalActive: false, isEmbedded: false,
            entries: b.entries.map((e) => ({ ...e, id: uid('entry') })) }
          set((s) => ({ lorebooks: [...s.lorebooks, copy] }))
          writeThrough('the new lorebook', j(`/lorebooks/${encodeURIComponent(newId)}`, { method: 'PUT', body: JSON.stringify({ ...lorebookToEngine(copy), id: newId }) }))
        }
        return newId
      },
      deleteLorebook: (id) => {
        bumpMutate()
        set((s) => ({ lorebooks: s.lorebooks.filter((b) => b.id !== id) }))
        writeThrough('the lorebook deletion', j(`/lorebooks/${encodeURIComponent(id)}`, { method: 'DELETE' }))
        // no card or persona keeps pointing at the deleted book
        for (const c of get().characters) {
          if (c.embeddedLorebookId === id || c.linkedLorebookIds.includes(id)) {
            get().updateCharacter(c.id, {
              embeddedLorebookId: c.embeddedLorebookId === id ? null : c.embeddedLorebookId,
              linkedLorebookIds: c.linkedLorebookIds.filter((x) => x !== id),
            })
          }
        }
        for (const per of get().personas) {
          if (per.lorebookIds.includes(id)) get().updatePersona(per.id, { lorebookIds: per.lorebookIds.filter((x) => x !== id) })
        }
      },

      updateRegex: (id, patch) => {
        bumpMutate()
        set((s) => ({ regexScripts: s.regexScripts.map((r) => (r.id === id ? { ...r, ...patch } : r)) }))
        const r = get().regexScripts.find((x) => x.id === id)
        if (!r) return
        void j(`/regex/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ ...regexToEngine(r), id }) })
          .catch((e) => toast.error(String((e as Error).message ?? e)))
      },
      addRegex: (scope) => {
        bumpMutate()
        const id = uid('rx')
        const script: RegexScript = {
          id, name: 'New script', scope, scopeTargetId: null, find: '', replace: '', flags: 'g',
          placements: { userInput: false, aiOutput: true, slash: false, wi: false, reasoning: false },
          markdownOnly: false, promptOnly: false,
          minDepth: null, maxDepth: null, trimStrings: [], runOnEdit: false, macroMode: 'none', enabled: true,
          order: get().regexScripts.length,
        }
        set((s) => ({ regexScripts: [...s.regexScripts, script] }))
        writeThrough('regex script', j(`/regex/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ ...regexToEngine(script), id }) }))
        return id
      },
      deleteRegex: (id) => {
        bumpMutate()
        set((s) => ({ regexScripts: s.regexScripts.filter((r) => r.id !== id) }))
        writeThrough('the regex deletion', j(`/regex/${encodeURIComponent(id)}`, { method: 'DELETE' }))
      },

      updateQRSet: (id, patch) => { bumpMutate(); set((s) => ({ qrSets: s.qrSets.map((q) => (q.id === id ? { ...q, ...patch } : q)) })) },
      addQRSet: () => {
        bumpMutate()
        const id = uid('qrs')
        set((s) => ({ qrSets: [...s.qrSets, { id, name: 'New set', scope: 'global', enabled: true, replies: [] }] }))
        return id
      },
      deleteQRSet: (id) => { bumpMutate(); set((s) => ({ qrSets: s.qrSets.filter((q) => q.id !== id) })) },

      // Connections are DERIVED from the engine's live model catalog — the
      // engine owns provider credentials; the app only picks models.
      updateConnection: () => {},
      addConnection: () => '',
      deleteConnection: () => {},

      updateExtension: (id, patch) => set((s) => ({ extensions: s.extensions.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
      // ── data bank: engine-backed (data/databank/*.json, chunked + searched) ──
      uploadDataBankFile: async (name, content, scope = 'global', scopeTargetId = null) => {
        bumpMutate()
        const r = await j<{ file: DataBankFile }>('/databank', {
          method: 'POST',
          body: JSON.stringify({ name, content, scope, ...(scope !== 'global' && scopeTargetId ? { scopeTargetId } : {}) }),
        })
        set((s) => ({ dataBank: [...s.dataBank, r.file] }))
      },
      updateDataBankFile: (id, patch) => {
        bumpMutate()
        set((s) => ({ dataBank: s.dataBank.map((f) => (f.id === id ? { ...f, ...patch } : f)) }))
        writeThrough('the data bank entry', j(`/databank/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }))
      },
      deleteDataBankFile: (id) => {
        bumpMutate()
        set((s) => ({ dataBank: s.dataBank.filter((f) => f.id !== id) }))
        writeThrough('the data bank deletion', j(`/databank/${encodeURIComponent(id)}`, { method: 'DELETE' }))
      },

      // ── connection profiles: named (provider, model) pairs for quick switching ──
      addConnectionProfile: (p) => {
        bumpMutate()
        const id = uid('prof')
        set((s) => ({ connectionProfiles: [...s.connectionProfiles, { id, ...p }] }))
        return id
      },
      updateConnectionProfile: (id, patch) => { bumpMutate(); set((s) => ({
        connectionProfiles: s.connectionProfiles.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      })) },
      deleteConnectionProfile: (id) => { bumpMutate(); set((s) => ({ connectionProfiles: s.connectionProfiles.filter((p) => p.id !== id) })) },
      updateBackground: (id, patch) => { bumpMutate(); set((s) => ({ backgrounds: s.backgrounds.map((b) => (b.id === id ? { ...b, ...patch } : b)) })) },
      addBackground: (name, url) => {
        bumpMutate()
        const id = uid('bg')
        set((s) => ({ backgrounds: [...s.backgrounds, { id, name, url, type: 'image', folderId: null, fitting: 'cover' }] }))
        return id
      },
      deleteBackground: (id) => { bumpMutate(); set((s) => ({
        backgrounds: s.backgrounds.filter((b) => b.id !== id),
        settings: s.settings.activeBackgroundId === id ? { ...s.settings, activeBackgroundId: null } : s.settings,
        chats: s.chats.map((c) => (c.backgroundId === id ? { ...c, backgroundId: null } : c)),
      })) },
      addFolder: (name, scope) => {
        bumpMutate()
        const id = uid('fold')
        set((s) => ({ folders: [...s.folders, { id, name, color: '#8ec9a8', scope }] }))
        return id
      },
      deleteFolder: (id) => { bumpMutate(); set((s) => ({
        folders: s.folders.filter((f) => f.id !== id),
        chats: s.chats.map((c) => (c.folderId === id ? { ...c, folderId: null } : c)),
        characters: s.characters.map((c) => (c.folderId === id ? { ...c, folderId: null } : c)),
      })) },
      updateTag: (id, patch) => { bumpMutate(); set((s) => ({ tags: s.tags.map((t) => (t.id === id ? { ...t, ...patch } : t)) })) },
      addTag: (name) => { bumpMutate(); set((s) => ({ tags: [...s.tags, { id: uid('tag'), name, color: '#7fb8d9', textColor: '#111318', visible: true, asFolder: false, order: s.tags.length }] })) },
      deleteTag: (id) => { bumpMutate(); set((s) => ({ tags: s.tags.filter((t) => t.id !== id) })) },
      resetAll: () => {
        // LOCAL data only — server data lives in the engine and is managed
        // from Settings → Data (per-type deletes) or the engine client.
        set({ ...localSeed(), view: 'home', activeChatId: null, activeCharacterId: null, drawer: null })
        toast.success('Local UI state reset, server data (characters, chats, presets…) untouched')
      },
    }),
    {
      name: 'chrysalis-store-v2',
      version: 4,
      storage: createJSONStorage(() => quietStorage),
      migrate: (persisted) => {
        // v1 → v2: the default chat font moved to the bundled Noto Sans; a
        // stored 'system' was the old default value, so it follows along
        const s = persisted as { settings?: Partial<AppSettings> } | undefined
        if (s?.settings?.proseFont === 'system') s.settings.proseFont = 'noto'
        // A persisted settings bag REPLACES the seeded one, so every key added
        // since it was written arrives undefined. Fill the new ones in.
        if (s?.settings) {
          const d = defaultSettings()
          if (typeof s.settings.lineSpacing !== 'number') s.settings.lineSpacing = d.lineSpacing
          if (typeof s.settings.paragraphSpacing !== 'number') s.settings.paragraphSpacing = d.paragraphSpacing
          // v3 → v4: thinking blocks used to expand by default; they now start
          // collapsed and open on tap (the Auto-expand Thinking switch opts
          // back in). The old default left `true` persisted everywhere.
          s.settings.reasoningAutoExpand = false
        }
        return persisted as never
      },
      partialize: (s) => ({
        // local-only slices; server-backed slices rehydrate from the engine
        settings: s.settings,
        qrSets: s.qrSets,
        themes: s.themes,
        backgrounds: s.backgrounds,
        tags: s.tags,
        folders: s.folders,
        view: s.view,
        activeChatId: s.activeChatId,
        activeCharacterId: s.activeCharacterId,
        selectedSettingsSection: s.selectedSettingsSection,
        inputHistory: s.inputHistory,
        railCollapsed: s.railCollapsed,
        drawerFull: s.drawerFull,
      }) as never,
    },
  ),
)

// ── generation driver ────────────────────────────────────────────────────────
/** Chats whose last run the user stopped (a stopped send is not "not sent": the turn may be stored). */
const stoppedRuns = new Set<ID>()
type SetFn = (partial: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void
type GetFn = () => AppState

/** Freeze a cancelled generation onto its message: everything that streamed
 *  (text + think blocks + tool rows rebuilt from the live marks) becomes the
 *  message's newest swipe, with the row's swipe animation suppressed — the
 *  screen keeps exactly what was on it, no slide, no swap. Mirrors what the
 *  engine salvages, so the reconcile that follows is invisible. */
function freezeCancelledStream(
  set: SetFn,
  get: GetFn,
  st: NonNullable<AppState['streaming']>,
): { keep: boolean; text: string; parts: ToolPart[]; isStaged: boolean; expectedSwipes: number | null; genMs: number } {
  const text = st.full
  // stopped generations still earned their seconds: the client owns the only
  // truthful clock once the engine's completion is discarded
  const genMs = st.startedAt ? Math.max(0, Date.now() - st.startedAt) : 0
  const parts: ToolPart[] = []
  if (st.marks?.length) {
    const marks = st.marks
    const anchors = [...new Set(marks.map((m) => m.at))].sort((a, b) => a - b)
    let prev = 0
    for (const a of anchors) {
      if (a > prev && text.slice(prev, a).trim()) parts.push({ type: 'text', text: text.slice(prev, a) })
      for (const m of marks) {
        if (m.at !== a) continue
        if (m.kind === 'think') parts.push({ type: 'thinking', text: m.text, ...(m.ms != null ? { ms: m.ms } : {}) })
        else parts.push({ type: 'tool', name: m.name, args: m.args, resultText: m.done ? (m.resultText ?? '') : 'cancelled', isError: !!m.isError && !!m.done })
      }
      prev = a
    }
    if (text.slice(prev).trim()) parts.push({ type: 'text', text: text.slice(prev) })
  }
  // thinking counts as content — a cancel mid-thought keeps its think block
  const keep = text.trim().length > 0 || (st.marks ?? []).some((m) => m.kind === 'think' && m.text.trim()) || (st.marks ?? []).some((m) => m.kind === 'tool')
  // suppress the swipe animation when the freeze APPENDS a swipe to a real
  // message (a staged bubble keeps index 0 — nothing to animate)
  const target = get().chats.find((c) => c.id === st.chatId)?.messages.find((m) => m.id === st.messageId)
  const isStagedOut = !!target && target.id.startsWith('pending-')
  const expectedSwipesOut = target && !isStagedOut ? target.swipes.length : null
  const skipKey = keep && target && !isStagedOut && target.swipes.length > 0
    ? `${target.id}:${target.swipes.length}`
    : null
  bumpMutate() // the frozen message must survive any in-flight hydrate
  set((s) => ({
    swipeFxSkip: skipKey,
    chats: s.chats.map((c) => (c.id !== st.chatId ? c : {
      ...c,
      messages: c.messages
        .map((m): Message | null => {
          if (m.id !== st.messageId) return m
          const isStaged = m.id.startsWith('pending-')
          // nothing streamed at all: a staged bubble vanishes, an in-place
          // regen keeps its old swipes untouched
          if (!keep) return isStaged ? null : m
          const frozenSwipe = { id: uid('sw'), content: text, model: m.swipes[m.activeSwipe]?.model ?? '', genTimeMs: genMs, timestamp: Date.now(), ...(parts.length ? { parts } : {}) }
          const swipes = isStaged || m.swipes.length === 0 ? [frozenSwipe] : [...m.swipes, frozenSwipe]
          return { ...m, swipes, activeSwipe: swipes.length - 1 }
        })
        .filter((m): m is Message => m !== null),
    })),
  }))
  return { keep, text, parts, isStaged: isStagedOut, expectedSwipes: expectedSwipesOut, genMs }
}

/** A chat from the engine, with how it plays when it is a group chat (the
 *  group's defaults and the chat's own turns): the meta alone does not say. */
function uiChat(get: GetFn, meta: EngineChatMeta, msgs: EngineMessage[]): Chat {
  const chat = engineChatToUI(meta, msgs)
  const g = get().characters.find((c) => c.id === chat.characterId)?.group
  if (g) chat.groupSettings = chatGroupSettings(g, chat.turns)
  return chat
}

async function refreshChat(set: SetFn, get: GetFn, chatId: ID) {
  const seqAtStart = mutateSeq
  try {
    const r = await j<{ meta: EngineChatMeta; messages: EngineMessage[] }>(`/chats/${encodeURIComponent(chatId)}`)
    if (mutateSeq !== seqAtStart) return // an optimistic mutation is ahead of this snapshot
    set((s) => ({ chats: s.chats.map((c) => (c.id === chatId ? uiChat(get, r.meta, r.messages ?? []) : c)) }))
  } catch { /* chat may be gone */ }
  void refreshLists(set, get)
}

async function refreshLists(set: SetFn, get: GetFn) {
  const seqAtStart = mutateSeq
  try {
    const metas = await j<{ chats: EngineChatMeta[] }>('/chats')
    if (mutateSeq !== seqAtStart) return
    set((s) => {
      const byId = new Map(s.chats.map((c) => [c.id, c]))
      // keep loaded transcripts; update order/metas; carry messageCount/preview for unloaded
      const merged = metas.chats.map((m) => {
        const existing = byId.get(m.id)
        if (existing && existing.messages.length > 0) return { ...existing, updatedAt: m.updatedAt ?? existing.updatedAt, title: m.title }
        return uiChat(get, m, [])
      })
      const added = s.chats.filter((c) => !metas.chats.some((m) => m.id === c.id))
      return { chats: attachBranches([...merged, ...added]) }
    })
  } catch { /* offline */ }
}

/** branch metadata: forks record parentChatId/parentMessageId on the engine */
function attachBranches(all: Chat[]): Chat[] {
  // one entry per id, the first wins: newChat/forkChat prepend after several awaits, and a hydrate
  // that ran meanwhile may already hold the same chat (React then sees two children with one key)
  const seen = new Set<ID>()
  const chats = all.filter((c) => !seen.has(c.id) && (seen.add(c.id), true))
  return chats.map((c) => ({
    ...c,
    branches: chats
      .filter((x) => x.parentChatId === c.id)
      .map((x): ChatBranch => ({
        id: x.id, name: x.title, parentMessageId: x.parentMessageId ?? '',
        createdAt: x.createdAt, messageCount: x.messages.length > 0 ? x.messages.length : x.messageCount ?? 0,
      })),
  }))
}

/**
 * The REAL generation driver.
 *  - stages a pending assistant bubble (id pending-*) so the streaming UI has
 *    a target before the server message exists
 *  - pushes lorebook scope (global + character-linked) onto the chat meta so
 *    the engine's world-info pass sees exactly what the UI's lorebook view
 *    says is active
 *  - keeps the POST open (the kernel runs the model inside the request;
 *    app_stream deltas arrive over WS meanwhile) and replaces local state
 *    with the committed transcript afterwards
 */
async function runGeneration(
  set: SetFn, get: GetFn, chatId: ID, op: 'send' | 'swipe' | 'continue' | 'next',
  body: Record<string, unknown>,
  opts?: { userText?: string; attachments?: Message['attachments']; regenerateInto?: ID },
): Promise<boolean> {
  if (get().streaming?.chatId === chatId) return false
  const chat = get().chats.find((c) => c.id === chatId)
  if (!chat) return false

  // world-info scope for this generation (studio semantics)
  const bookIds = scopeBookIds(get().lorebooks, chat, get().characters)
  const ctrl = new AbortController()
  activeGens.set(chatId, ctrl)

  // Swipe/regenerate stream IN PLACE on the target message — a new bubble
  // appended at the bottom (then vanishing on commit) reads as a glitch.
  const inPlaceId = opts?.regenerateInto
  if (inPlaceId) {
    set(() => ({ streaming: { chatId, messageId: inPlaceId, full: '', shown: 0, startedAt: Date.now() } }))
    return runStream(set, get, chatId, op, body, ctrl, chat, bookIds)
  }
  const pendingId = `pending-${uid('reply')}`
  const stageUser = opts?.userText?.trim()
    ? { id: `pending-${uid('user')}`, role: 'user' as const, characterId: null,
        swipes: [{ id: uid('sw'), content: opts.userText, model: 'user', genTimeMs: 0, timestamp: Date.now() }],
        activeSwipe: 0, timestamp: Date.now(), edited: false, hidden: false, bookmarked: false,
        // staged under the persona active at send time (matches the engine commit)
        authorName: get().personas.find((p) => p.id === chat.personaId)?.name
          ?? get().personas.find((p) => p.isDefault)?.name,
        personaId: get().personas.find((p) => p.id === chat.personaId)?.id
          ?? get().personas.find((p) => p.isDefault)?.id,
        ...(opts.attachments?.length ? { attachments: opts.attachments } : {}) }
    : null
  const pendingMsg: Message = {
    id: pendingId, role: 'assistant',
    characterId: op === 'next' ? String(body.charId ?? '') : chat.characterId,
    swipes: [{ id: uid('sw'), content: '', model: '', genTimeMs: 0, timestamp: Date.now() }],
    activeSwipe: 0, timestamp: Date.now(), edited: false, hidden: false, bookmarked: false,
  }
  // a group where only the user picks who speaks: the send stores the user's
  // message and nobody answers, so no reply bubble is staged
  const gs = chat.groupSettings
  const waitsForPick = op === 'send' && gs?.activation === 'manual' && gs.generationMode !== 'narrator'
  bumpMutate() // staged bubbles must survive any in-flight hydrate
  set((s) => ({
    streaming: { chatId, messageId: pendingId, full: '', shown: 0, startedAt: Date.now() },
    chats: s.chats.map((c) => (c.id === chatId ? {
      ...c,
      messages: [...c.messages, ...(stageUser ? [stageUser] : []), ...(waitsForPick ? [] : [pendingMsg])],
    } : c)),
  }))
  return runStream(set, get, chatId, op, body, ctrl, chat, bookIds)
}

/** The engine's limit on one app request body (1.0.7: 8 MB; 1 MB before). */
const APP_BODY_CAP = 8 * 1024 * 1024

const LANDED = Symbol('landed')

/** Is the engine generating for this chat right now? null = cannot tell (an engine before 1.0.7
 *  has no such route, or the request failed). */
async function engineGenerating(chatId: ID): Promise<boolean | null> {
  try {
    const r = await j<{ generating?: unknown }>(`/__generating?chatId=${encodeURIComponent(chatId)}`)
    return r.generating === true
  } catch {
    return null
  }
}

function dropAdopted(set: SetFn, get: GetFn, chatId: ID, messageId: ID) {
  set((s) => ({
    ...(s.streaming?.messageId === messageId ? { streaming: null } : {}),
    chats: s.chats.map((c) => (c.id === chatId ? { ...c, messages: c.messages.filter((m) => m.id !== messageId) } : c)),
  }))
}

/** The engine is still writing a reply no request of this page waits for (the page was reloaded
 *  mid-reply, or opened while another tab sent): show "Writing" with the live text, and pick up
 *  the commit once the run ends. Before, the reply looked lost and popped up later (GitHub #13). */
const adopting = new Set<ID>()
async function adoptRunningGeneration(set: SetFn, get: GetFn, chatId: ID) {
  if (adopting.has(chatId) || activeGens.has(chatId) || get().streaming) return
  adopting.add(chatId)
  try {
    if ((await engineGenerating(chatId)) !== true) return
    const chat = get().chats.find((c) => c.id === chatId)
    if (!chat || activeGens.has(chatId) || get().streaming) return
    const pendingId = `pending-${uid('reply')}`
    const pendingMsg: Message = {
      id: pendingId, role: 'assistant', characterId: chat.characterId,
      swipes: [{ id: uid('sw'), content: '', model: '', genTimeMs: 0, timestamp: Date.now() }],
      activeSwipe: 0, timestamp: Date.now(), edited: false, hidden: false, bookmarked: false,
    }
    bumpMutate()
    set((s) => ({
      streaming: { chatId, messageId: pendingId, full: '', shown: 0, startedAt: Date.now(), adopted: true },
      chats: s.chats.map((c) => (c.id === chatId ? { ...c, messages: [...c.messages, pendingMsg] } : c)),
    }))
    // the live text arrives over the socket as for any reply; this loop only waits for the end
    // waits on after a Stop too (Stop only hides the bubble), so the saved reply still shows up
    const until = Date.now() + 15 * 60_000
    let unknown = 0
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, 2000))
      const g = await engineGenerating(chatId)
      if (g === false || (g === null && ++unknown >= 5)) break
    }
    // the engine counts a run until its route ends, so the reply is saved by now
    if (get().streaming?.messageId === pendingId) dropAdopted(set, get, chatId, pendingId)
    await refreshChat(set, get, chatId)
  } finally {
    adopting.delete(chatId)
  }
}

/** The transcript before a generation: a committed reply differs from it.
 *  `inPlaceId` is the message a swipe, regenerate or continue writes into. */
function commitBaseline(chat: Chat, inPlaceId: ID | null) {
  const target = inPlaceId ? chat.messages.find((m) => m.id === inPlaceId) : undefined
  return {
    ids: new Set(chat.messages.map((m) => m.id)),
    target: target ? { id: target.id, swipes: target.swipes.length, active: target.activeSwipe, text: target.swipes[target.activeSwipe]?.content ?? '' } : null,
  }
}

function hasLanded(base: ReturnType<typeof commitBaseline>, msgs: EngineMessage[]): boolean {
  const t = base.target
  if (t) {
    const m = msgs.find((x) => x.id === t.id)
    if (!m) return false
    // read the way engineMessageToUI reads it, so an untouched message compares equal
    const raw = m.swipes?.length ? m.swipes : [m.text]
    const active = Math.min(m.swipe ?? 0, raw.length - 1)
    return raw.length !== t.swipes || active !== t.active || (m.text || raw[active]) !== t.text
  }
  return msgs.some((m) => m.role === 'char' && !base.ids.has(m.id))
}

/** After the page was hidden or offline mid-generation, look at the stored
 *  transcript on return and every few seconds after: a phone often leaves the
 *  open request hanging while the engine has long saved the reply. */
function watchForCommit(chatId: ID, base: ReturnType<typeof commitBaseline>, onLanded: () => void, onGone: () => void): () => void {
  let lost = document.visibilityState === 'hidden'
  let stopped = false
  let timer: ReturnType<typeof setInterval> | null = null
  // checks in a row that found no reply saved and no generation running on the engine
  let idle = 0
  const check = async () => {
    if (stopped || document.visibilityState !== 'visible') return
    try {
      const r = await j<{ messages: EngineMessage[] }>(`/chats/${encodeURIComponent(chatId)}`)
      if (stopped) return
      if (hasLanded(base, r.messages ?? [])) return onLanded()
      // the run ended without a reply (failed, or the server restarted): "Writing" used to
      // count forever (GitHub #13). Twice, since the commit lands just after the run ends.
      const running = await engineGenerating(chatId)
      if (stopped) return
      if (running === false) { if (++idle >= 2) onGone() } else idle = 0
    } catch { /* offline still: the next tick tries again */ }
  }
  const onChange = () => {
    if (document.visibilityState === 'hidden' || !navigator.onLine) { lost = true; return }
    if (!lost) return
    void check()
    timer ??= setInterval(() => void check(), 5000)
  }
  document.addEventListener('visibilitychange', onChange)
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    stopped = true
    if (timer) clearInterval(timer)
    document.removeEventListener('visibilitychange', onChange)
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/** Fetch + commit half of a generation; the staging half decided where the
 *  stream renders (in-place for swipe/regenerate, staged bubble for sends). */
async function runStream(
  set: SetFn, get: GetFn, chatId: ID, op: 'send' | 'swipe' | 'continue' | 'next',
  body: Record<string, unknown>, ctrl: AbortController, chat: Chat, bookIds: ID[],
): Promise<boolean> {
  let committed = false
  let committedRes: Record<string, unknown> | null = null
  try {
    // keep the engine's chat meta in sync with the UI's lorebook bindings, an
    // empty scope too (a book unlinked from the card must stop firing); the
    // engine skips the write when nothing changed
    await j(`/chats/${encodeURIComponent(chatId)}`, { method: 'PATCH', body: JSON.stringify({ lorebookIds: bookIds }), signal: ctrl.signal })
    const model = get().modelFor(chatId)
    // the POST can hang after the phone suspends the page (the engine still
    // commits the reply): a watcher that sees the commit ends the wait
    const inner = new AbortController()
    ctrl.signal.addEventListener('abort', () => inner.abort(), { once: true })
    const post = j<Record<string, unknown>>(`/chats/${encodeURIComponent(chatId)}/${op}`, {
      method: 'POST',
      // the model's context window and max output budget the prompt (engine plugin limitsOf)
      body: JSON.stringify({ ...body, ...(model ? { model } : {}), ...modelLimits(model, get().models, get().modelParams) }),
      signal: inner.signal,
    })
    let stopWatch = () => {}
    const landedLate = new Promise<typeof LANDED>((resolve, reject) => {
      stopWatch = watchForCommit(
        chatId,
        commitBaseline(chat, get().streaming?.chatId === chatId ? get().streaming!.messageId : null),
        () => resolve(LANDED),
        () => reject(new Error('The reply was lost on the way: the server finished without saving one. Try again.')),
      )
    })
    let res: Record<string, unknown> | typeof LANDED
    try {
      res = await Promise.race([post, landedLate])
    } catch (e) {
      // the watcher gave up on a run that ended without a reply: drop the hung request
      post.catch(() => {})
      inner.abort()
      throw e
    } finally {
      stopWatch()
      landedLate.catch(() => {})
    }
    if (res === LANDED) {
      post.catch(() => {}) // the abandoned request rejects on abort
      inner.abort()
      res = {}
    }
    // Fast local models can beat the fetch: if the runtime answered with the
    // pending marker (shouldn't normally escape), poll once for the commit.
    if (res && res.__llmPending === true) {
      await new Promise((r) => setTimeout(r, 600))
    }
    committedRes = res
    await refreshChat(set, get, chatId)
    committed = true
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      stoppedRuns.add(chatId)
      return false // stopped by the user
    }
    toast.error(String((e as Error).message ?? e))
    await refreshChat(set, get, chatId)
  } finally {
    activeGens.delete(chatId)
    const st = get().streaming
    if (st?.chatId === chatId) {
      // a staged reply commits under a server id: carry the row's reasoning
      // open/closed state across so a box the user closed mid-stream stays
      // closed, and drop the now-dead staging key
      const prefs = get().thinkOpen[st.messageId]
      if (prefs && st.messageId.startsWith('pending-')) {
        const landed = get().chats.find((c) => c.id === chatId)?.messages.at(-1)
        set((s) => {
          const next = { ...s.thinkOpen }
          delete next[st.messageId]
          if (landed && landed.role === 'assistant') next[landed.id] = prefs
          return { thinkOpen: next }
        })
      }
      set({ streaming: null })
    }
    // automation hooks fire only after the streaming lock is released
    if (committed) get().runAutoExecutes('onAi', chatId)
    if (committed) void noticeInsertTrim(chatId, resolveLanguage(get().settings.language))
    if (committed) void checkSoulProposals(chatId)
    // pictures the reply asked for through the drawing tool
    if (committed && op !== 'continue') {
      const replied = get().chats.find((c) => c.id === chatId)?.messages.filter((m) => m.role === 'assistant' && !m.picture).at(-1)
      const asks = (replied?.swipes[replied.activeSwipe]?.tools ?? [])
        .filter((t) => t.name === 'generate_image' && !t.isError && typeof t.args.prompt === 'string')
        .map((t) => String(t.args.prompt))
      if (asks.length) void drawRequested(get, chatId, asks)
    }
    // the rest of a group turn: each queued member answers in order; Stop
    // (or a failed reply) ends the turn
    const queue = Array.isArray(committedRes?.queue) ? (committedRes.queue as unknown[]).filter((x): x is string => typeof x === 'string') : []
    // the dashboard reads the newest reply once the turn is over (not between group members)
    if (committed && queue.length === 0) void triggerDashUpdate(chatId, op, () => get().streaming?.chatId === chatId)
    if (committed && queue.length) {
      void (async () => {
        for (const charId of queue) {
          if (get().streaming?.chatId === chatId || !get().chats.some((c) => c.id === chatId)) return
          const ok = await runGeneration(set, get, chatId, 'next', { charId })
          if (!ok) return
        }
      })()
    }
    // auto-translate: incoming (AI replies) / both translate the
    // newest message inline once it has committed
    if (committed) {
      const mode = get().settings.translation.autoMode
      if (mode === 'responses' || mode === 'both') {
        const chat = get().chats.find((c) => c.id === chatId)
        const last = chat?.messages[chat.messages.length - 1]
        if (last && last.role === 'assistant' && !last.translation) {
          void (async () => {
            try {
              const r = await j<{ text: string }>('/translate', {
                method: 'POST',
                body: JSON.stringify({ text: last.swipes[last.activeSwipe]?.content ?? '', target: get().settings.translation.targetLanguage, provider: get().settings.translation.provider, deeplKey: get().settings.translation.deeplKey }),
              })
              get().setMessageTranslation(chatId, last.id, r.text)
            } catch { /* silent — auto features never nag */ }
          })()
        }
      }
    }
  }
  return committed
}

/** Draw what a reply asked for with its drawing tool and post each picture. */
async function drawRequested(get: GetFn, chatId: ID, prompts: string[]) {
  const ig = get().settings.imageGen
  if (!ig?.enabled) {
    toast.error('The character tried to draw a picture', { description: 'Turn on Tools → Image Generation to see it.' })
    return
  }
  for (const prompt of prompts) {
    const t = toast.loading('Drawing…')
    try {
      const img = await generateImage({
        prompt: buildImagePrompt(ig, prompt),
        negativePrompt: ig.negativePrompt,
        model: ig.model || undefined,
      })
      await get().postPicture(chatId, img)
      toast.dismiss(t)
    } catch (e) {
      toast.error('Could not draw the picture', { id: t, description: String((e as Error).message ?? e) })
    }
  }
}

// helper selectors
export const useChat = (chatId: ID | null) => useApp((s) => s.chats.find((c) => c.id === chatId) ?? null)
/** Optimistic write-through. The UI has already moved by the time the request
 *  goes out, so a rejected write leaves the screen and the disk disagreeing,
 *  and the user only finds out on the next reload, as lost work. Say it
 *  instead. `what` names the thing that did not save. */
/** A shortcut set to run itself on an event can name a command auto-execute
 *  can't run (UI-only ones like /help, or a typo). Silently skipping it looks
 *  identical to a shortcut that ran and did nothing, so say it — once per
 *  command per session, since these fire on every chat change. */
const warnedShortcuts = new Set<string>()
function warnUnrunnableShortcut(label: string, command: string): void {
  const key = command.split(/\s/)[0] ?? command
  if (warnedShortcuts.has(key)) return
  warnedShortcuts.add(key)
  toast.error(`Shortcut "${label}" can't auto-run ${key}`, {
    description: 'Auto-execute runs /continue, /impersonate, /regenerate, /swipe, or plain text.',
  })
}

/** `base`, or "base 2", "base 3"… the first one no name in `taken` has (case-blind). */
export function uniqueName(base: string, taken: readonly string[]): string {
  const have = new Set(taken.map((n) => n.trim().toLowerCase()))
  if (!have.has(base.toLowerCase())) return base
  for (let i = 2; ; i++) if (!have.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`
}

function writeThrough(what: string, req: Promise<unknown>): void {
  void req.catch((e: unknown) => {
    toast.error(`Could not save ${what}`, { description: e instanceof Error ? e.message : String(e) })
  })
}

export const useCharacter = (charId: ID | null) => useApp((s) => s.characters.find((c) => c.id === charId) ?? null)

// ── library write-through ────────────────────────────────────────────────────
// The local collections (quick replies, themes, tags, folders, backgrounds,
// data bank, achievements) persist to data/library.json so agents can read
// and edit EVERYTHING in one file next to settings.json. One subscription
// catches every mutation path; hydrate overwrites are no-ops (same data in,
// same data out).
const LIB_KEYS = ['qrSets', 'themes', 'backgrounds', 'tags', 'folders', 'connectionProfiles'] as const
const libraryJson = (): string =>
  JSON.stringify(Object.fromEntries(LIB_KEYS.map((k) => [k, useApp.getState()[k]])))
/** Last library content known to be on disk. Hydrate REPLACES collection
 *  references every run, so a reference-based listener would see a phantom
 *  "change" per hydrate → PUT → look_changed → hydrate → … an infinite
 *  refresh loop. Content comparison breaks the cycle: identical data never
 *  writes. */
let libraryOnDisk: string | null = null
let libraryTimer: ReturnType<typeof setTimeout> | undefined
useApp.subscribe((s, prev) => {
  if (!LIB_KEYS.some((k) => s[k] !== prev[k])) return
  clearTimeout(libraryTimer)
  libraryTimer = setTimeout(() => {
    const next = libraryJson()
    if (next === libraryOnDisk) return // hydrate echo — nothing to write
    libraryOnDisk = next
    writeThrough('your collections', j('/library', { method: 'PUT', body: next }))
  }, 500)
})

/**
 * Once per workspace (0.9.2): the old connection profiles (library.json) become the engine's quick
 * switch, appended after what is already starred, under their names. Needs an engine with favourites
 * and an official install (the route is for trusted apps); otherwise it tries again next start.
 */
async function moveProfilesToFavorites(get: () => AppState, set: (p: Partial<AppState>) => void): Promise<void> {
  const st = get()
  if (st.settings.profilesMovedToFavorites || !st.connectionProfiles.length) return
  const have = new Set(st.favorites.map((f) => f.ref))
  const add: ModelFavorite[] = []
  for (const p of st.connectionProfiles) {
    const m = st.models.find((x) => x.ref === p.modelId || x.id === p.modelId)
    const ref = m?.ref ?? (p.modelId.includes('/') ? p.modelId : null)
    if (!ref || have.has(ref)) continue
    have.add(ref)
    add.push({ ref, ...(p.name ? { name: p.name } : {}) })
  }
  try {
    if (add.length) {
      const r = await fetch('/v1/models/favorites', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: [...st.favorites, ...add] }),
      })
      if (!r.ok) return
      const body = (await r.json()) as { favorites?: ModelFavorite[] }
      set({ favorites: body.favorites ?? [...st.favorites, ...add] })
    }
    get().updateSettings({ profilesMovedToFavorites: true })
  } catch {
    // an older engine: the profiles stay where they are
  }
}
