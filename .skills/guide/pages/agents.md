# Agents and the agent forge

An agent is a small helper you build from cards and wires. It reads part of the chat (before or after a reply, as you choose), may ask a model one or more short questions, keeps notes of its own, and shows something: a note under the reply, buttons to tap, a meter, a map, or a hint for the next reply. Examples: three suggested next moves, a tension meter, a map of the places visited. This page is for those who want such extras. The Help has three articles on the editor: "Agent editor: how an agent works", "Agent editor: the cards" and "Agent editor: three ready agents".

## What an agent is made of

An agent is data, not code. In the editor it is a board of **cards** joined by **wires**:

- an **Input** card says what the agent may read (the last reply, the chat history, the character card, the persona, the author's note, Litopys facts, lorebook entries);
- **Ask the model** cards put one question to a model and take the answer as free text, yes or no, or a few named fields;
- logic cards (an If card can fire only when its answer turns Yes, only once, or with a pause after it fires, and its rules can ask whether a value changed since the last run; the run log says why it answered), and cards that work in code with no model: dice, picking a line, cutting or extracting text;
- a **Script** card: a few lines of JavaScript you write, `(input, seed)` in and a plain object out, with typed inputs and outputs. It runs in a sandbox of the engine (no clock, no internet, no files, about half a second and 16 MB) and needs an engine from 1.10.1; an older engine fails the agent with a plain message;
- cards for the agent's own **memory** (numbers, text, yes/no, lists), kept for each chat and apart from the Dashboard;
- an **Output** card that shows a result: "A note under the reply", "Buttons to tap", a state value, or a hint put into the next prompt.

**Panels** (meters, counters, tables, a board of tiles) display what the agent keeps; nothing in a panel runs, and its buttons only put text in the message box.

When it runs is a lane. The agent's file names the lane it starts in, and each chat can move the agent to another lane (the chat's Agents tab, or the Canvas's "Agent sets" board). The four lanes:

- **Before the reply**: the reply waits for the agent, and a hint it leaves goes into that very reply. Keep it to one or two quick questions, because the wait is added to every reply. The Wait switch of the agent's row turns the wait off; the agent then runs beside the reply.
- **Beside the reply**: runs at the same time, adds no wait, and cannot put a hint into the reply it runs beside (notes, buttons and panels work).
- **After the reply**: the usual lane for notes, trackers and meters.
- **By hand**: runs only when you press the run button of its row.

On top of the lane, an agent can run on every Nth reply or only when chosen words appear. The words are looked for in the last two messages unless the agent says otherwise: the Agent tab has "Look back this many messages" (1 to 50) once words are set.

## Ready agents

Press "New agent" in the Agents board of the **Canvas** (the rail's **Agents** item opens it). "Empty agent" gives an Input and a note. "Start from a ready agent" offers ten working ones: Next moves, Pacing nudge, Story map, Scene recap, Territory board, Tension meter, Character growth (it proposes how the character has changed, for the card's Memory tab; see the memory page), Repetition guard, Canon guard and Ledger (described below). Under "Drafts" are agents Molfar wrote into your workspace ("Drafts from Molfar").

### Repetition guard, Canon guard and Ledger

Three ready agents for problems that long stories run into. Turn each on per chat, like any agent, and read its permissions before you allow it.

- **Repetition guard** stops a model from reusing its own words. After each reply a script (no model call, so it costs nothing on a free model) reads the last six replies of the character and finds phrases of three to five words that two replies share, and sentence openings used three times. It puts at most five phrases into the next prompt as "Do not reuse these phrases from earlier replies: ..." (about 40 to 80 tokens). It works on Cyrillic as on Latin. A chat with nothing repeated gets no hint. It reads the chat history and runs code.
- **Canon guard** catches a reply that contradicts the character card or the facts Litopys recorded (looks, names, places, things someone owns). Every third reply it reads the last three replies, the card and up to 30 facts, and asks the model once. When it finds a contradiction it leaves a note under the reply, ending with a reminder to update the fact in Litopys if the story really changed, and a button above the message box that writes "(OOC: ...)" with the correction; you decide whether to send it. It never rewrites a reply and never changes a card or a fact, and it shows each problem once. It needs a one-character chat that has Litopys facts; without either it quietly does nothing.
- **Ledger** keeps the numbers a resource game lives on: money, stock, a treasury with income per day, countdowns ("arrival in 4 days"). The model only reports what changed; a script does every sum and moves days forward. A table sits in a floating window, and the next reply is told the true numbers so it invents none. Numbers only, never items. Fix a number yourself by writing (ledger: gold = 500) or (ledger: remove gold) in your message; (ledger: timer Castle = 4) and (ledger: gold per day = 50) work too. It asks the model once per reply, but only when the reply or your message holds a digit, a number word or a time word (day, week, night, morning, in English, Ukrainian and Russian); a reply with none costs nothing, and the numbers still go into the prompt. Up to 12 rows.

## The editor

Edits are saved as a draft a moment after you stop. Three tabs: Card (the selected card), Agent (name, when it runs, its memory, panels) and Try. A check shows "Passes the check", the number of problems and warnings, and "N model calls per run". You cannot install with problems left. "Export as a file" saves one file you can share. The chat's "Install and manage agents..." sheet has "Install an agent file" for bringing one in.

### The If card's options

An If card answers Yes, No or Unknown by its rules, and on its own it says Yes on every run while the rules hold. Under the rules, **When it answers Yes** changes that: "Every time" (the default), "Only when it turns Yes" (it fires on the step from not Yes to Yes, and again only after the answer has gone back), or "Only once in this chat". **Pause after it fires (runs)** skips that many of the agent's runs after a Yes, 0 to 50. A run is one turn of the agent, so an agent that runs every third reply makes a pause of 2 last six replies. A rule can also use "changed since the last run": Yes when the value differs from the last run. In the form, each rule picks **What the rule reads**: a value you wire in, a Dashboard value, the chat (number of messages, who spoke last) or a World DM die (Fate, Life or Pacing: did it put a note into this reply, and what was the outcome). Reading a die needs the permission "Read what the World DM’s dice said for the last reply", and it only works for an agent that runs after the reply. Only a Yes is held back; No and Unknown still come out. The agent remembers this per chat, and "start over" on the agent forgets it. The Try tab shows why a card answered (the rule, the value it read, the result) and, when it held a Yes, which option held it; the agent log under a reply keeps the same lines.

## Trial run

The Try tab runs one made-up turn without touching anything. You change the inputs, and the wires on the board show what moves; with no model, each "Ask the model" card uses an example answer you can edit. Under "A real chat" pick a chat and "Fill from this chat" to load what the agent would really get. "Run with the model" then asks the real model with the real question: up to N calls, real tokens, and nothing saved to the chat or the agent.

An agent with a Script card that runs out of time three runs in a row in a chat is left alone there: the Agents tab says it is paused (each such run would cost the script's 2.5 seconds). Fix the script, then press **Run again**; one run that works ends the pause. The territory board's tiles are buttons: tap one and its place goes into the message box (nothing is sent). A list card can also be set to "Change an entry, or add it if there is none", so something said twice does not fill the list.

## Install, allow, switch on in a chat

1. Press "Install" ("Update" for a changed copy of an installed agent; use "Edit a copy" to change one).
2. Allow it once: "Review permissions", then "Allow all" or line by line. It runs when every line is on. An update asking for more waits for a new Allow. A Script card asks for "Run its own small program"; the permission list shows its code ("Read the code") before you allow it, and if an update changes the code, the permission is asked again.
3. Add it to a chat. In the chat header pill open the **Agents** tab: "In this chat" lists active agents, "Installed" lists the rest (pick one to add it). An agent that is not allowed yet shows **Allow…** in its row: it opens its permission dialog at once. A row can run again now, be removed, or stop the reply waiting for it. A new chat has no agents until you add some or pick a set.

A **set** is a named list of agents ("Save this chat's list as a set"; "Make default" gives it to new chats). The Canvas's "Agent sets" board shows each set's cost in time and calls, and holds the "Agents' notes in chats" switch that hides every agent's notes. Each agent's result place can be changed in the chat's Agents tab, among the places that suit it.

Each "Ask the model" card is one call per run; the editor shows the number. "Every Nth reply" divides the cost.

**What it costs, before you turn it on.** The permissions page and the agent's card in the Agents sheet carry an estimate for one run: the calls, and about how many tokens go in and at most come out. The Agents tab adds a line with the total per reply for the agents that are on in the chat, the "every Nth reply" already spread in. It is read from the agents' files (the length of their questions, what they read, their answer limits), not from your chat, so it says "about": the real numbers depend on the chat and the model. An agent that asks no model says so.

**Where a hint goes.** An Output card of kind hint ("prompt-insert") has "Position in the prompt": after the history (the default, the end of the last player message), at the start of the system prompt, or at its end. A hint in the system prompt weighs more with the model, so keep it short. It is the same permission as any hint.
