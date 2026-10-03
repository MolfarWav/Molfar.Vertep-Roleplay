# AGENTS.md — Roleplay app (the studio)

You are operating on the official Roleplay app's files. First-party but
unprivileged: everything here is plain files you may read, edit, and commit —
same as any user-made app. Keep this file current when you change the app.

## Where a change goes — decide this first

Pick the lightest place that can carry the request. All three are supported and
all three survive an update (a three-way merge against the version the app was
installed from; only an edit overlapping the same lines conflicts, and then
nothing is written until the user settles it). `data/` is never part of an
update at all.

1. **`data/`** — content and configuration. A great deal of this app's
   behavior is already data-driven, and reaching for `src/` for something a
   data file already controls is the one wrong answer here. Before writing any
   code, check whether what was asked for is one of these:
   `data/settings.json` `ui` (the WHOLE AppSettings object: theme, fonts,
   hotkeys, TTS, translation, memory, chat behavior), presets (prompt order,
   samplers, utility prompts, world-info budget, prompt format),
   lorebooks (what fires and when), regex scripts (rewrite text in or out),
   personas, quick replies in `data/library.json` (which have real automation
   hooks: onStartup/onChatChange/onUser/onAi), and character cards including
   their variants and versions. Edits here need no rebuild and open clients
   pick them up in about a second.
2. **`plugins/<your-id>/`** — new backend behavior: routes, model tools,
   scheduled work. Prefer a NEW plugin folder over editing `plugins/engine/`
   or `plugins/studio-import/`: a file only you added has no upstream version
   to disagree with, so it can never conflict on an update. A plugin can also
   patch a sibling's model request (`llmRequest`), which is how you change what
   the model receives without touching the assembly code.
3. **`src/`** — the UI. Editing it is normal and expected; it is how the app
   changes shape. It rebuilds in the user's browser (call `app_check`
   afterwards) and puts that file in the merge path on the next update.

## What this app is

The roleplay studio, v4: a power-user roleplay UI. Left nav rail (components/shell/
sections.ts is the one list, items carry a `group`: Home, Chats | Characters,
Marketplace, Personas, Lorebooks | Presets, Connections | Shortcuts, Tools |
Settings pinned at the bottom) + Ctrl+K command palette. From 1280px the rail is
206px with labels (Kurale) and ornament dividers; below that it is icons with
tooltips; on phones it is the bottom tab bar. On desktop a section always opens
as a DRAWER over the page (Home, Chats or a chat stays mounted underneath, with
a running stream). On phones a section is a real PAGE (with a big title and
count chip, `SectionPage` in components/shell/section-page.tsx), except over an
open chat, where it is a drawer too (the chat's header becomes a row of section
icons, tap to drop the section down over the chat, tap again to close) —
`opensAsDrawer` in lib/store.ts. The user wants the desktop drawers: do not
turn sections into desktop pages.
Nav labels and page titles go through `t()` (lib/i18n.ts, `ui.language` 'en' |
'uk', default from the browser); the rest of the app is English. Theme: the
default is the built-in "Vertep" (dark); a theme's optional `cta` color is the
second accent (primary button, active nav icon) and falls back to the accent.
Views are components/views/*, the chat experience lives in
components/chat/*, the tabbed character editor in components/character/*.
The Marketplace (components/views/marketplace-view.tsx) searches chub through
studio-import plugin routes (/marketplace/search, /marketplace/detail) and
downloads via the /import/url path; remote art rides the engine's same-origin
image proxy (/v1/apps/roleplay/img) because app pages are CSP-locked to
self-origin images. Catalog gotchas, all verified against the live endpoint:
adult listings are hidden unless nsfw/nsfl/nsfw_only are ALL stated (absent
= ~95% of the catalog missing); "trending" is a POOL of ~1.4k cards, not an
ordering, so it gets its own switch and takes over the sort; an unknown sort
key is a 400, never a fallback; tags are `topics`, and OR is `inclusive_or`
(`tags_mode` is read by nothing).
State is a zustand store (lib/store.ts) hydrated from the engine and mirrored
to it on every change. Messages are a FLAT list with swipes.

## Phase status

- v4.0: initial studio release (fixed one latent upstream component bug on the way:
  ui/command.tsx CommandDialog now wraps children in <Command> — without it
  every cmdk consumer crashes on undefined.subscribe when the palette opens).
- v4.1: FULLY WIRED to the engine. src/lib/engine.ts is the only network
  layer (fetch + adapters + the /v1/ws app_stream client); src/lib/store.ts
  hydrates from the engine and mirrors every mutation optimistically.
  Generation is real (send/swipe/continue/next/impersonate stay open while
  the kernel runs the model; deltas render live; Stop aborts). Characters,
  chats, swipes (set/generate/delete), messages (edit/hide/bookmark/move/
  truncate), forks+branch tree, groups (mute/strategy/force-speak),
  personas (the default in settings is what a NEW chat starts with; every
  chat pins its own persona and only an explicit switch changes it), presets (sections ⇄ portable prompts[]),
  lorebooks (global/linked scope → engine world-info), regex, model catalog
  (GET /v1/models), import (PNG tEXt cards/JSON/chats/regex/presets via
  plugins/studio-import) and backup zip export/restore are all server-backed.
  Quick replies now have REAL automation hooks (onStartup/onChatChange/
  onUser/onAi → store actions, see runAutoExecutes in lib/store.ts).
  Translation (plugin /translate: llm/google/lingva/deepl), TTS (engine
  /v1/audio/speech: keyless Edge voices or a speech endpoint), the data bank
  (plugin /databank) and image generation are all engine-backed.
  Purely local: themes, quick replies, tags/folders, hotkeys, backgrounds.

## Backups (the zip, both directions)

`GET /export/backup` writes public formats plus what those formats have no
room for, so a restore on another machine is not lossy:

- `characters/<slug>.json` whole cards, `worlds/<slug>.json` books with a
  `_studio` bag (settings, globalActive, folderId, `_linkedNames`).
- `personas/<slug>.json` the full record (avatar, title, pronouns, bindings,
  isDefault) with `_lorebookNames` / `_boundNames`; `User Settings/personas.json`
  keeps the flat name→description map other tools read.
- `chats/<owner>/<slug>-<id>.jsonl` plus a `.meta.json` sidecar (the whole
  chat meta, with `_presetName` / `_personaName` / `_lorebookNames`) and a
  `.memories.json` vault. Per-message fields the public line shape cannot
  carry (`hidden`, `bookmark`, `picture`, `translation`, `extra`) ride in
  `extra.chry`.
- `settings.json` carries `settings` (the real `ui` object), `library.json`
  the local collections, `databank/` the retrieval chunks.

IDS DO NOT TRAVEL. Anything pointing at another entity exports a `_…Names`
sibling and the importer re-resolves it; ids are re-minted on the way in.
Zip text is UTF-8 — never write latin1 into the archive.

Reading a zip: `normalizeEntryName` anchors on the collection folder, so any
wrapper above `characters/` or `worlds/` (a data folder, a whole install
directory, a tool's own backup) is cut. Binary entries arrive from the kernel
as `{ __b64__: true, base64 }` — use `entryBase64`, never the raw key.
Entries are handled in phase order (characters → books → presets → regex →
personas → groups → chats → databank), because the later phases resolve the
earlier ones by name.

## Memory, pictures, regex, groups, MCP (how they work now)

- Memory = one running summary per chat + a cutoff (meta.summary,
  meta.memoryCutoffMessageId). POST /chats/:id/compact folds the turns between
  the cutoff and the newest `keepRecent` into the summary and moves the
  cutoff; every compaction pushes the prior state onto meta.compactions (max
  20) so /compact/undo restores it and {redo:true} rewrites the latest one
  from the same start. Messages above the cutoff stay in the chat (dimmed)
  but leave the prompt. Auto mode compacts when a send reports `trimmed`
  (history fell out of the context) or every `interval` turns. The per-chat
  facts vault (/memories) is unchanged, shown under Memory → Facts.
  Summaries and fact extraction (manual and automatic) run on
  ui.memory.model when set (memoryModelOf in the engine plugin), otherwise on
  the chat's model.
- Pictures: /chats/:id/image-prompt has the chat model describe the scene
  (modes scene/character/face/user/background); the engine's /v1/images
  draws it into the asset store (/v1/assets/<sha>); POST /chats/:id/messages
  posts it as a hidden `picture` message (never in the prompt, never a swipe
  target) and it lands in the character's gallery. The tools plugin's
  built-in `generate_image` lets the model ask for one mid-reply; the client
  draws it after the reply commits.
- Regex has two axes like the portable format: placement = where
  (user_input, ai_output, slash, wi, reasoning), markdownOnly/promptOnly =
  when. Neither flag rewrites text as it is SAVED (send, reply, greeting,
  edit with runOnEdit); markdownOnly is display-only (client); promptOnly
  runs at assembly (history + world info). Preset text is never regexed.
  Scripts saved before the flags read via regexAxes(). Imported cards and
  presets bring their embedded scripts as character/preset-scoped scripts.
- Groups: groupTurnPlan() decides a turn. list = every unmuted member in
  order; natural = members named in the user's message, else one pick
  weighted by card talkativeness (never who just spoke). Send answers the
  first and returns `queue`; the client runs /next for the rest.
- The app page runs in a `sandbox="allow-scripts ..."` iframe (opaque origin):
  no cookies, no localStorage, `connect-src 'none'`. It is served cookieless
  from `/app/<user>/<app>/` (built in the browser with relative URLs).
  Every engine call goes through `client/app-bridge.js` to the shell's
  `app-bridge-host.js`, which allows only this app's routes plus models,
  images, audio, embeddings, assets and read-only catalogs. The shell's own
  localStorage backs the app's localStorage (snapshot rides the frame URL).
  Hot updates ride the same bridge (the app_built event). Never widen the host
  allowlist to agent/shell/settings/admin/mcp routes.
- MCP servers are engine-level: add and share them in Chrysalis settings.
  Each app starts with every shared server off and opts in per server
  (GET/PATCH /v1/apps/<app>/mcp[/<id>] {use}); an app cannot register
  servers of its own. Opted-in tools join tool-calling generations next to
  the tools plugin's.

## Layout

```
apps/roleplay/
├─ manifest.json        app identity (name/version — the engine registry)
├─ package.json         REAL npm deps (react 19, @base-ui/react, zustand,
│                       cmdk, sonner, react-markdown + katex/highlight.js,
│                       react-resizable-panels, @phosphor-icons/react; fonts via
│                       @fontsource-variable) — shadcn/ui on Base UI
├─ index.html           entry html (dark by default, favicon set)
├─ src/
│  ├─ main.tsx          mounts <AppShell/> (fonts + globals.css)
│  ├─ globals.css       tailwind v4 + shadcn tokens (light/dark) + RP prose
│  │                    classes (.mes_text q/em, .chat-column, quote styles)
│  ├─ components/
│  │  ├─ shell/         app-shell (rail, palette, hotkeys), master-detail,
│  │  │                 mobile-tab-bar
│  │  ├─ views/         home, chats, characters, personas, presets,
│  │  │                 lorebooks, quickreplies, regex, samplers, settings,
│  │  │                 connections, extensions + settings/* sections
│  │  ├─ chat/          chat-view, message-row, composer (+autocomplete,
│  │  │                 expanded editor), group dialogs, memory panel, …
│  │  ├─ character/     character editor pieces
│  │  ├─ ui/            shadcn components on Base UI (43 files)
│  │  ├─ markdown.tsx   react-markdown + gfm/math/highlight, quote tinting
│  │  └─ theme-applier.tsx  theme preset → CSS vars on <html>
│  ├─ hooks/            use-mobile
│  └─ lib/              store.ts (zustand+persist), types.ts, seed.ts,
│                       tokens.ts (real BPE counts, o200k), interop.ts
│                       (portable-format import/export), card-fields.ts, export.ts,
│                       image-gen.ts, utils.ts (cn)
├─ plugins/             engine/ (chats, characters, presets, generation) +
│                       studio-import/ — import/marketplace backend
└─ data/                characters/, presets/, personas/, settings.json
```

## Editing the UI

React + tailwind — write what you know. shadcn/ui
components drop in natively (components.json: style base-nova, css
src/globals.css). Save a src/ file and the user's open tab hot-updates in
place (the build runs in their browser; errors show over the app and land in
dist/.chrysalis-build.json).
Dependencies install engine-side with scripts disabled: edit package.json and
call app_deps (remove one with app_deps { remove: ["name"] }). The sandbox has
no npm itself. After src/ or dependency edits, app_check waits for the browser
build and returns its errors.

## Engine contract (wired in v4.1)

All app behavior (chats, swipes, presets, world info, characters, import)
lives in plugins/ as engine plugins over the plugin API; the UI talks to
/v1/apps/roleplay/* routes and the WS bus (app_stream deltas for live
replies). Chats are flat JSONL with swipes; each character is one card.json.
src/lib/engine.ts owns every route call + the studio↔engine adapters; the store
actions are thin wrappers (optimistic write → API call → refresh). A feature
without a working backend is marked unavailable in the UI, never stubbed.

## Agent-editable data (live sync, v4.2)

EVERYTHING lives in `data/` — one directory, plain JSON. This section is the
authoritative map (updates deliver this file; `data/README.md` is the copy a
fresh install seeds). Keep both in step. Small state is in TWO files:
`data/settings.json` (`ui` = the whole AppSettings) and `data/library.json`
(quick replies, themes, backgrounds, tags, folders, connection profiles).
Big collections stay in their subdirectories (characters/ chats/ groups/
presets/ lorebooks/ regex/ personas/ databank/). The tree below is the summary:

EVERYTHING the studio shows lives in this app's `data/` tree as plain JSON —
you may read and edit any of it directly, and every open client picks your
changes up within ~a second (the engine's data watcher emits `look_changed`
on the WS bus; the app re-hydrates). No restart, no reload needed.

```
data/
├─ settings.json        { model, personaId, ui: {…} }  — `ui` is the ENTIRE
│                       AppSettings object (theme, fonts, hotkeys, TTS,
│                       translation, chat behavior…). Edit a key → the UI
│                       applies it live. (UI writes back on user changes.)
├─ characters/<id>/card.json   full character cards (portable card fields + `studio` bag:
│                       favorites, colors, stats, sprites, gallery, versions,
│                       descVariants/personalityVariants/scenarioVariants)
├─ chats/<id>.jsonl     one message per line; <id>.meta.json holds title,
│                       folderId, personaId, presetId, model, branch
│                       parentage (parentChatId/parentMessageId), summary,
│                       fieldVariantSelection (which card alternate this chat sends)
├─ groups/<id>.json     { memberIds, mode, mutedIds }
├─ presets/<id>.json    portable shape (prompts[] + prompt_order[]) + `studio` bag
│                       (library, variables, samplers, utility prompts)
├─ lorebooks/<id>.json  world-info books (entries[], settings, vectorized)
├─ regex/<id>.json      regex scripts (find/replace/placements/flags)
├─ databank/<id>.json   { name, scope, enabled, size, chunks: [{i, text}] }
└─ personas/<id>.json   user personas
```

Characters: alternates, versions, per-chat choice — exact shapes:
- `card.studio.descVariants` / `personalityVariants` / `scenarioVariants`:
  `[{ id: "var_…", label, content }]`. The card's base `description` /
  `personality` / `scenario` stays the default; append to an array to add an
  alternate, never overwrite the base.
- `card.studio.versions`: `[{ id, label, savedAt, snapshot }]`, `snapshot`
  carrying `description`, `personality`, `scenario`, `firstMessage`,
  `exampleDialogue`, `systemPromptOverride`, `postHistoryInstructions`.
- A chat rides an alternate via its meta `fieldVariantSelection: { desc?,
  personality?, scenario? }` (values are variant ids; absent key = base text).
  Generation and prompt peek resolve through it, so editing the meta switches
  that one conversation immediately.

Rules of thumb:
- JSON edits: keep the exact same shape the files already use; the app's
  hydrate is tolerant but not a migrator.
- The `studio` bags are the studio's own fields riding alongside public formats —
  copy them through untouched when rewriting a file.
- Editing `src/` instead rebuilds the app (~5 s) — that's for CODE changes;
  for content/settings always prefer `data/`.
- Writes you make through the app's own HTTP routes (POST /v1/apps/roleplay/…)
  commit to the app's git automatically; direct file edits stay pending until
  you commit them (or the engine sweeps them under an `out-of-band:` label).
