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
sections.ts is the one list, items carry a `group` and a `hue`: Home, Chats | Characters,
Groups, Marketplace, Personas (the people) | Lorebooks, Litopys, Canvas, World, Agents (the technical block;
Agents is a link to Canvas on its Agents board, `board: 'agents'`, current only while that board is open, state in
lib/canvas-board.ts) | Presets | Shortcuts, Tools; Inbox and Help sit at the bottom; the Roleplay settings page
(`settings`, group `'none'`) has no rail item: it opens from the Roleplay settings button in Home's header and the phone menu, and the engine
issue draft docs/ENGINE-ISSUE-shell-settings-apps.md asks for an Apps entry in the shell's Settings) + Ctrl+K command
palette. Every item has its own icon hue (rail-hues.ts). From 1280px the rail is
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
The card editor shows ELEVEN panels: desktop keeps all eleven tabs, wrapping to two
rows so every tab fits without scrolling, each
painted with its group's color (Core sky = core + dialogue, Profile emerald, Soul
violet, Lorebook amber, everything else slate). On a phone the row holds FIVE groups
(Core, Profile, Soul, Lorebook, More): a group with one panel opens it, Core and More
open a dropdown (nothing overlaps the content). The panels keep their old names (that
is what links, the store and older builds pass), and `src/lib/editor-tabs.ts`
(`tabOfPanel`) maps an old name to the panel it named. The rows are plain
buttons, not Base UI tabs, because a group holds more than one panel.
The World section (components/world/, `world` in the rail) is the hub of the World DM plugin: chats
with a DM on the left (top switch Chats | Profiles), one chat's Overview (the same controls as the chat's
World DM sheet, `world-controls.tsx`: a DM switch, a profile picker, an Edit profile button; the settings are a list of `SettingRow`s in folds with an (i) popover for the long hint, `ui/setting-row.tsx`), World book (the
world book's records, editable by hand; `world-records.tsx`) and Runs (history,
tokens, errors) on the right, and World settings (the play model for all chats, a model test). The Profiles
tab (`world-profiles.tsx`, data in `lib/world-profiles.ts`) edits the five built-in levels and the player's
own profiles: defaults, options (clocks by model or code, news by clock, dice: off, hint or binding, with the stat (auto = by the action, or one fixed) and the share of replies that get a roll); a chat's own dice setting (World DM sheet, `settings.dice/diceStat/diceChance`, empty = the profile's) wins, four prompt blocks with Changed
badge, reset and Show default, a locked reply format, one Save with a dirty mark and a leave guard.
The chat's Start tab (`world-start.tsx`) drafts records, fronts and an events deck from the cards or an interview, and the player
removes items and accepts the rest; the Worlds tab (`world-library.tsx`) holds saved worlds, and "New chat in this world"
(`world-new-chat.tsx`, also a World select in the new-chat step) carries one into a fresh chat, where the opening dialog
(`world-opening.tsx`, opened through the store's `worldOpening`) edits the DM's drafted scenario and first message. The chat header's globe dot (`world-status.tsx`) shows its state.
The Places tab (`world-places.tsx`, tree logic in `lib/world-places.ts`: whole places, spots indented by `inside`, things by `place`, the rest under "Not placed") sits between Overview and World book; a row opens the record in the World book (whose editor has size/inside for places, place/holder for things and Delete; Places also has Add a place, Add a thing and a delete button per place, and the things of a deleted place move to "Not placed"). Both tabs read through `use-world-book.tsx`: a world the DM wrote from the played story (no `origin`; a saved world with `from`) opens at once, a built one asks the spoiler question once per session (`lib/world-reveal.ts`). A saved world's detail (World > Worlds) has the tabs Details | World book | Places on the same components (`worldId` instead of `chatId`; no "you are here", no generating). Each place row has a thumbnail and a Background button (`world-place-bg.tsx`): pick a library picture, remove it, or "Generate for this place" (`MakeSet` with `only`); the picture id is the record's `background`, its tags get the place's name and aliases (`placeTags`), and `applySceneBackground` shows it first when "Change the background by scene" is on.
The Dashboard's Person / Here / Quests / Notes tabs (strip: `dash-strip.tsx`, 300-420 px wide with a drag handle, remembered in `rp.dashStripWidth`; phone sheet: `dash-phone.tsx`, plus History) share `dash-tabs.tsx` (top block, tabs with tone squares and corner counters, panels) and `dash-cards.tsx` (Attitude, Mood and state, Outfit and things, Here, Things). What changed since the last reply comes from `lib/dash-changes.ts` (mood, stats against `char.prev`, the DM's `changed` ids, new quests); outfit and hands come from `lib/dash-outfit.ts` (the Dashboard sensor by default, the World DM's lists with `carrySource: 'dm'`). The open dashboard (`dash-wide.tsx`) has a World button and a full-screen toggle (`rp.dashFull`).
The chat's Backgrounds tab and a saved world's Backgrounds section (`world-backgrounds.tsx`, with `world-bg-set.tsx` for planning and drawing a set and `world-bg-name.tsx` for naming with a vision model; pure helpers in `lib/world-backgrounds.ts`) keep one library folder per world; images are stored through `storeBackground` (`lib/webp.ts`, WebP in the asset store) and "Change the background by scene" (`world-auto-bg.tsx`, `applySceneBackground` after each Dashboard update) is the only thing that switches a background by itself.
The Marketplace (components/views/marketplace-view.tsx) searches chub through
studio-import plugin routes (/marketplace/search, /marketplace/detail) and
downloads via the /import/url path; remote art rides the engine's same-origin
image proxy (/v1/apps/roleplay/img) because app pages are CSP-locked to
self-origin images. Message bodies obey the same rule: `MessageImage` in
src/components/markdown.tsx is the `img` component of the markdown renderer, so
a picture a card writes in its text (`![alt](https://…)` in a greeting, or a raw
<img>) is fetched through the proxy with `credentials: 'include'` (the route
needs the session cookie) and degrades to its alt text as a link — never to the
browser's broken-image icon — when the proxy or the link fails. The other sources (RisuRealm, CharaVault, Wyvern, Pygmalion,
JannyAI) use the same two routes with a `source`; their installs go through
/fetch/card and importCardFromLink (src/lib/card-import.ts), one importer for
dropped files, pasted links and the Store. State per source (query, page, sort,
tags, filters) lives in one browse record. Catalog gotchas, all verified against the live endpoint:
adult listings are hidden unless nsfw/nsfl/nsfw_only are ALL stated (absent
= ~95% of the catalog missing); "trending" is a POOL of ~1.4k cards, not an
ordering, so it gets its own switch and takes over the sort; an unknown sort
key is a 400, never a fallback; tags are `topics`, and OR is `inclusive_or`
(`tags_mode` is read by nothing).
The inbox ("Waiting on you", components/shell/inbox.tsx, #55) lists what waits on the player: background
failures (the World DM from GET /world/chats `error`/`errorAt`, the Library worker from /litopys/chats, the open
chat's dashboard sensor, a failed soul rating), Library proposals per chat (lib/attention.ts, polled by
pollNeedsYou) and cards with souls proposed (GET /dashboard/soul-drafts). It is a DRAWER (`InboxDrawer`, mounted in
app-shell): a side sheet from the rail on desktop (Inbox button above Help), a full-height sheet on phones (first
row of the More sheet), with filter chips All / Failures / Approvals / Souls / What's new (the tips of the current
version). Rows have a colour, icon and label per kind (failure red, Library approval blue, soul review violet);
`NeedsYouBadge` turns red when a failure is in the count. A new failure is toasted once (`worker:ref:at` in the seen
list; Open goes where it is fixed; not when the player is already there; the same worker+code is not toasted again
within 10 minutes); "Dismiss" stores the key. Rows and the badge total come from `inboxRows` in lib/attention-core.ts
and respect the per-kind switches in settings.attention (litopys, soul, failed). Toast colours by type are in
components/ui/sonner.tsx: use toast.error / warning / success / info, a plain toast() is a neutral note.
Imports (cards, presets, lorebooks, personas, regex, chats, backups, links) report to one progress card
(`components/shell/import-progress-card.tsx`, state in `lib/import-progress.ts`: `beginImport`, `forEachImport`): a job counts
whole files (cards: files plus batches of 25), a file that cannot be split shows its steps, a link download moves with the bytes
it has read, and Cancel stops between units. The card is a portal on the body (an open drawer makes #app inert), above the tab
bar on a phone. A new import path calls `forEachImport` or `beginImport` instead of keeping its own spinner.
The Personas section (components/views/personas-view.tsx owns the state) opens on an overview, not a list beside a page:
a header (search, sort, Select, Import, Backup, New persona), a folder strip, a tag row and a grid of cards with a 360 px
preview panel on desktop; rows, a bottom bar (Select, Folders, Tags, New) and a bottom sheet on a phone (`components/persona/`:
`persona-list.tsx` cards and rows, `persona-filters.tsx` folders, tags and the select bar, `persona-preview.tsx` panel and sheet;
the pure parts, sort, filter, the one-line summary and the profile fill count, are `lib/persona-list.ts`). A persona's `tags`
are names; their colours, order and "folder" flag live in the same `tags` list as the characters' tags, told apart by
`Tag.scope === 'persona'` (Characters ignores scoped tags). A folder is a persona tag with `asFolder`, a persona sits in every
folder it has a tag for. The shared tag manager is `components/tags/tag-manager.tsx`. "N chats" on the preview sets
`chatsPersonaFilter` (not saved) and opens Chats, which shows a removable "Persona: name" chip. "Open" shows the persona's page.
The persona's page (`persona-page.tsx`, keyed by persona id) is a hero (`persona-hero.tsx`: portrait, inline name, pronouns, title, tag editor,
Generate image, Use) over seven tabs (`persona-tabs.tsx`; sections and their tones in `lib/persona-page.ts`: Core, Profile n/9, Bindings, Lorebooks,
Memory, Colours, Gallery; the open tab is kept in sessionStorage). On a phone the same bodies are pages behind a list of sections. The Profile tab
holds "Model for this card's tasks" (`useCardTasks` takes a persona owner: the choice is `Persona.cardTasks`, written at once, and goes with
Fill empty / Structure it as `taskModel`) and the profile form with folded sections (`ProfileForm fold`). `Persona.gallery` is the generated portraits;
"Generate image" (`persona-image-dialog.tsx`) builds the prompt from the Appearance fields (`portraitPrompt`) and draws through the Image generation
connection of Extensions (`settings.imageGen`, POST /v1/images); with none enabled it says so.
"New persona" opens `persona-new-dialog.tsx`: Write it myself (a blank page, as before), Short interview (`persona-new-interview.tsx`:
an idea and an optional picture go to POST /profile/persona-ideas, three drafts and two questions come back, Create makes the persona from
`composeBrief`, runs Structure it and, for Full portrait / Deep dive, Fill empty with `merge` so the sketch and the details are ONE proposal
on the persona's page; `lib/persona-new.ts` and `lib/persona-new-api.ts`) and From a file (text, Markdown or JSON up to 200 KB; persona-shaped
JSON goes through the import, anything else becomes the description, cut at 12000 characters, and the page opens on Profile and starts
Structure it by `pendingStructure`). The questionnaire is the no-model path.
State is a zustand store (lib/store.ts) hydrated from the engine and mirrored
to it on every change. Messages are a FLAT list with swipes.

Home (`views/home-view.tsx`, blocks in `components/home/block-*.tsx`) is a bento: continue (the one filled button), a random
library card, a Marketplace card (`lib/home-market.ts`, one request an hour, left out when offline or switched off), a
world tile on a library picture, waiting on you, open quests gathered from the 12 latest chats (one request, GET /dashboard/quests; a row opens its chat), favourites, What's new and a tip. Its order,
widths and hidden blocks are per user in `settings.homeLayout`, changed in Customize; the rules are in `lib/home-layout.ts`.

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
  Preset choices (4.31): a preset's variables (types choice, toggle, text, …) are picked
  PER CHAT. The chat's Preset panel (chat/preset-panel.tsx, from the quick bar) and the
  step before a chat starts (chat/new-chat-step.tsx, setting askPresetOnNewChat) share
  chat/preset-choices.tsx; changes go through the store's setChatPreset (POST
  /chats/:id/preset: this chat only, the engine records a muted note shown by
  chat/preset-note.tsx). The editor for the variables is presets/variables-panel.tsx.

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

Pictures (#89): card galleries, generated pictures and backgrounds live in the
engine's asset store and the files above only carry `/v1/assets/<id>`. The
plugin cannot read that store, so the app adds the bytes itself:
`lib/backup-assets.ts` appends every referenced picture to the exported zip as
`assets/<id>` plus `assets/index.json` (type and name), and puts them back
(`PUT /v1/assets`) before the zip goes to `/import/zip`, stripped of `assets/`.
An asset id is the SHA-256 of its bytes, so these ids DO travel: nothing is
rewritten on restore. All three restore entry points (Settings > Data, Settings
> Import, Manage chats) go through `backupFileForImport`.

Replies with HTML and coloured dialogue (#93): `lib/safe-style.ts` is the one
list of what a reply's CSS may not do (fixed/sticky, z-index > 10, viewport-unit
sizes, `@import`, `@font-face`, foreign `url()`); it runs over inline `style`
(`rehypeSafeStyle`, after the sanitizer) and over `<style>` bodies (`scopeCss`
takes it as a filter). Add a rule there, with a test in `test/rp-safe-style.test.tsx`.
`stripCustomHtmlTags` keeps the inline tags in `INLINE_TAGS`. The fenced html
block (`HtmlInlay`) is a sealed frame the app cannot measure, so its height is
fixed with an Expand toggle. A solo card's `voices` (`studio.voices`) feed the
same speaker finder as group members (`lineSpeakers`, `leadVoiceIn`).

Fonts a reply may name (#126): `lib/reply-fonts.ts` lists them, `main.tsx` imports
their Latin and Cyrillic files from `@fontsource/*`; `test/rp-reply-fonts.test.ts`
keeps the three in step. A reply cannot bring a font (`@font-face` stays stripped),
and the sealed html block does not see the app's fonts, so they dress the reply's
own text, not what is inside that block. Adding a font = dependency (commit the
`bun.lock` it produces) + both imports + a line in the list.

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
  When the history is already down to its last message and the prompt still exceeds the model's window (a huge card,
  a reply reserve as big as the window), the engine does not stop the turn: it sends what fits and reports
  `tooSmall: {window, need, budget, reply}` in the send/next answer (and in the 503 body when the model fails);
  the store shows one warning toast with the ways out (`lib/context-notice.ts`).
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
  Molfar draws for the user with its own `image_generate` tool (engine
  1.2.1+): avatars, backgrounds and gallery items, written into the card or
  library.json as `/v1/assets/<id>` URLs (`.skills/edit-large-card`).
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

Usability comes first in every UI change (the user's rule): a user must find,
understand and use it without docs, on a phone too. The checklist is the
"Usability" part of the app-authoring skill. Here that means: reuse
components/ui (field.tsx FieldDescription for a one-line hint, popover.tsx for
an "i" explanation opened by tap, confirm.tsx before deleting, empty.tsx for
empty lists, sonner toasts for results); theme colours only (primary/cta,
destructive, muted), never hex; below MOBILE_BREAKPOINT (768 px,
hooks/use-mobile.ts) tap targets of 40 px, nothing hover-only, no sideways
scroll; rare options folded under "More" like the lorebook entry editor.

## The in-app guide

What's new after an update, a short tour on the first visit to a section, and
the searchable help list ("?" in the rail). A feature a user decides with gets
a tip in the same change; without one, nobody finds it.
- Tips and tours are data: `TIPS` and `TOURS` in src/lib/guide-tips.ts. The
  format and the logic: src/lib/guide.ts. The UI: src/components/guide/.
- A tip: `id` (`help.<area>` or `new.<feature>`), `title` and `body` in `en`
  and `uk` (plain words, one or two sentences, second person; UI labels exactly
  as the UI shows them, English labels stay English in uk), `help` (the group
  in `HELP_GROUPS`) to list it under "?", `keywords` for words people search
  with, `target` + `open` when there is an element to show.
- `target` is a `data-guide="<name>"` attribute you add on a stable element
  (never a class or text). `open` says how "Show me" gets there (a view, the
  chat menu, the dashboard, an editor tab...; see `GuideOpen`). An element shown
  only on hover needs `data-guide-reveal` (see `.ls-acts`).
- What's new: `since` = the version that will ship the feature. Local edits
  are not a release, so leave `since` out unless the change is being
  published; the tip still shows in the help list. Publishing bumps
  `APP_VERSION` in guide-tips.ts together with manifest.json (a test checks).
- A new section gets a tour: its component calls `useGuidePlace(place, ready)`
  (`ready` false while it loads or is empty), the place goes into `Place` in
  guide.ts, the tour into `TOURS` (2-4 steps, first step on the section title).
- Texts must be true: read the code you describe. `bun test
  test/rp-guide.test.ts` checks ids, both languages and that every target is
  marked in the UI; open the help list and press Show me once.
- Articles: the long text behind "More" in the help list lives in
  `src/lib/help-articles.json` (format, rules and checks: docs/HELP-ARTICLES.md),
  merged into `TIPS` by `mergeArticles`. Search ranks a title match above keywords,
  the body and the long text. A change to a feature that has an article updates the
  article and its `sources` in the same change; `node scripts/validate-help.mjs
  src/lib/help-articles.json --repo . --fix-lines` re-finds moved line numbers.

## Engine contract (wired in v4.1)

All app behavior (chats, swipes, presets, world info, characters, import)
lives in plugins/ as engine plugins over the plugin API; the UI talks to
/v1/apps/roleplay/* routes and the WS bus (app_stream deltas for live
replies). Chats are flat JSONL with swipes; each character is one card.json.
src/lib/engine.ts owns every route call + the studio↔engine adapters; the store
actions are thin wrappers (optimistic write → API call → refresh). A feature
without a working backend is marked unavailable in the UI, never stubbed.

Lorebook summaries: like cards (`Character.stub`), the start-up list holds books as summaries (`Lorebook.stub`,
`entries: []`, `entryCount`, `tokens`, `rev`; `GET /bootstrap` and `GET /lorebooks?summaries=1`, with
`lorebooksPending` followed in the background), because a library imported from SillyTavern has a book per card and
every book whole ran the plugin out of memory. The whole book comes from `loadBook(id)` (`GET /lorebooks/:id`,
one request per id); a screen that shows entry counts uses `bookEntryCount`, one that reads or writes entries loads
the book first. A summary is never written: `lorebookToEngine` throws on it and the engine answers 409. Exports
call `loadOwnBooks` / `loadForExport` (store.ts) before `characterToExportCard`, which refuses a stubbed own book.

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
│                       folderId, pinned, personaId, presetId, model, branch
│                       parentage (parentChatId/parentMessageId), summary,
│                       fieldVariantSelection (which card alternate this chat sends)
├─ groups/<id>.json     { memberIds, mode, mutedIds }
├─ presets/<id>.json    portable shape (prompts[] + prompt_order[]) + `studio` bag
│                       (library, variables, samplers, utility prompts)
├─ lorebooks/<id>.json  world-info books (entries[], settings, vectorized)
├─ regex/<id>.json      regex scripts (find/replace/placements/flags)
├─ databank/<id>.json   { name, scope, enabled, size, chunks: [{i, text}] }
├─ profile-drafts/      profile plugin: <characterId>.json, a "Structure it" proposal; group-<id>.json, a scene proposal
├─ dashboard/           relations plugin: state/<chatId>.json, soul-drafts/<characterId>.json, config.json, events.json
├─ litopys/             litopys plugin (shadow mode, nothing reaches the prompt yet): chats/<chatId>.json (chapters, facts,
│                       proposals, worker state), vectors/<chatId>.json, config.json; store.json = the 1.x backup.
│                       The read-only Litopys rail section (components/library/) reads GET /litopys/chats and /litopys/chat?chatId=.
├─ world/              world plugin (World DM): state/<chatId>.json (records, fronts, the pending event), config.json;
│                       its world book is lorebooks/world-<chatId>.json with ownerChatId (hidden from the library)
└─ personas/<id>.json   user personas
```

Card souls for the relationship dashboard: docs/SOUL.md

Every field of cards, lorebooks and presets: `docs/DATA-FORMATS.md`. The skills
in `.skills/` (`edit-large-card`, `card-craft`, `card-import`, `lorebook-craft`,
`preset-craft`, `agent-craft`) point there instead of copying it. A change to one of these
formats updates DATA-FORMATS.md (`test/rp-data-formats.test.ts` fails otherwise)
AND every skill that names the changed field, in the same commit.

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

The Litopys cut (4.72.0): `litopysCut` in `plugins/engine/plugin.js` is a ceiling (messages a chapter covers, outside the last `recentMessages`); `litopysFitCut` takes only as many as the window needs (the same budget the trim loop uses). `GET /chats/:id` reports the ceiling as `litopysCut` and the last real prompt's start as `promptCut` (null before any prompt); the chat view draws its lines from `promptCut`, and from a window estimate until there is one. Previews (`promptPreview`, `fetchWIStatus`, `wiTest`) send the chat's model limits like a send does. After a real generation the engine writes `litopys/prompt-cut/<chat>.json` (where the verbatim history started) and Litopys's insert (`buildInsert`, `promptCut`) carries a chapter for every message before it, so a small window never drops messages that no chapter stands in for.
In `cutMode: "scenes"` the cut is the end of the last whole scene (`litSceneEnds` in the engine, `sceneEnds` in Litopys) that leaves `sceneKeep` messages after it; the insert then takes the engine's `prompt-cut` as the cut exactly, in `fit` mode as a floor.
