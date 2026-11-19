# The places map

The places map is a small floating map over the chat. It shows every place the story has named, the roads the story has walked between them and where you are now. It is for anyone who plays with the World DM and wants to see the world they are in. It costs no model calls.

## Where it is

A chat shows a round map button, bottom left of the chat column, when the chat's world book has at least one place (see [[world-dm]]). Press it to open the map; press **×** on the map to fold it back into the button. You can drag the button and the window anywhere, and drag the lower corner to resize the window (double-click the corner for the default size). The window stands where you left it, per chat, in this browser. Settings has one switch, "Places Map", that hides the button everywhere.

A world that was built before the story (from cards, a recipe or the library) may hold places the story has not shown you yet, so the map asks the same question as the World section before it shows them.

On a phone the open map is a panel standing on the message box. While it is open, the sprite window and the row of characters step aside; while you type, the map steps aside too and comes back when the box is empty.

## What is on it

- **A dotted board.** Drag the empty board to pan, pinch or use the wheel to zoom, **+**, **−** and the corners button (Show all places) in the header. Places keep their size on the screen; far out they shrink and lose their names, except the one you are in and the one you picked.
- **A place** is a small painted picture with its name under it. The picture comes from the place's name (a tavern, a forge, a forest, a kitchen...); a place whose name says nothing gets a brass pin. Each kind has four pictures and a place keeps the one it got, so two taverns can look different. If the engine is older and has no pictures, a round emoji stands in their place. The place the story is in now has a ring and a dot. A place the story has never visited is a little dimmer.
- **Rooms and corners** of a place (the World DM's "spots") are smaller and stand around the place they are inside, with a thin line to it. Drag a place and its rooms go with it; drag a room and only the room moves.
- **Roads** are dashed lines between two places the story moved between. A road appears by itself the first time the story goes from one place to another; moving between rooms of one place is not a journey. Roads of the place you pick are drawn stronger.
  The map learns where the story is from the Dashboard's place line, matched by name to a place of the World book. When that line names somewhere that is not in the book, a line under the header says so ("The story is at ... which is not one of the places"), no place is marked as yours and no road is drawn until the story reaches a place the book has. Add the place in the World section (or give an existing one the name the story uses there). A road is only drawn for moves the map saw: it does not read back the story's past.
  **Draw a road by hand:** pick a place, press the road button on its card (the line of dots), then tap another place: a road joins them. Tap a place that already has a road to it and the road is taken away. Tapping a room or an empty spot only cancels. Only whole places can be joined, not rooms. Hand-drawn roads are kept like the ones the story drew.
- **Tap a place** to see its card at the bottom: the full name (the name under the icon is cut short, the card is not, and holding the pointer over a name shows it whole), "You are here", what it is inside, how many times the story visited it, and the picture bound to it in the World section when there is one.
- **Rename a place on the map** with the pencil on its card. It changes only what the map shows: the World book, the Dashboard and the story keep the place's own name, so nothing that goes by the place (its rooms, its roads, later travel by a tap) is affected. The card then also says "In the book: ...". Save an empty name to put the book's name back. The icon's kind is read from both names.

## Where the places stand

New places are placed by the app, not by a model: the first in the middle, the next ones next to the place the story came from, rooms around their place. Drag any place where you want it; the app never moves a place you placed. The positions, the roads and the map picture belong to the chat, not to the browser.

- **The lock** (the padlock in the header) keeps the places where they are: a drag that starts on a place moves the map instead, a tap still picks the place. It is made for a phone, where a finger panning the map keeps pushing icons about. It is kept per chat in this browser, so a phone can be locked while the desktop is not.

The gear in the header opens:

- **Upload a map picture.** A map you made or drew elsewhere goes under the places and is fitted into the board, aspect kept. **Remove the map picture** takes it away and keeps where the places stand. Then drag the places onto your picture.
- **Arrange the places again** puts every place back to the automatic layout (it asks first). The roads stay.

## Travel by a tap

Pick a place the story is not in and press the arrow on its card ("Go to this place"). A small window opens:

- **How:** on foot, riding or skip the road. Riding takes 0.4 of the walking time; skipping the road asks the reply for one line at most.
- **Minutes:** worked out from the distance between the two places on the board (10 board units a minute, rounded to 5), and yours to change. They are kept on the road, so the next trip between the same two places starts from them.
- **Road name:** optional. Kept on the road; the next trip tells the reply to keep to that road, so the same street is walked again. Left empty, the reply invents a short name (it is not read back automatically yet: type it here when you like it).
- **Your move:** the line that goes into the chat, "I head to ..." by default, yours to rewrite.

**Go** sends your move with a hidden instruction for that one reply: where from, where to, how, about how long, to tell the way in a few lines and then the arrival, and to show the new time of day. It costs the reply and nothing more. The Dashboard clock is not moved by the map: it follows the reply, as it does after Skip time, so a swiped reply takes the time back with it. The instruction shows as a chip on your message. On a phone the map folds after Go so you can read the reply.

When the map does not know where the story is (the line under the header says so), the trip has no road and no time: the move and the arrival only. A room of the place the story is in is a move within it, also without time.

## What it does not do

It does not draw the world and does not invent places (the World DM does, see [[world-dm]]). Places the DM has retired leave the map.
