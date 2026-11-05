# Canvas: chat links, the prompt and agents

Canvas is the technical workbench of Roleplay: one screen with boards, where you see and change how chats are connected and what each chat sends to the model. You do not need it to play. Open it when a story needs a sequel, when a reply surprised you, or when you build agents.

Pick a board with the **Board** switch at the top: **Chat links**, **Prompt**, **Agents** and **Agent sets**. The Agents item in the rail opens the same Canvas on its Agents board. The board you used last is remembered.

## Chat links

A map of your chats. Each chat is a card. A line from one chat to another means "this chat continues that one": the earlier chat's story rides along as backstory in the later chat's replies, within the backstory budget set in the Library. A solid line is a continuation. A dashed line is a branch forked from a message.

- Chats you have not put on the board wait in the list on the left (**Chats**). Drag one onto the board, or use **Put on the board** (with **its linked chats** to bring the whole chain). Drag a card back to the list, or use **Remove**, to take it off the board. The chat itself stays in the Library.
- Switch **Edit** on to connect or disconnect cards. A link that would make a loop, join a chat to itself or repeat an existing one is refused, and the board says why. **Undo** and **Redo** are there. **Fit** frames the whole graph.
- On a phone the board opens in **View** with a **List** of links. Building a graph is easier on a large screen, but you can still edit links in the list.

The Library's map of a chat shows the same chain but is view-only. Its **Edit on canvas** button brings you here.

## Prompt

Pick a chat to see the request it sends to the model. The board has two views: **Parts** and **Memory**.

- **Parts** lists every part of the request: the main prompt, the character card, the persona, lorebook entries, example dialogue, preset sections and the history, each with its token count and its state. A part can be off in the preset, off for this chat, empty, or not for this kind of reply. You can switch a part off for this one chat without touching the preset. **Only what is sent** hides the rest, and the total shows what the model gets.
- **Memory** explains why memory put in what it did for the last reply: [[memory]] has the full description.

For a quicker look at only what fired in the last reply, use the **Fired** button in the chat header. The Memory view and **Fired** read the same record; Fired also counts over the whole chat.

## Agents and Agent sets

The agent forge: build an agent, try it, and group agents into sets. See [[agents]].

## What stays as it is

Switching a part off on the Prompt board applies to that one chat. The preset and the cards are not changed.
