# ARCHITECTURE.md — Roleplay Studio (Detailed Map)

## 1. File Map

### 1.1 Root Files

| File | Purpose |
|------|---------|
| `manifest.json` | App metadata, plugins list |
| `package.json` | Dependencies |
| `index.html` | Entry point |

### 1.2 Plugins (`plugins/`)

| Plugin | File | Purpose |
|--------|------|---------|
| **engine** | `plugins/engine/plugin.js` | Core backend: all CRUD, generation (LLM), world info, local memory, history compaction, translation. Two-phase model: Pass A → `{__llmPending: true}`, Pass B → result |
| **studio-import** | `plugins/studio-import/plugin.js` | Import character cards (PNG v2/v3 + JSON), world info, presets, regex, personas, themes, chats; ZIP export/import |
| **relations** | `plugins/relations/plugin.js` | Relationship dashboard: a sensor model reports events, code turns them into per-character stats, mood, clock and notebook, saved as one snapshot per chat message in `data/dashboard/state/<chatId>.json`. Routes `/dashboard/*` |
| **tools** | `plugins/tools/plugin.js` | Model tools during generation: dice rolls, image drawing, toy control; definitions in `data/tools/*.json` |

### 1.3 Data (`data/`)

| Directory | Format | Purpose |
|-----------|--------|---------|
| `characters/<id>/card.json` | JSON (chara_card_v2 + `studio` bag) | Character card: name, description, system, scenario, greeting, avatar, expressions, gallery |
| `personas/<id>.json` | JSON | Player persona: name, avatar, `binding`, `lorebookIds` |
| `presets/<id>.json` | JSON | Preset: prompt sections, samplers, `utilityPrompts`, compact history |
| `lorebooks/<id>.json` | JSON | Lorebook: global entries + `linkedCharacterIds`, scan settings |
| `regex/<id>.json` | JSON | Replace scripts: `findRegex`, `replaceString`, `placements`, `scope` |
| `groups/<id>.json` | JSON | Group chats: `memberIds`, `mode`, `mutedIds` |
| `dashboard/state/<chatId>.json` | JSON | Relationship dashboard state per chat: snapshots by `<msgId>#<swipe>`, notebook, names, history (written by the `relations` plugin) |
| `chats/<id>.jsonl` | JSONL | Messages: flat list with `swipes[]` (reply variants) |
| `chats/<id>.meta.json` | JSON | Metadata: `title`, `characterId`, `groupId`, `presetId`, `personaId`, `authorNote`, `lorebookIds`, `summary`, `memoryCutoffMessageId` |
| `chats/<id>.memories.json` | JSON | Long-term memory: array of `{id, text, importance, pinned, at}` |
| `databank/<id>.json` | JSON | RAG documents: `chunks[]` with `text`, `i`. Term-density retrieval. Used in `assemble()` for prompt injection |
| `settings.json` | JSON | Settings: `model`, `personaId`, `ui` |
| `library.json` | JSON | Local collections: `qrSets`, `themes`, `backgrounds`, `tags`, `folders`, `connectionProfiles` |

### 1.4 Frontend (`src/`)

| File/Directory | Purpose |
|----------------|---------|
| `src/main.tsx` | React entry point |
| `src/lib/engine.ts` | Engine bridge: API calls (`j()`), WebSocket (`connectStreams`), adapters for cards/messages/presets/lorebooks/Regex ↔ UI types |
| `src/lib/store.ts` | Main Zustand store: all UI state, actions (`sendMessage`, `regenerate`, `compactChat`...), generation via `runGeneration` |
| `src/lib/types.ts` | TypeScript interfaces: `Character`, `Chat`, `Message`, `Swipe`, `Preset`, `Lorebook`, `LoreEntry`, `Persona`, `AppSettings`... |
| `src/lib/seed.ts` | Defaults: themes, default preset, settings |
| `src/components/` | React components: `chat/`, `character/`, `views/`, `settings/`, `ui/` |
| `src/hooks/` | Hooks: `useMobile`, others |

---

## 2. Data Formats

### 2.1 Character (`Character`)

```typescript
interface Character {
  id: string
  name: string
  avatar: string
  altAvatars: string[]
  description: string
  personality: string
  scenario: string
  firstMessage: string
  altGreetings: string[]
  groupGreetings: string[]
  exampleDialogue: string
  systemPromptOverride: string
  postHistoryInstructions: string
  depthPrompt: { text: string; depth: number; role: 'system'|'user'|'assistant' }
  creatorNotes: string
  creator: string
  version: string
  tags: string[]
  favorite: boolean
  folderId: string | null
  createdAt: number
  lastChatAt: number
  embeddedLorebookId: string | null
  linkedLorebookIds: string[]
  colors: { name: string; dialogue: string; bubble: string }
  stats: CharacterStat[]
  isGroup: boolean
  members?: string[]
  descVariants: AltVariant[]
  personalityVariants: AltVariant[]
  scenarioVariants: AltVariant[]
  versions: CharacterVersion[]
  voiceProvider: string
  voiceId: string
  cardExtras?: Record<string, unknown>
  gallery: { id: string; url: string; type: 'image'|'video'; caption: string }[]
  expressions: { name: string; url: string | null }[]
  defaultExpression: string
  characterRegexIds: string[]
  css: string
}
```

**File on disk:** `data/characters/<id>/card.json` — full chara_card_v2 format + `studio` bag.

### 2.2 Chat (`Chat`)

```typescript
interface Chat {
  id: string
  characterId: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
  branches: ChatBranch[]
  parentChatId: string | null
  parentMessageId: string | null
  personaId: string | null
  presetId: string | null
  authorNote: {
    text: string
    position: 'before-system' | 'after-system' | 'in-chat'
    depth: number
    role: 'system' | 'user' | 'assistant'
    frequency: number
    includeInWIScan: boolean
  }
  memoryCutoffMessageId: string | null
  summary: string
  compactions: number
  temporary: boolean
  folderId: string | null
  chatTags: string[]
  backgroundId: string | 'none' | null
  fieldVariantSelection: { desc?: string; personality?: string; scenario?: string }
  groupSettings?: {
    activation: 'natural' | 'list' | 'manual'
    generationMode?: 'swap' | 'append'
    autoMode: boolean
    autoDelaySec: number
    allowSelfResponses: boolean
    muted: string[]
  }
}
```

### 2.3 Message (`Message`)

```typescript
interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  characterId: string | null
  swipes: Swipe[]
  activeSwipe: number
  timestamp: number
  edited: boolean
  hidden: boolean
  bookmarked: boolean
  bookmarkLabel?: string
  translation?: string
  authorName?: string
  personaId?: string
  attachments?: { id: string; name: string; type: string; url?: string }[]
  picture?: boolean
}

interface Swipe {
  id: string
  content: string
  reasoning?: string
  reasoningTime?: number
  model: string
  genTimeMs: number
  timestamp: number
  usage?: { input: number; output: number; cacheRead?: number; cacheWrite?: number; costTotal?: number }
  params?: Record<string, unknown>
  tools?: { name: string; args: Record<string, unknown>; resultText: string; isError: boolean }[]
  parts?: ToolPart[]
}
```

**File on disk:** `data/chats/<id>.jsonl` — each line one message, `data/chats/<id>.meta.json` — metadata.

### 2.4 Lorebook (`Lorebook`)

```typescript
interface Lorebook {
  id: string
  name: string
  folderId: string | null
  globalActive: boolean
  linkedCharacterIds: string[]
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
  isEmbedded: boolean
  formatTemplate: string
}
```

### 2.5 Memory (`MemoryEntry`)

```typescript
interface MemoryEntry {
  id: string
  text: string
  importance: number         // 1-5
  pinned: boolean
  at: number
}
```

**File on disk:** `data/chats/<id>.memories.json`

---

## 3. How the Plugin Calls the Model

### 3.1 Two-phase Model (Two-phase Contract)

1. **Pass A**: Route returns `{ __llmPending: true, stash: { ... } }` and calls `host.llm.request(key, reqBody)`.
2. **Pass B**: Engine executes LLM request and re-invokes plugin with `host.llm.results[key]` populated. Plugin commits result to chat.

### 3.2 Main Generation Routes

| Route | Description |
|--------|-------------|
| `POST /chats/:id/send` | Send message as user → AI responds |
| `POST /chats/:id/swipe` | Switch reply variants (or generate new if none) |
| `POST /chats/:id/continue` | Continue last AI reply |
| `POST /chats/:id/next` | In group chat — force specific character to respond |
| `POST /chats/:id/impersonate` | Draft user's reply |
| `POST /chats/:id/image-prompt` | Generate description for image |

### 3.3 Swipe — Reply Variants

**Swipe** is a variant of an AI reply. Each message can have multiple swipes, stored in `Message.swipes[]`. The UI shows one active swipe at a time (`activeSwipe` index).

1. **First reply** (`POST /chats/:id/send`): Model generates reply. Stored as `swipes[0]` with metadata (`model`, `usage`, `genMs`, `reasoning`, `tools`, `parts`).
2. **Swipe navigation** (`POST /chats/:id/swipe`): User clicks left/right chevrons to switch between variants:
   - If variant already exists → switch `activeSwipe` index
   - If beyond last swipe → generate NEW variant (same history, different model output)
3. **Swipe storage** (`data/chats/<id>.jsonl`):
   ```json
   {
     "id": "msg_123",
     "role": "char",
     "text": "Hello!",
     "swipes": ["Hello!", "Hi there!", "Hey!"],
     "swipe": 0,
     "extra": {
       "model": "gpt-4",
       "usage": { "input": 100, "output": 20 },
       "genMs": 1500,
       "swipeMeta": [
         { "model": "gpt-4", "usage": { ... }, "genMs": 1500 },
         { "model": "gpt-4", "usage": { ... }, "genMs": 1400 },
         null
       ]
     }
   }
   ```
4. **Swipe generation** (in `plugin.js`):
   - Route `POST /chats/:id/swipe` with `dir: 1` (next) or `-1` (previous)
   - If `next >= swipes.length`: call `assemble()` with `gen: "swipe"`
   - New reply appended to `swipes[]`, `activeSwipe` moves to it
5. **Client-side** (`store.ts`):
   - `setSwipe(chatId, messageId, index)` — switches locally (optimistic), then commits to engine
   - `addSwipe(chatId)` — calls `regenerate()` to make a new variant
   - `deleteSwipe(chatId, messageId, swipeIndex)` — removes a variant

**Key behaviors:**
- **Pristine chat** (no user messages yet): Swiping past end wraps around and cycles greetings
- **Regenerate** (`/regen` or swipe right on last message): Equivalent to `addSwipe` — generates new variant of latest reply
- **Macros** (`{{user}}`, `{{char}}`) expanded ONLY on active swipe. Variants stored raw so they can be re-expanded with fresh values later
- **Per-swipe metadata** in `extra.swipeMeta[]` — aligned with `swipes[]`, `null` for cancelled generations

### 3.4 Assemble — Prompt Building

The `assemble()` function builds the full prompt:
- System prompt (main, character, scenario)
- World info (activated lorebook entries)
- Chat history
- Preset (sections, samplers)
- Memory (long-term facts)
- Data bank (RAG)
- Summary (compacted history)
- Author's note

### 3.5 WebSocket Streaming

Client connects via `connectStreams()`:
- `onDelta` — text tokens in real time
- `onThinking` — chain of thought (reasoning)
- `onTool` — tool call

### 3.6 Data Bank — Document Retrieval (RAG)

The **Data Bank** is a lightweight RAG system. Documents are stored as text files, split into overlapping chunks, and retrieved by term density against the query.

**File structure** (`data/databank/<id>.json`):
```typescript
interface DataBankFile {
  id: string
  name: string
  scope: 'global' | 'character' | 'chat'
  scopeTargetId: string | null
  enabled: boolean
  addedAt: number
  size: number
  chunks: { i: number; text: string }[]
}
```

**Chunking:** Default chunk size 1000 chars, overlap 150 chars.

**How `searchDatabank()` works:**
1. Tokenize query into terms (3+ chars, stopwords filtered out internally)
2. For each enabled file, scan each chunk
3. Count term occurrences in chunk
4. Score: `score = (hits * 1000) / chunk_length`
5. Filter: minimum score threshold = 2.0
6. Rank by score desc, return top N (default 3)

**Where used:**
1. **In `assemble()`** — injects top 3 chunks into prompt as system message (scans last 4 messages + pending user text)
2. **`/databank/search` route** — returns top 8 chunks for UI preview

**API Routes:**
| Route | Method | Description |
|-------|--------|-------------|
| `/databank` | GET | List all files |
| `/databank` | POST | Upload new file |
| `/databank/search` | GET | Search (`?q=query`) |
| `/databank/:id` | PATCH | Update |
| `/databank/:id` | DELETE | Delete |

**Extending Data Bank:**
| Enhancement | Where to Add |
|-------------|--------------|
| Semantic search | Use `vectorized` lorebook mode (embeddings) |
| Per-scope filtering | Add scope filter in `searchDatabank()` |
| Larger chunks | Modify `chunkText()` parameters |
| Better ranking | Add BM25 or hybrid scoring |

---

## 4. Where Chat History is Stored

History is stored **on the engine side** (server-backed), not in the browser:

| File | What's Stored |
|------|--------------|
| `data/chats/<id>.jsonl` | All messages (JSONL, one object = one line) |
| `data/chats/<id>.meta.json` | Chat metadata: title, character/group id, preset/persona id, author note, lorebookIds, summary, cutoff, etc. |
| `data/chats/<id>.memories.json` | Long-term facts (Memory vault) |

**Client loads history via API:**
- On startup: `fetchBootstrap(chatId?)` returns all metadata + messages of active chat
- On chat open: `ensureChatMessages(chatId)` — separate request
- Messages stored in `store.chats[id].messages` (Zustand)

---

## 5. Where to Add New Features

### 5.1 Character Memory

| Component | What to Do |
|-----------|-----------|
| `src/lib/types.ts` | Add `CharacterMemory` to `Character`: `memories: CharacterMemoryEntry[]` |
| `src/lib/engine.ts` | Adapter `characterToCard` / `cardToCharacter` — serialize to `studio` bag |
| `plugins/engine/plugin.js` | In `assemble()`: include character memory in prompt alongside `card.description` |
| `src/components/character/` | UI: memory editor in character card |
| `data/characters/<id>/card.json` | Storage (already has `studio` bag) |

**Alternative:** Store in separate file `data/characters/<id>/memories.json` — then need CRUD routes.

### 5.2 Enhanced Lorebook

| Feature | Where to Add |
|---------|--------------|
| Nested categories | `LoreEntry.group` → `group: { name: string, subgroups: string[] }` |
| Event triggers | `entry.triggerOn: { send?: boolean; swipe?: boolean; continue?: boolean; ... }` |
| Variables in keys | In `keyMatch()` support `{{var}}` — already has `expandMacros` |
| Category UI editor | `src/components/views/lorebooks-view.tsx` |

### 5.3 Trackers (Quest/Relationship Trackers)

| Component | What to Do |
|-----------|-----------|
| `src/lib/types.ts` | New type: `Tracker`, `TrackerEntry` |
| `data/trackers/<id>.json` | Tracker file: bound to chat or character |
| `plugins/engine/plugin.js` | CRUD routes: `GET/POST/PATCH/DELETE /trackers`; inject in `assemble()` |
| `src/components/chat/memory-panel.tsx` | UI: trackers panel (or new component) |
| `src/lib/store.ts` | Actions: `addTracker`, `updateTracker`, `deleteTracker` |

**Tracker structure:**
```typescript
interface Tracker {
  id: string
  name: string
  type: 'quest' | 'relationship' | 'inventory' | 'custom'
  scope: 'chat' | 'character' | 'global'
  scopeTargetId: string | null
  entries: TrackerEntry[]
}

interface TrackerEntry {
  id: string
  label: string
  status: 'active' | 'completed' | 'failed' | 'hidden'
  progress?: number
  notes: string
}
```

### 5.4 Chat Variables

Already partially implemented (`chatVars` in chat metadata). Can extend:

| What to Add | Where |
|-------------|-------|
| UI variable editor | `src/components/chat/chat-view.tsx` |
| Conditional logic in sections | `src/lib/types.ts` → `PromptSection.condition` (already exists) |
| Global variables (cross-chat) | New file `data/vars/global.json` |

### 5.5 Character Rules

| Where to Add |
|--------------|
| `Character.rules: string[]` |
| `plugins/engine/plugin.js` → `assemble()`: include in prompt after system prompt |
| `src/components/character/character-editor.tsx`: rules editor |

### 5.6 MCP Server Integration

| Component | Role |
|-----------|------|
| `src/lib/store.ts` | `fetchAppMcp()`, `setAppMcpUse()` — already exists |
| `src/components/extensions/mcp-tab.tsx` | UI: MCP management |
| `plugins/engine/plugin.js` | Pass tools in `wantsTools` during generation |

### 5.7 Generation Improvements

| Feature | Where to Add |
|---------|--------------|
| Compact prompts | `plugins/engine/plugin.js` — new parameter `compactPrompt: boolean` in preset |
| Multimodality | `plugins/engine/plugin.js` → `assemble()`: add images to messages (already partially exists via `attachments`) |
| Real-time token info | `src/components/chat/chat-view.tsx` — display tokens during streaming |

---

## 6. Key Engine Functions (plugin.js)

- **`assemble()`** — central prompt building function
- **`activateWorldInfo()`** — lorebook entry activation
- **`recallMemories()`** — long-term memory retrieval
- **`loadMemories()` / `saveMemories()`** — memory file operations
- **`searchDatabank()`** — RAG search across documents
- **`runGeneration()`** (in `store.ts`) — client-side generation driver
- **`connectStreams()`** (in `engine.ts`) — WebSocket for streaming

---

## 7. Summary: Intervention Points

| Feature | Frontend | Backend | Data |
|---------|----------|---------|------|
| Character memory | `src/lib/types.ts`, `src/components/character/` | `plugin.js: assemble()` | `card.json` (studio bag) |
| Lorebook | `src/components/views/lorebooks-view.tsx` | `plugin.js: activateWorldInfo()` | `lorebooks/<id>.json` |
| Trackers | `src/components/chat/`, `store.ts` | New CRUD route | `trackers/<id>.json` |
| Character rules | `character-editor.tsx` | `plugin.js: assemble()` | `card.json: studio.rules` |
| Chat variables | `store.ts` | `plugin.js: assemble()`, macros `{{setvar}}` | `chats/<id>.meta.json: chatVars` |
| MCP | `mcp-tab.tsx`, `store.ts` | Pass tools | — |
| Summary/compaction | `store.ts: compactChat()` | `plugin.js: compact` routes | `chats/<id>.meta.json` |

Icons: only @phosphor-icons/react. Its names differ from lucide (e.g. Scroll, not ScrollText). Check the name exists before importing.