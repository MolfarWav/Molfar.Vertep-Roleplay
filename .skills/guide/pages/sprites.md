# Sprites and sprite windows

Sprites are small pictures of a character, one per emotion, that appear over the chat and change as the story moves. This page is for anyone who wants to see several characters at once, in a group or with a narrator card, or to build a visual-novel look.

## What a sprite window is

A sprite window floats over the chat and shows **one character**. It picks the picture from that character's own last lines (the same keyword rules as before; no model is called), and the picture stays until the character speaks again. Drag a window anywhere, drag its lower corner to resize it (double-click the corner to go back to the default size), and press **×** to fold it into a small round chip; press the chip to bring it back.

Sprites are added to a card in the editor, **More** tab, **Sprites**. Settings has one switch, "Expression Sprites", that turns every window off.

## One window, or several

A new chat has one window that follows **whoever speaks**, as always. Press the gear on a window to open **Sprite windows**:

- **Add window** (up to 8). A new window shows "Next in the scene".
- **Shows**, per window: "Whoever speaks", "Next in the scene", or one named character (a member of the group, or one voice of a narrator card).
- **Transparent background**, per window: no frame and no backing, only the picture. Clicks pass through it to the chat text, so such a window is moved by the small grip in its top-left corner.
- **Arrange**: "Row at the bottom" (the visual-novel look) or "Grid". They only place the windows; drag them from there.
- **Hide empty windows**.
- **Back to one window**.

The layout is saved **per chat, in this browser**. It does not travel to another device.

## Who is "in the scene"

"Next in the scene" windows show the people of the scene other than the speaker, and a character **keeps their window** while they stay: nobody jumps to another window when someone else speaks. When a character leaves the scene, their window goes blank ("Nobody here"), or disappears if "Hide empty windows" is on, and the next newcomer takes a free window.

The scene is the Dashboard's "Present" list when the Dashboard has read the story (see [[dashboard]]). Without it, the scene is whoever spoke in the last six messages.

## Outfits

A character with more than one outfit gets a small outfit switch on the window. The choice is kept for the chat and is separate for every member of a group.

## On a phone

A phone shows **one window**; the other people of the scene are small round pictures at the bottom left. Tap one to show that character in the window, tap it again to go back to following the speaker. Transparent windows, arranging and extra windows are for tablets and computers.

## What it does not do

It does not draw anything and does not read the story with a model: a character with no sprites has no window, and a character who never spoke shows their default picture. A group member without sprites is skipped.
