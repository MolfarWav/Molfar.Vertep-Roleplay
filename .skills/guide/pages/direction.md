# Direction: who is in the scene

Direction is for group chats. After each reply a small, cheap "director" model reads the scene and says what kind of scene it is (a lesson, a break, an alone moment, a date) and which members are in it. Members who are not there stop answering and are left out of the prompt until the story brings them back.

## The bar

In a group chat there is a thin bar under the member bar, marked "Direction" (on a phone only the icon). From left to right:

- **The scene chip**: the kind of scene and who is here ("Alone moment, with Yuzu" or "Lesson, 4 here"). Tap it to see who is here and who is not in the scene, when the last report was made, and a **Report now** button that asks the director again. While the director reads, the chip says "Reading the scene…".
- **The model chip**: the director's model. If none is picked it shows **Pick a model**. Tap it for the same model list the chat's top bar has: starred models, then every model by connection, with a search box.
- **The switch**: Direction on or off for this chat. Until a model is picked it is greyed out and says "Pick a model first".
- **Next**: a chip that appears while a genre rule or a beat of your plan has a note waiting for the next reply ("Next: Yuzu"). The x skips it.
- **Rules**: opens the Direction sheet with three tabs, **Rules**, **Plan** and **Log**. Beside the switch, so it stays in view on a phone (there it is only an icon, with a dot while the rules are on).

With the switch off, the bar folds to "Direction: off" and the chat works as it did before.

## Genre rules

A genre is a set of small rules that bring people into the scene by chance, so a story of that genre does not stall. Open **Rules** and pick a genre from the list. There are nine: **School rom-com**, **Harem**, **Slice of life**, **Drama**, **Thriller**, **Detective**, **Steamy romance**, **Adventure** and **Horror**. Each has three rules, built from the same few kinds of condition (alone with one member for some replies, nobody around for some replies, the scene is of a kind, only a few present) and the same three actions (someone walks in on the moment, someone joins, someone comes back). The card of a rule says in one sentence what it does. For example, School rom-com has:

- **Interrupted moment**: you have been alone with one member for three replies, and someone walks in on you.
- **Someone comes by**: nobody has been around for three replies (not at home), and a member comes by.
- **Friends join the break**: in a break, lunch or club with one or two present, a friend joins.

A genre also tells the director which kinds of scene to look for. Everyone gets the usual ones (lesson, break, lunch, club, on the way, outing, date, alone moment, at home, event); a genre adds a few of its own, such as danger, investigation, argument, secret, night, travel, work, meal or downtime. A chat with no genre, or with School rom-com, sees only the usual ones, so nothing changes for it. As everywhere in Direction, no rule fires in an explicit scene. The numbers of every genre are first guesses.

A chat starts with no genre and the rules off, so nothing changes until you pick one. Choosing a genre turns the rules on; **Rules in this chat** turns them off again and keeps the genre. The rules need the director on: they read its reports.

After each reply the code (not a model) checks the rules in order. A rule may fire when its conditions hold, it is not resting, and a roll of two dice reaches its number. If it fires, the next reply gets a short stage note ("Yuzu walks in on you and Hana and interrupts the moment") and the person counts as in the scene, so their card is sent whole. One note per reply at most. The lock, a return after the lock, and an event or a returning person from World come first; the rule then waits for another turn.

Each rule card shows its state: **Ready**, **Cooling down** (replies left) or **Quiet for the payoff**, and how many times it has fired towards the payoff. **Numbers** opens its settings:

- **2d6 needed**: the roll must reach this number; the text beside it gives the percent of rolls ("about 42%"). 2 always fires, 13 never.
- **Cooldown**: replies the rule stays quiet after it fires.
- **Payoff every** and **Then quiet**: every K-th time it fires, the rule rests M replies more ("finally alone"). 0 turns the payoff off.

**Fire now** puts the rule's note on the next reply without a roll, a cooldown or counting towards the payoff; it needs someone to be away. **Skip** drops a waiting note. A note you skip or a reply you delete is forgotten, with its cooldown; swiping the reply that carried a note gives the new try the same note.

Under the reply that carried a note a small line says what happened: "Direction: Mei joins (Friends join the break, 2d6 = 10, needed 9) · came". The last word is the director's later report: **came** (they are in the scene), **only mentioned**, or **did not come**. The **Log** tab lists the same, with the roll and why, also rules that rolled and missed.

A group can set a **default genre** on its **Direction** tab; its new chats start with that genre on. Numbers are first guesses: change them in a chat if a rule fires too often or too rarely.

**Who comes.** Each rule card has a **Who comes** choice: **Members** (the default: someone from the group, the one who has been away longest), **World people** (one person from this chat's World, such as a teacher or a neighbour the story already has) or **Either** (a coin decides when both exist). The World people come from the chat's World book; people who are retired, set not to come back on their own, or already in the scene are left out. Without people in the World the two other options are greyed out and say why. The next reply's note says who the person is, in one sentence from their record, and that they are not one of the group; nobody here has their card, so the writing model plays them from that sentence. A person who is only on the bench and not in your group can interrupt, join or come by this way.

## The plan

A **beat** is something you want to happen: "The bell rings and the class empties into the hall", "Mei brings a cake". Open **Plan** and tap **Add beat**. A beat has:

- **What happens**: a sentence or two, as a stage direction.
- **Who takes part** (optional): members who are away come into the scene for it. Under **People from the World** you can also pick people the story already has (a teacher, a rival); the note tells the writing model who they are. People are picked from the chat's World book, so there are none to pick until it has some.
- **When**: **After some replies** (counted from the moment the beat becomes the next one; 0 means at once), **Scene** (when the director reads that kind of scene: a lesson, a break, a date...), **Place** (when the Dashboard's place contains your words, such as "roof"; it ignores capitals) or **By hand** (only when you press **Fire now**).
- **Wait for a new scene**: on by default. A beat that is due does not cut into the middle of a moment: it waits up to 6 replies for the story to change place or jump in time, then goes anyway. A place beat goes the moment the story gets there, and a by-hand beat only when you fire it.

You do not have to write every beat from nothing. **From the genre** (beside **Add beat**) lists ready-made beats of the chat's genre ("A rumour about the two of them starts going around the school"); picking one opens the editor filled in, so you add who takes part and save. It needs a genre picked in **Rules**. **Draft from the cards** asks the director's model, once, to read the members' cards (and the genre, if there is one) and suggest five to eight beats in order, built on who these characters are. It takes a few seconds to a minute. The suggestions open in a **Draft** card with a tick on each: untick the ones you do not want and press **Add** to put the rest at the end of the plan. Nothing is saved until you add, closing the sheet drops the draft, and a beat already in your plan is not suggested again. The draft is only as good as the director's model; edit the beats afterwards like any other.

The plan goes **in order**: only the first beat that is not finished is looked at; the ones behind it say "After the beats before it". A beat is finished when it came in, when it was given up (the director saw it left out twice) or when you **Skip** it. The next beat counts its replies from the moment the one before ended. Each card says where its beat stands: **Waiting** (replies left), **Due, waiting for a new scene** (replies left), **Goes with the next reply**, **Delivered** (came, only mentioned, or went in when nobody was named), **Did not land**, **Skipped**. If something holds a beat back, the card says why: Direction is off, the scene is locked, or the scene is explicit (a beat never fires in one; it goes when the scene leaves it). **Edit**, **Move up**, **Move down** and **Delete** change the list; **Fire now** puts the beat on the next reply at once, whatever it waits for.

A beat uses the same machinery as a genre rule: after each reply the code checks the plan before the rules, the note rides the next reply (one note per reply; the lock, a return after the lock, and an event or a returning person from World come first, and the beat then goes again at the next reply), and the director's later report says whether they **came**, were **only mentioned**, or it **did not land**. The director only knows the group's members, so for the one reply that carries a note naming World people it is also asked whether those people are in the scene; every other reply is read as before. A beat that did not land is tried once more with a stricter note, then given up. A reply you swipe gives the new try the same note; a reply you delete takes its beat back.

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
