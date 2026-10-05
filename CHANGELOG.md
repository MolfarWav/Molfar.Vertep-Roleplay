# Changelog (Molfar Vertep fork)

Changes on top of upstream Roleplay 4.18.2 (`b509845`).

## 4.23.0

- **The dashboard updates right after each reply**, no longer about a minute later. An edit or a Continue of the newest message is read again; a swipe gets its own state. A line under the newest message says what is happening: updating, updated (how long ago, how long the reading took, and what the characters learned), behind, or not updated with a Retry. The sensor line under the strip shows the same by colour.
- **Dashboard settings** (the gear in the wide view and in the phone sheet): the sensor (automatic or manual, its model, its reply limit, the prompt insert and its limit, catch-up, automatic souls, event groups, call and token counters), the event vocabulary (change an event's numbers, switch events off, add your own, reset), what the model sees (the exact words each character gets before a reply, with checks for no numbers, no blind spot and only that character's notebook) and Tune with Molfar (an unsent request to Molfar to change the vocabulary or settings for you).
- **The sensor prompt in blocks**: role, language, truth, events, scene, knowledge, threads and reply size, each edited and restored on its own; joined, they are what the sensor gets.
- **Your notebook**: edit or remove any note (removed ones can be restored), write your own (marked "written by you"), and mark notes pinned (always reaches the story model), important (goes first) or everyday (dropped first when the words do not fit).
- **Threads you manage**: resolve, reopen, edit or add story threads; set how many may be open at once; every few turns (your setting) the sensor is asked whether old threads are settled. A question or greeting with nothing at stake is no longer filed as a thread.
- **How a character addresses you** is tracked (a name, a nickname, a title); a change shows in the story list and the story model uses it. A character who plainly knows you (serves you, lives or works with you) counts as knowing your name even when it was never said.
- **Start values from a Soul saved later now apply**: a character who entered before their soul had start values (or whose start values you changed) shifts by the difference, shown in the story list.
- Characters who act or speak stay in the scene when a cheap sensor model leaves them out; the sensor sees each character's pronouns; shorter sensor replies (no blind spot or notes about your own character, no single summary given to everyone as a fact).
- Each part of the day has its own colour and sign; the constellation spreads small values so changes are visible, with a legend in the wide view; the notebook chips in the strip open the notebook; long boxes in the wide view scroll inside.

## 4.22.0

- **Relationship dashboard** (new plugin "Relationship dashboard"): after replies a small model call (the sensor) reads the turn and names what happened; code turns it into each character's attitude to you (trust, comfort, attraction, respect, affection), pulse (excitement, arousal), a named pattern of the relationship (a constellation such as Friendship or Honor without trust), the scene clock and place, open story threads, and a notebook of what each character knows about you and how (saw, heard from someone, guesses). The sensor runs in the background about a minute after a reply; "Refresh" runs it at once. Swipes and rewinds follow the active line: a discarded swipe leaves no trace.
- **Characters act on it**: before each reply a short block of words (never numbers) tells the story model how the speaking character feels right now and what they know, so a character who has not heard your name does not use it. The block's token budget is yours to set (Tools → Relationship dashboard); when it does not fit, a popup says what was left out.
- **Soul tab on cards**: class (romantic, ally, neutral, hostile), starting attitude, traits and spectra that make a character warm up or take offence faster, triggers and values, coping, pronouns and other spellings of the name. The dashboard rates a card's main characters by itself after import (a proposal you accept, edit or dismiss), "Rate now" and "Rate with Molfar" do it on demand, and a card kind (single, narrator, group, assistant) shows on the card. Minor figures the story brings in never get souls.
- **Scene strip and wide view**: beside the chat (from 1024 px wide) a strip shows the time, place, who is present, the focused character's constellation and attitude bars, threads and notebook counts; it collapses to a thin rail. "Open dashboard" shows everything: tier phrases, what changed this turn with the arithmetic, our story with a ten-turn chart, the notebook with the character's blind spot, the ensemble and how the others relate. On phones a one-line bar under the chat header opens a sheet with Scene, Constellation, Notebook and History tabs. A chat without state offers "Build the dashboard".
- **Hide the rail's labels**: on wide windows a caret at the top of the left rail collapses it to icons and back; the choice is kept.
- **Persona filter shows every persona**, not only those already used by a chat, so it no longer disappears when all visible chats share one.
- **Regex bound to a preset**: the preset editor has a Regex tab with the scripts that run only under that preset: bind a free script, unbind, create, delete all. The Regex list is grouped by preset, global, character and chat, in run order, with add and delete-all per group.
- **Tools tabs are grouped** into Panels, Text & voice and System.
- Litopys: facts can be added, edited, retired and restored by hand, and a chat can carry your own recap (routes for the coming Memory panel).

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
