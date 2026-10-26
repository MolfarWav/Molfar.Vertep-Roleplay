/** An agent that asks the model `n` times, each question built from the last answer. */
export function chainAgent(n: number, id = "chain"): Record<string, any> {
  const nodes: Record<string, any>[] = [{ id: "in", type: "agent.input", x: 0, y: 0, title: "Input", params: { give: [{ id: "reply", source: "lastReply" }] } }];
  const edges: Record<string, any>[] = [];
  for (let i = 1; i <= n; i++) {
    nodes.push({ id: `a${i}`, type: "model.ask", x: i * 250, y: 0, title: `Ask ${i}`, params: { role: "fast", prompt: i === 1 ? "{{reply}}" : "{{prev}}", answer: { as: "text" }, maxTokens: 50, batchKey: null } });
    edges.push({ id: `e${i}`, from: i === 1 ? "in:reply" : `a${i - 1}:text`, to: `a${i}:${i === 1 ? "reply" : "prev"}` });
  }
  nodes.push({ id: "out", type: "agent.output", x: (n + 1) * 250, y: 0, title: "Output", params: { kind: "note", title: "Last" } });
  edges.push({ id: "eo", from: `a${n}:text`, to: "out:in" });
  return { format: "vertep-canvas", version: 1, kind: "agent", title: id, agent: { formatVersion: 1, id, version: "1.0.0", name: id, description: "", author: "t", trigger: { when: "after", everyN: 1, keywords: [] }, models: { fast: { hint: "x" } }, limits: { maxCalls: n, concurrency: 1 } }, nodes, edges };
}


/** One question about the user's last message, answered into a hint for the reply (a prompt insert). `when` is the trigger. */
export function hintAgent(id: string, when: "before" | "parallel" | "after" = "before", trigger: Record<string, unknown> = {}, output: Record<string, unknown> = { kind: "prompt-insert", label: "Hint", show: "inspector" }): Record<string, any> {
  return {
    format: "vertep-canvas", version: 1, kind: "agent", title: id,
    agent: { formatVersion: 1, id, version: "1.0.0", name: id, description: "", author: "t", trigger: { when, everyN: 1, keywords: [], ...trigger }, models: { fast: { hint: "x" } }, limits: { maxCalls: 1, concurrency: 1 } },
    nodes: [
      { id: "in", type: "agent.input", x: 0, y: 0, title: "Input", params: { give: [{ id: "msg", source: "lastUserMessage" }] } },
      { id: "ask", type: "model.ask", x: 250, y: 0, title: "Hint", params: { role: "fast", prompt: "One hint for: {{msg}}", answer: { as: "text" }, maxTokens: 50, batchKey: null } },
      { id: "out", type: "agent.output", x: 500, y: 0, title: "Output", params: output },
    ],
    edges: [{ id: "e1", from: "in:msg", to: "ask:msg" }, { id: "e2", from: "ask:text", to: "out:in" }],
  };
}
