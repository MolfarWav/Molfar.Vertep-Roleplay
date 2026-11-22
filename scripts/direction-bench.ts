// Direction bench, phase 0 (Molfar.Vertep #496, design note .fork/handoff/direction/BENCH.md in the engine repo).
// A synthetic school rom-com group chat with a known answer key (the outline), and four measurements:
// M4 the sensor's inputs, M1 the scene tag (code vs a director model), M2 rule firing, M3 delivery of a stage note.
//
//   bun scripts/direction-bench.ts prose   <dir> [--model nanogpt/...]   outline.json + cast.json -> chat.json (player + reply per turn)
//   bun scripts/direction-bench.ts root    <dir>                         chat.json -> root/ (the shape scripts/director-bench.ts replays)
//   bun scripts/direction-bench.ts director <dir> --model nanogpt/... [--tag t]   variant B: one director call per turn
//   bun scripts/direction-bench.ts deliver <dir> --model nanogpt/... [--note template|written] [--writer nanogpt/...] [--tag t]
//   bun scripts/direction-bench.ts judge   <dir> --from deliver-<tag>.json --model nanogpt/...
//   bun scripts/direction-bench.ts score   <dir>                         every results file -> score.md + score.json
//
// The dir is kept outside the repository. Everything in it is fictional, so it may go to any provider.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const cmd = args[0];
const dir = args[1];
const flag = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
if (!cmd || !dir) throw new Error("usage: bun scripts/direction-bench.ts <prose|root|director|deliver|judge|score> <dir> [...]");
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const writeJson = (f: string, v: unknown) => fs.writeFileSync(path.join(dir, f), JSON.stringify(v, null, 1));

// ---------- the model (same providers and retries as scripts/director-bench.ts) ----------
function keyFor(env: string): string {
  if (process.env[env]) return process.env[env]!;
  for (const f of [path.resolve(".claude/skills/ask-model/keys.env"), path.join(os.homedir(), ".claude/skills/ask-model/keys.env")]) {
    try {
      const m = new RegExp("^" + env + "=(.*)$", "m").exec(fs.readFileSync(f, "utf8"));
      if (m) return m[1]!.trim().replace(/^["']|["']$/g, "");
    } catch {}
  }
  return "";
}
const BASES: Record<string, { url: string; env: string }> = {
  nanogpt: { url: "https://nano-gpt.com/api/subscription/v1", env: "NANOGPT_API_KEY" },
  "nanogpt-paid": { url: "https://nano-gpt.com/api/v1", env: "NANOGPT_API_KEY" },
};
type Answer = { text: string; model: string; error?: string; input: number; output: number; ms: number };
async function callModel(system: string, user: string, model: string, maxTokens: number, temperature: number): Promise<Answer> {
  const [prov, ...rest] = model.split("/");
  const base = BASES[prov!];
  const t0 = Date.now();
  if (!base) return { text: "", model, error: "unknown provider " + prov, input: 0, output: 0, ms: 0 };
  const key = keyFor(base.env);
  if (!key) return { text: "", model, error: "no key " + base.env, input: 0, output: 0, ms: 0 };
  const body = { model: rest.join("/"), messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: maxTokens, temperature };
  const pauses = [5000, 10000, 20000, 40000, 60000];
  for (let attempt = 0; attempt <= pauses.length; attempt++) {
    try {
      const r = await fetch(base.url + "/chat/completions", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + key }, body: JSON.stringify(body) });
      const j: any = await r.json().catch(() => ({}));
      const limited = r.status === 429 || r.status >= 500 || /too many requests/i.test(String(j?.error?.message ?? ""));
      if (!r.ok || limited) {
        if (attempt < pauses.length && limited) {
          await new Promise((res) => setTimeout(res, pauses[attempt]));
          continue;
        }
        return { text: "", model, error: String(j?.error?.message ?? r.status), input: 0, output: 0, ms: Date.now() - t0 };
      }
      return { text: String(j.choices?.[0]?.message?.content ?? ""), model, input: j.usage?.prompt_tokens ?? 0, output: j.usage?.completion_tokens ?? 0, ms: Date.now() - t0 };
    } catch (e) {
      if (attempt >= pauses.length) return { text: "", model, error: String(e), input: 0, output: 0, ms: Date.now() - t0 };
      await new Promise((res) => setTimeout(res, pauses[attempt]));
    }
  }
  return { text: "", model, error: "retries", input: 0, output: 0, ms: Date.now() - t0 };
}
/** The first JSON object or array in a model's answer (code fences and prose around it are dropped). */
function parseJson(text: string): any {
  const t = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = t.search(/[[{]/);
  if (start < 0) return null;
  for (let end = t.length; end > start; end--) {
    const c = t[end - 1];
    if (c !== "}" && c !== "]") continue;
    try {
      return JSON.parse(t.slice(start, end));
    } catch {}
  }
  return null;
}

// ---------- the corpus ----------
type Turn = {
  k: number; player: string; beat: string; place: string; day: number; time: string; tag: string;
  present: string[]; aloneWith: string | null; sceneNew: boolean; direction: string;
};
type Cast = { persona: { name: string; about: string }; members: { id: string; name: string; about: string }[] };
const TAGS = ["lesson", "break", "lunch", "club", "commute", "group_out", "date", "alone_moment", "at_home", "event"];
const first = (n: string) => n.split(" ")[0]!;

const PROSE_SYSTEM = (cast: Cast) =>
  [
    "You write one turn of a group roleplay chat for a test corpus: the player's message and the narrator's reply.",
    "The story is a light school romantic comedy. The player plays " + cast.persona.name + " (" + cast.persona.about + ").",
    "The narrator voices every other character. Characters:",
    ...cast.members.map((m) => "- " + m.name + ": " + m.about),
    "",
    "Rules:",
    "- The player's message: 1-3 sentences in the first person, actions in *asterisks*, speech in quotes, written as " + first(cast.persona.name) + ".",
    "- The reply: 150-300 words, third person, past tense, the narrator's voice, with dialogue. Never write " + first(cast.persona.name) + "'s words or decisions beyond what the player wrote.",
    "- Follow the beat exactly. Only the characters listed as present at the end may be physically in the scene at the end; anyone who leaves must be shown leaving, anyone who arrives must be shown arriving.",
    "- When the place or the time changes from the previous turn, show it naturally in the first lines (\"By lunch,\", \"The station was crowded\"). A character who is only mentioned or texts is not present.",
    "- Never name any label, tag, list or rule from this instruction. Plain story only.",
    "",
    'Reply with one JSON object: { "player": "...", "reply": "..." }. No code fences.',
  ].join("\n");

async function prose() {
  const outline: Turn[] = readJson("outline.json");
  const cast: Cast = readJson("cast.json");
  const model = flag("--model") ?? "nanogpt/deepseek/deepseek-v4-pro-0813";
  const out: any = fs.existsSync(path.join(dir, "chat.json")) ? readJson("chat.json") : { model, turns: [] as any[] };
  const done = new Set(out.turns.map((t: any) => t.k));
  for (const t of outline) {
    if (done.has(t.k)) continue;
    const prev = outline[t.k - 2];
    const prevText = out.turns.find((x: any) => x.k === t.k - 1);
    const user = [
      prev ? "Previous turn: day " + prev.day + ", " + prev.time + ", at " + prev.place + "; present at its end: " + (prev.present.join(", ") || "nobody but " + cast.persona.name) + "." : "This is the first turn of the story (a Monday morning).",
      prevText ? "Previous reply (for continuity):\n" + prevText.reply : "",
      "",
      "This turn: day " + t.day + ", ends at " + t.time + ", at " + t.place + ".",
      "Player does: " + t.player,
      "Beat of the reply: " + t.beat,
      "Present at the end of this turn: " + (t.present.join(", ") || "nobody but " + cast.persona.name) + ".",
    ].join("\n");
    const a = await callModel(PROSE_SYSTEM(cast), user, model, 4000, 0.8);
    const j = a.error ? null : parseJson(a.text);
    if (!j?.player || !j?.reply) {
      console.log(`turn ${t.k}: failed ${a.error ?? "unreadable"}`);
      continue;
    }
    out.turns.push({ k: t.k, player: String(j.player), reply: String(j.reply), ms: a.ms, input: a.input, output: a.output });
    out.turns.sort((x: any, y: any) => x.k - y.k);
    writeJson("chat.json", out);
    console.log(`turn ${t.k}: ${a.ms} ms, ${String(j.reply).split(/\s+/).length} words`);
  }
}

/** root/: the data folder director-bench.ts replays: cards, a narrator group, a persona, the chat, the Dashboard config. */
function buildRoot() {
  const cast: Cast = readJson("cast.json");
  const chat = readJson("chat.json");
  const root = path.join(dir, "root");
  fs.rmSync(root, { recursive: true, force: true });
  const w = (rel: string, v: unknown) => {
    const f = path.join(root, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, typeof v === "string" ? v : JSON.stringify(v, null, 1));
  };
  for (const m of cast.members) {
    w(`characters/${m.id}/card.json`, { spec: "chara_card_v2", name: m.name, description: m.about, personality: "", scenario: "", first_mes: "", mes_example: "", creator_notes: "", tags: [], extensions: {} });
  }
  const gid = "grp_romcom";
  const gname = "After Class";
  w(`groups/${gid}.json`, { id: gid, name: gname, memberIds: cast.members.map((m) => m.id), mode: "natural", mutedIds: [], generationMode: "narrator", scenario: "Second-year students of one high school, class 2-B and the literature club." });
  w("personas/you.json", { id: "you", name: cast.persona.name, description: cast.persona.about });
  w("settings.json", { personaId: "you" });
  w("dashboard/config.json", { debug: true, sensorModel: "nanogpt/deepseek/deepseek-v4-flash", injection: { maxTokens: 2000 }, maxThreads: 5, sensorMaxTokens: 7000, maxMain: 2 });
  const chatId = "romcom";
  w(`chats/${chatId}.meta.json`, { id: chatId, title: gname, characterId: null, groupId: gid, personaId: "you", model: "nanogpt/deepseek/deepseek-v4-flash", userName: cast.persona.name, lorebookIds: [], createdAt: 1790000000000, updatedAt: 1790000000000 });
  const lines: any[] = [];
  let at = 1790000000000;
  const msg = (role: string, name: string, charId: string | null, text: string, extra: object = {}) => {
    at += 60000;
    lines.push({ id: "m" + lines.length, name, charId, role, text, at, swipes: [text], swipe: 0, ...extra });
  };
  msg("system", "Narrator", null, "Monday morning. The alarm had been ringing for ten minutes before Kaito Asano finally opened his eyes, saw the time and swore.", { greeting: true });
  for (const t of chat.turns) {
    msg("user", cast.persona.name, null, t.player, { personaId: "you" });
    msg("char", gname, gid, t.reply);
  }
  w(`chats/${chatId}.jsonl`, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  console.log(`root: ${chat.turns.length} turns, ${lines.length} lines; turn k is line ${"2k"}`);
}

// ---------- state per turn, the rules, variant A (code tag) ----------
type State = { k: number; tag: string | null; present: string[]; aloneWith: string | null; sceneNew: boolean };
const RULE_TAGS_CROWD = ["break", "lunch", "club", "group_out"];
/** Rules v0 over a list of states (turn order). An event fires once: interrupt on the third turn of an alone stretch,
 *  crowd on the first turn of a scene where it holds. Returns per turn the condition and the event. */
function rules(states: State[], members: string[]) {
  const out: Record<number, { interruptCond: boolean; interrupt: boolean; crowdCond: boolean; crowd: boolean; away: string | null }> = {};
  let run = 0;
  let runWho: string | null = null;
  let crowdDoneInScene = false;
  const lastSeen: Record<string, number> = Object.fromEntries(members.map((m) => [m, 0]));
  for (const s of states) {
    if (s.aloneWith && s.aloneWith === runWho) run++;
    else {
      run = s.aloneWith ? 1 : 0;
      runWho = s.aloneWith;
    }
    for (const m of s.present) if (m in lastSeen) lastSeen[m] = s.k;
    if (s.sceneNew) crowdDoneInScene = false;
    const away = members.filter((m) => !s.present.includes(m)).sort((a, b) => lastSeen[a]! - lastSeen[b]!)[0] ?? null;
    const awayLong = away !== null && !s.present.includes(away) && s.k - lastSeen[away]! >= 6;
    const interruptCond = run >= 3;
    const crowdCond = !!s.tag && RULE_TAGS_CROWD.includes(s.tag) && awayLong;
    const crowd = crowdCond && !crowdDoneInScene;
    if (crowd) crowdDoneInScene = true;
    out[s.k] = { interruptCond, interrupt: run === 3, crowdCond, crowd, away: crowdCond ? away : null };
  }
  return out;
}
const keyStates = (outline: Turn[]): State[] => outline.map((t) => ({ k: t.k, tag: t.tag, present: t.present, aloneWith: t.aloneWith, sceneNew: t.sceneNew }));
/** The sensor's names mapped to members (a first name or the full name), unknown names dropped. */
function toMembers(names: string[], members: string[]): string[] {
  const out = new Set<string>();
  for (const n of names ?? []) {
    const low = String(n).toLowerCase();
    const m = members.find((x) => x.toLowerCase() === low || low.includes(first(x).toLowerCase()));
    if (m) out.add(m);
  }
  return [...out];
}
/** Variant A: the scene tag from a sensor snapshot by code only. */
function codeTag(place: string, time: string | null, day: number, n: number, direction: string): string {
  const p = place.toLowerCase();
  const hour = /^\d\d:\d\d$/.test(time ?? "") ? Number(time!.slice(0, 2)) : null;
  const weekend = day >= 6;
  if (/festival|fair|shrine|fireworks/.test(p)) return "event";
  const home = /apartment|home|house|bedroom|living room|kitchen/.test(p) && !/club|class/.test(p);
  if (home) return "at_home";
  if (n === 1) return weekend && /cafe|restaurant|cinema|mall|park|street|shop/.test(p) ? "date" : "alone_moment";
  if (/club/.test(p)) return "club";
  if (/classroom|class 2|2-b/.test(p)) return n >= 4 ? "lesson" : "break";
  if (/cafeteria|canteen|roof/.test(p)) return hour !== null && hour >= 12 && hour < 14 ? "lunch" : "break";
  if (/hall|corridor|stair|council|office|library/.test(p)) return "break";
  if (/gate|street|station|road|path|train|bus/.test(p)) return weekend || (hour !== null && hour >= 18) ? "group_out" : "commute";
  if (/cafe|karaoke|arcade|mall|park/.test(p)) return "group_out";
  return direction === "domestic" ? "at_home" : "break";
}
function sensorStates(file: string, members: string[]): State[] {
  const r = readJson(file);
  const states: State[] = [];
  for (const t of r.turns) {
    const k = t.k / 2;
    if (!Number.isInteger(k) || k < 1) continue;
    const snap = t.snap ?? {};
    const present = toMembers(snap.present ?? [], members);
    const clock = snap.clock ?? {};
    states.push({
      k,
      tag: codeTag(String(clock.place ?? ""), clock.time ?? null, Number(clock.day ?? 1), present.length, String(snap.scene?.direction ?? "")),
      present,
      aloneWith: present.length === 1 ? present[0]! : null,
      sceneNew: !!(t.raw?.scene?.new ?? snap.scene?.new),
    });
  }
  return states;
}

// ---------- variant B: the director call ----------
const DIRECTOR_SYSTEM = (cast: Cast) =>
  [
    "You are the director of a group roleplay, a school romantic comedy. The player plays " + cast.persona.name + ". After each turn you read the newest messages and report the scene for the code that runs the genre rules. You never write the story.",
    "Members: " + cast.members.map((m) => m.name).join(", ") + ".",
    "",
    "Report:",
    "- tag: the kind of scene at the end of the new messages, one of: lesson (a class in session), break (a short break in school), lunch (the lunch break), club (club activity in a club room), commute (walking or riding to or from school), group_out (several people out together outside school), date (" + first(cast.persona.name) + " and one member on a planned outing), alone_moment (" + first(cast.persona.name) + " and one member alone in a private moment that is not a date: an empty room, a rooftop, a walk alone together; it wins over commute, break, lunch and club), at_home (at someone's home), event (a festival or a school event).",
    "- present: the members physically in the scene at the end of the new messages (full names, never " + first(cast.persona.name) + "). Someone who only texts, calls or is mentioned is not present.",
    "- sceneNew: true when the new messages move to another place or skip more than about 30 minutes.",
    "- interrupt: true when " + first(cast.persona.name) + " has now been alone with the same member for 3 or more turns in a row, counting this one (use your log).",
    "- crowd: true when the tag is break, lunch, club or group_out and a member has been out of the scene for 6 or more turns (use your log).",
    "- who: for interrupt, the member who should walk in (one not present); for crowd, the member away the longest; else null.",
    "",
    'Reply with one JSON object: { "tag": "...", "present": ["..."], "sceneNew": false, "interrupt": false, "crowd": false, "who": null }. No prose, no code fences.',
  ].join("\n");

async function director() {
  const cast: Cast = readJson("cast.json");
  const chat = readJson("chat.json");
  const model = flag("--model");
  if (!model) throw new Error("--model");
  const tag = flag("--tag") ?? "director-" + model.split("/").pop();
  const out: any = { tag, model, turns: [] as any[] };
  const log: string[] = [];
  for (const t of chat.turns) {
    const prev = chat.turns.find((x: any) => x.k === t.k - 1);
    const user = [
      "Your log (turn: tag | present):",
      log.slice(-8).join("\n") || "(empty, this is the first turn)",
      "",
      prev ? "Previous reply (background):\n" + String(prev.reply).slice(0, 1500) : "",
      "",
      "New messages, turn " + t.k + ":",
      "PLAYER: " + t.player,
      "REPLY: " + t.reply,
    ].join("\n");
    const a = await callModel(DIRECTOR_SYSTEM(cast), user, model, 3000, 0);
    const j = a.error ? null : parseJson(a.text);
    const present = toMembers(Array.isArray(j?.present) ? j.present : [], cast.members.map((m) => m.name));
    const rec = { k: t.k, ms: a.ms, input: a.input, output: a.output, error: a.error ?? (j ? undefined : "unreadable"), tag: TAGS.includes(j?.tag) ? j.tag : null, present, sceneNew: j?.sceneNew === true, interrupt: j?.interrupt === true, crowd: j?.crowd === true, who: typeof j?.who === "string" ? j.who : null };
    out.turns.push(rec);
    log.push(t.k + ": " + (rec.tag ?? "?") + " | " + (present.map(first).join(", ") || "nobody"));
    writeJson(`results-${tag}.json`, out);
    console.log(`turn ${t.k}: ${a.ms} ms ${rec.error ?? ""} ${rec.tag} | ${present.map(first).join(",")}${rec.interrupt ? " INTERRUPT" : ""}${rec.crowd ? " CROWD" : ""}`);
  }
}

// ---------- M3: delivery of a stage note ----------
type Point = { k: number; kind: "interrupt" | "crowd" | "lock" | "return"; who: string[] };
const POINTS: Point[] = [
  { k: 15, kind: "interrupt", who: ["Mei Ishikawa"] },
  { k: 19, kind: "interrupt", who: ["Aoi Kisaragi"] },
  { k: 30, kind: "interrupt", who: ["Aoi Kisaragi"] },
  { k: 35, kind: "interrupt", who: ["Mei Ishikawa"] },
  { k: 37, kind: "interrupt", who: ["Aoi Kisaragi"] },
  { k: 41, kind: "interrupt", who: ["Hana Morimoto"] },
  { k: 9, kind: "crowd", who: ["Rin Shiraishi"] },
  { k: 24, kind: "crowd", who: ["Rin Shiraishi"] },
  { k: 14, kind: "lock", who: ["Yuzu Takane"] },
  { k: 29, kind: "lock", who: ["Hana Morimoto"] },
  { k: 43, kind: "lock", who: ["Aoi Kisaragi"] },
  { k: 32, kind: "return", who: ["Aoi Kisaragi", "Mei Ishikawa", "Yuzu Takane"] },
];
const names = (w: string[]) => w.join(" and ");
function templateNote(p: Point, user: string): string {
  if (p.kind === "lock")
    return ["[SCENE: only " + names(p.who) + " is here with " + user + "]", "Hold: nobody else enters, calls in person or appears in this reply; the others are elsewhere.", "Do not: explain this or mention a director."].join("\n");
  const what =
    p.kind === "interrupt" ? names(p.who) + " walks in on " + user + " and interrupts the moment."
    : p.kind === "crowd" ? names(p.who) + " joins the group here."
    : names(p.who) + " come back into the scene and join " + user + ".";
  return ["[SCENE EVENT: must happen in this reply]", "What: " + what, "How: bring it into this reply as part of the scene; the characters react in character.", "Do not: explain where it came from or mention a director."].join("\n");
}
const WRITER_SYSTEM =
  "You write one stage direction for the narrator of a school romantic comedy roleplay. You get the scene and what must happen. Write 1-2 sentences in English, concrete to this scene (where, how the person arrives or what holds the others away), in plain words, no dialogue. Reply with the sentences only.";
function replySystem(cast: Cast): string {
  return [
    "You are the narrator of a group roleplay, a light school romantic comedy. You voice every character except " + cast.persona.name + ", who is the player. Never write " + first(cast.persona.name) + "'s words, thoughts or actions.",
    "Write the next reply: 150-300 words, third person, past tense, with dialogue.",
    "Characters:",
    ...cast.members.map((m) => "- " + m.name + ": " + m.about),
    "Scenario: second-year students of one high school, class 2-B and the literature club.",
  ].join("\n");
}
async function deliver() {
  const cast: Cast = readJson("cast.json");
  const chat = readJson("chat.json");
  const outline: Turn[] = readJson("outline.json");
  const model = flag("--model");
  if (!model) throw new Error("--model");
  const noteKind = flag("--note") ?? "template";
  const writer = flag("--writer") ?? "nanogpt/deepseek/deepseek-v4-flash";
  const tag = flag("--tag") ?? "deliver-" + noteKind + "-" + model.split("/").pop();
  const out: any = { tag, model, noteKind, writer: noteKind === "written" ? writer : null, points: [] as any[] };
  // the written notes are made once per point and reused for every reply model (a shared file)
  const notesFile = path.join(dir, "notes-written.json");
  const written: Record<string, string> = fs.existsSync(notesFile) ? JSON.parse(fs.readFileSync(notesFile, "utf8")) : {};
  const user = cast.persona.name;
  for (const p of POINTS) {
    const before = outline[p.k - 2]!;
    const turn = chat.turns.find((x: any) => x.k === p.k);
    let note = templateNote(p, first(user));
    if (noteKind === "written") {
      const id = p.k + ":" + p.kind;
      if (!written[id]) {
        const prev = chat.turns.find((x: any) => x.k === p.k - 1);
        const ask = ["Scene now (" + before.place + ", present: " + (before.present.join(", ") || "nobody") + "):", String(prev?.reply ?? "").slice(-1200), "", "Must happen: " + templateNote(p, first(user)).split("\n")[1]].join("\n");
        const a = await callModel(WRITER_SYSTEM, ask, writer, 1500, 0.7);
        written[id] = a.error ? "" : a.text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
        fs.writeFileSync(notesFile, JSON.stringify(written, null, 1));
      }
      const head = p.kind === "lock" ? "[SCENE: only " + names(p.who) + " is here with " + first(user) + "]" : "[SCENE EVENT: must happen in this reply]";
      note = [head, written[id], "Do not: explain this or mention a director."].join("\n");
    }
    // the last 8 messages before this turn, then the player's message with the note appended (where World puts its event)
    const hist: { role: string; content: string }[] = [];
    for (const t of chat.turns.filter((x: any) => x.k < p.k).slice(-4)) {
      hist.push({ role: "user", content: t.player });
      hist.push({ role: "assistant", content: t.reply });
    }
    const lastUser = turn.player + "\n\n" + note;
    const t0 = Date.now();
    const a = await callModelMessages(replySystem(cast), [...hist, { role: "user", content: lastUser }], model, 2000, 0.8);
    out.points.push({ k: p.k, kind: p.kind, who: p.who, presentBefore: before.present, note, reply: a.text.replace(/<think>[\s\S]*?<\/think>/g, "").trim(), ms: Date.now() - t0, input: a.input, output: a.output, error: a.error });
    writeJson(`${tag}.json`, out);
    console.log(`k ${p.k} ${p.kind}: ${a.ms} ms ${a.error ?? ""}`);
  }
}
async function callModelMessages(system: string, msgs: { role: string; content: string }[], model: string, maxTokens: number, temperature: number): Promise<Answer> {
  // the same call with a real message history: the history goes in as a transcript block when the provider is one call deep
  const [prov, ...rest] = model.split("/");
  const base = BASES[prov!];
  const t0 = Date.now();
  if (!base) return { text: "", model, error: "unknown provider " + prov, input: 0, output: 0, ms: 0 };
  const key = keyFor(base.env);
  const body = { model: rest.join("/"), messages: [{ role: "system", content: system }, ...msgs], max_tokens: maxTokens, temperature };
  const pauses = [5000, 10000, 20000, 40000, 60000];
  for (let attempt = 0; attempt <= pauses.length; attempt++) {
    try {
      const r = await fetch(base.url + "/chat/completions", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + key }, body: JSON.stringify(body) });
      const j: any = await r.json().catch(() => ({}));
      const limited = r.status === 429 || r.status >= 500;
      if (!r.ok || limited) {
        if (attempt < pauses.length && limited) {
          await new Promise((res) => setTimeout(res, pauses[attempt]));
          continue;
        }
        return { text: "", model, error: String(j?.error?.message ?? r.status), input: 0, output: 0, ms: Date.now() - t0 };
      }
      return { text: String(j.choices?.[0]?.message?.content ?? ""), model, input: j.usage?.prompt_tokens ?? 0, output: j.usage?.completion_tokens ?? 0, ms: Date.now() - t0 };
    } catch (e) {
      if (attempt >= pauses.length) return { text: "", model, error: String(e), input: 0, output: 0, ms: Date.now() - t0 };
      await new Promise((res) => setTimeout(res, pauses[attempt]));
    }
  }
  return { text: "", model, error: "retries", input: 0, output: 0, ms: Date.now() - t0 };
}

const JUDGE_SYSTEM = [
  "You judge whether a roleplay reply followed a stage direction. You get the direction, who was in the scene before the reply, and the reply.",
  "Answer for each named person:",
  "- came: the person is physically in the scene by the end of the reply (arrives, walks in, sits down with them). A phone call, a text, a voice from far away or a mention is not came.",
  "- mentioned: the person is talked about, texts or calls, or is seen far off, but is not physically in the scene.",
  "- ignored: neither.",
  "For a direction that holds the scene (only the named person is here): list in leak every other character who is physically in the scene at the end of the reply (arrives or is shown there). Unnamed extras (classmates, a teacher, a waiter) are not leaks.",
  'Reply with one JSON object: { "people": { "<name>": "came|mentioned|ignored" }, "leak": ["name"], "why": "one short line" }. No prose, no code fences.',
].join("\n");
async function judge() {
  const from = flag("--from");
  const model = flag("--model");
  if (!from || !model) throw new Error("--from and --model");
  const d = readJson(from);
  const cast: Cast = readJson("cast.json");
  for (const p of d.points) {
    if (p.judge?.model === model) continue;
    const user = [
      "Direction:\n" + p.note,
      "",
      "Named: " + p.who.join(", ") + (p.kind === "lock" ? " (the scene is held to them; the other members are " + cast.members.map((m) => m.name).filter((n) => !p.who.includes(n)).join(", ") + ")" : ""),
      "In the scene before the reply: " + (p.presentBefore.join(", ") || "nobody but " + cast.persona.name),
      "",
      "Reply:\n" + p.reply,
    ].join("\n");
    const a = await callModel(JUDGE_SYSTEM, user, model, 3000, 0);
    const j = a.error ? null : parseJson(a.text);
    p.judge = { model, people: j?.people ?? null, leak: toMembers(Array.isArray(j?.leak) ? j.leak : [], cast.members.map((m) => m.name)).filter((n) => !p.who.includes(n) && !p.presentBefore.includes(n)), why: j?.why ?? null, error: a.error ?? (j ? undefined : "unreadable") };
    writeJson(from, d);
    console.log(`k ${p.k} ${p.kind}: ${JSON.stringify(p.judge.people)} leak ${p.judge.leak.join(",")}`);
  }
}

// ---------- score ----------
const prf = (tp: number, fp: number, fn: number) => {
  const p = tp + fp ? tp / (tp + fp) : 1;
  const r = tp + fn ? tp / (tp + fn) : 1;
  return { p, r, f1: p + r ? (2 * p * r) / (p + r) : 0, tp, fp, fn };
};
const pct = (x: number) => Math.round(x * 100) + "%";
function score() {
  const outline: Turn[] = readJson("outline.json");
  const cast: Cast = readJson("cast.json");
  const members = cast.members.map((m) => m.name);
  const key = keyStates(outline);
  const keyRules = rules(key, members);
  const files = fs.readdirSync(dir);
  const md: string[] = ["# Direction bench score", "", "Key: " + key.length + " turns. One run each; a few points are noise.", ""];
  const json: any = { sensors: {}, directors: {}, deliveries: {} };

  const stateScore = (name: string, states: State[]) => {
    const byK = new Map(states.map((s) => [s.k, s]));
    let pTp = 0, pFp = 0, pFn = 0, exact = 0, aloneOk = 0, tagOk = 0, nTurns = 0;
    let sTp = 0, sFp = 0, sFn = 0;
    const confusion: Record<string, Record<string, number>> = {};
    for (const t of key) {
      const s = byK.get(t.k);
      if (!s) continue;
      nTurns++;
      for (const m of members) {
        const a = s.present.includes(m), b = t.present.includes(m);
        if (a && b) pTp++;
        else if (a) pFp++;
        else if (b) pFn++;
      }
      if (s.present.length === t.present.length && s.present.every((m) => t.present.includes(m))) exact++;
      if (s.aloneWith === t.aloneWith) aloneOk++;
      if (s.tag === t.tag) tagOk++;
      (confusion[t.tag!] ??= {})[s.tag ?? "none"] = ((confusion[t.tag!] ?? {})[s.tag ?? "none"] ?? 0) + 1;
      if (t.k > 1) {
        if (s.sceneNew && t.sceneNew) sTp++;
        else if (s.sceneNew) sFp++;
        else if (t.sceneNew) sFn++;
      }
    }
    const r = rules(states, members);
    const ruleScore = (which: "interrupt" | "crowd") => {
      let tp = 0, fp = 0, fn = 0;
      for (const t of key) {
        const a = r[t.k]?.[(which + "Cond") as "interruptCond"] ?? false, b = keyRules[t.k]![(which + "Cond") as "interruptCond"];
        if (a && b) tp++;
        else if (a) fp++;
        else if (b) fn++;
      }
      // events: a key event counts as found when the variant fires the same rule within one turn of it
      const keyEv = key.filter((t) => keyRules[t.k]![which]).map((t) => t.k);
      const varEv = states.filter((s) => r[s.k]?.[which]).map((s) => s.k);
      const found = keyEv.filter((k) => varEv.some((v) => Math.abs(v - k) <= 1)).length;
      const extra = varEv.filter((v) => !keyEv.some((k) => Math.abs(v - k) <= 1)).length;
      return { cond: prf(tp, fp, fn), events: { key: keyEv, got: varEv, found, extra } };
    };
    return { turns: nTurns, present: { ...prf(pTp, pFp, pFn), exact: exact / nTurns }, alone: aloneOk / nTurns, tag: tagOk / nTurns, sceneNew: prf(sTp, sFp, sFn), confusion, interrupt: ruleScore("interrupt"), crowd: ruleScore("crowd") };
  };
  const row = (name: string, s: any, extra = "") =>
    `| ${name} | ${s.turns} | ${pct(s.present.p)} / ${pct(s.present.r)} / ${pct(s.present.exact)} | ${pct(s.alone)} | ${pct(s.sceneNew.f1)} | ${pct(s.tag)} | ${pct(s.interrupt.cond.f1)} (${s.interrupt.events.found}/${s.interrupt.events.key.length}, +${s.interrupt.events.extra}) | ${pct(s.crowd.cond.f1)} (${s.crowd.events.found}/${s.crowd.events.key.length}, +${s.crowd.events.extra}) | ${extra} |`;
  md.push("## M4 + M1 + M2: state, tag and rules per variant", "");
  md.push("A = Dashboard sensor + code tag + code rules. B = director call (its own present, tag; rules by code over its state). B-direct = the director's own interrupt and crowd answers.", "");
  md.push("| variant | turns | present P / R / exact | aloneWith | sceneNew F1 | tag | interrupt cond F1 (events found/key, +extra) | crowd cond F1 (events) | tokens in/out per turn, s per turn |");
  md.push("|---|---|---|---|---|---|---|---|---|");
  for (const f of files.filter((f) => /^results-sensor-.*\.json$/.test(f))) {
    const r = readJson(f);
    const s = stateScore(f, sensorStates(f, members));
    const turns = r.turns.filter((t: any) => t.k > 0);
    const tin = turns.reduce((a: number, t: any) => a + t.calls.reduce((x: number, c: any) => x + (c.input ?? 0), 0), 0) / turns.length;
    const tout = turns.reduce((a: number, t: any) => a + t.calls.reduce((x: number, c: any) => x + (c.output ?? 0), 0), 0) / turns.length;
    const ms = turns.reduce((a: number, t: any) => a + (t.ms ?? 0), 0) / turns.length;
    json.sensors[f] = s;
    md.push(row("A " + f.replace(/^results-|\.json$/g, ""), s, `${Math.round(tin)} / ${Math.round(tout)}, ${(ms / 1000).toFixed(1)}`));
  }
  for (const f of files.filter((f) => /^results-director-.*\.json$/.test(f))) {
    const r = readJson(f);
    const states: State[] = r.turns.map((t: any) => ({ k: t.k, tag: t.tag, present: t.present, aloneWith: t.present.length === 1 ? t.present[0] : null, sceneNew: t.sceneNew }));
    const s = stateScore(f, states);
    // the director's own rule answers, per turn, against the key's conditions
    const direct = (which: "interrupt" | "crowd") => {
      let tp = 0, fp = 0, fn = 0;
      for (const t of r.turns) {
        const a = !!t[which], b = keyRules[t.k]?.[(which + "Cond") as "interruptCond"] ?? false;
        if (a && b) tp++;
        else if (a) fp++;
        else if (b) fn++;
      }
      return prf(tp, fp, fn);
    };
    const tin = r.turns.reduce((a: number, t: any) => a + (t.input ?? 0), 0) / r.turns.length;
    const tout = r.turns.reduce((a: number, t: any) => a + (t.output ?? 0), 0) / r.turns.length;
    const ms = r.turns.reduce((a: number, t: any) => a + (t.ms ?? 0), 0) / r.turns.length;
    const errs = r.turns.filter((t: any) => t.error).length;
    json.directors[f] = { ...s, direct: { interrupt: direct("interrupt"), crowd: direct("crowd") }, errors: errs };
    md.push(row("B " + f.replace(/^results-|\.json$/g, ""), s, `${Math.round(tin)} / ${Math.round(tout)}, ${(ms / 1000).toFixed(1)}; B-direct interrupt F1 ${pct(direct("interrupt").f1)}, crowd F1 ${pct(direct("crowd").f1)}${errs ? "; " + errs + " errors" : ""}`));
  }
  md.push("", "Key events: interrupt at " + key.filter((t) => keyRules[t.k]!.interrupt).map((t) => t.k).join(", ") + "; crowd at " + key.filter((t) => keyRules[t.k]!.crowd).map((t) => t.k).join(", ") + ".", "");
  md.push("### Tag confusion (key -> got), per variant", "");
  for (const [f, s] of [...Object.entries<any>(json.sensors), ...Object.entries<any>(json.directors)]) {
    md.push("- " + f.replace(/^results-|\.json$/g, "") + ": " + Object.entries<any>(s.confusion).map(([k, v]) => k + " -> " + Object.entries(v).map(([g, n]) => g + " " + n).join(", ")).join("; "));
  }
  md.push("", "## M3: delivery of a stage note", "");
  md.push("| run | interrupt came / mentioned / ignored | crowd came | lock held | return: all came | words per reply | s per reply |");
  md.push("|---|---|---|---|---|---|---|");
  for (const f of files.filter((f) => /^deliver-.*\.json$/.test(f))) {
    const d = readJson(f);
    const pts = d.points.filter((p: any) => p.judge?.people);
    const verdict = (p: any, n: string) => {
      const v = Object.entries<any>(p.judge.people).find(([k]) => k.toLowerCase().includes(first(n).toLowerCase()));
      return v ? String(v[1]) : "ignored";
    };
    const inter = pts.filter((p: any) => p.kind === "interrupt");
    const c = (arr: any[], v: string) => arr.filter((p) => verdict(p, p.who[0]) === v).length;
    const crowd = pts.filter((p: any) => p.kind === "crowd");
    const lock = pts.filter((p: any) => p.kind === "lock");
    const ret = pts.filter((p: any) => p.kind === "return");
    const words = pts.reduce((a: number, p: any) => a + String(p.reply).split(/\s+/).length, 0) / Math.max(1, pts.length);
    const ms = pts.reduce((a: number, p: any) => a + (p.ms ?? 0), 0) / Math.max(1, pts.length);
    json.deliveries[f] = { interrupt: [c(inter, "came"), c(inter, "mentioned"), c(inter, "ignored"), inter.length], crowd: [c(crowd, "came"), crowd.length], lock: [lock.filter((p: any) => !p.judge.leak.length).length, lock.length], ret: [ret.filter((p: any) => p.who.every((n: string) => verdict(p, n) === "came")).length, ret.length] };
    md.push(`| ${f.replace(/\.json$/, "")} | ${c(inter, "came")} / ${c(inter, "mentioned")} / ${c(inter, "ignored")} of ${inter.length} | ${c(crowd, "came")} of ${crowd.length} | ${lock.filter((p: any) => !p.judge.leak.length).length} of ${lock.length} | ${ret.filter((p: any) => p.who.every((n: string) => verdict(p, n) === "came")).length} of ${ret.length} | ${Math.round(words)} | ${(ms / 1000).toFixed(1)} |`);
  }
  fs.writeFileSync(path.join(dir, "score.md"), md.join("\n") + "\n");
  writeJson("score.json", json);
  console.log(md.join("\n"));
}

if (cmd === "prose") await prose();
else if (cmd === "root") buildRoot();
else if (cmd === "director") await director();
else if (cmd === "deliver") await deliver();
else if (cmd === "judge") await judge();
else if (cmd === "score") score();
else throw new Error("unknown command " + cmd);
