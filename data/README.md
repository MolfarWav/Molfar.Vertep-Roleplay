# data/ — the ENTIRE app, in this one directory

Everything the Roleplay studio shows lives here as plain JSON. Read or edit
any file; every open client picks your changes up live within ~1 second (the
engine watches this tree and broadcasts `look_changed`; the app re-hydrates).
No restart, no reload. Keep shapes identical when editing — hydrate is
tolerant, not a migrator. `studio` bags inside files are the studio's own fields
riding alongside public formats: copy them through untouched.

| Path | What's inside |
|---|---|
| `settings.json` | `{ model, personaId, ui }` — `ui` is the WHOLE AppSettings object: theme preset, chat font + scale, hotkeys, display/chat/streaming behavior, TTS, translation, `summary` (mode/interval/word budget, the ordered summary prompt list, injection position/template), memory… edit any key and the UI applies it live. |
| `library.json` | `{ qrSets, themes, backgrounds, tags, folders, connectionProfiles }` — every local collection in ONE file: quick-reply sets (incl. auto-execute hooks), theme palettes, chat backgrounds, tags, folders, connection profiles (named connection+model pairs). |
| `characters/<id>/card.json` | Full character cards: portable card fields (name, description, personality, scenario, first_mes, alternate_greetings, example_dialogue, tags…) + `studio` bag (avatar, favorites, colors, stats, sprites, gallery, versions, variants). |
| `chats/<id>.jsonl` + `.meta.json` | One message per line (swipes, per-message `translation`, hidden/bookmarked flags); meta holds title, folderId, persona/preset/model, author's note, `summary` + `memoryCutoffMessageId` (what the summarizer covers / what the prompt drops), `chatVars` (chat-local {{setvar}}/{{getvar}} variables), `fieldVariantSelection` (which card alternate this chat sends), branch parentage (parentChatId/parentMessageId). |
| `groups/<id>.json` | Group chats: `{ memberIds, mode, mutedIds }`. |
| `presets/<id>.json` | Portable prompt-list shape (`prompts[]` + `prompt_order[]`) + `studio` bag (prompt library, variables, sampler objects, utility prompts). `default` is the read-only stock preset. |
| `lorebooks/<id>.json` | World-info books: entries (keys, positions, probability…), scan settings, vectorization config. Entry `status` is the source of truth: `"normal"` (keyed), `"constant"` (always injected), `"vectorized"` (embedding match). Don't write the legacy `constant` boolean — when both exist, `status` wins. |
| `regex/<id>.json` | Regex scripts: find/replace, flags, placements (which surfaces they touch). |
| `personas/<id>.json` | User personas: name, description, pronouns, bindings. |
| `dashboard/state/<chatId>.json` | The relationship dashboard's per-chat state, written only by the `relations` plugin: per-message snapshots (stats, mood, clock, and a `sig` of the message text they read: when the newest message's text changes, by an edit or a Continue, it is read again and that snapshot's notes, names and history are replaced), notebook, history. Optional `dashboard/config.json` (changed settings only, including `sensorMaxTokens`, the reply limit of the sensor and rating calls, 1000 to 8000, default 3000) and `dashboard/events.json` (your own event vocabulary: `{ "events": [...] }`; a row with a default id replaces that default, a new id adds an event, `{ "id": "...", "off": true }` removes one; `PUT /dashboard/events {events}` writes the rows, `DELETE /dashboard/events` clears them). `dashboard/soul-drafts/<characterId>.json`: proposed souls waiting for review (see docs/SOUL.md). Each character entry also keeps a `seed` (the soul start values its stats began from): a start saved or edited later moves the stats by the difference and adds a `kind: "seed"` history line. Never edit while a chat is updating. |
| `databank/<id>.json` | Data-bank documents: `{ name, scope, enabled, size, chunks: [{i, text}] }`. The engine chunks uploaded text (1000 chars, 150 overlap) and injects the top term-matching chunks into the prompt when a message is sent. |

## Characters: alternates, versions, per-chat choice

- `card.studio.descVariants` / `personalityVariants` / `scenarioVariants`:
  `[{ id: "var_…", label, content }]` — alternates for the three always-resident
  text fields. The card's base `description` / `personality` / `scenario` stays
  the default; add an alternate by appending to the array, never by overwriting
  the base.
- `card.studio.versions`: snapshots `[{ id, label, savedAt, snapshot }]` where
  `snapshot` carries `description`, `personality`, `scenario`, `firstMessage`,
  `exampleDialogue`, `systemPromptOverride`, `postHistoryInstructions`.
- Which alternate a single chat rides is the chat's own choice, not the card's:
  `chats/<id>.meta.json` → `fieldVariantSelection: { desc?, personality?,
  scenario? }`, values are `studio.<field>Variants[].id`. An absent key means
  the card's base text. Generation and prompt peek resolve through it, so
  setting the meta switches that conversation immediately.

Rules of thumb:
- Content/settings changes → edit here. CODE changes → `../src/` (triggers a
  ~5 s rebuild instead).
- Writes through the app's HTTP routes (`/v1/apps/roleplay/*`) auto-commit to
  the app's git; direct file edits commit when the engine next sweeps (under
  an `out-of-band:` label) or when you commit them yourself.
- Deleting a file removes the entity on the next hydrate.
- Files/dirs whose name starts with `_` are AI-ONLY TEMPLATES: the app never
  lists them in the UI. Copy one to a non-underscore name to make the entity
  real (it appears live). `_example.json` in `lorebooks/`, `regex/` and
  `databank/` shows the exact current shape — start from it. `groups/` appears
  once you create a first group chat.
