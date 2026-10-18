/**
 * Agentic tools plugin: gives the model callable tools during roleplay
 * generation. Definitions live as JSON files in data/tools/ — built-ins (dice,
 * toy control) seed themselves on first read, and users or their agent can add
 * custom tools (JSON definition + JS handler) through the same directory.
 *
 * Engine contract: the studio plugin marks its reply requests wantsTools; the
 * engine calls this plugin's appTools() export to collect the enabled
 * definitions and routes model tool calls back to handleTool below. Removing
 * this plugin removes tool calling entirely.
 *
 * Built-ins: dice, a picture tool (the app draws what the model describes
 * after the reply lands), and toy control.
 *
 * Routes (relative to /v1/apps/roleplay):
 *   GET    /tools        list (seeds built-ins when the dir is empty)
 *   PUT    /tools/:id    create/update; built-ins accept enabled + config only
 *   DELETE /tools/:id    custom tools are deleted, built-ins reset to defaults
 */

// ---------- built-in definitions ----------
// The dice parameters before the reason and the difficulty (GitHub #14): a stored copy still
// equal to them is a default nobody edited, so it follows the new one.
const DICE_PARAMS_1 = {
  type: "object",
  properties: {
    count: { type: "number", description: "How many dice to roll (default 1, max 20)" },
    sides: { type: "number", description: "Sides per die (default 6, max 1000)" },
    modifier: { type: "number", description: "Flat bonus or penalty added to the total (default 0)" },
  },
  additionalProperties: false,
};
const DICE_DESCRIPTION_1 =
  "Roll dice. Call this whenever the outcome of a chance event (an attack, a gamble, a leap, whether someone notices) should be left to chance instead of decided by you. Using it keeps the story fair and unpredictable.";
const DICE_PARAMS = {
  type: "object",
  properties: {
    reason: { type: "string", description: "What the roll decides, in a few words (\"leap over the gap\")" },
    count: DICE_PARAMS_1.properties.count,
    sides: DICE_PARAMS_1.properties.sides,
    modifier: DICE_PARAMS_1.properties.modifier,
    dc: { type: "number", description: "Difficulty: the total needed to succeed. Leave it out when there is no pass or fail." },
  },
  required: ["reason"],
  additionalProperties: false,
};
const BUILTINS = {
  dice: {
    name: "Dice Roller",
    description: "Roll dice when an outcome should be left to chance.",
    enabled: false,
    tool: {
      name: "roll_dice",
      description:
        "Roll dice. Call this whenever the outcome of a chance event (an attack, a gamble, a leap, whether someone notices) should be left to chance instead of decided by you. Using it keeps the story fair and unpredictable. Say what the roll decides, and give a difficulty when there is a pass or fail: the result says which.",
      parameters: DICE_PARAMS,
    },
  },
  image: {
    name: "Picture",
    description: "Lets the character draw a picture into the chat (needs Image Generation turned on).",
    enabled: false,
    tool: {
      name: "generate_image",
      description:
        "Draw a picture and show it in the chat. Use it when a moment is worth seeing: a place, an outfit, a scene, something the user asks to see. Keep it rare. The prompt must be a complete visual description (who is there and what they look like, the setting, lighting, framing) because the artist knows nothing about the story, and names mean nothing to it.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "The full visual description of the picture" },
        },
        required: ["prompt"],
        additionalProperties: false,
      },
    },
  },
  toy: {
    name: "Lovense",
    description: "Control a Lovense toy through its app's local server.",
    enabled: false,
    config: { host: "127.0.0.1", port: 20010 },
    tool: {
      name: "lovense",
      description:
        "Control the user's Lovense toy through their Lovense app (Game Mode or Connect must be running with local control enabled). The user feels everything immediately — weave it into the scene where it fits. Set mode (vibrate, rotate, pump, thrusting, fingering, suction, depth, stop) with intensity 0-20 (pump/depth max 3) and duration in seconds, or use a named preset pattern. Intensity 0 or mode stop halts everything.",
      parameters: {
        type: "object",
        properties: {
          mode: { type: "string", description: "vibrate (default), rotate, pump, thrusting, fingering, suction, depth, or stop" },
          intensity: { type: "number", description: "Strength: 0-20 (pump and depth top out at 3). 0 stops the toy." },
          duration: { type: "number", description: "Seconds to run (default 10, max 600)" },
          preset: { type: "string", description: "Named pattern instead of a steady level: pulse, wave, fireworks, or earthquake" },
        },
        additionalProperties: false,
      },
    },
  },
};

// ---------- storage ----------
function writeTool(fsx, t) {
  fsx.write("tools/" + t.id + ".json", JSON.stringify(t, null, 2));
}

function readTool(fsx, id) {
  try {
    const t = JSON.parse(fsx.read("tools/" + id + ".json"));
    return t && typeof t === "object" && typeof t.id === "string" ? t : null;
  } catch {
    return null;
  }
}

function listTools(fsx) {
  let files = [];
  try {
    files = fsx.list("tools").filter((f) => f.endsWith(".json"));
  } catch {}
  // built-ins are code-owned: seeded on first read and re-seeded after a
  // delete (delete = reset to defaults, not removal)
  const ids = new Set(files.map((f) => f.replace(/\.json$/, "")));
  if (ids.has("dice")) upgradeDice(fsx);
  for (const id of Object.keys(BUILTINS)) {
    if (!ids.has(id)) {
      writeTool(fsx, { id, builtin: id, ...BUILTINS[id] });
      files.push(id + ".json");
    }
  }
  const out = [];
  for (const f of files) {
    const t = readTool(fsx, f.replace(/\.json$/, ""));
    if (t) out.push(t);
  }
  return out;
}

/** A stored dice tool the user never edited gets the reason and the difficulty (#14). */
function upgradeDice(fsx) {
  const t = readTool(fsx, "dice");
  if (!t || t.builtin !== "dice" || !t.tool) return;
  if (JSON.stringify(t.tool.parameters) !== JSON.stringify(DICE_PARAMS_1)) return;
  const tool = { ...t.tool, parameters: DICE_PARAMS };
  if (tool.description === DICE_DESCRIPTION_1) tool.description = BUILTINS.dice.tool.description;
  writeTool(fsx, { ...t, tool });
}

// ---------- tool implementations ----------
function rollDice(args) {
  const num = (v, dflt, lo, hi) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
  };
  const a = args && typeof args === "object" ? args : {};
  const count = num(a.count, 1, 1, 20);
  const sides = num(a.sides, 6, 2, 1000);
  const mod = num(a.modifier, 0, -100, 100);
  const rolls = [];
  for (let i = 0; i < count; i++) rolls.push(1 + Math.floor(Math.random() * sides));
  const total = rolls.reduce((s, r) => s + r, 0) + mod;
  const expr = count + "d" + sides + (mod ? (mod > 0 ? "+" + mod : String(mod)) : "");
  const reason = typeof a.reason === "string" ? a.reason.trim().slice(0, 120) : "";
  const dc = Number(a.dc);
  const hasDc = a.dc != null && a.dc !== "" && Number.isFinite(dc);
  // "Leap over the gap: 1d20 → 14 vs 12, success": the reason and the outcome in one line
  const roll = expr + " → " + (count > 1 ? "[" + rolls.join(", ") + "] = " + total : String(total));
  const verdict = hasDc ? " vs " + Math.round(dc) + ", " + (total >= dc ? "success" : "failure") : "";
  return { text: (reason ? reason.charAt(0).toUpperCase() + reason.slice(1) + ": " : "") + roll + verdict };
}

/** Register a net request on pass A; read the result on pass B (the host
 *  re-runs the handler with results populated). Returns null on pass A. */
function twoPhaseNet(host, key, spec) {
  const results = host && host.net && host.net.results ? host.net.results : null;
  if (results && Object.prototype.hasOwnProperty.call(results, key)) return results[key];
  if (host && host.net && host.net.request) {
    host.net.request(key, spec);
    return null;
  }
  return { ok: false, error: "network not granted for this plugin" };
}

// Lovense local API (Game Mode / Connect): plain HTTP POST /command on the
// app's server (default 127.0.0.1:20010). Function actions are
// "<Actuator>:<level>" with level 0-20 (pump/depth cap at 3), plus the Preset
// patterns and Stop. Error codes: 401 no toy connected, 402 toy not found,
// 404 offline, 500 Game Mode disabled, 506 wrong param.
const LOVENSE_MODES = {
  vibrate: "Vibrate", rotate: "Rotate", pump: "Pump", thrusting: "Thrusting",
  fingering: "Fingering", suction: "Suction", depth: "Depth",
};
const LOVENSE_PRESETS = ["pulse", "wave", "fireworks", "earthquake"];
const LOVENSE_ERRORS = {
  400: "the Lovense app rejected the command parameters",
  401: "no Lovense toy is connected to the app",
  402: "the connected toy does not support that function",
  404: "the Lovense app is offline",
  500: "Game Mode is not enabled in the Lovense app",
  506: "the Lovense app reported invalid parameters",
};

function controlToy(tool, args, host) {
  const cfg = tool.config && typeof tool.config === "object" ? tool.config : {};
  const a = args && typeof args === "object" ? args : {};
  const mode = String(a.mode || "vibrate").toLowerCase();
  const preset = String(a.preset || "").toLowerCase();
  const wantsStop = mode === "stop" || (!preset && Math.floor(Number(a.intensity)) === 0);
  const duration = Math.min(600, Math.max(1, Math.floor(Number(a.duration)) || 10));

  let cmd;
  let summary;
  if (wantsStop) {
    cmd = { command: "Function", action: "Stop", timeSec: 0, apiVer: 1 };
    summary = "Toy stopped.";
  } else if (preset) {
    if (!LOVENSE_PRESETS.includes(preset)) return { text: "unknown preset '" + preset + "' (use " + LOVENSE_PRESETS.join(", ") + ")", isError: true };
    cmd = { command: "Preset", name: preset, timeSec: duration, apiVer: 1 };
    summary = "Toy running the " + preset + " pattern for " + duration + "s.";
  } else {
    const fn = LOVENSE_MODES[mode];
    if (!fn) return { text: "unknown mode '" + mode + "'", isError: true };
    const cap = mode === "pump" || mode === "depth" ? 3 : 20;
    const level = Math.min(cap, Math.max(1, Math.floor(Number(a.intensity)) || 1));
    cmd = { command: "Function", action: fn + ":" + level, timeSec: duration, apiVer: 1 };
    summary = "Toy set to " + mode + " " + level + "/" + cap + " for " + duration + "s.";
  }

  // a bare host name or address only: the value is spliced into the URL, and
  // "127.0.0.1:8788/any/path?" would aim the call at any local service
  const toyHost = String(cfg.host || "127.0.0.1");
  if (!/^(?:[A-Za-z0-9-]+\.)*[A-Za-z0-9-]+$|^\[[0-9A-Fa-f:]+\]$/.test(toyHost)) {
    return { text: "the toy's app host must be a plain host name or address", isError: true };
  }
  const res = twoPhaseNet(host, "toy", {
    url: "http://" + toyHost + ":" + (num(cfg.port, 20010, 1, 65535)) + "/command",
    method: "POST",
    body: cmd,
    timeoutMs: 5000,
  });
  if (res === null) return { text: "sending" }; // pass A — the host re-runs with results
  if (!res || res.ok !== true) {
    return { text: "Lovense app unreachable — start the app and enable Game Mode or Connect", isError: true };
  }
  // the app answers { code, messages? } inside its HTTP 200 body
  const code = res.json && typeof res.json === "object" ? Math.floor(Number(res.json.code)) || 200 : 200;
  if (code !== 200) {
    const why = LOVENSE_ERRORS[code] || "the Lovense app returned code " + code;
    return { text: why, isError: true };
  }
  return { text: summary };
}

function runCustom(tool, args, host) {
  try {
    const fn = new Function("args", "host", String(tool.handler || ""));
    const out = fn(args && typeof args === "object" ? args : {}, host);
    if (out && typeof out === "object") return { text: String(out.text ?? ""), isError: out.isError === true };
    return { text: String(out ?? "") };
  } catch (e) {
    return { text: "tool error: " + (e && e.message ? e.message : String(e)), isError: true };
  }
}

// ---------- engine hooks (hook signature is (ctx, host)) ----------
const IMAGE_TAGS_DESCRIPTION =
  "Draw a picture and show it in the chat. Use it when a moment is worth seeing: a place, an outfit, a scene, something the user asks to see. Keep it rare. Write the prompt as comma-separated Danbooru tags in English: count tag (1girl, 1boy, solo), appearance, clothing, pose, expression, setting, lighting, framing. No names, no quality tags, no sentences.";
const IMAGE_TAGS_PARAM = "Comma-separated Danbooru tags for the picture";

/** The image server's own prompt guidance (engine Settings > Images), as settings.json keeps it. */
function imageGuidance(fsx) {
  try {
    const g = ((JSON.parse(fsx.read("settings.json")).ui || {}).imageGen || {}).modelInstructions;
    return typeof g === "string" ? g.replace(/\s+/g, " ").trim().slice(0, 1000) : "";
  } catch {
    return "";
  }
}

/** Prompt style of image generation, as settings.json → ui.imageGen says (same rule as the app). */
function imageTagStyle(fsx) {
  try {
    const ig = (JSON.parse(fsx.read("settings.json")).ui || {}).imageGen || {};
    if (ig.promptStyle === "tags") return true;
    if (ig.promptStyle === "description") return false;
    if (ig.modelStyle === "tags" || ig.modelStyle === "description") return ig.modelStyle === "tags";
    return ig.modelApi === "comfyui" || ig.modelApi === "a1111";
  } catch {
    return false;
  }
}

export function appTools(_ctx, host) {
  const fsx = host && host.fs ? host.fs : null;
  if (!fsx) return { tools: [] };
  const defs = [];
  let tags = null;
  let guide = null;
  for (const t of listTools(fsx)) {
    if (t.enabled === false) continue;
    if (t.tool && typeof t.tool.name === "string") {
      let def = t.tool;
      // the stored copy is seeded once, so the tag wording is applied at send time, and only to an unedited description
      if (t.builtin === "image" && def.name === "generate_image" && def.description === BUILTINS.image.tool.description) {
        if (tags === null) tags = imageTagStyle(fsx);
        if (tags) {
          const props = def.parameters && def.parameters.properties ? def.parameters.properties : {};
          def = {
            ...def,
            description: IMAGE_TAGS_DESCRIPTION,
            parameters: { ...def.parameters, properties: { ...props, prompt: { ...(props.prompt || { type: "string" }), description: IMAGE_TAGS_PARAM } } },
          };
        }
        if (guide === null) guide = imageGuidance(fsx);
        if (guide) def = { ...def, description: def.description + " The image server's own guidance for prompts: " + guide };
      }
      defs.push(def);
    }
  }
  return { tools: defs };
}

// ---------- plugin panel (rendered by the app's generic plugin-panel view) ----------
const TOOL_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function itemOf(t) {
  // everything the page shows and everything the model sees is user-editable;
  // only a built-in's HANDLER is code-owned
  let note = null;
  const fields = [
    { key: "name", label: "Display name", kind: "text", value: t.name || "" },
    { key: "tool.name", label: "Model calls it", kind: "text", value: (t.tool && t.tool.name) || "" },
    { key: "tool.description", label: "Tell the model when to use it", kind: "textarea", value: (t.tool && t.tool.description) || "" },
    { key: "tool.parameters", label: "Parameters (JSON schema)", kind: "code", value: JSON.stringify((t.tool && t.tool.parameters) || { type: "object", properties: {} }, null, 2) },
    { key: "description", label: "Page description (optional)", kind: "text", value: t.description || "" },
  ];
  if (t.builtin === "toy") {
    fields.unshift({ key: "config.host", label: "App host", kind: "text", value: String((t.config && t.config.host) || "127.0.0.1") });
    fields.splice(1, 0, { key: "config.port", label: "App port", kind: "number", value: num((t.config && t.config.port) || 20010, 20010) });
    note = "Only localhost and 127.0.0.1 are allowed. For the app on another machine, ask your agent to add its hostname to this plugin's networkHosts allowlist.";
  } else if (!t.builtin) {
    fields.push({ key: "handler", label: "Handler JS — return { text }; args and host are in scope", kind: "code", value: t.handler || "" });
  }
  return {
    id: t.id,
    title: t.name || (t.tool && t.tool.name) || t.id,
    subtitle: t.description || (t.tool && t.tool.description) || "",
    ...(t.builtin ? { badge: "built-in", deleteLabel: "Reset" } : {}),
    enabled: t.enabled !== false,
    saveUrl: "/tools/" + t.id,
    deleteUrl: "/tools/" + t.id,
    fields,
    ...(note ? { note } : {}),
  };
}

export function uiPanel(_ctx, host) {
  const fsx = host && host.fs ? host.fs : null;
  return {
    label: "Tool Calling",
    icon: "dices",
    hint: "Enabled tools are offered to the model during generation.",
    items: fsx ? listTools(fsx).map(itemOf) : [],
    create: { url: "/tools/new", label: "New Tool" },
  };
}

function num(v, dflt, lo, hi) {
  let n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return dflt;
  if (lo !== undefined) n = Math.max(lo, n);
  if (hi !== undefined) n = Math.min(hi, n);
  return n;
}

/** Apply a panel save body {enabled?, values?{dot.path → value}} onto a tool.
 *  Keys are plugin-owned: "config.port" coerces to a number, "tool.parameters"
 *  parses from its JSON text. */
function applyPanelBody(t, b) {
  const next = { ...t, ...(t.tool ? { tool: { ...t.tool } } : {}), ...(t.config ? { config: { ...t.config } } : {}) };
  if (b.enabled !== undefined) next.enabled = b.enabled !== false;
  const values = b.values && typeof b.values === "object" ? b.values : {};
  for (const [key, raw] of Object.entries(values)) {
    if (key === "config.host") next.config = { ...next.config, host: String(raw) };
    else if (key === "config.port") next.config = { ...next.config, port: num(raw, 20010) };
    else if (key === "name") next.name = String(raw);
    else if (key === "description") next.description = String(raw);
    else if (key === "tool.name") next.tool = { ...next.tool, name: String(raw) };
    else if (key === "tool.description") next.tool = { ...next.tool, description: String(raw) };
    else if (key === "tool.parameters") {
      try { next.tool = { ...next.tool, parameters: JSON.parse(String(raw)) }; } catch { return { error: "parameters is not valid JSON" } }
    } else if (key === "handler") next.handler = String(raw);
  }
  if (!next.tool || !TOOL_NAME_RE.test(String(next.tool.name))) return { error: "tool.name required (letters, digits, dashes)" };
  if (!String((next.tool && next.tool.description) || "").trim()) return { error: "tool.description required" };
  return { tool: next };
}

export function handleTool(name, args, host) {
  const fsx = host && host.fs ? host.fs : null;
  if (!fsx) return { text: "tool storage unavailable", isError: true };
  const found = listTools(fsx).find((t) => t.tool && t.tool.name === name && t.enabled !== false);
  if (!found) return { text: "unknown tool: " + name, isError: true };
  if (found.builtin === "dice") return rollDice(args);
  // the app draws the picture once the reply lands (it reads this call from
  // the reply's tool trace); the model only needs to know it is coming
  if (found.builtin === "image") {
    const prompt = args && typeof args.prompt === "string" ? args.prompt.trim() : "";
    if (!prompt) return { text: "no prompt given: describe the picture", isError: true };
    return { text: "The picture is being drawn and will appear in the chat after this message. Do not describe it again." };
  }
  if (found.builtin === "toy") return controlToy(found, args, host);
  return runCustom(found, args, host);
}

// ---------- routes (panel protocol: PUT {enabled, values}; POST new → item) ----------
export function handleRoute(req, host) {
  const fsx = host.fs;
  const body = () => (req.body && typeof req.body === "object" ? req.body : {});
  const ok = (json, status) => ({ status: status || 200, json });
  const err = (status, error) => ({ status, json: { error } });

  if (req.path === "/tools" && req.method === "GET") return ok({ tools: listTools(fsx) });

  if (req.path === "/tools/new" && req.method === "POST") {
    // unsaved draft: the panel edits it like any item; its first Save (PUT)
    // writes the file
    const id = "custom-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    return ok(itemOf({
      id,
      name: "My Tool",
      description: "",
      enabled: true,
      tool: { name: "my_tool", description: "Describe what this does and when the model should call it.", parameters: { type: "object", properties: {} } },
      handler: 'return { text: "result for " + JSON.stringify(args) }',
    }));
  }

  const m = /^\/tools\/([a-z0-9_-]{1,48})$/.exec(req.path);
  if (m) {
    const id = m[1];
    if (req.method === "PUT") {
      const existing = readTool(fsx, id);
      if (existing?.builtin || (!existing && BUILTINS[id])) {
        // built-in: same editable surface as a custom tool (name, what the
        // model sees, parameters) minus the HANDLER — that is code-owned and
        // silently dropped
        const base = existing ?? { id, builtin: id, ...BUILTINS[id] };
        const applied = applyPanelBody(base, body());
        if (applied.error) return err(400, applied.error);
        const next = applied.tool;
        delete next.handler;
        if (base.builtin !== "toy") delete next.config;
        writeTool(fsx, next);
        return ok(next);
      }
      const applied = applyPanelBody(existing || { id, enabled: true, tool: { name: "", description: "" } }, body());
      if (applied.error) return err(400, applied.error);
      writeTool(fsx, applied.tool);
      return ok(applied.tool);
    }
    if (req.method === "DELETE") {
      try { fsx.remove("tools/" + id + ".json"); } catch {}
      return ok({ ok: true, ...(BUILTINS[id] ? { reset: true } : {}) });
    }
  }
  return null;
}
