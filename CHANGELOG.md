# Changelog (Molfar Vertep fork)

Changes on top of upstream Roleplay 4.18.2 (`b509845`).

## Unreleased (4.49.0)

Large libraries (MolfarWav/Molfar.Vertep#46). With engine 1.1.2 the start stays fast; an older engine works too, re-reading every card at each start.

- The app starts from a short list of characters (name, portrait, tags, the start of the description, a token count) kept in an index under `data/.cache/`, and loads a whole card when it is opened, chatted with or exported. Before, every whole card was loaded at start: with about 700 characters the app no longer opened. Measured with 2,000 cards: the start takes about 2 s; the first start after the update builds the index in the background (about 25 s for 2,000 cards, the list fills in meanwhile).
- Portraits kept inside the cards come when a list shows them: the characters with recent chats and favorites at start, the rest page by page on the Characters page. A tile shows a soft placeholder while its portrait comes, and the list says how many characters are still being loaded on that first start.
- Search on the Characters page covers names, tags and the first 1,000 characters of a description (until now the whole description); token counts on the tiles are estimates (marked ~) until the card is opened.
- Importing many cards at once sends them in batches of 25: a few hundred in one request ran out of time halfway, with part of the cards written and an error on screen.
- Characters page: counting chats per card no longer slows the page down with thousands of chats.
- Dashboard threads: a resolved thread stays resolved. A thread you added came back open one turn after the sensor closed it (MolfarWav/Molfar.Vertep#47); resolved threads now stay in the list's Resolved part as history (the newest 20, with the turn they closed on) instead of vanishing after a turn.

## 4.48.0

Molfar as a second built-in preset, option hints, and fixes. The faster export and the hidden Molfar blocks need engine 1.1.0; the rest works with any engine.

- Presets: Molfar ships next to FRANKENX, read-only, with eight regex scripts bound to it that hide its plan, inner voice and focus log. An update adds it when missing and keeps a copy you already have.
- Every option in the Choices panel can carry a short hint saying what it does: under the option in a list, in a tooltip and a line under the group for chips. All options of FRANKENX and Molfar have one; the preset editor edits them; Marinara imports bring their descriptions.
- The preset picker shows how many tokens each preset takes with this chat's picks, instead of the section count and temperature.
- Canvas: the Prompt board's chat picker searches by character and title, lists recent chats first, marks groups and tells two chats of the same character apart.
- Dashboard: the notice after a reply says how many notes about you were left out of that reply and that they stay in the notebook; it suggests a bigger limit only when even the pinned notes do not fit (MolfarWav/Molfar.Vertep#35).
- Export Roleplay data: packed by the engine, about 1 s instead of a time-out on an 8 MB workspace (MolfarWav/Molfar.Vertep#37).
- What's new: a tip points at Presets and Molfar after the update.

## 4.47.0

A help list with "Show me", and tours for seven more sections. Works with any engine.

- Help: "?" in the left rail (on a phone in More, and in the chat menu) lists what the app can do, grouped, with a search in English and Ukrainian that also knows other apps' words ("world info", "swipes"). "Show me" opens the place and points at the button: the chat menu, the Dashboard, an editor tab, the Groups list, a lorebook, a preset, the commands reference.
- Tours on the first visit to the chat menu, the Dashboard, Soul, the Library, Characters, Groups, Lorebooks and Presets. Settings → Guide turns them off or plays them again.
- Message buttons that show on hover stay visible while the guide points at them.
- The commands and macros reference opens without a chat.
- The bug tip says that Report a bug can hand the problem to Molfar first.

## 4.46.0

A short guide to what is new, safer drafts, and fixes from a day of testing on a phone. Works with any engine; the "not saved" warning needs engine 1.0.9.

- Guide: after an update, What's new shows what changed since your last version, one tip at a time; short tours point out the Canvas links, the Prompt board and the composer on first visits. Settings → Guide turns tips off or shows them again. English and Ukrainian.
- Drafts: a "Write for me" result that arrives late goes only into the chat it was asked for, and only over the draft it started from; otherwise it is offered, not pasted over what you typed. A message that could not be sent comes back into the composer with its attachments. When the browser refuses to save a draft, an amber line says so, with Copy.
- Phone composer: two rows, not three. Write for me and the big editor sit beside "+" and Send; Continue and Another are in the "+" menu.
- Number fields: an emptied field no longer turns into 0 with the next digits typed after it ("07500").
- The context ring in the chat header and the "out of context" line count against the model's context window, as the request does; they used the preset's 8192 and could show over 100 %.
- Profile, Structure it: a long card no longer fails with "not JSON" (the reply had been cut off). If it still fails, the message says whether the reply was cut off or not in the expected format.
- Links to Settings or Molfar that the engine refuses now say why: a copy restored from a backup is not counted as official until it is checked (engine 1.0.9 checks it by itself).
- Dashboard and Litopys: notes and facts are ranked against the scene indexed once, so a long chat with many entries no longer runs past the script time limit. A reply whose Dashboard insert fits clears the old "trimmed" notice.

## 4.45.0

Quick moves under a long draft, tidier phone pages for Characters and Lorebooks, and a clearer empty Library. Works with any engine.

- Composer: once a draft wraps, three coloured buttons sit under it: Continue, Write for me and Another (they were only in the "+" menu), plus a button for the big editor. On phones they take their own row. Write for me replaces the draft with a written message, and Undo in the notice brings your draft back.
- The big editor can take half the screen (the chat stays in view) or all of it; your choice is remembered on the device.
- Characters on a phone: the Characters / Groups switch and New on top; search, Filter and a More menu under it. Filter opens a sheet with the sort and every tag, wrapped, instead of a long row you swipe sideways; active tags show under the search, each with an ×. Import, a new group, selecting several and grid or list are in More. Desktop is unchanged.
- Lorebooks: a filter next to the search (all, global, on a card, not linked). Import and "Active in the open chat" moved from the bottom bar into a More menu.
- Library: a chat whose record has nothing in it yet shows one explanation of when the first chapter comes, with Open the chat, instead of "Up to date" over two "none yet" lines.
- Soul: Rate now / Rate again rates on the spot; the "Rate with Molfar" buttons are gone.
- Advanced (character editor): the system prompt override, scenario and personality summary say what they do.
- Groups: dialogue colours are readable on light themes (the pale yellow is gone); dark themes are unchanged. The group editor's tabs show their names on phones.
- Dashboard: five more events the sensor can name, seen as "other" on real chats: introducing oneself, inviting to meet, standing one's ground, an ultimatum, a veiled hold over someone.
- The browser tab and a few texts say Molfar Vertep instead of Chrysalis.

## 4.44.0

The Canvas gets a Prompt board: see what goes into a chat's request and switch parts off for that chat. The chat-links board fills one chat at a time. Works with any engine.

- Canvas, Prompt: pick a chat and see every part of its request in order (main prompt, preset sections, card fields, persona, each lorebook, chat history, data bank, author's note, Litopys, Dashboard), each with its tokens, wired into "Request to the model" with the total. A part can be switched off for this chat only; the preset and the card do not change. Parts the preset, a condition or the reply type leave out say so on their card. Details list what was taken and why something was left out, and show the text. Changes save at once; Ctrl+Z undoes them. On a phone the List view has the switches.
- History filter (on the Chat history card): send only the last N messages, only the player's or only the character's, and without thinking blocks. It applies before older messages are cut to fit the context.
- A Litopys or Dashboard switched off for a chat does no work for it at all; a lorebook switched off is not scanned, even a global one or one bound to the persona.
- Canvas, Chat links: the board starts empty and a list on the left holds the chats that are not on it, with search and sort. Drag a chat onto the board, or use "+", or put it there with all its linked chats; drag a card back onto the list (or Remove) to take it off. The view stays where it is after a drop or a move.
- The switches live in the chat's meta (`promptBoard`, see `docs/DATA-FORMATS.md`); a forked chat keeps them.

## 4.43.0

Fixes from the Tuesday bug batch (2026-10-14). Works with any engine; the reply pick-up after a reload needs engine 1.0.7.

- Dashboard: a character you text, call or write to stays in the scene. The insert says they are not in the same place and how you talk, so the model no longer forgets a conversation is by message (GitHub #16).
- Chat: reloading while a reply is being written no longer loses it. The chat shows "Writing" with the live text and picks up the reply when it is saved. A reply that never arrives ends "Writing" with an error instead of counting forever (GitHub #13; needs engine 1.0.7, older engines behave as before).
- Composer: once a draft wraps, the message box takes the whole width and the buttons move under it, on phones and desktop (GitHub #20).
- Dice: roll_dice takes what the roll decides and an optional difficulty; the result reads "Leap over the gap: 1d20 → 14 vs 12, success". A dice tool you never edited picks this up by itself (GitHub #14).
- Gallery: new images are stored in the engine's asset store and the card keeps only their link, so adding many images no longer fails; older images move there on the next add. Only images can be added (videos were skipped silently). A character save that fails is undone on screen and says why (GitHub #17).
- Error texts name Molfar Vertep, not Chrysalis.

## 4.42.0

A new Canvas tab: the links between Library chats as a board you edit with the mouse. No engine change needed.

- Canvas (left rail): every Library chat is a card; drag a wire from one chat's bottom dot to another's top dot and the second continues the first (it gets the earlier story as backstory). A wire that would make a loop is refused with the reason at the pointer; click a wire to select it and delete it; drop a card on a wire to put it between two chats; Undo from the toast or Ctrl+Z, Redo, Tidy, Fit, Edit/View. Branches forked from a message show as dashed wires you cannot edit. Remove only hides a chat from the board.
- Phones: the Canvas opens in View mode with a list where each chat's "Continues" is a pick.
- Library: the chat map is the same board in View mode, and "Edit links on the canvas" replaces the map's own search-and-link box (one place to edit links).

## 4.41.1

A card edited outside the app no longer takes the app down, and menus scroll on Android again. Works on Molfar Vertep 1.0.0 and later.

- Fixed: on Chrome and Brave for Android, the lower part of a sheet or menu (the chat menu, Dashboard settings) would not scroll by touch while a character's expression sprite was shown under it. The sprite now steps aside while a sheet or menu is open on a touch screen.
- Fixed: a card edited outside the app (by Molfar, a script or by hand) could take the whole app down when its editor opened, with only "Script error" on screen. A list written as one line (`"strengths": "brave, kind"`), a number where text goes, or an object where a list goes is now read as the app expects, in the card and in its Profile.
- A page that still fails to draw shows what went wrong, with "Copy details" and "Try again", and the rest of the app keeps working. The character editor's Profile and Soul tabs fail on their own, without the editor.

## 4.41.0

A new chat header and menu on phones, replies that survive a locked phone, your own default preset choices, regenerate with a hint, and translation per field and per lorebook. Works on Molfar Vertep 1.0.0 and later.

- Preset choices: "Save as my default" in the chat's preset choices (stock presets too). New chats with that preset start with these choices; a character that already has a chat still starts from the choices of its last one. "Use my default" and "Forget my default" sit next to it. Stored in `data/preset-defaults.json`.
- "Regenerate with a hint…" in the "+" menu: write what the new reply should do differently. The hint goes to the model for that one reply, as the last instruction, and is not saved in the chat. It always makes a new variant.
- Card editor: a "Translate" button on Description, Personality, Scenario, First message, Example dialogue and each alternate and group greeting. It translates that one field into the card's translation language, with Undo in the notice.
- Lorebooks: a translate button in the book's header translates every entry. Translated keywords are added next to the original ones, so entries fire in both languages. By default it keeps a copy of the book as it was.
- Settings, Streaming (and the chat's Display sheet): "Show replies" as the model writes them (default) or only when they are finished.
- Translation without a model: Google, Lingva and DeepL are in Tools, Translation. The new translate buttons use whatever is chosen there.
- Fixed: after switching away from the browser mid-reply (common on phones), the chat could show "…" forever until a reload. On return the app now checks whether the reply was already saved and shows it.
- While the model works, the empty reply shows moving dots and, after a few seconds, how long it has been writing.
- Streamed text keeps up with fast models: the typewriter speeds up when it falls behind.
- Fixed: after Stop and regenerate, switching variants with the arrows could show the same text on every variant. Each variant now keeps its own thinking and tool steps.
- Dashboard: a reply with no text (only thinking, or cut off) no longer starts a dashboard update, so no tokens are spent on it.
- New chat step: picking options before the character's remembered choices load no longer gets undone by them.
- Stock presets: the Samplers page tabs can be opened to read the other pages. The Groups block in the prompt manager says in plain words what a group does.
- Phones: a new chat header. It shows the character's portrait and name (a long name scrolls slowly), the chat's title, a ring with how full the context is, and one "Menu" button. The portrait opens the card, the soul and the full picture. The ring opens the chat's details: model, tokens, context.
- Phones: "Menu" slides in from the side. On top: who you play as (opens the persona), then big Preset and Model buttons that unfold their choices in place. Below: everything you do with this chat (find, next chat, author's note, lore activity, story record, branches, bookmarks, display, new chat, delete messages, chat files). The other sections sit at the bottom under "Go to". The preset, persona and model strip under the header is gone.
- The "+" next to the message box keeps only quick actions: regenerate, continue, impersonate, and the compose tools. New chat, delete messages and chat files moved to the chat menu ("⋮" on wide screens).
- Phones: the scene strip shows a small dashboard chip, so it is clear that a tap opens the dashboard.
- Phones: tab rows that run off the screen say so. The side with hidden tabs fades and shows an arrow that pages the row, and the open tab stays in view (card editor, group editor, preset editor, samplers). Tools wraps its tabs onto a second line instead of hiding them past the edge.
- Fixed: on Chrome and Brave for Android the lower part of a chat would not scroll by touch when a character's expression sprite had not loaded (an invisible sprite panel caught the finger). The panel now ignores touches until its picture loads and hides when the picture fails.

## 4.40.0

Turn settings per chat in groups, and a clear way to pick who speaks. Works on Molfar Vertep 1.0.0 and later.

- Group chats: turn settings belong to the chat. The group keeps its settings as the default; each chat can change its own from the new "Turns" button above it (generation mode, who answers, self responses, auto mode, who is silent and the members' order), and go back with "Use the group's settings". A new group chat can pick its generation mode in the new-chat step. One group can now run as Narrator in one chat and turn by turn in another.
- "Only the member you pick" (was "Only when you trigger a member"): a "Who answers?" row above the message box makes a member speak in one tap. Before, the only way was a member's chip, then "Trigger reply", and the send looked like a reply that vanished.
- Fixed: a group set to "only the member you pick" and then switched to Narrator never answered (the hidden "Who answers" stayed manual). A narrator now always answers.
- Fixed: right after a reply, a group chat could briefly lose its turn settings (auto mode read as off, the popover showed the defaults) until the next refresh.
- Plain names with a line of help: "Allow self responses" is "The same member may answer twice in a row" and shows only where it does something (who answers: Natural); "Auto mode" is "Keep the scene going on its own". Auto mode is hidden and paused while only you pick who speaks (a bare send there made nobody answer).

## 4.39.0

The Chats panel opens what it names, and the small fixes from the UX audit. Works on Molfar Vertep 1.0.0 and later.

- Chats page: the chat's details open their sections. A member chip opens that card, the group name or portrait opens the group editor, and the persona, preset and each lorebook open in their own section. A target that no longer exists stays plain text.
- UX audit, the small fixes:
  - Plain words instead of developer text: dashboard errors say what happened, with the raw reason under "Details"; a soul rating that failed on unreadable JSON says so; the marketplace says it could not be reached, with the detail behind an info button.
  - Labels: the Groups tab's title says "Groups"; "Single" / "Narrator" instead of capitals; "tokens", "permanent tokens" and "1 chat" instead of "tok" and "1 chats"; a silhouette and "No portrait" instead of the "?" image.
  - One of each: the stock preset shows one neutral notice and one "Create editable copy"; read-only prompt rows show a lock instead of a pencil; the Soul tab has one rating button and "Delete soul" moved into a "⋯" menu; Home hides the Create card while the hero shows the same three buttons.
  - Hints: one line under Post-history instructions, Depth prompt, @ depth and Role; under the soul's Class and start values; "Story, move" says what it does (and shows it on a tap). Lorebooks, Personas and Shortcuts get info buttons that open on click or tap (a new `ui/info-tip`). "Test keys" is "Test triggers".
  - Switches are "on" in the theme's second accent (cyan in Vertep, green in Daylight) instead of red, which now means destructive only.
  - The card editor shows "Saved" after an edit. The Chats list has a "New chat" button. A chat titled with the character's name shows its last line instead of the name twice.
  - Library: one name for the section; Litopys is introduced once as the chronicler; one empty state that says what appears and when.
  - Settings, Appearance: split into Text, Layout and Motion, with "Restore defaults" for those controls.
  - Group chats in narrator mode show the group's portrait next to the narrator's replies.
  - Phones: the "no model" chip shows and opens Settings (a toast explains when the app may not); list rows that open a page have a chevron; message actions and info buttons are 40 px targets; the Daylight Home hero text sits on a scrim.

## 4.38.0

Groups write their own scene, and the Chats page shows what each chat is about. Works on Molfar Vertep 1.0.0 and later.

- Group editor, Scene tab: "Generate the scenario" writes the shared scenario, either from the members' cards or as something wild, with an optional wish (its language sets the scenario's language). "Generate opening" then writes openings from that scenario, one at a time and unlike the ones the group already has. Each result is a draft you can edit, use, retry or discard; nothing on the group changes until you accept it. The model of the group's latest chat writes it (else the app's chat model). Muted members are left out.
- Chats page: the list sits on the left, grouped into Pinned, Today, This week and Earlier, each heading in its own colour, with One-on-one / Groups filters, three sorts and Select for moving or deleting several chats at once. The right side shows the picked chat: Continue, Pin, New chat, the story so far from Litopys, the last three messages in each speaker's colour, and its persona, preset, model, history size, lorebooks and turns. On a phone the panel opens after a tap.
- Chats can be pinned to the top of the Chats page (a `pinned` flag on the chat; pinning does not count as activity).

## 4.37.0

A UI round: groups get their own colour, FRANKENX's prose language is a pick, group members differ in how much they talk, and Molfar writes cards into the Profile tab's fields. No engine change needed.

- Characters page: the Characters / Groups switch is two separate tabs with icons and counts; groups have their own colour (violet), also on group tiles, the Group button and group chats in the Chats list (a ring and a small group mark on the picture).
- FRANKENX: Prose language is a pick instead of free text: the 14 interface languages plus "Same as my messages" (replies follow the language you write in). English stays the default. An update turns the old text field into the pick in every preset that still has it; an old answer written as the English name of a language ("Ukrainian") keeps working.
- Group chats: talkativeness differs per member. A card without its own value, or with SillyTavern's usual 0.5 (written into nearly every card), gets a guess from its personality (shy, quiet, reserved... versus chatty, loud, outgoing..., in English, Ukrainian and Russian). The group editor shows each member's value on the row, says whether it is the card's or a guess, and its slider starts from that value instead of 50%.
- Profile tab: a profile written outside the tab (by Molfar) without `compiled` is turned into the card's text on the next load, the old text kept as a version. Molfar's card skills (card-craft, card-import, edit-large-card) now write new and structured cards into the profile fields and set talkativeness.

## 4.36.0

The dashboard works with thinking models: it follows the chat preset's thinking settings instead of thinking without limit and returning nothing, and its bigger event vocabulary catches more of what happens in a scene. Works on Molfar Vertep 1.0.0 and later; for a local server (llama.cpp and the like), Molfar Vertep 1.0.1 lets the preset switch the model's thinking on and off.

- Dashboard: its sensor and soul rating calls think the way the chat's preset says (level, thinking budget, thinking tags), and a thinking budget adds to the dashboard's reply limit. Before, a thinking model got no budget there, spent the whole limit thinking and gave an empty answer.
- Dashboard: an answer that is all thinking says so, with what to change, instead of "the sensor returned nothing"; a thinking block written inline before the JSON no longer breaks reading it.
- Dashboard: importing many cards at once no longer rates each one with a model call; a single imported card is still rated, the rest when first played.
- Dashboard: the note before each reply, and fast mode's state instruction, say the reply stays in the story's language (the notes are in English, and small models followed them into English).
- Dashboard: a bigger event vocabulary, so fewer turns land in `other`. New events: manipulated, abandoned, respected or pushed a limit (trust); teased, confessed feelings, shared a meal, shared a victory, checked on them, thanked them (warmth); impressed them, taught them, acted cowardly (power); turned down their advance (body); attacked them, jealousy, forgave them (conflict); comforted them, kept them company (care). Clearer meanings for `protected_her` (now also a rescue), `protected_her_standing` (taking their side) and `insult` (also mockery). On 72 test scenes in Ukrainian, Russian and English, a cheap sensor left 2 to 6 turns with no usable event instead of 39; a small local-class model improved too, though its results swing a lot between runs. The sensor prompt grows by about 300 tokens; event groups can still be switched off per chat.
- Dashboard: an event id the sensor writes with its family in front (`trust.shared_secret`) counts as that event instead of `other`.

## 4.35.0

Group chats: a group has its own card and editor, a narrator mode that voices every member in one reply, and each member's dialogue in its own colour. Works on Molfar Vertep 0.9.7 and later.

- Groups: deleting a group works and takes its chats with it (it used to come back after a reload); the members stay.
- Groups: a group's description names its own members, not every character; Home's character count leaves groups out; a group's card menu no longer offers Duplicate, Convert to persona or Export PNG; a group's favorite is kept.
- Groups: a group has its own editor (Characters › Groups): members with their order, mute, talkativeness, opening and dialogue colour in this group; a shared scenario and openings; turn order; the group's own lorebooks and which members' books count; its chats.
- Groups: a narrator mode, the default for new groups: one reply voices every member. In group chats each member's dialogue takes its colour.
- Character and persona profiles: "Fill empty" scrolls its proposal into view; it opened at the top of the card, out of sight of the section you pressed it in.

## 4.34.0

Each tool's settings live with it: Litopys in the Library, the dashboard in its own settings; every prompt restores to its default on its own. Works on Molfar Vertep 0.9.7 and later.

- Library: Litopys settings open from a gear in the Library, next to the record they shape, with the Chapters and facts switch that used to sit in Tools. Settings › Memory points there.
- Dashboard: its settings in the chat now hold everything the Tools panel had: when notes leave the insert, and the soul rating, "Story, move" and fast mode prompts. A gear opens them before the dashboard is first built.
- Dashboard: "Open dashboard" sits at the top of the side strip, in the accent colour; at the bottom of a long strip it went unseen.
- Tools: the Litopys and Relationship dashboard panels are gone (each one's settings live with it now).
- Prompts: each Litopys and dashboard prompt restores to its default on its own; the sensor's "Restore default prompts" no longer resets the other prompts.
- Presets: each utility prompt in an editable preset (Impersonation, Continue nudge, New chat, Group nudge, Empty send) gets "Restore default" when its text differs from the shipped one.

## 4.33.0

A character card split into fields you can see and switch, filled by the model from the text or the portrait, and the same for your persona. Works on Molfar Vertep 0.9.7; reading pictures needs 0.9.8.

- Character editor: a Profile tab, a card split into fields modeled on Lorebary (identity, appearance, traits, behaviors, goals, background, relationships, an opt-in adult block). It writes Description and Personality as labeled lines, keeps the old text as notes, notices hand edits and has a Free write switch.
- Profile tab: "Structure it" asks the model to sort the card's text into the fields and shows what Description and Personality would become; Accept fills the profile (the old text goes to Versions), Discard drops the proposal. New field: Occupation.
- Personas: "Five questions" writes the persona's description from short answers (name, looks, character, who you are; a private note stays out of the prompt), keeping text written before.
- Character editor: Export offers PNG, CHARX (the portrait, emotion images and gallery as files, readable by RisuAI and this app) and JSON. No exported card carries its version history (old texts and drafts) any more; the full backup still does.
- Character editor: header buttons say what they do; Export has an export icon; saving a whole card keeps studio keys other tools wrote.
- Presets: "Use in this chat" and "Make default" are two separate actions.
- Profile tab, second round: many more fields (birthday, weight, measurements, pet peeves, guilty pleasures, core beliefs, motivations, hobbies, career and growth goals, origin, circles, trauma, more of the adult block). Every section has a switch: an off section keeps its fields and writes nothing, so a small context window pays only for what is on. Sections have their own icon and color, a side list jumps between them, and lists are chips.
- Profile tab: "Fill empty" asks the model for the empty fields of one section or the whole profile and shows them for Accept; it reads the portrait with the engine's Vision model (Settings > Connections and models; a picker here can override it or turn the portrait off). Engine 0.9.8 for pictures; older engines fill from the text.
- Profile tab: "Read from picture" in Appearance reads the portrait or an attached picture and proposes the appearance fields (optionally rewriting filled ones; the old text goes to Versions).
- Personas: a Profile section with the same fields, and "Structure it" to sort a pasted persona text into them.
- Character editor: the tabs have icons and are grouped (text, world, look, tech).

## 4.32.0

Where every part of the prompt comes from, and sends that stay fast with big lorebooks and preset regex. Works on Molfar Vertep 0.9.6; Molfar's prompt inspector shows the sources from 0.9.7.

- **Sources in Prompt peek.** Above the blocks, a table of what the next request is made of: card fields, the persona, each preset section by name, each lorebook entry with why it fired, Data Bank chunks, the author's note, every history message (with the regex scripts that changed it) and the prefill, with tokens and share. A click marks that part in the text; Esc clears it. Below: what was left out and why (sections switched off, gated by a condition or not for this kind of reply; entries that did not fit or were filtered; how many entries' keys were not in the text; history the budget trimmed or Litopys keeps as chapters) and the preset's choices in effect.
- **The same in Molfar's prompt inspector** (engine 0.9.7) for every real reply, with what Litopys and the dashboard added labeled too.
- **Faster sends.** A big lorebook made every send slow: 300 entries took about 3 s on a desktop and 1000 entries ran past the plugin time limit, on phones much sooner ("script execution has exceeded the maximum allowed time limit"). Keys are now looked up as text first (the same matches as before): 300 entries in about 0.3 s, 1000 in 0.6 s. Macros skip text without `{{`, and regex scripts are read once per send and skip messages that cannot match: a 400-message chat with 150 preset regex scripts went from 3.3 s to 1.3 s.
- **Counts read right.** "1 entry", "1 global book", "5 повідомлень": counts take the right word form in English and Ukrainian.

## 4.31.0

Presets with options you pick for each chat, Marinara presets, and FRANKENX built in. Works on Molfar Vertep 0.9.5; no engine update needed.

- **Options per chat.** A preset can offer choices (point of view, tense, reply length, genre…: one option or several) and switches that turn whole blocks on or off. Each chat keeps its own picks: open the chat header's switch, **Preset**, then **Choices**. Every option shows how many tokens it adds, the panel shows the preset's total, and **Reset to defaults** goes back to the preset's own picks. Changes apply from the next reply.
- **Pick the preset when a chat starts.** A new chat opens a short step with the preset and its options ("Start" keeps the defaults). It remembers each character: the next chat with them starts with the preset and options you picked last time. Settings › Chat Behavior turns the step off.
- **This chat only.** Switching the preset in a chat changes that chat; **Make default** is its own button. A muted line in the chat says what changed ("Point of view → First"), never sent to the model.
- **FRANKENX 1.6** ships as a ready preset (read-only; duplicate it to edit): a simulation-style roleplay preset with 15 options and 6 switchable blocks, adapted to this app: no scene header (the scene heading and the dashboard track time and place), no tracker agents, the prose language as an option. Its instructions take about 13k tokens: use a model with a 32k window or more.
- **Marinara presets import** with their options, groups, in-chat depth sections and defaults.
- **Writing presets.** In the editor, Variables gain the Choice type (options with a label and the text they insert, one or several, defaults) and on/off switches; sections read them as `{{name}}`, in `{{#if name == "value"}}…{{else}}…{{/if}}` blocks, or through a section condition (`name`, `!name`, `name==value`). A preset can carry a description. Formats: `docs/DATA-FORMATS.md`.

## 4.30.0

What a reply is sent with, a longer backstory, and settings that agree with the shell. Needs Molfar Vertep 0.9.5 for the parameters in the chat header, the shell's language and the links to its Settings (on an older engine they are simply not shown and the old fields stay).

- **Parameters in the chat header.** The header switch's Model tab shows the temperature, max output, reasoning and thinking budget replies are sent with, each marked **model** (Settings › Connections and models), **preset**, or **provider** (not sent). The engine works it out the same way it builds the request.
- **Backstory along a chain.** A chat that continues a chain of earlier chats gets the stories of up to three of them, within the one Backstory budget: the oldest is filled first within its share (50/30/20 for three, 65/35 for two), what it leaves goes to the nearer ones, the oldest story comes first in the prompt and a fact is given once. The Library's insert record names the chain.
- **Numbers the model decides.** In a preset's Samplers, Context size is shown as the model's window when the engine knows it (the preset's own number applies only to unknown windows), and Max response tokens as the model's Chat block value while the preset does not override the model; both with **Set up the model**.
- **The shell's language.** The app starts in the shell's language (Ukrainian or English) until you pick one in Settings › Appearance.
- **Settings that belong to the shell.** Matching by meaning: the embeddings model field became **Set up in Settings › Memory**. Data: **Export / Restore Roleplay data (zip)**, a note and a link to the shell's Backup for the whole profile; "Reset All Data" is **Reset look and local settings**.
- Fixes: a new or forked chat could appear twice in the chat list for a moment (React's "two children with the same key"); the Home stat tiles broke long Ukrainian labels in the narrow column (they are rows there now).

## 4.29.0

Lorebooks understand Ukrainian and Russian, say why an entry fired, and every setting the editor shows now works. Works on Molfar Vertep 0.9.3; no engine update needed.

- **Word forms in keys.** A Ukrainian or Russian key matches every form of its word: "вежа" also finds "вежі", "вежу", "вежею", so one base form per key is enough. A key of several words fires when they stand side by side in that order ("Червона Вежа" finds "до Червоної Вежі"). Short keys no longer fire inside longer words ("кіт" in "кітель"). A book switch, Word forms, and a per-entry override turn it off. Keys in other scripts get proper word boundaries ("Kraków").
- **Why an entry fired.** The keyword test, the Active viewer and the chat's Lorebook activity show for each entry the key that hit (and the secondary ones), "always on", sticky or "by meaning", the recursion pass and the chance. Entries that matched but stayed out say why: waits until a message, cooling down, lost the roll, lost its group to another entry, secondary keys failed, filtered for this character, cut by the budget.
- **A real keyword test.** Paste a message and the book is scanned the way a chat scans it (word forms, secondary keys, regex, recursion, groups), with the book as it is in the editor, unsaved edits too; pick a chat to bring its timers and card along.
- **Every setting works.** The editor offered settings nothing read; now: Min activations (too few entries fired: scan deeper into the chat), the character filter (by card or tag, or everyone but them), generation types (only on continue, swipe and so on), the book's Format template, Insertion strategy (the character's books first, global first, or evenly), Include names, and Group scoring. Positions next to the example dialogues and the author's note land there (they were saved as before or after the character), and entries no longer vanish when a preset has no world-info slot: they join the end of the system block.
- **A clearer lorebook editor.** The book list says which card owns or uses each book; settings come in groups with a hint under each; entries filter by on, off, always on, keyed, by meaning and "no keys" (entries that can never fire), and many can be enabled, disabled, made "by meaning", copied or deleted at once; an entry shows the basics first and the rest under More options, in plain words. Works on phones.
- **Books belong to cards.** The card's Lorebook tab lists its own book and the linked ones: open, replace, unlink, add (with a search), or start a new book; new books never repeat a name ("New Lorebook 2"). **With Molfar** next to "+" in Lorebooks asks Molfar to build a new book with you. A group chat reads every member's books. A book unlinked from a card stops firing in its old chats. Deleting a card can delete its own book with it, and deleting a book removes it from cards and personas.
- **Exported cards carry their book.** PNG and JSON exports are standard V2 cards with the card's own lorebook inside, so other apps get it; importing them here keeps sprites, gallery and the book's settings. Backups keep every lorebook field and which cards use which book.
- **Data Bank.** A file can belong to everyone, one character or one chat, and the search keeps to that. Ukrainian and Russian queries find other word forms and skip filler words; documents are cut at sentence ends; the passages take at most a small share of the context and name their file.
- **Translate a card, then decide.** In the character editor, Translate shows the translation in the card first, with a banner and a message that stays until you choose Save or Discard. The language follows the app's (it was English, which changed nothing on an English card), a card already in that language says so, and long fields (RisuAI scripts of 20 000+ characters) translate in pieces, keeping macros and tags. The Translate button is labelled and coloured.
- Fixes: editing a card that carries its emotion images (over 1 MB) failed with "body too large" and nothing was saved: a save now sends only what changed; imported lorebooks kept their extra settings only until the first save in the editor, and entry ids were renumbered on every save (timers and vectors then stuck to other entries); the book's case-sensitive, whole-words and vector-threshold settings never applied; a Trigger % changed in the editor was never used; an entry's own case setting now wins over the book's; translations of every provider are cut at paragraphs and sentences, not mid-sentence.

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
