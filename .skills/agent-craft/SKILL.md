---
name: agent-craft
description: Use when making, changing or fixing a Roleplay agent (a small helper that runs after a reply: keeps a tracker, leaves a note, offers choices, nudges the next reply). Triggers: "зроби агента", "агент для чату", "трекер", "полагоди агента", "agent file".
---
Without this skill, Molfar invents card types, asks the model to do arithmetic, wires the history into every call, and hands over a file the checker refuses. An agent is data, not code: one JSON file of cards and wires that the app checks, shows to the user with its permissions, and runs after a reply. Molfar writes the file; the user installs it.

## Procedure

1. **Name the job in one sentence and pick its shape.** Four shapes cover most asks; each has a verified file in `references/`:
   - a note under the reply: `recipe-note.vertep-agent.json`
   - a tracker the code counts (a number, a list) with a panel: `recipe-tracker.vertep-agent.json`
   - buttons the player can tap: `recipe-choices.vertep-agent.json`
   - a hint added to the next reply: `recipe-hint.vertep-agent.json`
   A request that mixes shapes is one agent with several Output cards, not several agents, unless the user wants to switch them separately. Ask at most three questions, and only those that change the file: what it keeps or says, how often, what the user should see.
2. **Copy the closest recipe, then edit it.** `read_file` the recipe once, change the id, name, description, prompts, fields and panels. Never write `agent.derived` or a hash: the check fills them in.
3. **Read the card list when a param is unknown.** `references/cards.md` is the short form. For anything it does not settle, `grep` the heading "Agents:" in `apps/roleplay/docs/DATA-FORMATS.md` and read that section once. Do not invent a card type: an unknown type makes the agent refuse to run.
4. **Write one draft file.** `write_file` to `apps/roleplay/data/agents/drafts/<id>.vertep-agent.json` (the id is also the file name). Write the whole file in one call; `edit_file` refuses a result that is not valid JSON. To fix the same agent later, overwrite the same path.
5. **Hand it over.** Tell the user, in their language: open a chat, open the Agents tab (the switcher with Preset, Persona, Model; on a phone: Menu, then Agents), choose "Install and manage agents", find the agent under "Drafts from Molfar". If the check is red, the user pastes what it says, and Molfar fixes the file. If it is green, press Install, then Allow, then add the agent to the chat. The first run happens after the next reply.
6. **Report in plain words.** What the agent does, how many model calls per reply, which model role it needs, which permissions it will ask for (in words, not tokens: "read the last reply", "show a note"), and what the user will see after a reply and where.

## Craft rules

- **The code counts, the model names events.** Never ask the model for a total, a new level or a sum. Ask which event happened (`enum`, yes/no), branch with `logic.if`, and change the number with `state.add`. The field's `min` and `max` clamp it whatever the cards do.
- **One model call per job.** One `model.ask` with a small JSON `shape` beats two calls. `limits.maxCalls` must equal the number of `model.ask` cards, or the check says `E_BUDGET`.
- **Weak models are the target.** The user tests on free models with small context. Prefer `yesno` and `enum` answers, a `shape` of one to three fields, `maxTokens` 60 to 120, and a prompt that ends "Answer with JSON only". Give the card only what it needs: `lastReply` and `lastUserMessage`, not `history` (a long history on every reply costs the user real tokens and makes small models drift).
- **Ask for the least.** Each `give` source and each state field is a permission the user must accept. Take no source you do not wire into a prompt.
- **Every input gets exactly one wire.** `E_UNWIRED` is the commonest error: each `{{slot}}` in a template or prompt is an input; so is each `logic.if` input and the `in` of an Output. Types must match: a `yesno` `answer` is a flag, a `shape` number is a number, `yes` / `done` / `when` are signals. Port ids use only letters, digits, `_` and `-`.
- **Branching.** A `model.ask` `enum` feeds a text input of `logic.if` with `eq`. Several branches that end in the same Output meet in `logic.merge`. A `state.*` card with a `when` wire runs only when that signal fires.
- **Triggers.** `after` runs after every reply; `everyN` (every 3rd reply saves two thirds of the cost) and `keywords` (words from the last player message or reply) narrow it. Leave `manual` out for now: no screen runs it by hand yet. `before` and `parallel` are not run yet either.
- **Own state, not Dashboard fields.** `read:state.*` and `write:state.*` (the Dashboard's fields) and the sources `summary`, `preGenInjections`, `parallelResults` install but do not run yet. Keep what the agent needs in its own `agent.state`, which is kept apart per chat.
- **Show it where it fits.** A short note: `note` (under the reply). A number or a list: a panel in `top1` (always visible bar) or `float` (a button, for bigger panels). Buttons that start a move: `choices` with `show: "bottom"`. A hint for the model: `prompt-insert`, shown in the prompt inspector. `html` and grid widgets are not drawn yet; do not use them.
- **A hint cannot be conditional yet.** A `prompt-insert` always carries the text it is wired to; if the model has nothing to say, it still inserts something. Word the prompt so that an empty nudge is harmless.
- **Names.** `agent.id` is a lowercase slug of 2 to 41 characters (`a-z`, `0-9`, `-`). Set `author` to the user's name when known. `models` holds roles only (`fast`), never a model id or a key; the user maps the role to a model.
- **Layout.** Give every card `x` and `y`, left to right in steps of about 250, so the editor shows the file readable later.
- **Cost honesty.** One reply costs the user `maxCalls` extra model calls. Say it plainly when you hand the file over, and suggest `everyN: 2` or `3` for trackers that do not need every turn.

## After it runs

- The result sits under the reply (notes), in the panels, or above the composer (choices). The line "Agents · N" under a reply lists each agent's run, and a failed one says why. When the user reports a failure, ask for that line and fix the file from it.
- An update of the same id keeps the permissions the user already allowed, for what the agent still asks. A new permission waits for a fresh Allow, and the agent does not run until then.
- A draft stays in the folder after install. Overwriting it and pressing Update installs the new version.
