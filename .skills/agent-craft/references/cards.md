# Agent cards: the params of each, and what the wires carry

The checker (`src/canvas-kit/boards/agent-check.js`) is the truth; this is the short form. Every card is
`{ "id", "type", "x", "y", "title", "params" }`. Ports are not written: they follow from `params`. A wire is
`{ "id", "from": "<card>:<port>", "to": "<card>:<port>" }`, from an output port to an input port of the same type.

Wire types: `text`, `number`, `flag` (yes or no), `signal` (fired or not; the `when` / `done` ports).

| Card | params | Ports it gets |
|---|---|---|
| `agent.input` (exactly one) | `give: [{ id, source }]`, source one of `lastReply`, `lastUserMessage`, `history`, `card`, `persona`, `authorNote`, `myPrevious`, `litopysFacts` (the chat's active Litopys facts, optional `limit` up to 60), `lorebook` (entries that are constant or keyed by the last six messages, optional `limit` up to 20). `state` (a Dashboard field, read only: `{ id, source: "state", field, as, of? }`, see below). Not yet run: `summary`, `preGenInjections`, `parallelResults` | one text output per `id` |
| `text.template` | `text` with `{{slot}}`s | one text input per slot, output `text` |
| `model.ask` | `role` (`fast`), `prompt` with `{{slot}}`s, `answer`, `maxTokens`, `batchKey: null` | one text input per slot in the prompt. Outputs by `answer`: `{ "as": "text" }` gives `text`; `{ "as": "yesno" }` gives `answer` (flag) and `reason` (text); `{ "as": "json", "shape": { "mood": "enum:calm\|tense", "level": "number", "met": "bool", "who": "text" } }` gives one output per shape field |
| `data.parse` | `shape` as above | input `text`, one output per field, and `failed` (signal) |
| `logic.if` | `inputs: [{ id, type }]`, `match`: `all` / `any` / `none`, `rows: [{ left, op, right }]` | one input per `inputs` entry; outputs `yes`, `no`, `unknown` (signals) |
| `logic.merge` | `count` (2 or more) | inputs `i1`..`iN` (signals), output `out`; fires when any input fires |
| `random.dice` | `count` (1 to 20), `sides` (2 to 1000), optional `bonus` | optional `when` (signal); outputs `total` (number), `rolls` (text). The code rolls, never the model; one reply rolls the same every time |
| `random.pick` | `items: [{ text, weight }]` (2 to 40, weight 1 to 100) | optional `when`; outputs `text`, `index` (number) |
| `text.extract` | `pattern` (up to 200 characters, no repeated group that holds a repeat or a choice), `flags` (`i`, `m`, `s`), `group`, `all`, `join` | input `in`; outputs `match` (text) and `none` (signal: nothing matched) |
| `text.cut` | `keep` (`first` / `last`), `unit` (`chars` / `words` / `lines`), `n` | input `in`, output `text` |
| `state.read` | `field`, `as` (`number` / `text` / `flag`) | output `value` |
| `state.set` | `field`, `as` | input `value`, optional `when`, output `done` |
| `state.add` | `field` (a number field), `amount` (fixed, may be negative) | optional input `by` (number) instead of `amount`, optional `when`, output `done` |
| `state.list` | `field`, `op` (`add` / `update` / `remove`), `item` (copy the field's entry shape), `key` (the entry field that finds the entry, for `update` / `remove`) | one input per entry field (`remove`: just `key`), optional `when`, output `done` |
| `agent.output` (one or more) | `kind`, optional `show`, plus `title` (note), `label` (prompt-insert) | input `in`: text for `note`, `choices`, `prompt-insert`; signal for `state-patch` |
| `note` | free text for people | none; never sent to a model |

`logic.if` rows: `left` and `right` are `{ "from": "wire", "port": "<input id>" }` or `{ "value": <literal> }`.
Operators by the input's type: text `eq`, `neq`, `contains`, `notContains`, `in` (value a list), `isSet`, `isMissing`;
number `lt`, `lte`, `eq`, `gte`, `gt`, `between` (value `[lo, hi]`), `isSet`, `isMissing`; flag `isYes`, `isNo`, `isUnknown`.
Missing data is `unknown`, never `no`. A rule with no right side (`isYes`, `isSet`) leaves `right` out.

`agent.output` places (`show`): `state-patch` log, feed, top1, top2, float, toast; `note` note, log, feed, top1, float;
`prompt-insert` inspector, note; `choices` bottom, log, float. The first is the default.

Own state (`agent.state`), kept per chat: `{ "tension": { "type": "number", "min": 0, "max": 10, "start": 2 } }`,
`{ "type": "text" }`, `{ "type": "flag" }`, `{ "type": "list", "item": { "name": "text", "level": "number" }, "max": 20 }`.
Panels (`agent.panels`, at most 4): `{ id, title, place: "float" | "top1" | "top2", widgets }`; widgets `meter`, `number`,
`counter` (number field), `table` (list field, `columns`), `list`, `log` (list field), `text` (text field),
`actions` (`items: [{ label, send }]`, only fills the composer). Each bound widget has `bind: "<field>"`; `html` is not drawn yet.

The first run of a number field starts at its `start`. Numbers stay inside `min` / `max` whatever the cards say.

Dashboard fields an agent may read (`source: "state"` on the Input card, or `from: "state"` in an `logic.if` rule; nothing else of the Dashboard is open, and nothing can be written to it): scene text `present` (names, joined), `place`, `weather`; per character text `mood`, `condition`, `outfit`, `holding`, `goal` (`as: "text"`) and numbers `trust`, `comfort`, `attraction`, `respect`, `affection` (`as: "number"`). `of: "Anna"` names the character; without it the field is about whoever spoke last. The permission is the field (`read:state.comfort`). A field the Dashboard has no value for is missing: a card that needs it is skipped and an If says Unknown. A number cannot go into a text slot of a prompt: compare it in an If, or leave the wire out.
