# Changelog (Molfar Vertep fork)

Changes on top of upstream Roleplay 4.18.2 (`b509845`).

## 4.21.2

- **The chat header's switcher shows the whole context at a glance**: one pill with the preset, the persona (with its avatar) and the model, each in its own segment. It opens a palette with three tabs, Preset, Persona and Model. Each row is a card: presets show how many sections are on, the temperature and the context size, personas show their avatar and title, models show the provider mark. The line on top of each tab opens that preset or persona in its editor, search narrows the list, and "Save current as profile…" and "Manage profiles…" sit at the bottom of the Model tab.
- A preset that is used for new chats is marked "default" (it was "stock", which it is not).

## 4.21.1

- On a computer, sections (Characters, Personas, Lorebooks, Presets, Settings and the rest) open as a drawer over the page again, as before 4.20.0: Home, Chats or the open chat stay underneath. On phones nothing changes: a section is its own page, and a drawer over an open chat.

## 4.21.0

- **A new Home**, built to the Vertep design: **Continue story** (the latest chat with its art, last line, persona and lorebook, Continue and Branches), **Create** (new character, import a card, or with Molfar), **Ask Molfar** (a request line and suggestions), achievements as rings, recent chats and **My apps**. Home's words follow Settings → Interface language, including "2 год тому".
- **Recent chats on Home**: filter by your persona and by character (a group chat matches any member), delete one chat or select several and delete them together, always after a confirmation. A chat that is still generating is never deleted. The Chats page has the same filters.
- **Molfar from Roleplay**: "Ask Molfar", "With Molfar" and the "+" in My apps open Molfar on a new chat with the request typed in, unsent: you read it and send it. My apps opens your other apps. Needs Molfar Vertep 0.6.0 or newer; on older versions these blocks are hidden.
- Chat previews no longer show raw tags such as `<sage:tremble>` or markdown marks (display only, the chat is unchanged).
- The navigation shows its labels in a 1280 px window too (the app frame is a little narrower than the window).
- Home no longer has "Character of the day" and "Quick load".

## 4.20.0

- New look, **Vertep**: a built-in dark theme (oxblood red accent, cyan primary buttons) and the default on a fresh install. An existing install keeps its chosen theme; Vertep appears first in Settings → Themes. Themes take an optional `cta` colour for primary buttons (missing = the accent). A fresh install also follows the theme's quote colour instead of a fixed green.
- Kurale is the heading font: page titles, navigation labels, chips.
- The navigation rail shows labels from 1280 px, in groups split by an ornament (Home, Chats · Characters, Marketplace, Personas, Lorebooks · Presets, Connections · Shortcuts, Tools · Settings at the bottom); narrower windows keep the icon rail with tooltips.
- Sections open as full pages with a large title and a count, from Home, Chats or another section. Over an open chat they still slide in as a drawer, so the chat and a running reply stay put.
- Navigation and page titles in Ukrainian: Settings → Interface language (follows the browser by default).

## 4.19.2

- The summary prompt ships with the plugin and follows its updates, like Litopys's: Settings keep one only when you changed it, **Reset** clears your copy, and a copy that is an earlier default word for word follows the new one. Settings read the default from the engine (`GET /settings/summary-prompt`) instead of carrying their own copy.
- Prompts that make a model write for you say which language to write in: the summary and the facts the chat memory finds follow the language of the story. The image-prompt writer says it writes English whatever the story's language, because image models expect English.
- `test/rp-prompts.test.ts`: every shipped prompt is English, and the ones that write for the user carry a language line.

## 4.19.1

- Litopys prompts ship with the plugin and follow its updates: `config.json` keeps a prompt only when you changed it, and the panel shows **Restore default prompts** when you did. A config holding an earlier default word for word follows the new one.
- New scribe and curator prompts: facts in the story's own language, a character's claim kept as theirs (not as world truth), one-scene details (mood, weather, time of day) left out, at most 8 new facts per pass, no restating what the record already says; the curator returns ops only for items that need one and never retires a fact for age alone.

## 4.19.0

- Litopys (formerly Archivarius) ships with the app: a world-lore keeper that
  extracts world facts, a chronicle and a running recap from each chat into
  `data/litopys/store.json` and `data/vault-chats/<character>.md`, and a
  curator that proposes clean-ups for approval. It reads `data/archivarius/*`
  until its first save, and an Archivarius copy left in `plugins/` stops running
  (`"replaces": ["archivarius"]`; needs Molfar Vertep 0.2.0 or newer).
- Chat memory recall matches Ukrainian and Russian word forms: stems, stop
  words, the typographic apostrophe, rarer words weigh more. Before, only
  lowercase Latin words of 4+ letters could match, so Cyrillic memories never
  surfaced by text. Duplicate detection keeps Cyrillic letters too.
- Plugin panels: `select` and `model` field kinds (the model picker groups by
  endpoint), hints, placeholders, row counts and an Advanced section.
- Settings: the memory model uses the same searchable model picker.
- Themes: optional per-level heading colors, the Neon Tokyo Night theme and
  two neon heading CSS snippets.
- `docs/ARCHITECTURE.md`: a detailed file map for agents editing the app.
- App skills in `.skills/`: `edit-large-card`, `roleplay-ui-orchestrator`.
