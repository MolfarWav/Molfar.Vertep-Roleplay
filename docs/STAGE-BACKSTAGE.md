# Stage and Backstage: where a feature goes (Molfar.Vertep#448)

Status: T1 to T5 are built (T3 variant A, T4 for the Dashboard, T5 tone and chip); see the end.

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
| DM | backstage | a link to the World section's DM tab (#183), like Agents to its Canvas board |
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
4. **Agents** is a Canvas board: its rail item and Canvas share a key, so the two are one place with two names. **DM** is the same for the World section's DM tab.
5. **Characters and Groups** are Playbill (pick a story) and Backstage (edit a card) in one list.

Not verified: the inventory is read from `sections.ts`, `chat-tools.tsx`, the handbook pages and the component names, not by walking every panel
in a running app. Dashboard sensor settings and the agent permission panels are placed by their names.

## T2: the `tier` field
`SectionItem.tier` is `'playbill' | 'backstage'` (a section never is the Stage; the Stage is the chat). The rail groups are unchanged on
purpose: they already follow the tiers, T2 only names them, so the later steps read the field and not a group number.

## T3: the curtain (built, variant A)
A **Backstage** button in the chat header (a block in the phone menu) lists the places that make this story and opens the existing section
drawers on them: the card, the preset, up to three lorebooks of the character, What fired, the Library and the World of this chat, and the
Dashboard settings. The chat stays under the drawer, so closing it returns to the same message. The rows come from `backstageTargets`
(`src/lib/backstage-targets.ts`, pure, tested); the UI is `src/components/chat/backstage-menu.tsx`. Owner's picks (2026-11-20): the button
sits before the kebab, all those rows, no hotkey for now. Variants B (the story tools row folded behind the curtain) and C (a pinned panel) are not built.

## T4: the Dashboard split (built)
The Dashboard's readable half (the strip, the wide sheet, the phone sheet) stays on the Stage. Its settings are the maker's half and now have
their own door: the curtain's "Dashboard settings" row opens the settings view directly (`openDashSettings` in the store, a counter like
`openDashboard`; an empty dashboard opens its own settings sheet). The gear inside the readable sheet stays as a second way in, on purpose:
nothing was taken away. Library and World are still mixed (their reader's view and settings share a screen); they are the next candidates.

## T5: the Backstage surface (built)
A drawer of a section whose `tier` is `backstage`, and the Dashboard settings sheet, take `BACKSTAGE_SURFACE` (`src/lib/backstage-tone.ts`: the
popover colour with 5% of the primary mixed in, from tokens so every theme follows) and show a **Backstage** chip in the header
(`src/components/shell/backstage-chip.tsx`), so the tone is never the only cue. The drawer's slide is the transition; nothing else animates.
Left on purpose: the Characters, Groups and Personas drawers keep the Stage tone even when opened from the curtain to edit a card (their tier is
the lobby, see line 5 of the list above); on a phone a drawer has no header of its own, so only the tone shows there, the settings sheet carries the chip.
