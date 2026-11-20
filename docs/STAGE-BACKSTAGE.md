# Stage and Backstage: where a feature goes (Molfar.Vertep#448)

Status: T1 (the inventory) and T2 (the `tier` field) are done. T3 to T5 wait for the owner's word, see the end.

## The rule
A vertep is a box theatre with two floors, and a lobby.
- **Playbill** (the lobby): choosing what to play. Home, Chats, Characters, Groups, Personas, Marketplace.
- **Stage**: what a reader of the story sees. The chat, sprites, the background, the scene line, the composer, the Fight button,
  and readable sheets (relations, quests, the journal, the knowledge map, the places map) as a side drawer.
- **Backstage**: what makes the story. Presets and samplers, lorebooks, Litopys settings, the Dashboard sensor settings, What fired,
  World DM settings, regex, shortcuts, Forge agents, the prompt inspector.

Test for a new feature: does a reader of the story see it? Stage. Does it change how the story is made? Backstage.
A feature that needs both is split: the readable view on the Stage, the settings Backstage.
Tiers are a field on a section (`tier` in `src/components/shell/sections.ts`); the UI catalog (#191) is how a section looks. They do not conflict.

## T1: the inventory

### Sections (the rail and the phone's "All sections" sheet)
| Section | Tier | Note |
| --- | --- | --- |
| Home | playbill | |
| Chats | playbill | |
| Characters | playbill | the card editor inside it is Backstage work, reached from a card |
| Groups | playbill | same |
| Marketplace | playbill | |
| Personas | playbill | |
| Lorebooks | backstage | |
| Library (Litopys) | backstage | **mixed**: the Overview tab and the "Who knows" tab are read by the reader; the Ledger's Settings, Proposals, Habits, Activity are the maker's |
| Canvas | backstage | |
| World | backstage | **mixed**: the Overview and World book are the maker's; the chat's world state is readable |
| Agents | backstage | |
| Presets | backstage | |
| Shortcuts | backstage | quick replies run on the Stage, their editor is Backstage |
| Tools | backstage | |
| Roleplay settings | backstage | off the rail |

### Inside the chat (`src/components/chat/`)
| Panel | Tier | Note |
| --- | --- | --- |
| Messages, composer, direction chips, scene heading, sprites and windows, background | stage | |
| Dashboard strip and its tabs (Person, Here, Quests, Notes, History) | stage | the readable half |
| Dashboard sensor settings (model, what to track) | backstage | **mixed** inside one component family |
| Header pill (preset, persona, model) | backstage | sits on the Stage: a maker's control on the reader's floor |
| Story tools row: Note, What fired, Record, World, Carries | backstage | **all five sit in the Stage header** |
| Preset panel, request size, prompt peek | backstage | |
| Voice colours, per-chat CSS, expanded editor | stage | looks of the page |
| Agent panels and notes under a reply | stage | what an agent shows; its settings and permissions are Backstage |
| Fight button and its panels | stage | |

### What fits no tier (a real UX line each)
1. **The story tools row** puts five Backstage tools into the Stage header, always visible. A newcomer sees "What fired" before a first reply.
2. **Library, World and the Dashboard** each hold a reader's view and a maker's settings in one place.
3. **The header pill** (preset, persona, model) is a maker's choice on the reader's floor.
4. **Agents** is a Canvas board: its rail item and Canvas share a key, so the two are one place with two names.
5. **Characters and Groups** are Playbill (pick a story) and Backstage (edit a card) in one list.

Not verified: the inventory is read from `sections.ts`, `chat-tools.tsx`, the handbook pages and the component names, not by walking every panel
in a running app. Dashboard sensor settings and the agent permission panels are placed by their names.

## T2: the `tier` field
`SectionItem.tier` is `'playbill' | 'backstage'` (a section never is the Stage; the Stage is the chat). The rail groups are unchanged on
purpose: they already follow the tiers, T2 only names them, so the later steps read the field and not a group number.

## T3 to T5: UI plan, waiting for the owner
- **T3, the curtain.** One control in a fixed place (the chat header, and the rail's foot) and one shortcut. Backstage opens at what you were
  looking at: from a reply to What fired for that reply, from a character to its card, from a lore highlight to that entry. Coming back returns
  to the same message. Where it starts: the chat. Steps: one tap. Variants: (A) a curtain button that opens the existing section drawers
  at the right place (smallest; the five tools stay), (B) A plus a collapsed story tools row (the row moves behind the curtain),
  (C) a pinned Backstage panel beside the chat on a wide desktop. Recommended: A first, then B.
- **T4, split the mixed features** (Dashboard first): readable view on the Stage, settings Backstage.
- **T5, the Backstage surface tone and the transition**, through tokens, never hex.
Each of these changes screens the owner uses every day, so each goes through `ux-review` with a written plan and is shown before it is built.
