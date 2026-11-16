# World DM

The World DM is a game master for the world of one chat. After replies it reads the story and keeps the people, places and things it meets in the chat's own lorebook, called the world book. At higher levels it also moves the world and sends events into the scene. Use it when you want the world to feel alive and consistent.

## Levels

Open it from the chat header "World" (on a phone, Menu, then World), or from the **World** section of the rail. Pick what the DM does:

- **Off**: no events and no dice. The world book still fills from the story: when the scene names a new place or thing, one small call asks the DM model whether to record it.
- **Chronicler**: records only, and adds no events of its own.
- **Living world**: factions and threats move off screen. News may reach characters as a rumour; nothing is forced.
- **Director**: brings hooks, complications and visitors into the scene, and the next reply must use them.
- **Antagonist**: consequences and pressure aimed at what the characters care about.
- **Total chaos**: anything may happen, whatever the genre. It never rewrites the story and waits out explicit scenes.

By default the DM is already on at the Chronicler level in a story chat, from its first reply (not for a chat whose cards are all assistants). Switch it off in the World sheet's Overview if you do not want it.

## What it does each turn

It runs after replies, every Nth reply ("Run after every N replies"), or right away with "World turn". It reads the new messages and writes or retires records in the world book: people, places, things and who holds them. You can give a Group or a Place record **Members** (the people who belong) in the World book tab; a fact told to that group in Litopys is then known to each of them ([[litopys]]). The DM does not fill Members itself. From Living world up it also moves fronts and clocks, and may prepare an event that is added to the next reply. With **Code** moving the clocks (World > Profiles > Options), every N replies code rolls a d6 for each front: 1-2 nothing, 3-4 one step, 5-6 one step and the DM is told news of that front may reach the story. Optional dice (World sheet, Dice, from Living world up, off by default): before a reply, code rolls 2d6 and tells the model how an uncertain action turns out, as a Hint or Binding. The **Pacing check, %** option (Dice details, off by default) adds a second hidden roll for the moments the user's character takes a step toward closeness: how well it lands depends on the character's comfort, trust and affection from the Dashboard, and the model plays it as not ready, hesitant, accepting with nerves, or welcoming. It never blocks a reply and never names the dice.

It costs one extra model call whenever it is due, on the "DM model (all chats)"; a small, cheap model is enough. A failed run is shown in the sheet and in the Inbox, and the DM reads the same messages again next time.

The DM is shown every record by name, but only those the new messages touch in full: the ones they name, the scene's place and what lies there, the people in the scene, pinned records and people who are about to come back. That keeps a book of many records cheap. The DM can still change or retire any record.

A profile that plays from an events deck shows "New deck" when the deck is used up. The model is asked for 8 to 12 events; if fewer come back, the deck is kept as it came and a warning says it came back short, so you can build it again.

## People coming back

A friend or a relative from a card's lorebook can stay out of the story for a hundred messages, because an entry comes up only when somebody says the name. The DM brings such people back. It counts the replies since a person was last in the scene (with the Dashboard on, a name in the text alone is only a mention and does not reset the count; a far friend who texts or calls counts as in the scene), and when the silence is long (about 15, 30 or 60 replies, by **People coming back > How often**; Normal is the default for new chats) it tells the writing model, firmly, that the person comes into this reply. A hidden roll of 2d6, plus the length of the silence and how much the person weighs, decides how big the return is: a message, a call with a request, or someone arriving with news. The model chooses the form; the DM checks that the person showed up and asks once more if not. If the writer only mentions the person, the log says "only mentioned, not on stage" and no second try follows; after such a medium or big return the next one comes after half the usual pause and is at least medium. A card's lorebook people join the bench with **Take people from the cards' lorebooks**, or by the Start switch "People from the lorebooks". On a person or faction record you can set Relation, Weight and "Bring back automatically". To see it work, turn on **Show under the reply**: a small mark says who came, why and how the dice fell; the card also lists the bench with each person's silence and a log of returns.

## New people from the cast deck

The bench brings back people the story already has. The **cast deck** brings in people it has not met. A deck is a pile of cards: a name, a faction (a group or a front of the world), one person who already exists that this new person is tied to (a cousin, a debtor, a rival), what they want, and five to ten sentences about them. The DM never sees the cards; when nobody on the bench is due and the story has been quiet for about as long as for a return, the DM picks a card, preferring one whose tie is in the scene, then one whose faction's front is stirred, then one whose faction belongs to this place, and tells the writing model, firmly, that this new person comes into the reply through that tie. When they show up the card becomes a person in the book, a member of their faction. If they do not, the card waits.

A Start can write the deck (the switch **New people for later**, with the number of factions, people each and how long a card is), and the deck fills itself when fewer than 3 cards are left. In the chat's World panel the card **Cast deck** has the switch, how many cards are left, **Add new people now** and a log of every draw and refill. The book has a **Cast deck** chip: the cards are behind **Show the cards** because they spoil what is coming; you can edit or remove a card, and a card with no tie is marked.

## The world book and its tidy-up

The chat's World panel has tiles for what the DM keeps: **People**, **Places**, **Factions** and **Things**, then the **Archive** and the **Fronts** and **Runs**. Press a tile to open the world book at that type (a world built by Start before the story still asks the spoiler question once; a played chat opens at once). The book is a list with a search over names, keys and text, colour chips per type and cards that fold their text; Edit, Retire, Pin and Delete work as before. A thing can have a **reason** (a clue, a hidden thing, a promise, a gift, a weapon, something people fight over); the DM states it when it records one, and you can change it in the form.

Facts are not records any more. A custom, a law or a piece of history belongs in the text of the place or the faction it describes, and what people know or hide belongs in the Litopys. A book that still has old notes shows a banner and a tile **Old notes**; on each note choose **Fold into…** a place or a faction (its text grows by the note) or **To the Litopys** (a fact everybody knows, up to 300 characters).

The book also tidies itself. Every 10 replies, a thing that fewer than 3 of the last 10 replies named, that belongs to nobody (not held by your character, a card character or a person in the book, and not in a character's hands in the Dashboard), is not pinned and is not a clue, a hidden thing or a promise, goes to the **Archive**, out of the story model's sight. It comes back when the story names it twice, or when the DM names it again; you can also press **Wake**. The card **Tidying the book** has the switch, **Tidy now** (a pass at once; the first pass of a chat only takes the list of things) and a log of every archive and every wake with the count that decided it. People, places and factions are never tidied away. A record you delete is not written again by the DM, and the DM is told which names you removed.

## Deleting or swiping a reply

Delete a reply, or swipe to another one, and the DM takes back what it learned from the old one: records, clocks and a waiting event return to how they were, the world book is written again, and the DM reads the story again from there.

An event is one shot. The DM checks whether the story showed it, looking at everything after the reply that carried it, also the part it already read. If not, the event is sent once more with the next reply, unless the story has moved to another place by then (a time skip, a new scene): then it is let go, so an old event does not pull the story back.

Records you changed by hand stay, unless the DM changed the same record afterwards. A record you deleted stays deleted. Deleting old messages from the top, reading other swipes of an older reply and editing a reply's text take nothing back.

## World section tabs

The gear next to the heading of the World list opens **World settings**, in folding blocks like the Litopys settings: the play model (with a switch to override it for this World, the reply limit and a test button), the build model, the image model, the backgrounds switch and whether you are told about failures. A folded block shows what is set in one line.

On the chosen chat: Overview (the same controls as the sheet), Places (a tree of places, with a background picture per place), World book (read, write, retire or delete records by hand), Runs (history, tokens, errors), Start (draft records from cards or a short interview), Backgrounds (plan and draw a set of pictures; with "Change the background by scene" on, the Dashboard picks the fitting one; with "Draw places that have no picture" also on (it is always listed there, greyed out until the scene switch and image generation are on), a place the story moves to that has no picture is drawn on the spot by the World's image model and filed in the folder; "Look of the pictures" there takes a few English words (for example `medieval fantasy, candlelight`) that are added to every background drawn for the chat, a place drawn on the spot or a set; the chat's Display sheet has a link here). Also **Profiles** and **Worlds**.

## World profiles

Each level is a built-in profile: the five of them hold the DM's prompts, and you can open one, change a prompt block and roll it back to the default. You can also make profiles of your own on top of a level. A chat picks its profile in the DM sheet. New chats start with the Chronicler unless you press **Make default** on another profile (the Profiles tab, in the profile's header): it gets a *Default* tag and every new chat starts with its level, numbers and prompts; chats you already have keep their own, and the DM "off" is chosen per chat and cannot be the default. "Saved worlds" holds worlds you built and start new chats in; "New world" builds one before any chat, from cards or a short interview.

Related: [[memory]], [[dashboard]]. The Help articles *World profiles* and *Starting a world* have the screens.
