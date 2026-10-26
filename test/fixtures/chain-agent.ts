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

