# The Canvas

The Canvas is the rail section where you see how things connect: which chat continues which, what one chat sends to the model, and how agents are wired. It has boards, and you switch between them at the top ("Board:"). Open it when you want to link chats, check the size of a request, or build an agent.

## The boards

- **Chat links**: every chat is a card. Wires say which chat continues which.
- **Prompt**: every part of one chat's next request, with its token count. Two views, "Parts" and "Memory".
- **Agents** and **Agent sets**: the agent forge and the named lists of agents. See [[agents]].

The Canvas works best on a large screen. On a phone the Chat links board offers a List, where you pick for each chat what it continues.

## Chat links: continue a story in another chat

A chat that continues an earlier one gets that story as backstory (chapters and facts), so it can be short and still remember. This is the way to keep a long story cheap: see [[long-chats]].

1. Open the Canvas, board "Chat links", and switch to Edit if it is in View.
2. Chats that are not on the board wait in the list on the left (search by title or character). Drag one onto the board, or use "Put on the board". "Put on the board with its linked chats" brings the whole chain.
3. Drag a wire from the bottom dot of the earlier chat to the top dot of the later one. The later chat now continues the earlier one.
4. To remove a link, select the wire and press Delete, or pick the chat in the Details panel and press "Unlink". Undo and Redo are in the toolbar.

The rules are few. A chat continues at most one chat, but many chats can continue the same one. A link that would make a loop is refused, with a reason. A dashed wire is a branch forked from a message; it is shown, not edited here. "Remove" only hides a chat from the board, and the chat stays in the Library.

Saved boards ("Saved boards" menu) remember which chats sit on a board and where. The links themselves are shared by every board, so deleting a board never breaks a link.

The Library's "Map of chats" shows the same links for one chat, view only. Its button "Edit links on the canvas" opens this board with that chat selected.

## Prompt: what the model gets

Pick a chat and the board lists the parts of its next request: preset sections, the card, the persona, lorebook entries, the author's note, the history and more. Each has a token count, and most have a switch that turns the part off for this chat only; the preset and the card stay as they are. Click a row for its Details: the text taken and why anything was left out. "Turn everything on" undoes your switches. The total at the bottom is what the model gets.

The history card has no switch. Its Details choose the last N messages and whose messages count (desktop only).

The switch **Parts | Memory** at the top of the board changes the view. Memory shows what the story record put into the last reply and what it left out, and "Copy report" gives it as text for whoever helps you. See [[memory]] and [[litopys]].

## Where else links matter

A book saved from a chat is read by the chats that continue it on this board too: see [[memory]]. The panel "What this chat carries" (the "~N tok" button in the chat header) shows the backstory a link brings, with a switch.
