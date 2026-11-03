# Soul of a character

A soul is a character's temperament toward you: how they treat you when the story starts, how fast each feeling grows, and what hurts or pleases them more. It is the input of the Dashboard's relationship numbers ([[dashboard]]). You need this page if you want a character to react in their own way, or if you wonder why a proposal appeared.

## What a soul holds

Class (romantic, ally, neutral or hostile), pronouns, start values for trust, comfort, attraction, respect and affection (from -20 to +20; 0 is a stranger), traits (dominance, confidence, shyness, patience, curiosity), spectra that tilt how fast a feeling grows, triggers and values (things that hit harder or please more), a line about coping under strain, and other names the character goes by. The Help article *Soul of a character* explains each field.

The soul does not store what happens in a story. It never changes during play; the Dashboard keeps the changing numbers for each chat. A character with no soul simply plays neutral, with every multiplier at 1 and start values of 0.

## Where it is edited

Open a card, then the **Soul** tab. Each character is a chip at the top: a card with one character has one chip, a narrator card has one per recurring character. Pick a chip and edit its fields, then press "Save soul". Saved traits and spectra are fixed; "Edit" unlocks them, and the tab warns that a change touches the next turns of every chat with this card. "Delete soul" is in the "More actions" menu. "Add" or "Add by hand" creates a soul for a name yourself.

Only main characters get a soul. Passers-by the story invents are left without one on purpose.

## Automatic rating and proposals

By default the app proposes a soul for a card that has none: right after import, and on the first Dashboard update of a chat. A model reads the card, the lorebooks and recent messages. A proposal is not saved into the card. A banner shows "Proposal (automatic)" with "Review", "Accept all" and "Dismiss"; or "Save soul" on a single character. Until you decide, the proposal already acts in play as a provisional soul. "Dismiss" stops automatic rating for this card. If a rating fails, the banner shows "Retry" and "Choose another model". Waiting proposals also appear in the Inbox.

## Can I rate again from the screen?

Yes, with the same button. The one rating button in the Soul tab changes its label with what is selected:

- With no character selected, or one that has no saved soul yet: "Rate now". It rates only the characters that have no soul; if none are left it only says there is nothing new. Rating a character that has no soul yet can also be done with "Rate this character".
- With a character that already has a saved soul selected: "Rate again". It asks a model for a fresh soul for that one character and shows it as an update to review next to the saved one. If you have unsaved edits it first asks "Rate again?" because they would be replaced. If the new rating equals the saved soul, you are told there is nothing to change.

Nothing is overwritten until you press "Save soul". The model used is the Dashboard's "Sensor model" (the chat's model if empty); the "Rate characters automatically" switch in the Dashboard settings only controls the automatic first rating, not this button.

You can also ask Molfar in its own chat to rate or adjust a soul; it writes the same kind of proposal ([[vertep:molfar]]).
