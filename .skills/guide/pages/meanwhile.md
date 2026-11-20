# Meanwhile: life off screen

Meanwhile lets the people who are not in the scene do things while the story goes on: Bram sells a horse at the harbour, Ada hides the ledger, a front moves a step closer to its goal. It is a test version, off by default.

## Turning it on

Open the chat's **World** sheet and find the card **Meanwhile**. Switch on "Let people off screen act". The switch is for all chats. It needs the **Dashboard** to be on, because Meanwhile reads the scenes from it, and it needs somebody to act: a character card that is not in the scene, or a person in the World DM's book.

## When it runs

A pass runs after a reply when at least two new replies have come and either a new scene began or the story clock moved by six hours. One pass is one model call. It uses its own model if you set one, else the World DM's, the Dashboard sensor's, the Library's, the chat's, the app's. The card says which. "Run a pass now" runs one at once.

A pass asks for up to three small events. The app checks each one: the people must be ones the chat knows, never your character and never anyone who is in the scene, and the effects must come from a short list. An event that fails a check is dropped whole, and the log says why. If a model answers nothing, the pass tries once more with more room; a pass that fails waits ten minutes.

## What the card shows

- **What this card shows**: Nothing (only that something happened), Hints (who and where) or Everything. The default is Hints, so the story is not spoiled for you.
- **Off screen so far**: the events, as that setting allows.
- **Log**: every pass: why it ran (scene closed, time passed, by hand), how many events the model offered and how many were kept, why the rest were dropped, and the error when it failed.

## What the events do to the story

Each kept event becomes a memory of the people it happened to and of those who saw it, and of nobody else: never your character. It reaches a reply by the usual rules of the story record ([[litopys]]): when one of those people speaks, or one of them is in the scene for a narrator's or a group's reply. Someone who knows may then bring it up, hint at it or act on it; the others may not. A secret event is also marked "kept secret", so a group reply is told who keeps it. The events are not copied into the Library's Facts: they are read from the Meanwhile file for each reply, so they cost nothing to keep and leave with the swipe. The prompt's "What fired" panel lists them like any fact.

If you switch Meanwhile off, the events stop reaching replies at once.

## In the Dashboard's journal

In the wide Dashboard, a character's **Journal** has an **Off screen (Meanwhile)** section with the events that happened to that character, newest first, as far as the card's setting lets them show: only where and when under Hints, the text under Everything, and nothing under Nothing. It only reads the Meanwhile file; it writes nothing into the Dashboard, so it goes with a swipe and needs no extra setting. On a phone the Journal is not shown.

## Swipes and deletes

An event belongs to the reply after which it happened. If you regenerate that reply, the new version is written without the event; if you swipe or delete that reply, the events of that pass go too, from the story as well, and the next pass reads the story again from the last reply that is still there.

Related: [[world-dm]], [[dashboard]], [[litopys]]. See [[litopys]] "Who knows" for how secrets are shown.
