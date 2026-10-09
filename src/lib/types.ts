// ─── Core domain types for the roleplay chat frontend (server-backed via lib/engine.ts) ───

export type ID = string

// ── Characters ──
export interface CharacterStat {
  id: ID
  name: string
  initial: number
  max: number
  color: string
}

export interface CharacterVersion {
  id: ID
  label: string
  savedAt: number
  snapshot: Partial<Character>
}

export interface AltVariant {
  id: ID
  label: string
  content: string
}

export interface Character {
  id: ID
  name: string
  avatar: string
  altAvatars: string[]
  description: string
  personality: string
  scenario: string
  firstMessage: string
  altGreetings: string[]
  /** Group-only greetings (card v3): when a group chat starts, a member
   *  carrying these opens with one of them instead of not greeting. */
  groupGreetings: string[]
  exampleDialogue: string
  systemPromptOverride: string
  postHistoryInstructions: string
  depthPrompt: { text: string; depth: number; role: 'system' | 'user' | 'assistant' }
  creatorNotes: string
  creator: string
  version: string
  tags: string[]
  favorite: boolean
  folderId: ID | null
  createdAt: number
  lastChatAt: number
  embeddedLorebookId: ID | null
  linkedLorebookIds: ID[]
  colors: { name: string; dialogue: string; bubble: string }
  stats: CharacterStat[]
  isGroup: boolean
  members?: ID[] // for groups
  descVariants: AltVariant[]
  personalityVariants: AltVariant[]
  scenarioVariants: AltVariant[]
  versions: CharacterVersion[]
  voiceProvider: string
  voiceId: string
  /** Unknown card-spec fields preserved from import (v3 extras like
   *  nickname/assets/group_only_greetings, plus the spec extensions bag) —
   *  written back on save so round-trips never destroy card data. */
  cardExtras?: Record<string, unknown>
  gallery: { id: ID; url: string; type: 'image' | 'video'; caption: string }[]
  expressions: { name: string; url: string | null }[]
  defaultExpression: string
  characterRegexIds: ID[]
  /** Per-character CSS, applied only while one of this character's chats is open. */
  css: string
}

export interface Tag {
  id: ID
  name: string
  color: string
  textColor: string
  visible: boolean
  asFolder: boolean
  order: number
}

export interface Folder {
  id: ID
  name: string
  color: string
  scope: 'characters' | 'personas' | 'presets' | 'lorebooks' | 'chats' | 'backgrounds' | 'connections'
}

// ── Chats & messages ──
/** One interleaved generation segment in true arrival order: thinking, text,
 *  or a tool call with its result. Messages that used tools render these
 *  top-to-bottom, exactly as the model produced them. */
export type ToolPart =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string; ms?: number }
  | { type: 'tool'; name: string; args: Record<string, unknown>; resultText: string; isError: boolean }

export interface Swipe {
  id: ID
  content: string
  reasoning?: string
  reasoningTime?: number
  model: string
  genTimeMs: number
  timestamp: number
  /** REAL usage from the engine for generated swipes (tokens + cost) */
  usage?: { input: number; output: number; cacheRead?: number; cacheWrite?: number; costTotal?: number }
  /** sampler snapshot taken at generation time (temperature, max_tokens, …) */
  params?: Record<string, unknown>
  /** tool calls the model made while generating this swipe */
  tools?: { name: string; args: Record<string, unknown>; resultText: string; isError: boolean }[]
  /** interleaved text/tool segments (set when tools were used mid-reply) */
  parts?: ToolPart[]
}

export interface Message {
  id: ID
  role: 'user' | 'assistant' | 'system'
  characterId: ID | null // which member spoke (groups) or null for user/persona
  swipes: Swipe[]
  activeSwipe: number
  timestamp: number
  edited: boolean
  hidden: boolean // hide-from-AI ghost
  bookmarked: boolean
  bookmarkLabel?: string
  /** Inline translation shown under the original text. */
  translation?: string
  /** Author display name as stored on the engine message — user messages keep
   *  the persona name they were sent under (chats can mix personas). */
  authorName?: string
  /** The persona a user message was sent as; its avatar follows that persona
   *  even after the chat switches to another one. */
  personaId?: ID
  /** Legacy flag kept so old localStorage payloads and imports still parse. */
  isOOC?: boolean
  attachments?: { id: ID; name: string; type: string; url?: string }[]
  showTranslation?: boolean
  /** A generated picture posted into the chat: its attachment name is the
   *  prompt that drew it, and it stays out of the model's prompt. */
  picture?: boolean
}

export interface ChatBranch {
  id: ID
  name: string
  parentMessageId: ID
  createdAt: number
  messageCount: number
}

export interface Chat {
  id: ID
  characterId: ID
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
  branches: ChatBranch[]
  parentChatId: ID | null
  parentMessageId: ID | null
  personaId: ID | null
  presetId: ID | null
  authorNote: {
    text: string
    position: 'before-system' | 'after-system' | 'in-chat'
    depth: number
    role: 'system' | 'user' | 'assistant'
    frequency: number
    includeInWIScan: boolean
  }
  litopysCut?: { count: number; upTo: string | null }
  temporary: boolean
  folderId: ID | null
  chatTags: string[]
  backgroundId: ID | 'none' | null
  fieldVariantSelection: { desc?: ID; personality?: ID; scenario?: ID }
  /** From the chat list meta: what a chat shows BEFORE its transcript loads.
   *  `messages` is empty until the chat is opened, so lists read these two
   *  rather than the transcript. */
  preview?: string
  messageCount?: number
  /** did the user ever speak here? From the meta, so it is known without
   *  loading the transcript (the boot sweep and Home both need it). */
  hasUser?: boolean
  groupSettings?: {
    activation: 'natural' | 'list' | 'manual'
    generationMode?: 'swap' | 'append' // swap = individual character turns, append = merged card
    autoMode: boolean
    autoDelaySec: number
    allowSelfResponses: boolean
    muted: ID[]
  }
}

// ── Personas ──
export interface Persona {
  id: ID
  name: string
  avatar: string
  title: string
  description: string
  pronouns: string
  lorebookIds: ID[]
  isDefault: boolean
  folderId: ID | null
  binding: 'default' | 'character' | 'chat'
  boundCharacterIds: ID[]
  autoLock: boolean
  createdAt: number
}

// ── Presets / prompt manager ──
export type SectionMarker =
  | 'main' | 'nsfw' | 'jailbreak' | 'charDescription' | 'personality' | 'scenario'
  | 'persona' | 'exampleDialogue' | 'chatHistory' | 'wiBefore' | 'wiAfter' | 'summary' | 'depthPrompt' | null

export interface PromptSection {
  id: ID
  name: string
  enabled: boolean
  role: 'system' | 'user' | 'assistant'
  marker: SectionMarker
  content: string
  position: 'relative' | 'in-chat'
  depth: number
  order: number
  injectionTriggers: string[] // normal|continue|impersonate|swipe|regenerate|quiet
  forbidOverrides: boolean
  groupId: ID | null
  /**
   * Only render when a chat variable matches: "varName" (set and non-empty),
   * "varName==value", "varName!=value". Blank = always render.
   */
  condition?: string | null
}

export interface SectionGroup {
  id: ID
  name: string
  wrapFormat: 'xml' | 'markdown' | 'none'
}

export interface PromptVariable {
  id: ID
  name: string
  label: string
  type: 'text' | 'number' | 'slider' | 'dropdown' | 'toggle' | 'multi'
  options?: string[]
  min?: number
  max?: number
  defaultValue: string
}

export interface SamplerSettings {
  temperature: { value: number; enabled: boolean }
  top_p: { value: number; enabled: boolean }
  top_k: { value: number; enabled: boolean }
  min_p: { value: number; enabled: boolean }
  rep_pen: { value: number; enabled: boolean }
  freq_pen: { value: number; enabled: boolean }
  pres_pen: { value: number; enabled: boolean }
  maxTokens: number
  contextSize: number
  contextUnlocked: boolean
  seed: number
  stopStrings: string[]
  logitBias: { token: string; bias: number }[]
  reasoning: { enabled: boolean; effort: 'off' | 'min' | 'low' | 'med' | 'high' | 'max'; budget: number; autoParse: boolean; display: 'collapsed' | 'expanded' | 'hidden'; thinkTagOpen: string; thinkTagClose: string }
  streaming: boolean
  streamingSpeed: number
  /** Sent as a trailing assistant turn — the reply starts with this text.
   *  An assistant-role prompt section placed last in the chain does the same. */
  assistantPrefill: string
}

export interface Preset {
  id: ID
  name: string
  readOnly: boolean
  isDefault: boolean
  folderId: ID | null
  picture: string | null
  sections: PromptSection[]
  /**
   * Prompt library: sections the user removed from the
   * active order but chose not to delete — one click adds them back.
   * Optional so presets created before the field keep working.
   */
  library?: PromptSection[]
  groups: SectionGroup[]
  variables: PromptVariable[]
  utilityPrompts: { impersonation: string; continueNudge: string; newChat: string; groupNudge: string; emptySend: string }
  samplers: SamplerSettings
  /** 0.9.2: the engine sends the MODEL's parameters (Settings > connections) and this preset's
   *  samplers only fill what the model leaves unset; on, this preset's samplers win instead. */
  samplersOverrideModel?: boolean
  /**
   * How character names are injected into the prompt (the
   * "Character Names Behavior"):
   *  - none:       never prepend a name
   *  - default:    prepend only in groups / when a forced avatar is used
   *  - content:    always prefix the message content with "Name: "
   *  - completion: send the name in the API's `name` field, not the content
   */
  namesBehavior: 'none' | 'default' | 'content' | 'completion'
  /** Verbosity hint passed to models that support it. */
  verbosity: 'auto' | 'low' | 'medium' | 'high'
  /**
   * Continue Prefill: on a continue, resend the partial reply as an
   * assistant prefill instead of appending a "continue" nudge turn. ON by
   * default.
   */
  continuePrefill: boolean
  /** Compact system messages: squash consecutive system parts into one
   *  message at assembly (fewer, denser system blocks). */
  squashSystemMessages: boolean
  /**
   * Compact chat history: the whole visible chat is sent as ONE message of
   * the chosen role instead of alternating turns. Each turn is wrapped in a
   * per-role prefix/suffix so the model can still tell speakers apart, and
   * an optional stop string halts the model when it starts the user's next
   * turn. \n in the text fields is a real newline.
   */
  compactHistory: {
    enabled: boolean
    role: 'system' | 'user' | 'assistant'
    separator: 'space' | 'newline' | 'double'
    userPrefix: string
    userSuffix: string
    charPrefix: string
    charSuffix: string
    stopString: string
  }
  /**
   * Prompt Post-Processing: a structural transform of the assembled message
   * list right before sending, for endpoints that mishandle repeated roles.
   * No model, no rewrite — structure only.
   */
  promptPostProcessing: {
    enabled: boolean
    mode: 'none' | 'merge' | 'semi' | 'strict' | 'single'
  }
  /**
   * Text completion connections only: the instruct format the chat is
   * written in. `use` is "connection" (the connection's own setting),
   * "auto" (match the loaded model), an engine format id, or "custom".
   */
  promptFormat: { use: string; custom: PromptFormatSequences }
  /** Extra generation parameters imported from outside presets or added by
   *  hand in the samplers tab (the textgen sweep: dry/xtc/dynatemp/mirostat/
   *  smoothing/typical/… plus negative_prompt and the bool toggles). They
   *  ride the engine preset top-level and only enter the request body when
   *  the endpoint understands them. */
  extendedSamplers?: Record<string, number | string | boolean>
  createdAt: number
}

// ── Lorebooks / world info ──
export type EntryStatus = 'constant' | 'normal' | 'vectorized'
export type EntryLogic = 'AND_ANY' | 'AND_ALL' | 'NOT_ANY' | 'NOT_ALL'
export type EntryPosition = 'before_char' | 'after_char' | 'before_em' | 'after_em' | 'before_an' | 'after_an' | 'at_depth' | 'before_examples' | 'after_examples'

export interface LoreEntry {
  id: ID
  title: string
  memo: string
  keys: string[]
  keysRegex: boolean
  secondaryKeys: string[]
  logic: EntryLogic
  status: EntryStatus
  content: string
  position: EntryPosition
  depth: number
  role: 'system' | 'user' | 'assistant'
  order: number
  probability: number
  useProbability: boolean
  group: string
  groupWeight: number
  groupPrioritize: boolean
  sticky: number
  cooldown: number
  delay: number
  enabled: boolean
  characterFilter: ID[]
  characterFilterExclude: boolean
  tagFilter: string[]
  triggerFilters: string[]
  nonRecursable: boolean
  preventFurtherRecursion: boolean
  delayUntilRecursion: boolean
  /** Include this entry even when the WI budget is exhausted */
  ignoreBudget: boolean
  scanDepthOverride: number | null
  caseSensitiveOverride: boolean | null
  wholeWordsOverride: boolean | null
  groupScoringOverride: boolean | null
  automationId: string
  matchSources: { description: boolean; personality: boolean; scenario: boolean; persona: boolean }
}

export interface Lorebook {
  id: ID
  name: string
  folderId: ID | null
  globalActive: boolean
  linkedCharacterIds: ID[]
  entries: LoreEntry[]
  settings: {
    scanDepth: number
    contextPercent: number
    budgetCap: number
    minActivations: number
    maxRecursion: number
    insertionStrategy: 'evenly' | 'character_first' | 'global_first'
    caseSensitive: boolean
    wholeWords: boolean
    groupScoring: boolean
    recursiveScan: boolean
    includeNames: boolean
    overflowAlert: boolean
  }
  vectorized: { embedding: string; queryMessages: number; scoreThreshold: number; topK: number }
  isEmbedded: boolean // embedded in a character card
  /**
   * Per-book wrapper applied to every activated entry before insertion —
   * World-info "Format Template". `{{original}}` marks where the
   * entry's own content goes. Empty string means "insert content unwrapped".
   */
  formatTemplate: string
}

// ── Quick replies ──
export interface QuickReply {
  id: ID
  label: string
  message: string
  color: string
  mode: 'send' | 'insert'
  autoExecute: { onStartup: boolean; onUser: boolean; onAi: boolean; onChatChange: boolean }
}

export interface QuickReplySet {
  id: ID
  name: string
  scope: 'global' | 'chat' | 'character'
  characterId?: ID
  replies: QuickReply[]
  enabled: boolean
}

// ── Regex ──
export interface RegexScript {
  id: ID
  name: string
  scope: 'global' | 'character' | 'chat' | 'preset'
  scopeTargetId: ID | null
  find: string
  replace: string
  flags: string
  /** WHERE it applies: which text the script sees */
  placements: { userInput: boolean; aiOutput: boolean; slash: boolean; wi: boolean; reasoning: boolean }
  /** WHEN: with neither flag the saved message text is rewritten; markdownOnly
   *  changes only what is shown, promptOnly only what the model reads */
  markdownOnly: boolean
  promptOnly: boolean
  minDepth: number | null
  maxDepth: number | null
  trimStrings: string[]
  runOnEdit: boolean
  macroMode: 'none' | 'raw' | 'escaped'
  enabled: boolean
  order: number
}

// ── Connections ──
export interface Connection {
  id: ID
  name: string
  provider: string
  url: string
  keySet: boolean
  model: string
  isDefault: boolean
  folderId: ID | null
}

/** An instruct format's turn markers. A newline after a role header is part
 *  of its prefix. */
export interface PromptFormatSequences {
  systemPrefix: string
  systemSuffix: string
  userPrefix: string
  userSuffix: string
  assistantPrefix: string
  assistantSuffix: string
  /** No system role: later system messages are written as user turns. */
  systemAsUser: boolean
}

export interface ModelInfo {
  id: string
  provider: string
  /** Wire protocol; "openai-text" is a text completion model. */
  api: string
  /** Unambiguous engine ref ("<provider>/<model id>") — the same model name
   *  can exist under several providers, so selection ALWAYS uses this. */
  ref: string
  context: number
  maxOut: number
  reasoning: boolean
  /** USD per million tokens, as the engine reports them (the user's own price
   *  table first, then the catalog). null when nobody knows this model's
   *  rates — spend for it is unknown, not free. */
  pricing: ModelPricing | null
}

export interface ModelPricing {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

// ── Extensions ──
export interface Extension {
  id: ID
  name: string
  version: string
  author: string
  description: string
  enabled: boolean
  permissions: { name: string; granted: boolean }[]
  hasUpdate: boolean
}

// ── Themes / appearance ──
export interface ThemePreset {
  id: ID
  name: string
  builtin: boolean
  colors: {
    mainText: string; italics: string; quotes: string; shadow: string
    chatBg: string; uiBg: string; borders: string
    userTint: string; charTint: string; accent: string
    /** Optional second accent for the primary action button and the active
     *  nav icon. Absent = the accent (every theme written before it keeps working). */
    cta?: string
    /** Optional per-level heading colors (H1/H2/H3). Absent = inherit. */
    heading1?: string; heading2?: string; heading3?: string
  }
}

export interface BackgroundItem {
  id: ID
  name: string
  url: string
  type: 'image' | 'video'
  folderId: ID | null
  fitting: 'cover' | 'contain' | 'stretch'
}

// ── Memory / data bank ──
export interface DataBankFile {
  id: ID
  name: string
  scope: 'global' | 'character' | 'chat'
  scopeTargetId: ID | null
  /** ready = chunked + searchable on the engine side */
  status: 'ready'
  size: number
  chunks: number
  enabled: boolean
  addedAt?: number
}

/** Named (connection, model) pair for one-click switching. Lives in the
 *  app library (library.json) so agents can edit it on disk. */
export interface ConnectionProfile {
  id: ID
  name: string
  /** provider name exactly as the engine model catalog surfaces it */
  provider: string
  modelId: string
}

// ── Settings ──
export interface AppSettings {
  /** 0.9.2: the active preset's samplers were moved into the current model once (model-params.ts). */
  modelParamsMigrated?: boolean
  themeMode: 'dark' | 'light'
  activeThemeId: ID
  /** Kept for old saves: every value renders the same look now (see lookVersion). */
  displayMode: 'bubbles' | 'flat' | 'minimal' | 'document'
  /** Which chat-look defaults the saved settings were last moved to. Absent = 1;
   *  2 = the stage look (Noto Serif, line height 1.8, 14px paragraph gap). */
  lookVersion?: number
  chatWidth: 'full' | 'comfortable' | 'compact' | 'custom'
  chatWidthCustom: number
  fontScale: number
  /** Chat prose leading, in percent of the font size. 136 is what `normal`
   *  computes to for the default face, so it is the untouched look. */
  lineSpacing: number
  /** Gap below each paragraph of chat prose, in px. */
  paragraphSpacing: number
  /** Chat prose font — 'system' (regular text) is the default; Inter/Georgia/
   *  JetBrains Mono/Verdana/Times are the built-in alternatives. */
  proseFont: 'noto-serif' | 'noto' | 'system' | 'inter' | 'georgia' | 'jetbrains' | 'verdana' | 'times'
  uiScale: number
  avatarScale: number
  streamingFps: number
  /** 'rect' = tall rounded-rectangle portrait crop; the rest are corner
   *  radii on a square crop. */
  avatarShape: 'circle' | 'square' | 'rounded' | 'rect'
  /** Portrait avatars (tall rectangle) vs square/round thumbnails. */
  avatarStyle: 'thumb' | 'portrait'
  /** Vertical breathing room between messages: roomy, or tight power-user. */
  messageSpacing: 'compact' | 'cozy' | 'roomy'
  hideAvatars: boolean
  showTimestamps: boolean
  showMessageIds: boolean
  /** "edited" tag on messages that were edited — off by default */
  showEdited: boolean
  showTokens: boolean
  /** chat-header spend badge — users who'd rather not see money hide it */
  showCost: boolean
  /** live reasoning auto-expands while the model thinks (off = start closed) */
  reasoningAutoExpand: boolean
  /** AI narration renders italic + grey, quoted dialogue stays upright */
  italicNarration: boolean
  showModelIcons: boolean
  showGenTimer: boolean
  /** cached-read token note riding the message stats line */
  showCache: boolean
  expandMessageActions: boolean
  /** floating expression sprite for the latest speaker (when they have sprites) */
  showExpressionSprites: boolean
  reducedMotion: boolean
  autoScroll: boolean
  confirmDeletions: boolean
  dayDividers: boolean
  messageTint: boolean
  swipeCountAllMessages: boolean
  sendOnEnter: boolean
  upArrowEditLast: boolean
  messagesToLoad: number
  quoteStyle: 'default' | 'bold' | 'glow' | 'underline'
  /** Overrides the active theme's quote color. Empty string = follow the theme. */
  quoteColor: string
  /** Overrides the active theme's italics/narration color. Empty = follow theme. */
  italicsColor: string
  /** Interface language for the nav labels and page titles: 'en' | 'uk'.
   *  Anything else (older builds wrote 'English') follows the browser. */
  language: string
  customCss: string
  activeBackgroundId: ID | null
  backgroundOpacity: number
  charSubheader: 'version' | 'creator'
  /** TTS. provider 'None' | 'System (Web Speech)' (browser voices) |
   *  'Engine' → engine POST /v1/audio/speech (OpenAI-compatible speech
   *  endpoint resolved from the engine's connections; creds never leave). */
  tts: { provider: string; narratorVoice: string; autoPlay: boolean; speed: number; onlyQuotes: boolean; skipAsterisks: boolean; skipCodeblocks: boolean; charVoices: Record<ID, string>; model: string; /** 'edge' (free neural voices) or a speech endpoint id */ engineProvider: string }
  /** Translation. provider 'llm' (any engine model) | 'google' | 'lingva' |
   *  'deepl' (keyed). The DeepL key is APP-LEVEL config by design: the user
   *  types it into the app's own settings, so it lives in data/settings.json
   *  and app backups, unlike engine credentials which stay in the vault. */
  translation: { provider: 'llm' | 'google' | 'lingva' | 'deepl'; targetLanguage: string; /** the language the model receives when auto-translating inputs */ internalLanguage: string; autoMode: 'none' | 'responses' | 'inputs' | 'both'; deeplKey?: string }
  /** Image generation via the engine's pi-ai images bridge (POST /v1/images). */
  imageGen?: { enabled: boolean; model: string; promptPrefix: string; negativePrompt: string; interactive: boolean; saveToGallery?: boolean }
}


export interface Achievement {
  id: ID
  name: string
  description: string
  icon: string
  unlocked: boolean
}
