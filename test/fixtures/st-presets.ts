// Two SillyTavern presets written for the import tests (#239). They copy the STYLE of public modular
// presets, not their text: no real preset is copied into the repo.
//  - EMBER: setvar modules assembled by one getvar blueprint, [PICK n: TAG] tags, a ↓/↑ pair, a README
//    prompt, "DO NOT TOUCH" and "DO NOT ENABLE" blocks, the authors' {{// }} explanations.
//  - VOYAGE: the header style (a rule-drawn header prompt, then its toggles).

type Prompt = { identifier: string; name: string; role?: string; content?: string; marker?: boolean }
const P = (identifier: string, name: string, content = ""): Prompt => ({ identifier, name, role: "system", content })
const preset = (prompts: Prompt[], off: string[]) => ({
  temperature: 1,
  prompts,
  prompt_order: [{ character_id: 100001, order: prompts.map((p) => ({ identifier: p.identifier, enabled: !off.includes(p.identifier) })) }],
})

export const EMBER = preset([
  P("main", "Main Prompt", "You are the narrator of an interactive story with {{user}}."),
  P("readme", "📖 README", "{{// Ember is a modular preset. Each module sets a variable; the Master Blueprint at the bottom puts the picked ones together. Picks are marked [PICK n: TAG] on the toggles. }}"),
  P("vars", "Prompt Variables", "{{// Language of the story. }}{{setvar::ember_lang::English}}{{trim}}"),
  P("h_mind", "━━ 1. MIND ━━"),
  P("riot", "Riot Mind [PICK 1: MIND]", "{{// Macro state zeroing }}{{// The narrator thinks fast and breaks things. Best for action stories with a lot going on. }}{{setvar::ember_mind::Think like a riot: fast, loud, decisive.}}"),
  P("calm", "Calm Mind [PICK 1: MIND]", "{{// A patient narrator who lets scenes breathe. }}{{setvar::ember_mind::Think calmly and let scenes breathe.}}"),
  P("ag_full", "[PICK 1: ↓] Agency Full", "{{// Characters act on their own goals every reply. }}{{setvar::ember_agency::Characters pursue their own goals and act without waiting.}}"),
  P("ag_lite", "[PICK 1: ↑] Agency Lite", "{{// Characters react more than they act. }}{{setvar::ember_agency::Characters mostly react to the player.}}"),
  P("h_opt", "━━ 2. OPTIONS ━━"),
  P("stacc", "Anti-Staccato", "{{// Stops chains of very short sentences. }}{{setvar::ember_opt_staccato::Avoid chains of short choppy sentences.}}"),
  P("tact", "Tactility", "{{// More touch, texture and temperature in descriptions. }}{{setvar::ember_opt_tact::Describe touch, texture and temperature.}}"),
  P("cine", "Cinematic Composition", "{{setvar::ember_opt_cine::Frame each scene like a film shot.}}"),
  P("h_asm", "━━ 13. ASSEMBLY & MARKERS ━━"),
  P("blueprint", "Master Blueprint 🚫DO NOT TOUCH🚫", "{{// DO NOT TURN OFF OR DELETE }}<rules>\n{{getvar::ember_mind}}\n{{getvar::ember_agency}}\n{{getvar::ember_opt_staccato}}\n{{getvar::ember_opt_tact}}\n{{getvar::ember_opt_cine}}\nWrite in {{getvar::ember_lang}}.\n</rules>"),
  P("braille", "Braille note", "Use plain text only."),
  { identifier: "chatHistory", name: "Chat History", marker: true },
  P("h_dbg", "━🚫 DO NOT ENABLE 🚫━"),
  P("dump", "Debug dump", "Print every variable: {{getvar::ember_mind}}"),
], ["readme", "calm", "ag_lite", "stacc", "braille", "dump"])

export const VOYAGE = preset([
  P("main", "Main Prompt", "Write the next reply in the story."),
  P("h_pov", "━📜 Point of View (PICK ONE)", "{{// Whose eyes the story is told through. }}"),
  P("third", "Third Person", "{{// Narrator stays outside the characters. }}Write in third person."),
  P("second", "Second Person", "Write in second person, addressing {{user}} as you."),
  P("first", "First Person", "Write in first person as {{char}}."),
  P("h_ext", "━ Extras", "Mix any of these."),
  P("sparks", "Sparks", "Add small surprising details."),
  P("rain", "Rain", "Weather matters: let it rain sometimes."),
  P("fog", "Fog", "Hide things in fog."),
  P("wind", "Wind", "Let the wind move things."),
  P("h_core", "━ Core"),
  P("a", "Prose", "Vivid prose."),
  P("b", "Dialogue", "Natural dialogue."),
  P("c", "Slow burn", "Take romance slowly."),
  { identifier: "chatHistory", name: "Chat History", marker: true },
  P("jb", "Final note", "Stay in character."),
], ["second", "first", "fog", "wind", "c"])
