// Local defaults for the studio's client-side slices (theme palettes,
// sampler defaults). Server-backed data starts EMPTY apart from the shipped
// template: a fresh workspace carries the stock preset, the default persona,
// and the example bot — nothing else.
import { detectLanguage } from './i18n.js'
import type { ThemePreset, SamplerSettings, AppSettings, Preset, PromptSection, SectionMarker, PromptFormatSequences } from './types.js'

/** Every generation type a preset section can be limited to. */
export const GENERATION_TYPES = ['normal', 'continue', 'impersonate', 'swipe', 'regenerate', 'quiet'] as const

const now = Date.now()

// ── Samplers default ──
export function defaultSamplers(): SamplerSettings {
  const v = (value: number, enabled = true) => ({ value, enabled })
  return {
    temperature: v(0.85), top_p: v(0.95), top_k: v(40, false), min_p: v(0.05),
    rep_pen: v(1.08), freq_pen: v(0.1), pres_pen: v(0.05),
    maxTokens: 512, contextSize: 8192, contextUnlocked: false, seed: -1,
    stopStrings: ['\\n{{user}}:', '</s>'], logitBias: [],
    reasoning: { enabled: true, effort: 'med', budget: 2048, autoParse: true, display: 'collapsed', thinkTagOpen: '<think>', thinkTagClose: '</think>' },
    streaming: true, streamingSpeed: 30, assistantPrefill: '',
  }
}

// ── Default preset ──
// The main prompt is a REGULAR editable entry that ships with text — there is
// no hidden engine-side default behind an empty box. Utility prompts ship
// their working defaults too, except the empty-send replacement which stays
// blank (an empty box sends nothing at all).
export const DEFAULT_MAIN_PROMPT =
  "Write {{char}}'s next reply in a fictional roleplay chat between {{char}} and {{user}}. Stay in character, describe actions and atmosphere, and never speak or act for {{user}}."

/** Compact-history defaults: turns labeled by a bold speaker tag, the whole
 *  chat sent as one assistant message, generation stopped when the model
 *  starts the user's next turn. */
export const DEFAULT_COMPACT_HISTORY: Preset['compactHistory'] = {
  enabled: false,
  role: 'assistant',
  separator: 'double',
  userPrefix: '**{{user}}:** ',
  userSuffix: '',
  charPrefix: '',
  charSuffix: '',
  stopString: '**{{user}}:**',
}

/** The starting point of a custom text completion format. */
export const EMPTY_PROMPT_FORMAT: PromptFormatSequences = {
  systemPrefix: '',
  systemSuffix: '',
  userPrefix: '',
  userSuffix: '',
  assistantPrefix: '',
  assistantSuffix: '',
  systemAsUser: false,
}

export const DEFAULT_UTILITY_PROMPTS: Preset['utilityPrompts'] = {
  impersonation: "Write the next reply from {{user}}'s point of view, using the chat history as a style guide. Do not write as any character. Output only {{user}}'s message.",
  continueNudge: '[Continue your last message without repeating its original content.]',
  newChat: '[Start a new chat]',
  groupNudge: '[Write the next reply only as {{name}}]',
  emptySend: '',
}

export function buildDefaultPreset(): Preset {
  // marker ids are the CANONICAL engine identifiers — the engine matches
  // markers by identifier ("chatHistory", "worldInfoBefore", …)
  const CANONICAL: Record<Exclude<SectionMarker, null>, string> = {
    main: 'main', nsfw: 'nsfw', jailbreak: 'postHistory', charDescription: 'charDescription',
    personality: 'charPersonality', scenario: 'scenario', persona: 'personaDescription',
    exampleDialogue: 'dialogueExamples', chatHistory: 'chatHistory', wiBefore: 'worldInfoBefore',
    wiAfter: 'worldInfoAfter', summary: 'summary', depthPrompt: 'depthPrompt',
  }
  const markerSection = (marker: SectionMarker, name: string, content = ''): PromptSection => ({
    id: CANONICAL[marker as Exclude<SectionMarker, null>],
    name,
    enabled: true,
    role: 'system',
    marker,
    content,
    position: 'relative',
    depth: 4,
    order: 0,
    injectionTriggers: [...GENERATION_TYPES],
    forbidOverrides: false,
    groupId: null,
  })
  const sections: PromptSection[] = [
    { ...markerSection('main', 'Main Prompt', DEFAULT_MAIN_PROMPT) },
    { ...markerSection('wiBefore', 'World info before'), order: 1 },
    { ...markerSection('charDescription', 'Character description'), order: 2 },
    { ...markerSection('personality', 'Personality'), order: 3 },
    { ...markerSection('scenario', 'Scenario'), order: 4 },
    { ...markerSection('persona', 'Persona description'), order: 5 },
    { ...markerSection('wiAfter', 'World info after'), order: 6 },
    { ...markerSection('exampleDialogue', 'Example dialogue'), order: 7 },
    { ...markerSection('chatHistory', 'Chat history'), order: 8 },
    { ...markerSection('jailbreak', 'Post-history instructions'), order: 9 },
  ].map((s, i) => ({ ...s, order: i }))
  return {
    id: 'default',
    name: 'Default',
    // the stock preset is a clean baseline — duplicate it to make changes
    readOnly: true,
    isDefault: true,
    folderId: null,
    picture: null,
    sections,
    library: [],
    groups: [],
    variables: [],
    utilityPrompts: { ...DEFAULT_UTILITY_PROMPTS },
    samplers: defaultSamplers(),
    namesBehavior: 'default',
    verbosity: 'auto',
    continuePrefill: true,
    squashSystemMessages: false,
    compactHistory: { ...DEFAULT_COMPACT_HISTORY, enabled: false },
    promptPostProcessing: { enabled: false, mode: 'none' },
    promptFormat: { use: 'connection', custom: { ...EMPTY_PROMPT_FORMAT } },
    createdAt: now,
  }
}

// ── Quick replies ──
// No seeds: shortcut sets are user-authored (Shortcuts view or the composer's
// shortcuts toggle); a fresh workspace starts with none.

// ── Connections & models ──
// No seed catalog: models come from the engine's real connections.

// ── Extensions ──

// ── Themes & backgrounds ──
export const seedThemes: ThemePreset[] = [
  // Vertep — the default. Near-black blue ground, warm linen text, red accent
  // (active nav, borders, "new") and a cyan second accent (`cta`) for the
  // primary action button and the active nav icon. Dark only.
  { id: 'theme_vertep', name: 'Vertep', builtin: true, colors: { mainText: '#f0e9dc', italics: '#a9b1c4', quotes: '#538796', shadow: '#000000', chatBg: '#07080b', uiBg: '#0b0c11', borders: '#2a2f3d', userTint: '#12141c', charTint: '#0b0c11', accent: '#e2213a', cta: '#39d5ff' } },
  // Pure neutral-grey ramp — true greys only, one green accent.
  // Base sits at rgb(20,20,20) so the app reads properly dark, properly.
  // Quoted dialogue rides the same green accent; Daylight keeps its darker
  // blue because the accent green does not hold contrast on a white page.
  { id: 'theme_void', name: 'Void', builtin: true, colors: { mainText: '#e4e4e4', italics: '#8f8f8f', quotes: '#54d17d', shadow: '#000000', chatBg: '#0b0b0b', uiBg: '#101010', borders: '#212121', userTint: '#171717', charTint: '#101010', accent: '#54d17d' } },
  { id: 'theme_charcoal', name: 'Charcoal', builtin: true, colors: { mainText: '#e6e6e6', italics: '#9d9d9d', quotes: '#54d17d', shadow: '#000000', chatBg: '#141414', uiBg: '#191919', borders: '#2b2b2b', userTint: '#202020', charTint: '#191919', accent: '#54d17d' } },
  { id: 'theme_daylight', name: 'Daylight', builtin: true, colors: { mainText: '#161616', italics: '#6b6b6b', quotes: '#1f6fb5', shadow: '#d4d4d4', chatBg: '#fafafa', uiBg: '#ffffff', borders: '#e0e0e0', userTint: '#f1f1f2', charTint: '#ffffff', accent: '#2eaf5a' } },
  { id: 'theme_ash', name: 'Ash', builtin: false, colors: { mainText: '#e8e6e3', italics: '#a09c96', quotes: '#d8a657', shadow: '#000000', chatBg: '#161514', uiBg: '#1c1b1a', borders: '#2f2d2b', userTint: '#232120', charTint: '#1c1b1a', accent: '#c98a3f' } },
  // Neon Tokyo Night — deep indigo night, cyan dialogue, pink neon accents.
  // Heading colors ride alongside: pink H1, cyan H2, violet H3.
  { id: 'theme_neon_tokyo', name: 'Neon Tokyo Night', builtin: false, colors: { mainText: '#e8e8f5', italics: '#8b8bb0', quotes: '#22d3ee', shadow: '#000000', chatBg: '#0a0a18', uiBg: '#101024', borders: '#2a2a4a', userTint: '#1a1a35', charTint: '#101024', accent: '#ff2e88', heading1: '#ff2e88', heading2: '#22d3ee', heading3: '#a78bfa' } },
]

/** Built-in themes shipped after an install's library.json was written are
 *  missing from it (the library, once on disk, replaces the seed). Prepend the
 *  absent built-ins in seed order so they show up; a theme already there —
 *  edited or not — is left exactly as it is. */
export function withBuiltinThemes(themes: ThemePreset[]): ThemePreset[] {
  const have = new Set(themes.map((t) => t.id))
  const missing = seedThemes.filter((t) => t.builtin && !have.has(t.id))
  return missing.length ? [...missing, ...themes] : themes
}

// No seeded backgrounds — the picker shows None + whatever the user uploads.

// ── Data bank / memory / achievements ──
// No seeds: the data bank starts EMPTY (uploads register real files), and
// achievements are DERIVED from real usage in home-view (no fake unlocks).

// ── Default settings ──
export function defaultSettings(): AppSettings {
  return {
    themeMode: 'dark', activeThemeId: 'theme_vertep', displayMode: 'bubbles',
    chatWidth: 'comfortable', chatWidthCustom: 760, fontScale: 100, lineSpacing: 180, paragraphSpacing: 14, proseFont: 'noto-serif', lookVersion: 2, uiScale: 100,
    avatarScale: 100, streamingFps: 30,
    avatarShape: 'rounded', avatarStyle: 'thumb', messageSpacing: 'roomy', hideAvatars: false,
    showTimestamps: true, showMessageIds: false, showEdited: false, showTokens: true, showCost: true, reasoningAutoExpand: false, italicNarration: false, showModelIcons: true, showGenTimer: true, showExpressionSprites: true, showCache: true,
    expandMessageActions: false, reducedMotion: false,
    autoScroll: true, confirmDeletions: true, dayDividers: true, messageTint: true, swipeCountAllMessages: false,
    sendOnEnter: true, upArrowEditLast: true, messagesToLoad: 50,
    quoteStyle: 'default', quoteColor: '', italicsColor: '', language: detectLanguage(), customCss: '', activeBackgroundId: null, backgroundOpacity: 18,
    charSubheader: 'creator',
    tts: { provider: 'None', narratorVoice: 'aria', autoPlay: false, speed: 1, onlyQuotes: true, skipAsterisks: true, skipCodeblocks: true, charVoices: {}, model: 'tts-1', engineProvider: 'edge' },
    translation: { provider: 'llm', targetLanguage: 'Spanish', internalLanguage: 'English', autoMode: 'none' },
    summary: {
      mode: 'auto', interval: 40, keepRecent: 6, targetLength: 300, prompt: '', // '' = the engine's shipped summary prompt (see fetchSummaryPromptDefault)
      template: '[Story so far: {{summary}}]', position: 'after-system', depth: 2, role: 'system',
    },
    memory: { enabled: true, auto: false, interval: 20, model: '' },
  }
}
