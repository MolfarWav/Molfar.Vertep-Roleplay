# Changelog (Molfar Vertep fork)

Changes on top of upstream Roleplay 4.18.2 (`b509845`).

## Unreleased

## 4.29.0

Lorebooks understand Ukrainian and Russian, say why an entry fired, and every setting the editor shows now works. Works on Molfar Vertep 0.9.3; no engine update needed.

- **Word forms in keys.** A Ukrainian or Russian key matches every form of its word: "вежа" also finds "вежі", "вежу", "вежею", so one base form per key is enough. A key of several words fires when they stand side by side in that order ("Червона Вежа" finds "до Червоної Вежі"). Short keys no longer fire inside longer words ("кіт" in "кітель"). A book switch, Word forms, and a per-entry override turn it off. Keys in other scripts get proper word boundaries ("Kraków").
- **Why an entry fired.** The keyword test, the Active viewer and the chat's Lorebook activity show for each entry the key that hit (and the secondary ones), "always on", sticky or "by meaning", the recursion pass and the chance. Entries that matched but stayed out say why: waits until a message, cooling down, lost the roll, lost its group to another entry, secondary keys failed, filtered for this character, cut by the budget.
- **A real keyword test.** Paste a message and the book is scanned the way a chat scans it (word forms, secondary keys, regex, recursion, groups), with the book as it is in the editor, unsaved edits too; pick a chat to bring its timers and card along.
- **Every setting works.** The editor offered settings nothing read; now: Min activations (too few entries fired: scan deeper into the chat), the character filter (by card or tag, or everyone but them), generation types (only on continue, swipe and so on), the book's Format template, Insertion strategy (the character's books first, global first, or evenly), Include names, and Group scoring. Positions next to the example dialogues and the author's note land there (they were saved as before or after the character), and entries no longer vanish when a preset has no world-info slot: they join the end of the system block.
- **A clearer lorebook editor.** The book list says which card owns or uses each book; settings come in groups with a hint under each; entries filter by on, off, always on, keyed, by meaning and "no keys" (entries that can never fire), and many can be enabled, disabled, copied or deleted at once; an entry shows the basics first and the rest under More options, in plain words. Works on phones.
- **Books belong to cards.** The card's Lorebook tab lists its own book and the linked ones: open, replace, unlink, add, or start a new book. A group chat reads every member's books. A book unlinked from a card stops firing in its old chats. Deleting a card can delete its own book with it, and deleting a book removes it from cards and personas.
- **Exported cards carry their book.** PNG and JSON exports are standard V2 cards with the card's own lorebook inside, so other apps get it; importing them here keeps sprites, gallery and the book's settings. Backups keep every lorebook field and which cards use which book.
- **Data Bank.** A file can belong to everyone, one character or one chat, and the search keeps to that. Ukrainian and Russian queries find other word forms and skip filler words; documents are cut at sentence ends; the passages take at most a small share of the context and name their file.
- **Translate a card, then decide.** In the character editor, Translate shows the translation in the card first, with a banner and a message that stays until you choose Save or Discard. The language follows the app's (it was English, which changed nothing on an English card), a card already in that language says so, and long fields (RisuAI scripts of 20 000+ characters) translate in pieces, keeping macros and tags. The Translate button is labelled and coloured.
- Fixes: imported lorebooks kept their extra settings only until the first save in the editor, and entry ids were renumbered on every save (timers and vectors then stuck to other entries); the book's case-sensitive, whole-words and vector-threshold settings never applied; a Trigger % changed in the editor was never used; an entry's own case setting now wins over the book's; translations of every provider are cut at paragraphs and sentences, not mid-sentence.

## 4.28.0

The Marketplace gets five more storefronts, cards of any size install with their emotion images, and cards can be translated. Needs Molfar Vertep 0.9.3 for cards over 16 MB and for RisuRealm thumbnails: update the engine too (on an older engine the rest works, and a big card says the engine is too old).

- **Six storefronts.** Next to Chub: **RisuRealm** (recommended, trending, newest, random, most downloaded; adult switch), **CharaVault** (an archive of cards from other sites: tags in and out, creator, token range, "has a lorebook", where the card came from, ten orderings), **Wyvern** and **Pygmalion** (their public catalogs, SFW without an account), and **JannyAI** (search, tags, token range; the site lets only your browser download, so "Get on JannyAI" opens the card's page and you drop the PNG on the bar above the grid). Every card shows where it is from, a gold **Lorebook** and a rose **Emotions** badge where the site says so, and each source keeps its own search, page and filters. Searches are kept for 5 minutes.
- **Paste a card link** in the Marketplace or on the Characters page: RisuRealm, CharaVault, Wyvern, Pygmalion, GitHub (also "blob" links), Hugging Face, Catbox and Discord files. JannyAI links open the page instead; other sites ask you to download and drop the file.
- **Big cards install.** A card is downloaded through the engine (up to 200 MB) and read in the app: a RisuRealm pack with 120 emotion images installs in about a minute. charx files (also RisuRealm's JPEG-covered ones), PNG cards with embedded images and JSON cards all work, and "Open character" goes straight to the new character.
- **Emotion images come in.** RisuAI's images ("x-risu-asset", also inside PNG cards) become the character's expression sprites, named without the character prefix ("Yrel_angry" -> "angry"). They are stored inside the card, so the app sizes them to what the card can hold: 512-640 px for 20-30 images, smaller for very large packs (a note says when some did not fit). Full-size images as separate files come in a later version.
- **Translate a card.** In the Marketplace's card window: Translate shows the card in your language (English by default), and "Install translated" installs it translated, its lorebook too (the translated keys are added next to the original ones, so entries fire in both languages). In the character editor: Translate for a card you already have, and "Restore original" to go back. It uses the provider set in Tools → Translation; the original texts are kept in the card.
- **Sprites follow Ukrainian and Russian replies.** The emotion detector knew English words only, so a chat in another language always showed the default sprite.
- **The floating sprite folds and resizes.** A × folds it into a small chip (a click brings it back), a corner handle resizes it; size, place and state are remembered.
- Fixes: PNG cards dropped on the Characters page or Home keep Cyrillic and Korean names intact (they came in garbled); V3 PNG cards that put the "ccv3" chunk first are read (they counted as "no card"); a chub link now imports from the card PNG itself, with all its fields; a charx whose main icon is large still gets a portrait.

Models are set up in one place, chats can continue each other, and portraits show everywhere. Needs Molfar Vertep 0.9.2 for the model settings and the quick switch: update the engine too (on an older engine the app still runs, without them).

- **Models in one place.** The Connections section is gone from the rail. Which models the pickers show, the quick switch (starred models, each with a name of your own) and every model's context window, prices and parameters live in the shell's Settings, "Connections and models". The chat's preset · persona · model switch offers the quick switch first, then the other models, and "Set up" opens the model's settings; on phones the switch sits in the bottom bar. Your old connection profiles become the quick switch once, with their names.
- **A model per chat.** Each chat remembers its own model; a new chat starts with the one you chose last.
- **The model's parameters come first.** Temperature, max output, reasoning and the rest belong to the model now (set in the shell's Settings), and the app budgets the prompt with the model's own context window. Your preset's samplers fill in only what the model leaves unset; a preset switch, "This preset's samplers override the model", lets them win. The first time, the default preset's samplers become the current model's parameters.
- **Chats that continue each other.** The Library's map is now the map of one chat: the chats it continues above, the ones that continue it below. Search for an earlier chat to link it, like a backlink, and the new chat gets the earlier story (Litopys chapters and key facts) as backstory in every reply, within the "Backstory budget" of the Library settings.
- **Portraits everywhere.** A portrait set in the Library shows on the dashboard and in Soul too (narrator-card and lorebook characters stop showing initials); a click on the focused character's avatar on the dashboard, or on the large portrait in Soul, changes it.
- **Full screen drawers.** Connections, Presets, the Library, Lorebooks, the Marketplace and Characters open full screen with a button in their header.
- **"Story, move" only arms the note.** With an empty box it no longer sends at once; your Send or Enter carries it.
- Fixes: the card id copy button works inside the app frame; prices no longer show floating-point noise ("$0.42000000000000004").

## 4.26.1

Two fixes.

- **The map of chats in the Library closes.** Before, once opened it stayed on screen whatever you pressed; now the map button opens and closes it, and Overview or Ledger brings back that view of the chat.
- **"Story, move" with an empty box no longer leaves a "..." turn.** It lets the character carry on with no turn of yours, even when your preset turns an empty send into text (presets imported from SillyTavern often send "..."). The event it brings in now grows from what is already in the scene (someone's intent, a danger or promise already set up, the place itself) instead of out of nowhere.

## 4.26.0

Molfar learns the craft of cards, lorebooks and presets. The skills use the json_get and json_set tools of Molfar Vertep 0.9.1: update the engine too.

- **Four skills for Molfar**, loaded when a task needs them: `card-craft` (a new character, or a deeper one: description and personality, first message, example dialogue, what makes a character flat or speak for you), `card-import` (a card or lorebook from JanitorAI, RisuAI, Wyvern or pasted text, adapted to this app), `lorebook-craft` (a world that holds together, entries that fire) and `preset-craft` (writing, auditing and porting presets). Each is a short procedure of a few tool calls; `edit-large-card` is cut down the same way.
- **One reference for the data files**, `docs/DATA-FORMATS.md`: every field of cards, lorebooks and presets, the macros (`{{roll}}`, `{{random}}`, `{{pick}}`, `{{setvar}}`…) and regex scripts. The skills point to it instead of copying it, and a test fails when the code writes a field the page does not name, so it stays current.
- **The card's id in the character editor**, copied with one click: give it to Molfar so it edits exactly that card.

## 4.25.1

A new example character for new installs.

- **Dzvinka replaces Ember.** The example card that came from the upstream project is gone; new installs get Dzvinka, a mavka who keeps a spring below a mountain pass, with her Soul already filled in (the relationship dashboard works from her first message) and her own lorebook, *Dzvinka — The Beech Spring* (seven entries: the spring, the pass, mavky, wormwood, the village and its molfar, Kupala night). Her card says who made it: Molfar Vertep. Existing installs keep their characters and chats: app updates never touch `data/`.

## 4.25.0

Memory v2: one story memory per chat, Litopys, which you can see and edit in the Library.

- **Litopys is the chat's memory.** It cuts the story into scenes and, in the background, writes one chapter per finished scene (what changed, not a retelling) and the facts that came out of it: who they are about, who knows them, their kind (event, trait, lasting change, relation, world, plan) and weight. A scene gets its chapter once the next scene begins. The memory model is set in Litopys's settings (empty = the chat's own model).
- **Long chats stay in the model's window.** Messages Litopys already holds leave the prompt, except the newest ones (Recent messages, 20 by default), which always go word for word; in their place each reply carries one Litopys block within a token budget (800 by default): pinned facts first, then traits and lasting changes of the characters present, the last chapter that left the prompt, then other facts and chapters by relevance. A character only gets facts they know. Messages that left the prompt are dimmed in the chat, with a divider.
- **Arcs**: when the older chapters outgrow a threshold (twice the budget by default), neighbouring chapters can merge into one short arc that rides the prompt in their place; the chapters stay in the record. By default the Library asks first (Merge, Not now, Always merge automatically). Every number is a setting.
- **The Library** (the rail section that was Litopys) shows every chat's record two ways. **Overview**: the chapters as a timeline with their facts, arcs as bands over their chapters, the waiting proposals, and a card per character (pinned facts, traits, changes, relations, what they know about others) with a portrait you can set for names without a card. **Ledger**: tabs for chapters, facts, proposals and activity, with filters and search. In both you edit, pin (up to 5 per character), retire, restore and delete facts, edit, rewrite or delete chapters (and keep a scene out of the record), and accept or reject what Litopys proposes. A line says what the worker is doing (writing, waiting, failed and retrying, stalled). A map shows chats and the chats forked from them.
- **Back to the source**: "Open the messages" on a chapter or a fact shows the messages it came from, and the Ledger searches the original messages, never the summaries.
- **The chat's Memory item** opens its record: how many messages left the prompt, what the last reply carried, and **Rebuild from scratch**, which writes a new record beside the old one and swaps it in when done (your own, edited and pinned facts and your edited chapters stay).
- **The built-in Memory is gone**: its summary and facts move into Litopys by themselves (the old memory file is removed after the move), as do Litopys 1.x facts. Roleplay Settings has a Litopys section instead: model, recent messages, insert and budget, scene sizes, pin limit, arcs and the prompts.
- **Records are written in English** by Litopys, the dashboard's sensor and fast mode, whatever the story's language, so they hold up across models; names stay as the story spells them.
- **The history fits the context window by tokens**, keeping room for the reply and for the dashboard's and Litopys's inserts; Next, swipe, Continue and Impersonate use the same matching as Send.
- **Dashboard**: notes follow the scene, near-duplicates are not written, the sensor gets the newest and the most relevant notes, and important or key notes older than 30 turns move into Litopys facts.
- A chapter that comes out longer than its messages is asked for again, shorter. Replies some models return in a flat shape are read. Deleting a chat deletes its memory too. A language stored before 4.20 ("English") is read again instead of the browser's.

## 4.24.0

- **"Story, move"**: one press makes the next reply move the story on its own, pulling on the dashboard's open threads (all of them, or the one you pick). The nudge rides that one request only: it is never saved in the chat or shown as a message. Its wording is a setting.
- **Dashboard fast mode** (for strong models; Settings of the dashboard, Mode): the story reply itself ends with the state report, which is cut out before you see or save the reply, so there is no separate sensor call. It adds some text to every request (the settings say about how much); when a reply leaves the report out or it cannot be read, the usual sensor runs.
- **New chat look**: messages read like a book page (Noto Serif, more line spacing; your own font and spacing choices are kept), characters in an arched portrait, your turns set off to the right, and a heading with an embroidered band where the story moves to a new place (from the dashboard). Message actions (Edit, Copy, Regenerate, More) show under the text when you point at a message and always on phones; More is grouped into Message, Story and Delete. Model, time, tokens and cost of a reply show on hover. The display mode, avatar shape and message tint settings are gone: there is one look.
- **From the chat to the card**: clicking a character's portrait (in a message or the chat header) opens Card, Soul, Dashboard and View portrait; in a group chat it acts on the character who spoke. The chat header's model and cost badges moved into an "i" button with the chat's model, spend, tokens and context use, and the header no longer gets cut off on narrow windows.
- **A reply that starts with the character's name** ("Aria: …") no longer shows the name twice: new replies lose it when saved (also in group turns), older ones hide it on screen.
- **Litopys** adds its lore to replies only when you turn on "Insert into the prompt" in its settings (off by default). It never actually reached the prompt before because of an engine bug fixed in Molfar Vertep 0.8.1; the dashboard's own insert, "Story, move" and fast mode need that engine version too.
- The browser tab shows the Molfar Vertep logo.

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
