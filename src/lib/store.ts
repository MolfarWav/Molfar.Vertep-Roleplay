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
import { persist } from 'zustand/middleware'
import { toast } from 'sonner'
import type {
  Character, Chat, Message, Persona, Preset, Lorebook, QuickReplySet, RegexScript,
  Connection, Extension, ThemePreset, BackgroundItem, Tag, Folder, AppSettings,
  ConnectionProfile, DataBankFile, ID, ModelInfo, ChatBranch, ToolPart,
} from './types'
import {
  seedThemes, defaultSettings, withBuiltinThemes,
  buildDefaultPreset, DEFAULT_MAIN_PROMPT, DEFAULT_UTILITY_PROMPTS,
} from './seed'
import { uid } from './tokens'
import { DEFAULT_AVATAR } from './utils'
import {
  j, fetchModels, fetchEngineConnections, fetchBootstrap, connectStreams, ApiError, reloadWithReason,
  cardToCharacter, characterToCard, groupToCharacter,
  engineChatToUI, chatPatchOf,
  type EngineChatMeta, type EngineMessage, type EngineConnectionInfo,
  enginePersonaToUI, presetToEngine, enginePresetToUI,
  lorebookToEngine, engineLorebookToUI, regexToEngine, engineRegexToUI,
} from './engine'
import { MOBILE_BREAKPOINT } from '@/hooks/use-mobile'
import { buildImagePrompt, generateImage, postPicture, type GeneratedImage } from './image-gen'
import { presetImport, regexImport } from './import-shapes'

export type ViewKey =
  | 'home' | 'chats' | 'characters' | 'marketplace' | 'personas' | 'presets' | 'lorebooks'
  | 'quickreplies' | 'extensions' | 'connections' | 'settings' | 'chat'

/** Sections that can be a drawer (see opensAsDrawer). Home and the chat
 *  surfaces are always pages. */
export const DRAWER_VIEWS = new Set<ViewKey>([
  'characters', 'marketplace', 'personas', 'presets', 'lorebooks', 'quickreplies', 'extensions', 'connections', 'settings',
])

const isDesktopViewport = () =>
  typeof window !== 'undefined' && window.matchMedia(`(min-width: ${MOBILE_BREAKPOINT}px)`).matches

/** Sections slide over the page on desktop (Home, Chats or a chat stays put
 *  underneath), and over an open chat on phones; any other phone page is
 *  replaced by the section. */
const opensAsDrawer = (page: ViewKey) => isDesktopViewport() || page === 'chat'

export type BootState = 'loading' | 'ready' | 'error'

/** Books the engine should scan for a chat: every global book plus the ones
 *  linked to the speaking character (studio semantics — engine honors
 *  meta.lorebookIds as the scope). */
function scopeBookIds(books: Lorebook[], chat: Chat | undefined, characters: Character[]): string[] {
  if (!chat) return []
  const ids = new Set(books.filter((b) => b.globalActive).map((b) => b.id))
  const char = characters.find((c) => c.id === chat.characterId)
  if (char?.embeddedLorebookId) ids.add(char.embeddedLorebookId)
  for (const lid of char?.linkedLorebookIds ?? []) ids.add(lid)
  return [...ids]
}

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
  focusPersonaId: ID | null
  /** set by Home's Branches button: the chat view opens that chat's branch tree and clears it */
  branchTreeFor: ID | null
  openBranchTree: (chatId: ID) => void
  selectedSettingsSection: string
  streaming: { chatId: ID; messageId: ID; full: string; shown: number; startedAt: number; thinking?: string; thinkingT0?: number; thinkingMs?: number; marks?: Array<{ kind: 'tool'; at: number; name: string; args: Record<string, unknown>; done?: boolean; resultText?: string; isError?: boolean } | { kind: 'think'; at: number; text: string; t0: number; ms?: number }> } | null
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
  composerDraft: string | null
  deleteMode: boolean
  /** /help reference dialog (commands + macros) */
  helpOpen: boolean
  setHelpOpen: (v: boolean) => void
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
  focusPreset: (presetId: ID) => void
  focusPersona: (personaId: ID) => void
  setSettingsSection: (s: string) => void
  updateSettings: (patch: Partial<AppSettings>) => void
  // chat actions
  sendMessage: (chatId: ID, content: string, opts?: { attachments?: Message['attachments'] }) => void
  stopStreaming: () => void
  tickStream: () => void
  regenerate: (chatId: ID, messageId?: ID) => void
  setComposerDraft: (text: string | null) => void
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
  newChat: (charId: ID, greetingIndex?: number) => Promise<ID>
  startChatAndOpen: (charId: ID, greetingIndex?: number) => Promise<void>
  createGroup: (name: string, memberIds: ID[]) => Promise<ID>
  convertToGroup: (chatId: ID, addMemberIds: ID[]) => Promise<void>
  reorderGroupMember: (groupId: ID, memberId: ID, dir: -1 | 1) => void
  triggerMember: (chatId: ID, memberId: ID) => void
  deleteChat: (chatId: ID) => void
  pushInputHistory: (s: string) => void
  /** Fire quick replies whose auto-execute flag matches the event (real hooks). */
  runAutoExecutes: (event: 'onStartup' | 'onUser' | 'onAi' | 'onChatChange', chatId?: ID | null) => void
  /** Fold the next stretch of the chat into its summary and move the cutoff
   *  (keeps the newest turns, or everything from `upTo` on). `redo` rewrites
   *  the latest summary over the same messages. */
  compactChat: (chatId: ID, opts?: { redo?: boolean; upTo?: ID }) => Promise<{ summary: string; covered: number }>
  /** Restore the summary and cutoff from before the latest compaction. */
  undoCompaction: (chatId: ID) => Promise<void>
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
  deleteCharacter: (id: ID) => void
  /** Make a card playable as the user: name, description and avatar move to a
   *  persona ({{char}}/{{user}} trade places). Null when a same-name persona
   *  exists and the caller has not confirmed with { overwrite: true }. */
  convertCharacterToPersona: (id: ID, opts?: { overwrite?: boolean }) => ID | null
  updatePersona: (id: ID, patch: Partial<Persona>) => void
  usePersona: (id: ID) => void
  usePreset: (id: ID) => void
  addPersona: (init?: Partial<Persona> & { id?: ID }) => ID
  duplicatePersona: (id: ID) => ID
  deletePersona: (id: ID) => void
  updatePreset: (id: ID, patch: Partial<Preset>) => void
  duplicatePreset: (id: ID) => ID
  deletePreset: (id: ID) => void
  updateLorebook: (id: ID, patch: Partial<Lorebook>) => void
  addLorebook: () => ID
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
  uploadDataBankFile: (name: string, content: string, scope?: DataBankFile['scope']) => Promise<void>
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
      engineConnections: [],
      model: null,
      ...localSeed(),
      view: 'home',
      drawer: null,
      activeChatId: null,
      activeCharacterId: null,
      focusPresetId: null,
      focusPersonaId: null,
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
      composerDraft: null,
      deleteMode: false,
      helpOpen: false,

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
          const [boot, models, engineConnections] = await Promise.all([
            // the chat about to be shown rides along, so the first paint needs
            // no follow-up fetch
            fetchBootstrap(get().activeChatId),
            fetchModels(),
            fetchEngineConnections(),
          ])
          const settings = boot.settings
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
          // group settings hydrate from the group entity so activation, mutes,
          // card mode, self responses and auto delay survive reloads (a group
          // chat's characterId IS the group id)
          const groupCfgById = new Map(boot.groups.map((g) => [String(g.id ?? ''), g]))
          for (const c of withBranches) {
            const g = groupCfgById.get(c.characterId)
            if (!g) continue
            c.groupSettings = {
              activation: g.mode ?? 'natural',
              generationMode: g.generationMode ?? 'swap',
              autoMode: g.autoMode ?? false,
              autoDelaySec: g.autoDelaySec ?? 5,
              allowSelfResponses: g.allowSelfResponses ?? false,
              muted: g.mutedIds ?? [],
            }
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
            models, engineConnections, model: settings.model, dataBank: databankRes.files ?? [],
            boot: 'ready', hydrated: true, bootError: null,
            // engine-side UI settings (agent-editable, data/settings.json `ui`)
          })
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
          // memory vault config: older builds shipped a chunking stub that
          // never ran — replace it wholesale with the vault defaults
          if (typeof get().settings.memory?.enabled !== 'boolean') {
            set({ settings: { ...get().settings, memory: { enabled: true, auto: false, interval: 20, model: '' } } })
          }
          // summary config normalization. Older builds kept an ordered prompt
          // list; its instruction text carries over as the single prompt when
          // the user had rewritten it, and the retired keys drop off.
          set((s) => {
            const d = defaultSettings().summary
            const legacy = s.settings.summary as Partial<AppSettings['summary']> & {
              prompts?: { marker?: string | null; role?: string; content?: string }[]
              paused?: boolean
              notify?: boolean
            }
            const cur = { ...d, ...legacy }
            if ((cur.mode as string) === 'interval') cur.mode = 'auto'
            if (legacy.paused === true) cur.mode = 'manual'
            if (!cur.template.includes('{{summary}}')) cur.template = d.template
            if (typeof legacy.prompt !== 'string' || !legacy.prompt.trim()) {
              const own = legacy.prompts?.find((x) => !x.marker && x.role === 'system')?.content?.trim()
              cur.prompt = own && !own.startsWith('Summarize the most important facts and events in the story so far.') ? own : d.prompt
            }
            delete (cur as typeof legacy).prompts
            delete (cur as typeof legacy).paused
            delete (cur as typeof legacy).notify
            return { settings: { ...s.settings, summary: cur } }
          })
          // the normalized shape must reach the ENGINE too — assemble() reads
          // settings.json directly (write-back only when it actually changed)
          if (JSON.stringify((settings.ui ?? {}).summary ?? null) !== JSON.stringify(get().settings.summary)) {
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
        } catch (e) {
          const msg = e instanceof ApiError && e.status === 401
            ? 'Session expired, log in again from the Chrysalis client.'
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
      setComposerDraft: (text) => set({ composerDraft: text }),
      openChat: (chatId) => {
        sessionOpenedChats.add(chatId)
        const chat = get().chats.find((c) => c.id === chatId)
        set({ view: 'chat', activeChatId: chatId, activeCharacterId: chat?.characterId ?? null, drawer: null })
        void get().ensureChatMessages(chatId).then(() => get().runAutoExecutes('onChatChange', chatId))
      },
      ensureChatMessages: async (chatId) => {
        const chat = get().chats.find((c) => c.id === chatId)
        if (!chat || chat.messages.length > 0) return
        const seqAtStart = mutateSeq
        try {
          const r = await j<{ meta: EngineChatMeta; messages: EngineMessage[] }>(`/chats/${encodeURIComponent(chatId)}`)
          if (mutateSeq !== seqAtStart) return
          set((s) => ({ chats: s.chats.map((c) => (c.id === chatId ? engineChatToUI(r.meta, r.messages ?? []) : c)) }))
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
      focusPreset: (presetId) => {
        if (opensAsDrawer(get().view)) set({ focusPresetId: presetId, drawer: 'presets' })
        else set({ view: 'presets', focusPresetId: presetId })
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
        if (!chat || get().streaming?.chatId === chatId) return
        const activePreset =
          presets.find((p) => p.id === chat.presetId) ?? presets.find((p) => p.isDefault) ?? presets[0]
        // `send_if_empty`: an empty box is replaced by this
        // text; when the replacement is also blank, NO user turn is added and
        // the model just continues (engine: allowEmpty send).
        const effective = content.trim() || activePreset?.utilityPrompts.emptySend.trim() || ''
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
      },
      stopStreaming: () => {
        flushStreamDeltas?.()
        const st = get().streaming
        if (!st) return
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
                ...(get().model ? { model: get().model } : {}),
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
        set({ streaming: { ...st, shown: Math.min(st.full.length, st.shown + 3) } })
      },
      regenerate: (chatId, messageId) => {
        const chat = get().chats.find((c) => c.id === chatId)
        if (!chat || get().streaming?.chatId === chatId) return
        const lastChar = [...chat.messages].reverse().find((m) => m.role === 'assistant' && !m.picture)
        if (messageId && messageId !== lastChar?.id) {
          toast.error('Only the latest reply can be regenerated: engine prompts are built from the newest turn')
          return
        }
        if (!lastChar) return
        void runGeneration(set, get, chatId, 'swipe', { dir: 1 }, { regenerateInto: lastChar.id })
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
        set({ streaming: { chatId, messageId: '', full: '', shown: 0, startedAt: Date.now() } })
        void (async () => {
          try {
            const r = await j<{ text: string }>(`/chats/${encodeURIComponent(chatId)}/impersonate`, {
              method: 'POST', body: JSON.stringify(get().model ? { model: get().model } : {}),
            })
            set({ composerDraft: r.text, streaming: null })
          } catch (e) {
            set({ streaming: null })
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
        const forked = engineChatToUI(r.meta, r.messages ?? [])
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
        const chat = get().chats.find((c) => c.id === chatId)
        const body = chatPatchOf(patch)
        void (async () => {
          try {
            if (Object.keys(body).length) {
              await j(`/chats/${encodeURIComponent(chatId)}`, { method: 'PATCH', body: JSON.stringify(body) })
            }
            // group settings live on the group entity (activation strategy,
            // mutes, card mode, self responses, auto delay) — PATCH-merge so
            // no read-modify-write window exists
            if (patch.groupSettings && chat) {
              await j(`/groups/${encodeURIComponent(chat.characterId)}`, {
                method: 'PATCH',
                body: JSON.stringify({
                  mode: patch.groupSettings.activation,
                  mutedIds: patch.groupSettings.muted,
                  generationMode: patch.groupSettings.generationMode ?? 'swap',
                  allowSelfResponses: patch.groupSettings.allowSelfResponses ?? false,
                  ...(patch.groupSettings.autoMode != null ? { autoMode: patch.groupSettings.autoMode, autoDelaySec: patch.groupSettings.autoDelaySec ?? 5 } : {}),
                }),
              })
            }
          } catch (e) { toast.error(String((e as Error).message ?? e)) }
        })()
      },
      newChat: async (charId, greetingIndex = 0) => {
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
          }),
        })
        let chat = engineChatToUI(r.meta, r.messages ?? [])
        // greeting picker: rotate the seeded greeting swipes to the chosen one
        if (greetingIndex > 0) {
          const mid = chat.messages[0]?.id
          if (mid) {
            try {
              await j(`/chats/${encodeURIComponent(chat.id)}/messages/${encodeURIComponent(mid)}/swipe`, {
                method: 'POST', body: JSON.stringify({ index: greetingIndex }),
              })
              const fresh = await j<{ meta: EngineChatMeta; messages: EngineMessage[] }>(`/chats/${encodeURIComponent(chat.id)}`)
              chat = engineChatToUI(fresh.meta, fresh.messages ?? [])
            } catch { /* greeting rotation is best-effort */ }
          }
        }
        bumpMutate()
        set((s) => ({ chats: attachBranches([chat, ...s.chats]) }))
        return chat.id
      },
      startChatAndOpen: async (charId, greetingIndex) => {
        try {
          const id = await get().newChat(charId, greetingIndex)
          sessionNewChats.add(id)
          get().openChat(id)
        } catch (e) { toast.error(String((e as Error).message ?? e)) }
      },
      createGroup: async (name, memberIds) => {
        const gid = uid('grp')
        await j(`/groups/${encodeURIComponent(gid)}`, {
          method: 'PUT',
          body: JSON.stringify({ id: gid, name, memberIds, mode: 'natural', mutedIds: [] }),
        })
        const members = get().characters.filter((c) => memberIds.includes(c.id))
        bumpMutate()
        set((s) => ({ characters: [...s.characters, groupToCharacter({ id: gid, name, memberIds, mode: 'natural', mutedIds: [] }, members)] }))
        const chatId = await get().newChat(gid)
        return chatId
      },
      convertToGroup: async (chatId, addMemberIds) => {
        const chat = get().chats.find((c) => c.id === chatId)
        const solo = get().characters.find((c) => c.id === chat?.characterId)
        if (!chat || !solo || solo.isGroup) return
        const memberIds = [solo.id, ...addMemberIds.filter((id) => id !== solo.id)]
        const gid = uid('grp')
        await j(`/groups/${encodeURIComponent(gid)}`, {
          method: 'PUT',
          body: JSON.stringify({ id: gid, name: `${solo.name} & co.`, memberIds, mode: 'natural', mutedIds: [] }),
        })
        await j(`/chats/${encodeURIComponent(chatId)}`, { method: 'PATCH', body: JSON.stringify({ groupId: gid, characterId: null }) })
        const members = get().characters.filter((c) => memberIds.includes(c.id))
        bumpMutate()
        set((s) => ({
          characters: [...s.characters, groupToCharacter({ id: gid, name: `${solo.name} & co.`, memberIds, mode: 'natural', mutedIds: [] }, members)],
          chats: s.chats.map((c) => (c.id === chatId ? { ...c, characterId: gid } : c)),
          activeCharacterId: s.activeCharacterId === solo.id ? gid : s.activeCharacterId,
        }))
        toast.success(`Converted to a group with ${members.map((m) => m.name).join(', ')}`)
      },
      reorderGroupMember: (groupId, memberId, dir) => {
        const g = get().characters.find((c) => c.id === groupId)
        if (!g?.isGroup || !g.members) return
        const idx = g.members.indexOf(memberId)
        const to = idx + dir
        if (idx < 0 || to < 0 || to >= g.members.length) return
        const members = [...g.members]
        const tmp = members[idx]!
        members[idx] = members[to]!
        members[to] = tmp
        bumpMutate()
        set((s) => ({ characters: s.characters.map((c) => (c.id === groupId ? { ...c, members } : c)) }))
        // PATCH-merge just the member order — a GET-then-PUT round trip here
        // used to race the look_changed echo and revert the local update
        void j(`/groups/${encodeURIComponent(groupId)}`, { method: 'PATCH', body: JSON.stringify({ memberIds: members }) })
          .catch(() => void get().hydrate())
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
      compactChat: async (chatId, opts) => {
        const r = await j<{ summary: string; covered: number }>(`/chats/${encodeURIComponent(chatId)}/compact`, {
          method: 'POST',
          body: JSON.stringify({
            keepRecent: get().settings.summary.keepRecent,
            ...(opts?.redo ? { redo: true } : {}),
            ...(opts?.upTo ? { upTo: opts.upTo } : {}),
            ...(get().model ? { model: get().model } : {}),
          }),
        })
        await refreshChat(set, get, chatId)
        return r
      },
      undoCompaction: async (chatId) => {
        await j(`/chats/${encodeURIComponent(chatId)}/compact/undo`, { method: 'POST' })
        await refreshChat(set, get, chatId)
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
        if (c.isGroup) return // group metadata goes through group actions
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
        void j(`/characters/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(characterToCard(c)) })
          .catch((e) => toast.error(String((e as Error).message ?? e)))
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
      deleteCharacter: (id) => {
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
      usePreset: (id) => {
        const { presets, chats, activeChatId } = get()
        const preset = presets.find((x) => x.id === id)
        if (!preset) return
        // same rule as personas: new chats start with it and the open chat
        // swaps to it on the spot (every chat stores its own preset, so the
        // default alone would leave the open one where it was)
        if (!preset.isDefault) get().updatePreset(id, { isDefault: true })
        const chat = activeChatId ? chats.find((c) => c.id === activeChatId) : null
        if (chat && chat.presetId !== id) get().updateChat(chat.id, { presetId: id })
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
      addLorebook: () => {
        bumpMutate()
        const id = uid('book')
        const book: Lorebook = {
          id, name: 'New Lorebook', folderId: null, globalActive: false, linkedCharacterIds: [], entries: [],
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
      uploadDataBankFile: async (name, content, scope = 'global') => {
        bumpMutate()
        const r = await j<{ file: DataBankFile }>('/databank', {
          method: 'POST',
          body: JSON.stringify({ name, content, scope }),
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
      }) as never,
    },
  ),
)

// ── generation driver ────────────────────────────────────────────────────────
/** Chats with an automatic compaction in flight (one at a time per chat). */
const compacting = new Set<ID>()
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

async function refreshChat(set: SetFn, get: GetFn, chatId: ID) {
  const seqAtStart = mutateSeq
  try {
    const r = await j<{ meta: EngineChatMeta; messages: EngineMessage[] }>(`/chats/${encodeURIComponent(chatId)}`)
    if (mutateSeq !== seqAtStart) return // an optimistic mutation is ahead of this snapshot
    set((s) => ({ chats: s.chats.map((c) => (c.id === chatId ? engineChatToUI(r.meta, r.messages ?? []) : c)) }))
  } catch { /* chat may be gone */ }
  void refreshLists(set, get)
}

async function refreshLists(set: SetFn, _get: GetFn) {
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
        return engineChatToUI(m, [])
      })
      const added = s.chats.filter((c) => !metas.chats.some((m) => m.id === c.id))
      return { chats: attachBranches([...merged, ...added]) }
    })
  } catch { /* offline */ }
}

/** branch metadata: forks record parentChatId/parentMessageId on the engine */
function attachBranches(chats: Chat[]): Chat[] {
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
  bumpMutate() // staged bubbles must survive any in-flight hydrate
  set((s) => ({
    streaming: { chatId, messageId: pendingId, full: '', shown: 0, startedAt: Date.now() },
    chats: s.chats.map((c) => (c.id === chatId ? {
      ...c,
      messages: [...c.messages, ...(stageUser ? [stageUser] : []), pendingMsg],
    } : c)),
  }))
  return runStream(set, get, chatId, op, body, ctrl, chat, bookIds)
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
    // keep the engine's chat meta in sync with the UI's lorebook bindings
    if (bookIds.length || (chat.messages.length === 0 && op === 'send')) {
      await j(`/chats/${encodeURIComponent(chatId)}`, { method: 'PATCH', body: JSON.stringify({ lorebookIds: bookIds }), signal: ctrl.signal })
    }
    const model = get().model
    const res = await j<Record<string, unknown>>(`/chats/${encodeURIComponent(chatId)}/${op}`, {
      method: 'POST',
      body: JSON.stringify({ ...body, ...(model ? { model } : {}) }),
      signal: ctrl.signal,
    })
    // Fast local models can beat the fetch: if the runtime answered with the
    // pending marker (shouldn't normally escape), poll once for the commit.
    if (res && res.__llmPending === true) {
      await new Promise((r) => setTimeout(r, 600))
    }
    committedRes = res
    await refreshChat(set, get, chatId)
    committed = true
  } catch (e) {
    if ((e as Error).name === 'AbortError') return false // stopped by the user
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
      // automatic compaction: when this turn's prompt could not hold the
      // whole history, or enough turns sit past the cutoff, fold the older
      // stretch into the summary (undo is one tap away on the toast)
      const scfg = get().settings.summary
      const trimmed = typeof committedRes?.trimmed === 'number' ? committedRes.trimmed : 0
      // (a group turn compacts after its last member has answered)
      if ((op === 'send' || op === 'next') && scfg.mode === 'auto' && !queue.length && !compacting.has(chatId)) {
        const chat = get().chats.find((c) => c.id === chatId)
        if (chat) {
          const cutIdx = chat.memoryCutoffMessageId ? chat.messages.findIndex((m) => m.id === chat.memoryCutoffMessageId) : -1
          const since = chat.messages.slice(Math.max(0, cutIdx)).filter((m) => !m.hidden && m.role !== 'system').length
          if (trimmed > 0 || (scfg.interval > 0 && since >= scfg.interval + scfg.keepRecent)) {
            compacting.add(chatId)
            void get().compactChat(chatId)
              .then((r) => toast.success('Chat compacted', {
                description: `${r.covered} messages folded into the summary`,
                action: { label: 'Undo', onClick: () => { void get().undoCompaction(chatId).catch((e) => toast.error(String((e as Error).message ?? e))) } },
              }))
              .catch((e) => toast.error('Automatic compaction failed', { description: String((e as Error).message ?? e) }))
              .finally(() => compacting.delete(chatId))
          }
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
