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
| **relations** | `plugins/relations/plugin.js` | Relationship dashboard: a sensor model reports events, code turns them into per-character stats, mood, clock and notebook, saved as one snapshot per chat message in `data/dashboard/state/<chatId>.json`. Also rates a card's main characters (a "soul", `docs/SOUL.md`) into proposals in `data/dashboard/soul-drafts/<characterId>.json`. Routes `/dashboard/*`, among them `soul/rate`, `soul-draft`, `guests`, `soul/effects` |
| **profile** | `plugins/profile/plugin.js` | "Structure it" for the Profile tab: one model call (the dashboard's sensor model, else the app's model) splits a card's description and personality into profile fields, filed as a draft in `data/profile-drafts/<characterId>.json`; the app accepts or discards it, the plugin never writes a card. The group editor's Scene tab asks it for a shared scenario (from the cards, or something wild, plus an optional wish) and then openings from that scenario, written by the model of the group's latest chat (else the app's chat model) and filed the same way as `group-<groupId>.json`. Routes `/profile/portrait-prompt` (what a card looks like, one model call, for an image server; the app draws it and keeps the picture), `/profile/structure`, `/profile/fill`, `/profile/group-scene`, `/profile/group-opening`, `/profile/draft` |
| **agents** | `plugins/agents/plugin.js` | Runs custom agents (#127): installs checked `data/agents/<id>.vertep-agent.json` files, keeps the permissions the user confirmed, runs the agents a chat uses after a reply (the checker and executor are a generated copy of `src/canvas-kit/boards/agent-check.js` and `agent-run.js`), keeps each agent's own state per chat, and adds an agent's prompt insert to the next reply through its `llmRequest` hook. Routes `/agents/*`, format in `docs/DATA-FORMATS.md` |
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
| `dashboard/state/<chatId>.json` | JSON | Relationship dashboard state per chat: snapshots by `<msgId>#<swipe>` (the newest 40), a place log `places` by the same keys (up to 2000, it outlives the snapshot cap and feeds the scene list), notebook, names, history (written by the `relations` plugin) |
| `dashboard/notes/<chatId>.json` | JSON | What the user added or changed in a chat's dashboard: own notes (`u<k>`), tags, edits and removals of notes, own threads (`ut<k>`) and thread edits. Written only by `POST /dashboard/notes`, never by an update (written by the `relations` plugin routes) |
| `dashboard/nudge/<chatId>.json` | JSON | One pending "Story, move" nudge `{v, threadId, at}` (`threadId` null = all open threads): added to the end of the next reply request only, never to the chat; removed when used, ignored and removed after 30 minutes (written by the `relations` plugin routes `POST`/`DELETE /dashboard/nudge` and its llmRequest hook) |
| `dashboard/fast/<chatId>.json` | JSON | Fast mode (dashboard mode `fast`): the state report a story reply carried, `{v, entries: {"<msgId>#<swipe>": {body, at, model, closed}}}`. The reply ends with `<vertep_state>{json}</vertep_state>`; the `engine` plugin cuts the tag from the saved text and parts (in every mode, for send, next, swipe, continue and a cancelled save) and, in fast mode only, keeps its `body` here (cut to 16000 characters; `closed` false when the reply was cut off before `</vertep_state>`; at most 20 entries, older than 24 hours dropped on each write). The `relations` update reads the entry of the key it senses, applies it with no sensor call, and removes it; a body it cannot read is removed and the sensor runs as in mode `sensor`; a re-read after an edit or Continue never uses one. Orphan and day-old files are swept by the `relations` tick. The same cut drops a hidden plan, `<vertep_plan>...</vertep_plan>`, that a reply voicing several characters may open with when the Litopys switch `hiddenPlan` (default off) asked for it (#184): from text, parts and reasoning in every mode and with every preset, its body is not kept anywhere; an unclosed plan loses only its opening tag, except in a reply stopped by the user, where it goes to the end |
| `profile-drafts/<characterId>.json` | JSON | A proposed card profile waiting for review (`profile`, `leftover`, `note`, `model`, `at`; written by the `profile` plugin) |
| `profile-drafts/group-<groupId>.json` | JSON | A proposed group scenario or opening waiting for review (`kind`: `scenario` or `opening`, `text`, `mode`, `model`, `at`; written by the `profile` plugin) |
| `dashboard/soul-drafts/<characterId>.json` | JSON | Proposed souls of one card waiting for the user's review (`by` auto or molfar, `note`, `error`, `dismissedAt`, `characters`); see `docs/SOUL.md` (written by the `relations` plugin) |
| `dashboard/config.json` | JSON | Dashboard settings: only what differs from the defaults (sensor model, insert limits, `said`, `journal`, quest limits...). See DATA-FORMATS.md, "Dashboard state" |
| `dashboard/events.json` | JSON | Optional own event vocabulary of the user (changed, new, off rows); removed to go back to the default vocabulary |
| `dashboard/agent/<chatId>.json` | JSON | Ledger of the Dashboard fields custom agents wrote (`before`, `after`, `undone`), so an undo and a re-read keep them (written by the `agents` plugin; DATA-FORMATS.md, "Agents") |
| `dashboard/voices/<chatId>.json` | JSON | Voice colours per chat: `{v, mode, colors, hand}`, one colour per person of the entity registry |
| `dashboard/notice/<chatId>.json` | JSON | The last time the Dashboard insert did not fit the user's limit, so the app shows the notice once |
| `dashboard/rebase/<chatId>.json` | JSON | The state a rebuild on top of an earlier chat replaced, one copy per chat, gone with the chat |
| `dashboard/lexicon.json`, `dashboard/other-seen.json` | JSON | `lexicon`: the user's extra words for the scene scan (or `{"off": true}`). `other-seen`: event ids the sensor made up that nobody could place (DATA-FORMATS.md, "Dashboard state") |
| `registry/<chatId>.json` | JSON | Entity registry: one id per person, thing and place of a chat, with aliases. Written by the `relations` plugin, read by `world`, `litopys` and `agents`. DATA-FORMATS.md, "The entity registry"; `docs/ENTITY-REGISTRY.md` |
| `chats/<id>.jsonl` | JSONL | Messages: flat list with `swipes[]` (reply variants) |
| `chats/<id>.meta.json` | JSON | Metadata: `title`, `characterId`, `groupId`, `presetId`, `personaId`, `authorNote`, `lorebookIds`, `worldBookId`, per-chat switches. The old Memory keys (`summary`, `memoryCutoffMessageId`, `compactions`, `memoryExtractedAt`) are removed by the engine once Litopys holds the chat |
| `chats/<id>.memories.json` | JSON | Legacy, no longer written: the old Memory vault, array of `{id, text, importance, pinned, at}`. The Litopys sweep takes its facts into `litopys/chats/<id>.json` and then deletes the file |
| `databank/<id>.json` | JSON | Data Bank file: `chunks[]` (`i`, `text`, ...), term-density retrieval used in `assemble()`. Also holds snapshot books (`kind: "snapshot"`: a saved story with chapter, arc and fact chunks and who knew them; written by the `litopys` plugin). Shapes: DATA-FORMATS.md, "Snapshot books (#184)" |
| `litopys/chats/<chatId>.json` | JSON | The chat's Litopys record: chapters, arcs, facts (with `knownBy`, `cast`, beliefs and lies), proposals, marked scenes, habits, the scene in progress, counters, the worker's last run, optional per-chat `config`. The heart of story memory (written by the `litopys` plugin). DATA-FORMATS.md, "Who witnessed a scene", "Beliefs", "Scenes set apart by hand" |
| `litopys/vectors/<chatId>.json` | JSON | Embeddings of the chat's chapters and active facts: `{id: {hash, vector, m?}}` (DATA-FORMATS.md, "Litopys config", the Vectors line) |
| `litopys/config.json` | JSON | Litopys settings: only what the user changed (budget, prompts, recollections, `autoEmbed`...). DATA-FORMATS.md, "Litopys config" |
| `litopys/insert/<chatId>.json`, `litopys/trace-ring/<chatId>.json`, `litopys/fired/<chatId>.json` | JSON | What the last reply took from memory: sizes and ids (the memory trace), the traces of the four replies before it, and counters of how often each fact and chapter went in. Written by the Litopys reply hook. DATA-FORMATS.md, "Memory trace", "What fired"; COUPLINGS.md, "Litopys insert file and the memory traces" |
| `litopys/prompt-cut/<chatId>.json` | JSON | `{count, upTo}`: where the engine's last prompt started its word-for-word history; Litopys uses it so chapters cover what left the prompt (written by the `engine` plugin) |
| `litopys/embed-status.json`, `litopys/embed-auto.json`, `litopys/embed-want/<id>.json` | JSON | Embedding bookkeeping: whether embedding works (a failed call pauses for an hour), the last automatic look for gaps, and one request file per chat or Data Bank file waiting for vectors. COUPLINGS.md, "Litopys vectors and the embeddings model" |
| `litopys/wake.json`, `litopys/worker.json` | JSON | Worker bookkeeping: chats asked to be visited next, and the worker's last sign of life |
| `litopys/far/<chatId>.json` | JSON | A small digest of a finished chat for the far tier of a long backstory (its turning points, pinned and key facts, one line per arc). Dropped whenever that chat's record is saved, made again on the next read (#288) |
| `litopys/portraits.json`, `litopys/links.json` | JSON | `portraits`: pictures the user sets for names. `links`: a chat that continues an earlier one (its backstory) |
| `litopys/store.json`, `litopys/proposals.json` | JSON | Litopys 1.x data, kept as a backup after the migration; trimmed for deleted chats |
| `characters/<id>/memory.json` | JSON | Card memory: stories the character remembers (snapshots imported from chats), habits, `inject` budget. Never in `card.json` or an export. DATA-FORMATS.md, "The card's long memory" |
| `memory/personas/<id>.json`, `memory/worlds/<id>.json` | JSON | The same kind of long memory for a persona and for a saved World DM world (stories and facts only, no habits). A chat takes them in only when its meta says so. DATA-FORMATS.md, "A persona's and a saved world's long memory" |
| `databank-vectors/<fileId>.json` | JSON | Embeddings of a Data Bank file's passages, one model per file, made on the user's click or by the automatic filling; they only raise the rank of passages the words already found. DATA-FORMATS.md, "Data Bank vectors" |
| `databank-trace/<chatId>.json`, `fired-log/<chatId>.json` | JSON | What the Data Bank and the lorebooks put into the last real replies (never for a preview); the "last reply" views read them. Written by `assemble()`. DATA-FORMATS.md, "Memory trace", "What fired" |
| `world/state/<chatId>.json` | JSON | World DM state of a chat: settings, records (people, things, places), fronts, event, log. The chat's world book is `lorebooks/world-<chatId>.json`. DATA-FORMATS.md, "World DM" |
| `world/config.json`, `world/profiles/<id>.json`, `world/recipes/<id>.json` | JSON | World DM: settings that differ from the defaults, the player's profile changes or own profiles, and the player's recipes for learning a world from cards |
| `world/library/w-<id>.json`, `world/library/w-<id>.draft.json` | JSON | A saved world, and a world being built without a chat until accepted |
| `world/snaps/` (per chat), `world/dice/<chatId>.json` | JSON | Rollback snapshots that follow the chat's line, and the dice log (DATA-FORMATS.md, "World DM"; COUPLINGS.md, "World DM rollback follows the chat's line") |
| `agents/<id>.vertep-agent.json` | JSON (Canvas file) | An installed custom agent: data, not code. DATA-FORMATS.md, "Agents" |
| `agents/drafts/<name>.vertep-agent.json`, `agents/grants/<id>.json` | JSON | A draft waiting for the user to install it, and the permissions the user confirmed for an agent |
| `agents/state/<chatId>/<id>.json`, `agents/runs/<chatId>.json`, `agents/inserts/<chatId>.json` | JSON | An agent's own state in a chat, the run log (newest 100), and prompt hints waiting for the next reply |
| `agents/config.json`, `agents/settings.json`, `agents/presets/<id>.json` | JSON | The user's choices per agent (models, call limit), global agent settings, and agent presets (a named list of agents). DATA-FORMATS.md, "Agents" |
| `letters/config.json`, `letters/inbox/<id>.json`, `letters/cards/<characterId>.json`, `letters/day.json` | JSON | Letters from cards: settings, unread letters, the cooldown and opt-out of each card, and the count of letters written today. DATA-FORMATS.md, "Letters from cards" |
| `tools/<id>.json` | JSON | Tool definitions for model tool calls (dice, pictures, toy control, custom); built-ins seed themselves on first read (written by the `tools` plugin) |
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
  pinned?: boolean          // pinned to the top of the Chats page
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

### 5.1 Character Memory (built)

Character memory exists; there is nothing to add. It belongs to the `litopys` plugin (`plugins/litopys/plugin.js`), and none of it is stored in `card.json` or in a card export.

| Layer | What it is | Stored in |
|-------|-----------|-----------|
| Card memory | Stories the character remembers: snapshots of chats the user imports (arc, strongest facts, the character's notes and said lines), and habits (accepted by hand or earned in a chat). Edited in the card's Memory tab. Routes `/litopys/card-memory*`, `/litopys/habits`. A persona and a saved World DM world have the same kind of memory (`/litopys/memory`, `kind` = card, persona or world), stories and facts only | `characters/<id>/memory.json`, `memory/personas/<id>.json`, `memory/worlds/<id>.json` |
| Recollections | What each character saw, heard or was told in a scene, how it left them and what they want now. The chapter worker writes them as `views` of a chapter | `litopys/chats/<chatId>.json` |
| Litopys record | Chapters, arcs and facts of the chat, with who knows each fact (`knownBy`, `cast`), beliefs and lies. The chapter worker builds it one scene at a time | `litopys/chats/<chatId>.json`, vectors in `litopys/vectors/<chatId>.json` |

**In the prompt.** The plugin adds these through its `llmRequest` hook, not in `assemble()`, each as its own part (shown in the prompt inspector): "Litopys · character memory" (also persona memory, world memory and character habits), "Litopys · recollections", "Litopys · story so far", "Litopys · facts and earlier chapters", "Litopys · who knows what" and, right before the newest player message, "Litopys · latest recollection". All of it stays inside the token budget in `litopys/config.json`. The engine reads the plugin's insert file only to reserve room in the history budget.

**Where the full shape is.** DATA-FORMATS.md: "The card's long memory", "What each character remembers of a scene", "A persona's and a saved world's long memory", "Litopys config". COUPLINGS.md: "Litopys insert file and the memory traces", "Who knows what (witnesses and Data Bank scope)", "Lies, beliefs and the risk review".

### 5.2 Enhanced Lorebook

| Feature | Where to Add |
|---------|--------------|
| Nested categories | `LoreEntry.group` → `group: { name: string, subgroups: string[] }` |
| Event triggers | `entry.triggerOn: { send?: boolean; swipe?: boolean; continue?: boolean; ... }` |
| Variables in keys | In `keyMatch()` support `{{var}}` — already has `expandMacros` |
| Category UI editor | `src/components/views/lorebooks-view.tsx` |

### 5.3 Trackers (Quest/Relationship Trackers)

There is no `Tracker` type in `src/lib/types.ts`, no `data/trackers/` directory and no `/trackers` routes. What a tracker was meant to do is done by three other parts:

- **Dashboard** (`plugins/relations`). A sensor model reports what happened in each reply and code turns it into state: per-character stats and mood (relationships), a notebook of what each character saw, heard or guessed, threads (quests: main, side and everyday, with steps), what the characters said and are held to (`said`), a short journal of how each character sees another, and the story clock (day, time, place). Stored as one snapshot per chat message in `dashboard/state/<chatId>.json`; the user's own notes, tags and threads are in `dashboard/notes/<chatId>.json`. The state goes into the reply prompt as "Relationship dashboard", "Dashboard · journal" and "Dashboard · said". Full shape: DATA-FORMATS.md, "Dashboard state"; routes in the header of the plugin.
- **Agents' own state** (`plugins/agents`). A custom agent can keep its own fields per chat (`write:own.<field>`) and, with the user's permission, write some Dashboard fields (the writes are logged and can be undone). Stored in `agents/state/<chatId>/<agentId>.json`; the Dashboard writes are logged in `dashboard/agent/<chatId>.json`. Format: DATA-FORMATS.md, "Agents".
- **Litopys facts** (`plugins/litopys`). Long-lived story facts, including relations and changes between people, with who knows them. Stored in `litopys/chats/<chatId>.json`. See 5.1.

To add a new kind of tracking, build it as an agent or as a Dashboard field first, not as a new data type.

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