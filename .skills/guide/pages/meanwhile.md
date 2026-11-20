# Meanwhile: life off screen

Meanwhile lets the people who are not in the scene do things while the story goes on: Bram sells a horse at the harbour, Ada hides the ledger, a front moves a step closer to its goal. It is a test version: off by default, and it only writes down what happened and keeps it in a log. It does not yet put the events into the characters' memory, so nothing changes in your replies.

## Turning it on

Open the chat's **World** sheet and find the card **Meanwhile**. Switch on "Let people off screen act". The switch is for all chats. It needs the **Dashboard** to be on, because Meanwhile reads the scenes from it, and it needs somebody to act: a character card that is not in the scene, or a person in the World DM's book.

## When it runs

A pass runs after a reply when at least two new replies have come and either a new scene began or the story clock moved by six hours. One pass is one model call. It uses its own model if you set one, else the World DM's, the Dashboard sensor's, the Library's, the chat's, the app's. The card says which. "Run a pass now" runs one at once.

A pass asks for up to three small events. The app checks each one: the people must be ones the chat knows, never your character and never anyone who is in the scene, and the effects must come from a short list. An event that fails a check is dropped whole, and the log says why. If a model answers nothing, the pass tries once more with more room; a pass that fails waits ten minutes.

## What the card shows

- **What this card shows**: Nothing (only that something happened), Hints (who and where) or Everything. The default is Hints, so the story is not spoiled for you.
- **Off screen so far**: the events, as that setting allows.
- **Log**: every pass: why it ran (scene closed, time passed, by hand), how many events the model offered and how many were kept, why the rest were dropped, and the error when it failed.

## Swipes and deletes

An event belongs to the reply after which it happened. If you swipe or delete that reply, the events of that pass go too, and the next pass reads the story again from the last reply that is still there.

Related: [[world-dm]], [[dashboard]], [[litopys]]. See [[litopys]] "Who knows" for how secrets are shown.
