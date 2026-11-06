# Agents and the agent forge

An agent is a small helper you build from cards and wires. After a reply it reads part of the chat, may ask a model one or more short questions, keeps notes of its own, and shows something: a note under the reply, buttons to tap, a meter, a map, or a hint for the next reply. Examples: three suggested next moves, a tension meter, a map of the places visited. This page is for those who want such extras. The Help has three articles on the editor: "Agent editor: how an agent works", "Agent editor: the cards" and "Agent editor: three ready agents".

## What an agent is made of

An agent is data, not code. In the editor it is a board of **cards** joined by **wires**:

- an **Input** card says what the agent may read (the last reply, the chat history, the character card, the persona, the author's note, Litopys facts, lorebook entries);
- **Ask the model** cards put one question to a model and take the answer as free text, yes or no, or a few named fields;
- logic cards, and cards that work in code with no model: dice, picking a line, cutting or extracting text;
- a **Script** card: a few lines of JavaScript you write, `(input, seed)` in and a plain object out, with typed inputs and outputs. It runs in a sandbox of the engine (no clock, no internet, no files, about half a second and 16 MB) and needs an engine from 1.10.1; an older engine fails the agent with a plain message;
- cards for the agent's own **memory** (numbers, text, yes/no, lists), kept for each chat and apart from the Dashboard;
- an **Output** card that shows a result: "A note under the reply", "Buttons to tap", a state value, or a hint put into the next prompt.

**Panels** (meters, counters, tables, a board of tiles) display what the agent keeps; nothing in a panel runs, and its buttons only put text in the message box.

When it runs is set per agent: after every reply (the only timing this version runs), on every Nth reply, or only when chosen words appear.

## Ready agents

Press "New agent" in the Agents board of the **Canvas** (the rail's **Agents** item opens it). "Empty agent" gives an Input and a note. "Start from a ready agent" offers six working ones: Next moves, Pacing nudge, Story map, Scene recap, Territory board and Tension meter. Under "Drafts" are agents Molfar wrote into your workspace ("Drafts from Molfar").

## The editor

Edits are saved as a draft a moment after you stop. Three tabs: Card (the selected card), Agent (name, when it runs, its memory, panels) and Try. A check shows "Passes the check", the number of problems and warnings, and "N model calls per run". You cannot install with problems left. "Export as a file" saves one file you can share. The chat's "Install and manage agents..." sheet has "Install an agent file" for bringing one in.

## Trial run

The Try tab runs one made-up turn without touching anything. You change the inputs, and the wires on the board show what moves; with no model, each "Ask the model" card uses an example answer you can edit. Under "A real chat" pick a chat and "Fill from this chat" to load what the agent would really get. "Run with the model" then asks the real model with the real question: up to N calls, real tokens, and nothing saved to the chat or the agent.

## Install, allow, switch on in a chat

1. Press "Install" ("Update" for a changed copy of an installed agent; use "Edit a copy" to change one).
2. Allow it once: "Review permissions", then "Allow all" or line by line. It runs when every line is on. An update asking for more waits for a new Allow. A Script card asks for "Run its own small program"; the permission list shows its code ("Read the code") before you allow it, and if an update changes the code, the permission is asked again.
3. Add it to a chat. In the chat header pill open the **Agents** tab: "In this chat" lists active agents, "Installed" lists the rest (pick one to add it). A row can run again now, be removed, or stop the reply waiting for it. A new chat has no agents until you add some or pick a set.

A **set** is a named list of agents ("Save this chat's list as a set"; "Make default" gives it to new chats). The Canvas's "Agent sets" board shows each set's cost in time and calls, and holds the "Agents' notes in chats" switch that hides every agent's notes. Each agent's result place can be changed in the chat's Agents tab, among the places that suit it.

Each "Ask the model" card is one call per run; the editor shows the number. "Every Nth reply" divides the cost.
