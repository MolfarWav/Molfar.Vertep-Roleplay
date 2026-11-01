/**
 * Leak scenarios for the omniscience bench (issue #184, P0b). Synthetic text only, nothing from a real chat.
 * `char`: one character speaks and a secret it must not know sits in the Litopys record (what the insert did before
 * the speaker filter; after it the secret is not in the prompt). `narrator`: one narrator voices the cast and a secret
 * only one of them knows sits in the record; compared with and without the "who knows what" brief.
 */
export const USER = "Jude";

export type Scenario = {
  id: string;
  kind: "char" | "narrator";
  /** The characters of the scene besides the player. */
  cast: string[];
  /** char: who speaks. narrator: unused. */
  speaker?: string;
  secret: string;
  /** Who knows the secret (names). */
  knownBy: string[];
  /** Who must not act on it, for the judge. */
  mustNotKnow: string[];
  userTurn: string;
};

export const CARDS: Record<string, string> = {
  Aria: "Aria, a quiet courier with a sharp memory.",
  Bram: "Bram, a grim innkeeper turned guide.",
  Cael: "Cael, a talkative scout who loves rumours.",
  Dara: "Dara, a young healer who notices small things.",
  Eno: "Eno, an old soldier who says little.",
};

export const SCENARIOS: Scenario[] = [
  { id: "c1", kind: "char", cast: ["Aria", "Bram"], speaker: "Aria", secret: "Jude plans to betray the guild at midnight.", knownBy: [USER], mustNotKnow: ["Aria"], userTurn: "Aria, be honest: do you have any idea what I am up to tonight?" },
  { id: "c2", kind: "char", cast: ["Aria", "Bram"], speaker: "Bram", secret: "Aria sold the guild's map to the Duke's spy.", knownBy: ["Aria"], mustNotKnow: ["Bram"], userTurn: "Bram, where do you think the guild's map went?" },
  { id: "c3", kind: "char", cast: ["Cael", "Dara"], speaker: "Cael", secret: "The innkeeper's daughter is secretly the missing princess.", knownBy: ["Dara"], mustNotKnow: ["Cael"], userTurn: "Cael, who do you think the girl at the inn really is?" },
  { id: "c4", kind: "char", cast: ["Aria", "Cael"], speaker: "Aria", secret: "Jude carries a vial of poison meant for the Duke.", knownBy: [USER], mustNotKnow: ["Aria"], userTurn: "Aria, do you trust what I carry in my pack?" },
  { id: "c5", kind: "char", cast: ["Bram", "Eno"], speaker: "Eno", secret: "Bram is a werewolf and has been since the winter.", knownBy: ["Bram"], mustNotKnow: ["Eno"], userTurn: "Eno, you have travelled with Bram the longest. Anything odd about him?" },
  { id: "c6", kind: "char", cast: ["Cael", "Dara"], speaker: "Dara", secret: "The treasure is buried under the third stone of the old mill.", knownBy: ["Cael"], mustNotKnow: ["Dara"], userTurn: "Dara, if you had to dig for the treasure right now, where would you start?" },
  { id: "c7", kind: "char", cast: ["Aria", "Bram"], speaker: "Bram", secret: "Jude's real name is Ilyan and he fled the capital after a murder.", knownBy: [USER], mustNotKnow: ["Bram"], userTurn: "Bram, what do you know about where I come from?" },
  { id: "c8", kind: "char", cast: ["Aria", "Cael"], speaker: "Cael", secret: "Aria has been poisoning the captain's wine for a week.", knownBy: ["Aria"], mustNotKnow: ["Cael"], userTurn: "Cael, why do you think the captain has been so ill lately?" },
  { id: "n1", kind: "narrator", cast: ["Aria", "Bram", "Cael"], secret: "Bram stole the captain's seal.", knownBy: ["Bram"], mustNotKnow: ["Aria", "Cael"], userTurn: "I ask Aria whether she has seen the captain's seal." },
  { id: "n2", kind: "narrator", cast: ["Aria", "Bram", "Cael"], secret: "Cael is the Duke's spy.", knownBy: ["Cael"], mustNotKnow: ["Aria", "Bram"], userTurn: "I ask Bram who he suspects of being a spy among us." },
  { id: "n3", kind: "narrator", cast: ["Aria", "Bram", "Cael"], secret: "Aria hid the antidote inside the chapel bell.", knownBy: ["Aria"], mustNotKnow: ["Bram", "Cael"], userTurn: "I ask Cael where the antidote might be hidden." },
  { id: "n4", kind: "narrator", cast: ["Aria", "Bram", "Cael"], secret: "Jude plans to ambush the convoy at dawn.", knownBy: [USER], mustNotKnow: ["Aria", "Bram", "Cael"], userTurn: "I look at the others. \"What do you think I will do at dawn?\"" },
  { id: "n5", kind: "narrator", cast: ["Aria", "Bram", "Cael"], secret: "Bram is secretly in love with the captain's wife.", knownBy: ["Bram"], mustNotKnow: ["Aria", "Cael"], userTurn: "I ask Cael what he thinks is troubling Bram lately." },
  { id: "n6", kind: "narrator", cast: ["Aria", "Bram", "Cael"], secret: "Cael rigged the bridge with explosives.", knownBy: ["Cael"], mustNotKnow: ["Aria", "Bram"], userTurn: "I ask Aria whether the bridge is safe to cross." },
  { id: "n7", kind: "narrator", cast: ["Aria", "Bram", "Cael"], secret: "Aria was once a nun who broke her vows.", knownBy: ["Aria"], mustNotKnow: ["Bram", "Cael"], userTurn: "I ask Bram what he knows about Aria's past." },
  { id: "n8", kind: "narrator", cast: ["Aria", "Bram", "Cael"], secret: "Cael forged the king's letter.", knownBy: ["Cael"], mustNotKnow: ["Aria", "Bram"], userTurn: "I ask Aria and Bram who wrote the king's letter." },
];

/** Six neutral messages of the scene, so every character of the cast is present in the line. */
export function history(cast: string[]): Array<{ role: "user" | "char"; name: string; text: string }> {
  const [a, b, c] = [cast[0]!, cast[1]!, cast[2] ?? cast[0]!];
  return [
    { role: "user", name: USER, text: "The fire has burned low. I poke at the embers and glance at the road ahead." },
    { role: "char", name: a, text: `${a} pulls her cloak tighter. "We should move at first light. The road north is long."` },
    { role: "char", name: b, text: `${b} shrugs and passes round a heel of bread. "Eat. We will want our strength."` },
    { role: "user", name: USER, text: "I take the bread and sit down with the others by the fire." },
    { role: "char", name: c, text: `${c} grins over the flames. "Quiet night for once. I would not trust it."` },
    { role: "char", name: a, text: `${a} nods slowly and watches the dark between the trees.` },
  ];
}

export const NEUTRAL_FACTS = ["The company travels north along the old road.", "The Duke's soldiers hold the bridge towns."];
