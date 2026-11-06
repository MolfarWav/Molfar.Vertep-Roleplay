# Long chats and token cost

A chat that runs for weeks grows, and every reply sends more of it to the model. This page says what Roleplay already does about that, which switches cut the cost, and how to carry a story into a fresh chat. It is for anyone whose replies get slow or expensive, or whose model forgets the start of the story.

## What is sent with each reply

The messages grow, and so does the story record that Litopys writes ([[litopys]]). The Canvas Prompt board lists every part of the next request with its token count: see [[canvas]].

## What happens by itself

By default the whole chat is sent while the window has room, and messages that a chapter already holds leave only when the window runs short. On a big window the cost keeps growing. When a reply sends 60% of the model's window, a strip above the message box says so and offers the two ways out below: "Send finished scenes as chapters" and "Continue in a new chat". "Not now" hides it until the prompt has grown by half. "Remind me when the prompt is big", next to "Memory size", sets the limit: 60% of the window, your own size in tokens, or never.

The record has its own size. In the Library, gear "Litopys settings", block "In the prompt", "Memory size" is Auto by default: 15% of the model's window, between 800 and 16000 tokens. On a big window that can raise the cost; "Compact" keeps it at 800.

## The switches that cut cost

In the same block, "Older messages leave the prompt" has two choices:

- **Only when the window is full** (default): every message is sent while it fits.
- **By scenes**: as soon as a chapter holds a scene, the whole scene is replaced by the chapter. Only the last messages stay word for word ("Direct messages after the scenes", 2 or more). The newest scene has no chapter yet, so it is sent in full.

"By scenes" is the nearest thing to automatic trimming. It costs some detail: a chapter is a retelling, so a weak model may lose a small thing. Pin a fact that must never be lost ([[litopys]]).

Other cuts:

- On the Canvas Prompt board, the history card's Details can send only the last N messages. This is desktop only and affects that chat alone.
- Lower "Memory size" to Compact, or switch "Chapters and facts" off.

## Start a fresh chat and keep the story

When a story reaches a natural break, a new chat that continues the old one starts with a small prompt and still knows what happened.

1. In the chat, open "More" and pick **Continue in a new chat** (the strip offers the same button).
2. The "New chat with" step opens with this chat chosen in the **Continues** menu, on its preset and picks, persona and model. Change anything, then press Start.
3. The new chat gets the old story as backstory: its chapters and facts, up to three chats back along the chain, within the "Backstory budget". The nearest chat gets the largest share. The old messages are not sent.

The Continues menu also lists the character's other earlier chats, so a chat can pick up any of them. The Canvas draws the same link and can change it later: see [[canvas]].

The new chat opens with the card's first greeting, and a hint under it says so, with the button "Edit the first message". Use it to carry on from where the story stopped.

## Save a story as a book

In the Library, Litopys, "Save as a book" copies a chat's chapters, arcs and facts onto the Data Bank shelf for the chats you pick. A character only gets what they witnessed or were told. See [[memory]].

## Check what the model got

If a character forgets something, open Canvas > Prompt and switch from "Parts" to "Memory": it shows which facts went in and which were left out, and why. The **Fired** button in the chat header shows it for the last reply and for the whole chat.
