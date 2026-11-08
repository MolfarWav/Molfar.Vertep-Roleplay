# Long chats and token cost

A chat that runs for weeks grows, and every reply sends more of it to the model. This page is for anyone whose replies get slow or expensive, or whose model forgets the start of the story.

## The Request size button

By default the whole chat is sent while the window has room. On a big window the cost keeps growing, so the chat header has a **Request size** button next to the story tools (on a phone: in the Menu). It shows how many tokens the last request sent, the whole prompt as the provider counted it, and which model got it. Press it for the model, its window and your limit. It is teal below three quarters of the limit, amber from there, and red with a warning sign past it. The Canvas Prompt board lists every part of a request ([[canvas]]).

When a reply pushes the request past the limit, a popup opens:

- **Yes, continue in a new chat** creates the next chat at once and opens it.
- **Not now** hides the popup for this chat until the request has grown by half. Closing it counts as Not now.
- **Send finished scenes as chapters instead** appears when Litopys is on (next section).

The limit is at the bottom of the popup, and in the Library, gear "Litopys settings", block "In the prompt", "Warn me when a request gets big": 60% of the model's window (default), a size you type (100k) or pick (16k to 500k), or never. A chat already past the limit shows the red button and no popup until a new reply makes it grow.

The record has its own size. In the same block, "Memory size" is Auto by default: 15% of the model's window, between 800 and 16000 tokens. "Compact" keeps it at 800.

## The switches that cut cost

In the same block, "Older messages leave the prompt" has two choices:

- **Only when the window is full** (default): every message is sent while it fits.
- **By scenes**: as soon as a chapter holds a scene, the scene is replaced by the chapter. Only the last messages stay word for word ("Direct messages after the scenes", 2 or more). The newest scene has no chapter yet, so it is sent in full.

"By scenes" costs some detail: a chapter is a retelling, so a weak model may lose a small thing. Pin a fact that must never be lost ([[litopys]]). Other cuts:

- Canvas Prompt board, history card, Details: send only the last N messages (desktop, that chat alone).
- Lower "Memory size" to Compact, or switch "Chapters and facts" off.

## Start a fresh chat and keep the story

At a natural break, a new chat that continues the old one starts with a small prompt and still knows what happened.

1. In the chat, open "More" and pick **Continue in a new chat**, or press Yes in the popup.
2. The new chat is created at once and opens. It keeps the preset and its picks, persona, model, agent set, a group's turn order and the World DM world.
3. It gets the old story as backstory, within the "Backstory budget". The nearest three earlier chats are read in full: chapters, facts and turning points. Older chats of a long chain are not dropped: they ride in one condensed part (see below). The old messages are not sent.

The earlier chat then moves to the Archive on its own (next section). The link is the one the Canvas draws, and the Canvas can change it later: see [[canvas]]. To pick another earlier chat, start a chat from the character and use the **Continues** menu in the "New chat with" step.

The new chat opens with the card's first greeting; "Edit the first message" lets you carry on where the story stopped.

## A story of many chats

A story can go on for many chats. The three nearest earlier chats give their chapters, arcs and facts as before. Every older chat goes into one **far** part, placed first: its turning points, the pinned and key facts, and one line for each arc. The part is built from what Litopys already wrote, with no extra model call, and takes about a fifth of the Backstory budget. If the budget is short, the oldest chats lose their lines first and the turning points last. In **What this chat carries** it is its own row, "Far backstory, chats 1-2", so you can see the first chats were kept, not lost. A short chain has no far part. Raise the Backstory budget if a long story feels thin.

A condensed part drops small details (a cloak's colour); the word-for-word memories below bring those back.

## Archive a finished story

A story you are done with can go to the **Archive**. It is a status on the chat, not a move: the chat stays where it is, so its memory, its links on the Canvas and any book made from it keep working.

- In Chats, pick a chat and press **Archive** (the amber button in its panel), or tick several with Select. In a chat it is in the menu under "Manage chat".
- An archived chat leaves the list and Home. The amber **Archive** row under the filters opens them; **Back to chats** returns.
- It opens read only: you can read, copy, branch from a message, export and look at its Dashboard and Library, but not send, swipe, edit or delete. Its place at the bottom offers **Continue in a new chat**. **Unarchive** (in its panel or the banner) makes it normal again.
- The confirmation offers **Archive and continue** when no chat continues this one yet.
- **It happens by itself** when a chat becomes the earlier chat of another: a link on the Canvas, Continue in a new chat, the popup above, or a pick in "Continues". A toast with Undo says so. Branches are not continuations and stay as they are. Switch it off in the Library, gear "Litopys settings", "Archive the earlier chat when it is continued".
- A chat of 100 messages or more that has been quiet for a week gets a small "Long chat · archive?" tag in the list and a hint in its panel. Nothing is archived for you.

Why bother: the earlier chat no longer changes, so the memory of it stays stable and a new chat that continues it reads it as a finished story ([[litopys]]).

## Details the chapters dropped

A chapter is a retelling, so a small detail of an earlier chat can be gone from it. In the Library, Litopys settings, "In the prompt", the switch **Word-for-word memories of earlier chats** lets a chat that continues others bring back one or two passages of the original messages when what is being said shares rare words with them ([[litopys]]). Off by default.

## Save a story as a book

In the Library, Litopys, "Save as a book" copies a chat's chapters, arcs and facts onto the Data Bank shelf for chats you pick: see [[memory]].

## Check what the model got

If a character forgets something, open Canvas > Prompt and switch from "Parts" to "Memory": it shows which facts went in and which were left out, and why. The **Fired** button in the chat header shows it for the last reply and the whole chat.
