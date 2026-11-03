# The scene Dashboard

The Dashboard is a panel beside the chat that tracks the scene: who is present, how each character feels about you, what they wear and know, the open story threads. It is for anyone who wants the story to remember relationships and details between replies. The Help article *Scene dashboard* lists its fields.

## What it tracks

Open it by clicking a portrait in the chat and choosing Dashboard. The side panel has four tabs: **Person** (attitude, mood and state, outfit and things), **Here** (place, weather, who is present), **Quests** (the open threads: main, side, everyday) and **Notes** (the notebook: what a character knows, and whether they saw, heard or guessed it). The "Constellation" names how a character stands toward you, for example Friendship or Romance. A number on a tab counts changes since your last reply (red when something fell). The wide view also has a Journal with a character's thought and recollections. On a phone the same content opens as a sheet.

The numbers (trust, comfort, attraction, respect, affection, and more) are worked out by code from events a model reports, and tilted by each character's [[soul]]. The state is kept per message, so a swipe or a deleted message never leaves stale numbers.

The "Story, move" button next to Send arms a one-time nudge for the next reply; its arrow picks an open quest or a twist.

## When it updates

The "Settings" button inside the Dashboard opens its settings; the Sensor tab has the mode:

- **Sensor** (default): after each reply a model reads the new messages and reports what happened.
- **Fast: inside the story reply**: for strong models. The story model writes the report itself at the end of its reply, with no separate call, adding some tokens to every reply. If it leaves the report out, the usual sensor runs.
- **Manual**: it updates only when you press "Refresh".

## What it costs

In Sensor mode, one extra model call per reply, on the "Sensor model" (the chat's model if you leave it empty). A cheap, small model is enough. It reads the new messages whole (up to about 12000 characters together; a longer reply loses only the middle), and code first marks the sentences that look like clothing, dressing or a kiss and points the model at them, so a skirt named once in the middle of a long reply still reaches the outfit. If a character card has an "Attire:" line, the sensor is also shown it as a reference for the exact wording of a garment the text mentions (it never adds a garment the text does not show). To add words for a language the scan does not know, list them in `data/dashboard/lexicon.json` (`{"wear": ["..."], "touch": ["..."]}`); `{"off": true}` switches the scan off. The Dashboard also adds a short "Prompt insert" to what the story model reads, so characters know where they stand: you can switch it off and set "Tokens per character". "What the model sees" in the settings shows the insert.

## How to turn it off

There is no separate off switch in the screens listed here. Set the mode to "Manual" and it never calls a model by itself. To remove it completely, disable the Dashboard plugin in the Plugins button of Molfar Vertep; Tools > Plugins in Roleplay only lists what runs. Switch "Prompt insert" off if you want it to stay out of the request.

## Related

[[soul]] feeds it; [[litopys]] uses its notes; [[memory]] compares it with the other kinds of memory.
