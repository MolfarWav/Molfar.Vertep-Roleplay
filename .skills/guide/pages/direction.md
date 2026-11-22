# Direction: who is in the scene

Direction is for group chats. After each reply a small, cheap "director" model reads the scene and says what kind of scene it is (a lesson, a break, an alone moment, a date) and which members are in it. Members who are not there stop answering and are left out of the prompt until the story brings them back.

## The bar

In a group chat there is a thin bar under the member bar, marked "Direction" (on a phone only the icon). From left to right:

- **The scene chip**: the kind of scene and who is here ("Alone moment, with Yuzu" or "Lesson, 4 here"). Tap it to see who is here and who is not in the scene, when the last report was made, and a **Report now** button that asks the director again. While the director reads, the chip says "Reading the scene…".
- **The model chip**: the director's model. If none is picked it shows **Pick a model**. Tap it for the same model list the chat's top bar has: starred models, then every model by connection, with a search box.
- **The switch**: Direction on or off for this chat. Until a model is picked it is greyed out and says "Pick a model first".
- **Log**: the last reports (the kind of scene, who was here, how long it took, how many tokens), and every switch, lock, release and error, newest first.

With the switch off, the bar folds to "Direction: off" and the chat works as it did before.

## Picking the model

There is one director model for all chats and all groups. Pick it from any bar, or on the group's **Direction** tab. There is no default: you choose. A small fast model is enough: it costs one short call after each reply.

A new group chat starts with Direction on as soon as a model is picked. Chats you already had are not touched. Each chat has its own switch.

## Who is away

A member chip changes when someone is out of the scene: the picture is dimmed and carries a small door mark. A lock mark means the lock (below) left them out. Tap a chip: its popover says "Here" or "Not in the scene".

An absent member does not take turns on their own, and their card is not sent to the model: only one line says they are not in the scene. Naming them in your message still calls them in. When the director sees them back, their whole card returns.

## The lock and the return

To keep a scene with one person, tap a member chip and choose **Only <name> in the scene**. A chip "Only Yuzu" appears before the scene chip, and the others stay out whatever the director says. Tap the x on that chip, or **Release the lock** in a member's popover, to let go. On the next reply the others are told they may come back and the story is asked to give them a way in.

## If the director fails

If the director's answer cannot be read, or the call fails, the scene chip says **No report**; open it to see why. The chat then uses the Dashboard's idea of who is here, or lets everyone answer as before. Nothing in your story is lost.

## New groups

**New group** opens a wide window (full screen on a phone). Name the group, or leave the name blank to use the first three members. Search, narrow with **All**, **Favourites** and **Recent**, tag chips and a sort (Name, Recently used, Most chats), and tap portraits to choose. The chosen members sit in a row on top in speaking order; the arrows move one earlier or later, the x removes. **Next** needs two characters.

After **Next** the group is made and its editor opens with a note: check how it plays, then start the first chat. **Start chat** is the main button. The **Direction** tab sets whether new chats of this group start with Direction on, and shows the director's model. A group on the Groups page opens the same editor, and so does the group's name at the top of its chat.

When you start a later chat of a group, the short step before the chat has a **Direction** switch: on when the group's default is on and a model is picked.

See also [[characters]] and [[dashboard]].
