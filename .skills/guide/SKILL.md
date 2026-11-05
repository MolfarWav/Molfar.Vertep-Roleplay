---
name: guide
description: Use FIRST when the user asks how to use Roleplay, where something is in it, what a part of it is (Dashboard, Litopys, Soul, World DM, Agents, memory, lorebooks), or whether something can be done from the screen. Triggers: "як", "де", "чи можна", "що таке", "how do I", "where is", "can I", "what is". The Roleplay user guide, the same pages the user reads in Help > Guide.
---

# Answering usage questions about Roleplay

Answer from these pages, not from the code. Read the page that fits:
`skill_load { name: "guide", scope: "app:roleplay", file: "pages/<page>.md" }`.

- `index`: what Roleplay is, a map of its parts
- `first-story`: the newcomer's path, what to switch off on a small model
- `characters`: cards, the card editor, persona, groups, import
- `soul`: a character's Soul, rating it, how it feeds the relationship dashboard
- `dashboard`: the scene dashboard
- `litopys`: chapters, facts, proposals, the Library
- `canvas`: Canvas boards: chat links, the prompt board (Parts and Memory), agents
- `memory`: Dashboard, Litopys, card memory, lorebooks, Data Bank, author's note: which does what
- `world-dm`: the World DM and world profiles
- `agents`: agents and the agent forge
- `settings`: where Roleplay's settings are

For the detail of one screen, the app's Help articles: `src/lib/help-articles.json`,
entries with `id`, `title`, `where`, `details` (grep the title or `json_get` the
entry; never read the whole file). For the engine itself (Molfar, models, settings,
sync), the built-in skill `vertep-guide`.

Only when neither covers it, read the code, and say "the guide does not cover this;
from the code: ...".

Do not propose building a new app or plugin when the user asks how to do something
in Roleplay; answer with what exists, and offer to build only if nothing does it.
