# Litopys: the story record

Litopys (the chronicle) is the long memory of one chat. It reads the story in the background and writes a chapter for each finished scene, plus the facts the story has established. When a chat grows too long for the model's window, the record carries the story forward. Use it for long stories; you do not need to start it.

## Chapters and facts

- A **chapter** says what changed in a scene, not a retelling. It is written once the next scene begins, so the latest scene may not have one yet. A new place or a jump in time closes a scene; you can also mark a run of messages as a scene yourself, from a message's "More" menu under Story.
- A **fact** is one short sentence that stays true: "Medli hides her wings at the market." Facts have a type, a weight (Everyday, Important, Key) and who knows them. You can add, edit, pin or retire facts by hand.
- **Proposals** are Litopys's suggestions: merge two facts, retire one, reword, pin. You accept or reject each.
- **Habits** a character clearly shows can also appear, and become a habit after repeating in several scenes.

## Where to look

Press **Record** in the chat header (on a phone, in the Menu) for this chat's record in a side panel. The **Library** section of the rail shows every chat's record. It has two views: Overview (a timeline, a card per character, waiting proposals) and Details with the tabs Chapters, Facts, Proposals, Habits and Activity. The Activity tab logs what Litopys did, with Undo where possible. The gear ("Litopys settings") sets how the record is written.

## What goes into the prompt

By default the record is inserted automatically. "Memory size" says how many tokens it may take: Auto by default (15% of the model's window, at least 800 and at most 16000), Compact (800 tokens) or Custom from 200 up to 16000. Auto lets a big window carry more of the story; on a small model it stays near 800. A size you saved yourself earlier stays as it was. When everything fits, all of it is sent; otherwise the parts that matter most to the scene. A small model wants a small size. "Chapters and facts" off means no new chapters or facts and nothing added to the prompt.

Older messages can leave the prompt only when the window is full, or scene by scene once a chapter covers them; the setting "Older messages leave the prompt" chooses.

## Matching by meaning

Memory finds facts and chapters by words. With an embeddings model it also finds them by meaning: a question in other words still reaches the fact. The card **Matching by meaning** (at the top of a chat's record, and in Canvas > Prompt > Memory) shows where it stands: off, failing, no vectors yet, partly done, done, or made by another model. Set the model up once in Settings > Memory: by default the app uses a model on your own computer first (LM Studio or Ollama), then an API connection with a key, then OpenRouter. Once one call to the embeddings model has worked (a press of the card's button, or a reply), the engine fills the missing vectors of every chat and Data Bank file by itself, a look every few minutes; anything over 300,000 tokens waits for the button, and a switch **Make vectors by itself** in Settings > Memory turns it off. The button **Embed N items** says first how many items and about how many tokens that takes, and does it now. New scenes embed their new items either way. If you change the embeddings model, the old vectors are not used until you press **Embed again**. The Data Bank has its own card, **Data Bank by meaning**, at the top of Settings > Data Bank: it works the same way for the passages of your files and snapshot books, and a file that is only partly covered says "7 of 12 by meaning".

## Suggestions and tidying

"Suggestions" is "Ask me first" by default: every pin and rewrite waits for your yes. The quiet option applies pins and rewrites at once and logs them in Activity. Retiring and merging always wait for you. "Tidy facts automatically" looks for duplicates and contradictions after 30 new facts, at one extra model call per 60 facts.

## Rebuild

"Rebuild from scratch" rewrites the chapters and facts from the messages in the background, about one model call every 30 seconds. Your own, edited and pinned facts and edited chapters stay, and the current record is used until the new one is ready. It refuses to start if no scene has closed.

If you edit messages after a chapter was written, that chapter is marked stale and rewritten.

## Related

A character's card can keep memory of finished chats too: see [[memory]]. The Help articles *Litopys: chapters and proposals*, *Facts and proposals* and *Overview vs Details* cover the screens.
