# Characters, personas and groups

Everything you play with lives in four sections: Characters, Groups, Personas and Marketplace. This page says what each is for; the Help articles *Your characters*, *The card editor tabs* and *Groups of characters* have the details.

## Cards

A card is a character: description, personality, scenario and a first message. A tag written `group: Guild of Ravens` or `faction: Guild of Ravens` also puts the card's character in that group, so a memory fact told to the group is known to them ([[litopys]]). The Characters section shows your cards as a grid or list, with search, tags, folders, favorites (a star) and several sorts. Open a card to edit it. Edits stay in a draft until "Save changes"; leaving with unsaved edits asks first.

The editor has six tabs:

- **Core**: the card text, dialogue and greeting.
- **Profile**: the same description split into structured fields (identity, appearance, goals). Every save writes them back into the card text. A narrator card can describe a whole cast here.
- **Soul**: how the character reacts to you, plus habits. See [[soul]].
- **Memory**: finished chats the character remembers. See [[memory]].
- **Lorebook**: books linked to this card.
- **More**: colors and voices, sprites, gallery, regex, advanced settings.

A card may play several characters at once (a narrator or game master). Under Colors, "Voices" gives each speaker its own color. If you list no voices, the chat does it for you: a card that holds several characters (sections named after each) colors every character's lines by itself, each with a different color, kept with the chat. In any other chat, open the chat menu, "Voice colors", and turn the switch on; "Spread colors" gives everyone you have not picked a different color. This needs the Relationship dashboard, which supplies the list of characters.

## Personas

A persona is you: name, pronouns, description, avatar. The model sees it wherever the prompt speaks of the user. "Use this persona" makes it your default and switches the open chat to it. A persona can carry its own lorebooks and can be locked to chosen characters, so new chats with them start with it.

## Groups

A group puts several characters into one chat. "New group" lets you pick members. The editor has Overview, Members, Scene, Turns, Lore and Chats. The Turns tab decides who answers: Narrator (one reply voices everyone) or Each in turn. A new group starts as Narrator. A group is not a card: deleting a group deletes its chats, never its members. Members without a color of their own get different colors automatically.

## Getting cards

- "Import card" accepts PNG or JSON files, one or many, and links to Chub, RisuRealm, CharaVault, Botbooru or a direct file.
- The Marketplace searches several sources at once; open a result to read the full card before importing. Each source has its own sort order and adult filter, and some need a manual download.
- Export writes a PNG with the card inside.
- "With Molfar" on Home (and in Lorebooks) asks Molfar to draft a card or a lorebook with you. See [[vertep:molfar]].

## Letters from cards

A card you have not played for a while can write you a short note in its own voice. The note lands in the inbox (Home's "Waiting on you", the inbox button in the rail) as a green Letter; opening it takes you to the old chat, or starts a chat for a card you never played. A letter never writes into a chat and never invents events.

It is **off until you turn it on**. While it is off, a green card "Let your characters write to you" sits at the top of the Characters section and in Home's "Waiting on you": **Turn on** switches it on at once, **Not now** hides the card for good. The numbers (days of idle, letters a day, days between letters from one card, the writing model) and the cards you stopped are in Characters, More, Letters from cards. Letters are checked every few hours while the app is open: a chat idle for 14 days, a card you never played for 14 days, and a played card with no Soul (once).

## Portraits for cards without one

A card with no picture of its own (nothing, or the default avatar) can be drawn. **One card:** in the card editor, "Draw" under the portrait opens a dialog: pick the image model, a text model (the Card tasks model) writes a description of the card, which you can edit, and the image model draws it. The picture goes to the card's Gallery at once and "Use as portrait" makes it the avatar. **Many cards:** Characters, More, "Draw missing portraits (N)" asks which model and then draws them one after another through the progress card; Cancel stops it between cards and a card that fails is listed with the reason.

"Draw with" lists the image models of Settings > Images: a local ComfyUI or Forge next to API models. The first choice is the app's own image model (Extensions > Image generation); a pick here is remembered for portraits only. A tag-trained model gets a line of tags, an API model a paragraph. A card with only a name has nothing to describe, and the dialog says so. Image generation must be on (Extensions); the dialogs say so and open it for you.

## What a card does not hold

The Dashboard state, chapters and facts belong to each chat, not to the card. Card memory is also not part of the card and never appears in an export. The Soul, in contrast, is saved in the card.

Next: [[first-story]] for the first chat, or [[soul]] for the reaction profile.
