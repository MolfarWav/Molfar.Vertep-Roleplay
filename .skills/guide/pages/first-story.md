# Your first story

This is the shortest path from an empty Roleplay to a running story, and a list of what happens by itself so that nothing surprises you. You need a model connection first: see [[vertep:models]].

## Steps

1. **Get a card.** On Home press "New character" and write one, or "Import card" to bring a PNG or JSON card from a file. You can also search the Marketplace section, or press "With Molfar" to have Molfar draft a card from your idea. See [[characters]].
2. **Save it.** The card editor keeps edits in a draft until you press "Save changes".
3. **Pick a persona** (who you play) in the Personas section, or keep the default. "Use this persona" makes it your default.
4. **Start a chat.** Press "New chat" on the card. The chat opens with the card's first message.
5. **Check the model.** The pill in the chat header has a Model tab; picking a model there changes this chat only.
6. **Write.** Under each reply you can flip through other versions (swipes); the right arrow on the last version asks for a new one. To redo a reply with direction, use "Regenerate with a hint" in the "+" menu. The "More" button on a message offers edit, fork, prompt peek and more.

## What runs by itself

Once the chat has replies, background helpers work, each with its own model calls:

- The Dashboard reads the scene after every reply ([[dashboard]]).
- Litopys writes a chapter when a scene closes ([[litopys]]).
- The World DM, at its lowest active level (Chronicler), records people and places into a book for this chat ([[world-dm]]).
- A card with no soul gets one proposed automatically ([[soul]]).

Failures of these jobs are listed in the Inbox.

## If the model is small, slow or paid by the call

The cheapest savings, in order:

1. In the Dashboard's "Settings", set the mode to "Manual" (it then updates only when you press Refresh), or choose a small model as the "Sensor model".
2. In the Library's "Litopys settings", lower "Memory size" or switch "Chapters and facts" off.
3. In the World sheet, pick the "Off" level (it still makes a small call when the scene names a new place) or choose a cheap "DM model (all chats)".
4. In the Dashboard settings, switch "Rate characters automatically" off.
5. On the Canvas, the Prompt board shows every part of the next request with its tokens, and lets you switch parts off for one chat.

A story that has grown long needs its own measures: see [[long-chats]].

Free models with small context windows do best with a Manual dashboard and a Compact memory.

## Next

[[memory]] explains the kinds of memory; [[settings]] says where everything is set.
