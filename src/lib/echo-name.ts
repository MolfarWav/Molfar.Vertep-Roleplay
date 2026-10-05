// The same rule lives in plugins/engine/plugin.js (stripEchoedName): the engine
// strips the echo from new replies, this hides it in messages saved before that.
// Plugins are plain JS and cannot import from src/, so keep the two in step.

/**
 * Models often start a reply with the speaker's own name ("Aria:"). Cut that echo:
 * only at the very start (after leading whitespace), once, case-insensitive, in the
 * forms `Name:`, `Name :`, `**Name:**`, `**Name**:`, `*Name:*`, `*Name*:`,
 * `__Name:__`, `_Name:_`. The name is matched literally. The rest loses its
 * leading whitespace.
 */
export function hideEchoedName(text: string, name: string | null | undefined): string {
  const t = String(text ?? "");
  const n = String(name ?? "").trim();
  if (!n) return t;
  const body = t.trimStart();
  const at = (form: string) => body.slice(0, form.length).toLowerCase() === form.toLowerCase();
  for (const form of [`**${n}:**`, `**${n}**:`, `*${n}:*`, `*${n}*:`, `__${n}:__`, `_${n}:_`]) {
    if (at(form)) return body.slice(form.length).trimStart();
  }
  if (!at(n)) return t;
  let i = n.length;
  while (body[i] === " " || body[i] === "\t") i++;
  return body[i] === ":" ? body.slice(i + 1).trimStart() : t;
}
