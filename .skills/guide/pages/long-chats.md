# Long chats and token cost

A chat that runs for weeks grows, and every reply sends more of it to the model. This page says what Roleplay already does about that, which switches cut the cost, and how to carry a story into a fresh chat. It is for anyone whose replies get slow or expensive, or whose model forgets the start of the story.

## What is sent with each reply

The messages grow, and so does the story record that Litopys writes ([[litopys]]). The Canvas Prompt board lists every part of the next request with its token count: see [[canvas]]. The "~N tok" button in the chat header shows what the chat carries besides the history, with a switch per part.

## What happens by itself

Litopys turns finished scenes into chapters and facts. By default the whole chat is still sent while the model's window has room for it, and the oldest messages that a chapter already holds leave only when the window runs short. So on a model with a big window the cost keeps growing, and nothing warns you. The app does not yet offer to trim the chat when it gets large.

The record has its own size. In the Library, gear "Litopys settings", block "In the prompt", "Memory size" is Auto by default: 15% of the model's window, between 800 and 16000 tokens. On a big window that can raise the cost; "Compact" keeps it at 800.

## The switches that cut cost

In the same block, "Older messages leave the prompt" has two choices:

- **Only when the window is full** (default): every message is sent while it fits.
- **By scenes**: as soon as a chapter holds a scene, the whole scene is replaced by the chapter. Only the last messages stay word for word ("Direct messages after the scenes", 2 or more). The newest scene has no chapter yet, so it is sent in full.

"By scenes" is the nearest thing to automatic trimming. It costs some detail: a chapter is a retelling, so a weak model may lose a small thing that the old messages carried. Pin a fact that must never be lost ([[litopys]]).

Other cuts:

- On the Canvas Prompt board, the history card's Details can send only the last N messages. This is desktop only and affects that chat alone.
- Lower "Memory size" to Compact, or switch "Chapters and facts" off.
- Keep lorebook entries short; long reference text belongs in the Data Bank ([[memory]]).

## Start a fresh chat and keep the story

When a story reaches a natural break, a new chat that continues the old one starts with a small prompt and still knows what happened.

1. Start a new chat with the same card (Home or Characters, "New chat").
2. Open the Canvas, board "Chat links". Drag a wire from the bottom dot of the old chat to the top dot of the new one. On a phone use the List: pick what the new chat continues. See [[canvas]].
3. The new chat now gets the old story as backstory: its chapters and facts, up to three chats back along the chain, within the "Backstory budget". The nearest chat gets the largest share. The old messages are not sent.

The new chat opens with the card's first greeting, and a hint under it says so, with the button "Edit the first message". Use it if the story should carry on from where it stopped. Linking is a manual step on the Canvas.

## Save a story as a book

In the Library, Litopys, "Save as a book" copies a chat's chapters, arcs and facts onto the Data Bank shelf for the chats you pick (and the chats that continue them). A character only gets what they were there for or were told. The book is frozen; "Save a new version" copies the chat again. See [[memory]].

## Check what the model got

If a character forgets something, open Canvas > Prompt and switch from "Parts" to "Memory": it shows which facts went in and which were left out, and why.
