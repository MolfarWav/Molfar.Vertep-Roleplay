# Which memory for what

Roleplay has several things that "remember". They differ in who keeps them, what they hold and how long they last. If a character forgets something, this page tells you which one to reach for.

## The kinds

**Chat history.** The messages themselves. The model sees as many recent ones as its window allows.

**Dashboard** ([[dashboard]]). Per chat, the *current* state of the scene: who is present, feelings, outfits, open quests, what each character knows. It changes with every reply.

**Litopys** ([[litopys]]). Per chat, the *past* of the story: a chapter per finished scene and a list of facts. This is what a long chat leans on after older messages leave the prompt.

**Card memory.** Per character, across chats: what the character remembers from finished stories, their facts, notes, said lines and earned habits. It lives in the "Memory" tab of the card editor. You import a finished chat, see what would be kept, tick what to keep, and a switch turns one story off for new chats. It has its own size (Compact 800 tokens by default). It is not part of the card text and never appears in an exported card.

**Lorebooks.** Reference entries that join the prompt when their keywords appear, or always for a few. They hold the world's rules, places, people. Link a book to a card or group, or mark it Global to reach every chat. A chat also gets its own world book written by the World DM ([[world-dm]]). An entry set to **By meaning** fires when its sense is close to the recent messages, even without a key. With a local embeddings model the engine compares the entries of a book with each other: an entry fires when it stands out from the rest for this message, up to 10 entries per book. A book with fewer than 4 such entries uses a fixed closeness. An entry with secondary keys still needs them. If you change the embeddings model, the entries are made again by themselves on the next reply or two.

**Data Bank** (Tools). Text documents you upload (text formats only, up to 2 MB each). On every message the most relevant passages are added: found by words first, and with an embeddings model set up also ordered by meaning (the card **Data Bank by meaning** on the same screen: one press, or the engine does it by itself once embedding works). Use it for long reference material, not for the story itself. A **book** is a Data Bank file made from a story: in Library > Litopys, **Save as a book** copies the chapters, arcs and facts of a chat into a shelf file that other chats can read. Pick the chats that may read it (the chats that continue this one are chosen for you). It is a copy, not a link: later changes to the chat do not reach it, and **Save a new version** keeps the old one. A character only gets passages they could know: a fact keeps its "known by" list, a chapter its cast. In the Data Bank tab, **passages** lets you fix or delete a passage and change the readers; the Memory view counts the passages kept out.

**Author's note** (chat header, "Note"). Text you write for this chat only, placed at a depth and role you choose. Use it to steer: a style hint, a plot push.

**Soul** ([[soul]]). Not a memory of events but how a character reacts; it never changes during play.

## Which to use

- "She should remember last night's fight": Dashboard handles it short-term; Litopys keeps it long-term. Add a pinned fact if it must never be lost.
- "She should remember the previous story in a new chat": card memory, or link the chats on the Canvas so the earlier chat brings its story as backstory.
- "The world has a rule or a place": a lorebook.
- "I want the next replies to go this way": author's note, or the "Story, move" button.
- "I have a long document": Data Bank.

## Why did she know that?

Open **Canvas > Prompt** and switch the board from **Parts** to **Memory**. It shows what memory put into the last reply, and what it left out and why: the facts that went in (with their rank and who knows them), the ones kept out because the speaker does not know them, the ones that did not fit the memory size, the chapters, what the Data Bank found, and anything the checks after the reply flagged. People appear with their id from the chat's list of people, so "Sina" and "Sina Rose" are told apart. **Copy report** puts the same thing in your clipboard as plain text: paste it to whoever helps you debug the memory. The row of buttons at the top goes back through the last five replies (the Data Bank hits go with them); the checks after the reply are kept for the newest one only. A fold named **Worker: left out of the last scene** lists the facts the chapter worker did not keep and why: a near copy of a fact it already had, only what the card says, more than eight in one scene, a fact that is already gone, or the same proposal already waiting. The **Checked after the reply** fold names the facts the Dashboard sensor could not keep (about your own character, about someone who is not in the scene, an important event with no quote), not only how many. The summary also says **Ranked by meaning: yes** with how many of the candidates had a vector, or **no** and why (the chat has no vectors yet, the last call to the embeddings model failed, or this reply was not embedded). That tells "the answer was never in memory" from "the search by meaning was off". In the chat, the panel "What this chat carries" has a **Why?** button on the Litopys row that opens this view for that chat.

## Costs

All of these take room in the prompt. The Canvas Prompt board shows each part with its token count and lets you switch parts off for one chat. On a small model, lower Litopys's "Memory size", keep card memory Compact, and prefer a few short lorebook entries.
