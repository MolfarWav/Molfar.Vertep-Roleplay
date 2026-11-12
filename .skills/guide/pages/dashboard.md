# The scene Dashboard

The Dashboard is a panel beside the chat that tracks the scene: who is present, how each character feels about you, what they wear and know, the open story threads. It is for anyone who wants the story to remember relationships and details between replies. The Help article *Scene dashboard* lists its fields.

## What it tracks

Open it by clicking a portrait in the chat and choosing Dashboard. The side panel has four tabs: **Person** (attitude, mood and state, outfit and things: what they wear, hold and carry, and what lies nearby), **Here** (place, weather, who is present), **Quests** (the open threads: main, side, everyday) and **Notes** (the notebook: what a character knows, and whether they saw, heard or guessed it). The "Constellation" names how a character stands toward you, for example Friendship or Romance. A number on a tab counts changes since your last reply (red when something fell). The wide view also has a Journal with a character's thought and recollections. On a phone the same content opens as a sheet.

**One person listed twice.** If the Dashboard shows the same person under two names (say "Sina" and "Sina Rose"), open one of them and use the small people button in the Person header, then "Same person as..." and pick the other. You are asked first: the notes, history and things move to the person you picked, their relationship numbers stay, the name becomes another name of theirs, and it cannot be undone. The Dashboard also suggests likely duplicates itself: a box at the top of the Person tab (and a chip "Possible duplicate" in "Since your last reply") says "X may be the same person as Y" with the reason. "Merge into Y" does the same as the menu; "Different people" keeps them apart and the Dashboard stops suggesting that pair. The same menu has **Not in the scene** for someone the story only mentions but a model put into the scene: they leave the "present" list, stay known with their notes, and the Dashboard does not put them back unless they speak (the toast has Undo, and the menu then offers "Put back in the scene"). "Remove from the Dashboard" is for a name that is simply wrong: it takes the person out of every saved state.

A character who is in touch from elsewhere (a text, a letter, a call, a video) is marked so in the scene line, with one more short sentence about what reaches them: by text or letter only the words sent; by call only the voice and the sounds near the phone; by video only what is in the camera and what is heard near it. A silent action, such as putting the kettle on, is not known to them.

The numbers (trust, comfort, attraction, respect, affection, and more) are worked out by code from events a model reports, and tilted by each character's [[soul]]. The state is kept per message, so a swipe or a deleted message never leaves stale numbers.

Whose feeling is it: each number is how that character feels about *your* character, never the other way round. The events behind them are what your character does: a kiss on the forehead or a hug warms comfort and affection, only a romantic kiss raises arousal. When a character wrongs your character (cheats, lies, leaves), that is the character's deed: it is not booked as your character's, and the sensor is told not to lower the character's trust in you for it. If a number still moves wrongly, report it as an issue: the sensor model is a model, and a small one can misread a scene.

**The date and a calendar of your own.** The clock shows a date under the time. Tap the pencil next to it to set the date, hide it, or go back to automatic. For a fantasy or isekai world whose months and years are not ours, choose **A world with its own calendar…** in that popover: name the months and give each its days (12 months of 30 days is one tap), add weekday names and an era ("AR", "of the Third Age") if you want, and say the date of the story's present day, in any year, also before zero. After that the date follows the Day counter ("3 Frostmoon 1204 AR"), shows on the clock and in the scene lines the model reads, and the story text never moves it. **Use the real calendar** in the same window takes it back.

The "Story, move" button next to Send arms a one-time nudge for the next reply; its arrow picks an open quest or a twist.

## What changed, in the chat

Under the newest reply, a muted line says what the Dashboard recorded for it: "Changed: Ada · trust fell, mood calm → tense, +2". Tap it to unfold the same chips as the Dashboard's "Since your last reply" row; a chip opens the matching Dashboard tab (on a phone, its bottom sheet). Older replies show nothing, and the line waits while a reply is being written or the Dashboard is still updating. To hide it, switch off "Show what changed under the newest reply" in Settings > Chat Behavior.

## Ties between characters

The sensor notes how two characters who are not you stand to each other, as a one-word role and a one-word warmth ("rival, cold"). The reply's prompt carries up to four of these as one short line, only for people in the scene. A character's own reply gets just the ties that character is part of; a narrator gets the ties of the people the turn is about first.

## What a character said, and lies

Under a person's notebook the **Said** list keeps the strong things they said and are held to: a vow, a threat, a confession, an order. A lie is kept there too, covered until you choose "Show hidden".

When a character lies in front of others, the others take it as true. Their next replies treat it as something they were told and have no reason to doubt, until the story shows otherwise. Only the people who were in the scene are fooled, and only in their own replies: someone else speaking does not repeat the lie.

Open a lie and you see **Believe it:** with a button for each person who still believes it. Press a name when that person has found out. The row's menu also has **This was a lie** for a statement the sensor did not call one (the people in the scene then believe it), and **Not a lie** when the sensor got it wrong. The sensor ends the belief by itself when a reply shows the truth coming out. Removing the lie from the list removes every belief with it.

> The narrator voices everyone in one reply, so it always knows the truth. This only keeps one character from acting on what another character knows.

## When it updates

The "Settings" button inside the Dashboard opens its settings; the Sensor tab has the mode:

- **Sensor** (default): after each reply a model reads the new messages and reports what happened.
- **Fast: inside the story reply**: for strong models. The story model writes the report itself at the end of its reply, with no separate call, adding some tokens to every reply. If it leaves the report out, the usual sensor runs.
- **Manual**: it updates only when you press "Refresh".

## What it costs

In Sensor mode, one extra model call per reply, on the "Sensor model" (the chat's model if you leave it empty). A cheap, small model is enough. It reads the new messages whole (up to about 12000 characters together; a longer reply loses only the middle), and code first marks the sentences that look like clothing, dressing or a kiss and points the model at them, so a skirt named once in the middle of a long reply still reaches the outfit. If a character card has an "Attire:" line, the sensor is also shown it as a reference for the exact wording of a garment the text mentions (it never adds a garment the text does not show). What a character wears and holds is kept as a list of items; a garment that gets torn or dirty stays one item. Each thing keeps one identity wherever it goes: worn, taken off by the door, handed to someone else. Things left in a place stay there: when the story comes back to the café, the cup is still on the table. When the story has not shown what someone wears for about six turns, the writing model is asked to mention it, briefly. To add words for a language the scan does not know, list them in `data/dashboard/lexicon.json` (`{"wear": ["..."], "touch": ["..."]}`); `{"off": true}` switches the scan off. The Dashboard also adds a short "Prompt insert" to what the story model reads, so characters know where they stand: you can switch it off and set "Tokens per character". "What the model sees" in the settings shows the insert.

## How to turn it off

There is no separate off switch in the screens listed here. Set the mode to "Manual" and it never calls a model by itself. To remove it completely, disable the Dashboard plugin in the Plugins button of Molfar Vertep; Tools > Plugins in Roleplay only lists what runs. Switch "Prompt insert" off if you want it to stay out of the request.

## Related

[[soul]] feeds it; [[litopys]] uses its notes; [[memory]] compares it with the other kinds of memory.
