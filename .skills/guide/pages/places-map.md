# The places map

The places map is a small floating map over the chat. It shows every place the story has named, the roads the story has walked between them and where you are now. It is for anyone who plays with the World DM and wants to see the world they are in. It costs no model calls.

## Where it is

A chat shows a round map button, bottom left of the chat column, when the chat's world book has at least one place (see [[world-dm]]). Press it to open the map; press **×** on the map to fold it back into the button. You can drag the button and the window anywhere, and drag the lower corner to resize the window (double-click the corner for the default size). The window stands where you left it, per chat, in this browser. Settings has one switch, "Places Map", that hides the button everywhere.

A world that was built before the story (from cards, a recipe or the library) may hold places the story has not shown you yet, so the map asks the same question as the World section before it shows them.

On a phone the open map is a panel standing on the message box. While it is open, the sprite window and the row of characters step aside; while you type, the map steps aside too and comes back when the box is empty.

## What is on it

- **A dotted board.** Drag the empty board to pan, pinch or use the wheel to zoom, **+**, **−** and the corners button (Show all places) in the header. Places keep their size on the screen; far out they shrink and lose their names, except the one you are in and the one you picked.
- **A place** is a small painted picture with its name under it. The three dots on its card ("More for this place") open a menu with "Change the icon of this place", which changes it by hand: the dialog offers "Automatic" (the one the name says) and every kind of the icon set with all its pictures; pick one and it stays on this place. Automatic takes the pick off. The picks belong to the chat. The picture comes from the place's name (a tavern, a forge, a forest, a kitchen...); a place whose name says nothing gets a brass pin. Each kind has several pictures (usually four) and a place keeps the one it got, so two taverns can look different. There are fantasy kinds (a tavern, a forge, a castle, a cave...) and the modern city's (a hospital, a police station, a cafe, a skyscraper, a metro entrance, a gas station, a post office, a cinema, a karaoke bar, an arcade and more). If the engine is older and has no pictures, a round emoji stands in their place. The place the story is in now has a ring and a dot. A place the story has never visited is a little dimmer.
- **Rooms and corners** of a place (the World DM's "spots") are smaller and stand around the place they are inside, with a thin line to it. Drag a place and its rooms go with it; drag a room and only the room moves.
- **Roads** are dashed lines between two places the story moved between. A road appears by itself the first time the story goes from one place to another; moving between rooms of one place is not a journey. Roads of the place you pick are drawn stronger.
  The map learns where the story is from the Dashboard's place line, matched by name to a place of the World book. When that line names somewhere that is not in the book, a line under the header says so ("The story is at ... which is not one of the places"), no place is marked as yours and no road is drawn until the story reaches a place the book has. Add the place in the World section (or give an existing one the name the story uses there). A road is only drawn for moves the map saw: it does not read back the story's past.
  **Draw a road by hand:** pick a place, choose "Draw a road from this place" in the three-dots menu of its card, then tap another place: a road joins them. Tap a place that already has a road to it and the road is taken away. Tapping a room or an empty spot only cancels. Only whole places can be joined, not rooms. Hand-drawn roads are kept like the ones the story drew.
- **Tap a place** to see its card at the bottom: the full name (the name under the icon is cut short, the card is not, and holding the pointer over a name shows it whole), "You are here", what it is inside, how many times the story visited it, and the picture bound to it in the World section when there is one.
- **Rename a place on the map** from the card's three-dots menu. It changes only what the map shows: the World book, the Dashboard and the story keep the place's own name, so nothing that goes by the place (its rooms, its roads, later travel by a tap) is affected. The card then also says "In the book: ...". Save an empty name to put the book's name back. The icon's kind is read from both names.

## Where the places stand

New places are placed by the app, not by a model: the first in the middle, the next ones next to the place the story came from, rooms around their place. Drag any place where you want it; the app never moves a place you placed. The positions, the roads and the map picture belong to the chat, not to the browser.

- **The lock** (the padlock in the header) keeps the places where they are: a drag that starts on a place moves the map instead, a tap still picks the place. It is made for a phone, where a finger panning the map keeps pushing icons about. It is kept per chat in this browser, so a phone can be locked while the desktop is not.

The gear in the header opens:

- **The picture under the places** (see "Ready maps" below): upload your own, choose a ready map, or switch to the dotted grid. Changing it keeps where the places stand; then drag the places onto it.
- **Draw a map with the image model** (see "Draw a map" below).
- **Maps of this chat** (see "Several maps" below), and, once there are several, **Places on this map**.
- **Arrange the places again** puts every place back to the automatic layout (it asks first). The roads stay.

## Travel by a tap

Pick a place the story is not in and press the arrow on its card (next to the three dots) ("Go to this place"). A small window opens:

- **How:** on foot, riding, by taxi, by metro or skip the road. Riding takes 0.4 of the walking time, a taxi 0.2, the metro a quarter plus ten minutes of waiting; skipping the road asks the reply for one line at most. Taxi is offered on town and region maps, the metro on town maps only (see "Several maps").
- **Minutes:** worked out from the distance between the two places on the board and the map's scale (a town map: 10 board units a minute, rounded to 5; a region map and a world map are many times slower per unit, so a long trip is told in hours or days, and the window shows it next to the number, "= 2 d 4 h"), and yours to change. They are kept on the road, so the next trip between the same two places starts from them. **Ask the model** (next to the minutes) makes one call on the World DM's model: it reads what the book says about the two places and the distance and gives the walking time, which fills the field. It costs one small call, only when you press it, and it is off while the World DM is off.
- **Road name:** optional. Kept on the road; the next trip tells the reply to keep to that road, so the same street is walked again. Left empty, the reply invents a short name. When the road has none and the World DM is on, one small call on its model reads the reply after the journey and a line appears under the header: "The reply called this road ..." with **Keep**. Keep puts the name on the road; ignore it and nothing changes. Nothing is read when you already named the road.
- **Road event** (off until you switch it on, remembered per chat in this browser): when the DM is already holding an event, that one plays on the road. Otherwise a seeded die is rolled against the chance you set (25% to start): the window shows the roll before you send, and on a hit names a small kind of event (a stranger, an obstacle, the weather, a find, a feeling of being watched, a traveller in trouble, a rumour, a warning sign) that the reply fills in. The same roll shows if you reopen the window, and it is in the instruction chip on your message.
- **Your move:** the line that goes into the chat, "I head to ..." by default, yours to rewrite.

**Go** sends your move with a hidden instruction for that one reply: where from, where to, how, about how long, to tell the way in a few lines and then the arrival, and to show the new time of day. It costs the reply and nothing more. The Dashboard clock is not moved by the map: it follows the reply, as it does after Skip time, so a swiped reply takes the time back with it. The instruction shows as a chip on your message. On a phone the map folds after Go so you can read the reply.

When the map does not know where the story is (the line under the header says so), the trip has no road and no time: the move and the arrival only. A room of the place the story is in is a move within it, also without time.

## Ready maps and the picture under the places

A map with nothing chosen is not bare: the app shows a ready, painted plan that suits the places (a house plan for rooms, caves for cellars and dungeons, a coast for the sea, a walled town or a village for streets and shops, the wilds for woods and rivers, a region otherwise; a modern plan, such as a downtown, a suburb, an industrial district, an airport or a campus, when the places are a modern city's: a hospital, a police station, a cinema, a bank...). The plan is picked by code from the names, the same one every time for a chat, and costs nothing.

The gear menu has the rest:
- **Choose a ready map** opens the gallery of the engine's packs by kind (Region, Wilderness, Coast, Walled town, Village, Harbour town, House plan, Caves; Downtown, Suburb, Industrial district, Campus, Waterfront, Old town, Airport, Metropolis, City park, Small town), four maps each. Pick one and it stays on this chat.
- **Upload a map picture** puts your own under the places, fitted into the board with its aspect kept.
- **No picture (the dotted grid)** takes the picture away; the menu then offers **Use the automatic map again**.

Moving the places or changing the picture never moves one into the other: the places keep where you put them.

## Several maps

One chat can have more than one map: a country, a city's plan, a dungeon. Each has its own picture, places, roads and scale. Open the gear menu and choose **Maps of this chat**: the first map is listed, **Add a map** makes another. For each map you set:

- **Name.**
- **Scale:** Town (a trip takes minutes: streets, a building, a dungeon level), Region (hours: villages, woods and roads between them) or World (days: cities and lands far apart). The scale sets how long a trip on that map takes, and which ways of travel are offered: on foot, riding and skip the road everywhere, a taxi on town and region maps, the metro on town maps.
- **Plan of:** the place this map is the plan of (the map of a city is the plan of that city), or none.

Once there are several maps, a row under the header shows the map you are looking at with a caret: press it to switch, or to open the list again. The map you look at is remembered per chat in this browser. A map that is the plan of a place shows a back arrow to the map that holds that place.

**A place stands only on the maps you put it on.** **Places on this map** (gear menu) lists every place with a tick: tick a place to show it on this map, untick to take it off this map only (its rooms go with it; a place on no map goes back to the map the story is on). A new place the DM adds goes to the map the story is on; a new city, village or castle also goes to the region and world maps. A new region or world map starts with the cities, villages and castles you already have. A new town map starts empty and says so, with a button for the same list.

**A place that has a map of its own** gets an **Open the map of this place** button on its card; **Make a map of this place** in its three-dots menu creates an empty map that is its plan and opens it. A place you open from the country's map is the same place as on the city's map; the story's place on the country map is the city whose plan holds it (while the story is in the city's tavern, the country map marks the city).

A road is kept on the map that has both its places. Travel is inside one map: on the world map you go from city to city and the story arrives at the city itself; to go to a tavern in it, open the city's map (the back arrow and the Open button move between them) and go from there.

The picture of a map is chosen like any other (a ready map, your own, none, or drawn): a Region or World map starts from a region plan whatever the places are, a Town map from the plan that suits its places.

## Draw a map

**Draw a map with the image model** (gear menu) paints a picture for the map on view with the image model you chose in Settings > Images. The window has:

- **What kind of map:** region, continent, walled town, harbour town, village, wilderness, coast, house plan, dungeon, caves, and the modern city's kinds (downtown, metropolis, suburb, industrial district, campus, waterfront, airport, small town). A Region map starts on Region, a World map on Continent.
- **What to draw:** a prompt filled from the kind and the names of the places on the map. It asks for only the ground (land, water, roads, empty plots) because your places are icons laid on top. Change it as you like; picking another kind rewrites it until you have edited it.
- A line with the image model and a reminder that each picture is one call that may cost money.

**Draw the map** makes one call and shows the result in the window; nothing has changed yet. **Use this map** makes it this map's picture (the other maps keep theirs), **Draw again** goes back to the prompt. If no image model is set up, the call says so; add one in Settings > Images.

## What it does not do

It does not invent places (the World DM does, see [[world-dm]]). Places the DM has retired leave the map.
