/**
 * SillyTavern's nested macro forms (Molfar.Vertep#516): a macro inside a setvar value, the block
 * {{#setvar::name}}…{{/setvar}}, {{#if::cond}} and a condition built from macros. Read as a tree, left to
 * right, inner macros first; a text without these forms keeps the flat passes.
 */
import { describe, expect, it } from "bun:test";

const engineUrl = new URL("../plugins/engine/plugin.js", import.meta.url).href;
type Engine = typeof import("../plugins/engine/plugin.js");
const eng = (await import(engineUrl)) as Engine;

const mc = (vars: Record<string, string> = {}, extra: Record<string, unknown> = {}) =>
  ({ userName: "Anna", charName: "Arthur", chatId: "c1", vars, ...extra }) as Parameters<Engine["expandMacros"]>[1];

describe("nested macros (#516)", () => {
  it("a setvar value keeps the macros inside it, expanded when it is stored", () => {
    const vars: Record<string, string> = {};
    const out = eng.expandMacros("{{setvar::rule::{{user}} leads. {{getvar::tone}}. Drop the needle.}}[{{getvar::rule}}]", mc(vars));
    expect(out).toBe("[Anna leads. . Drop the needle.]");
    expect(vars.rule).toBe("Anna leads. . Drop the needle.");
  });

  it("reads in order: a getvar sees the setvars before it, not after", () => {
    const vars: Record<string, string> = {};
    const out = eng.expandMacros("{{setvar::a::1}}{{setvar::b::{{getvar::a}}+{{getvar::c}}}}{{setvar::c::3}}{{getvar::b}}|{{getvar::c}}", mc(vars));
    expect(out).toBe("1+|3");
  });

  it("the block {{#setvar::name}}…{{/setvar}} stores its body and shows nothing", () => {
    const vars: Record<string, string> = {};
    const out = eng.expandMacros("A{{#setvar::check}}* Conflict for {{char}}: {{pick::x}}{{/setvar}}B{{getvar::check}}", mc(vars));
    expect(out).toBe("AB* Conflict for Arthur: x");
    expect(vars.check).toBe("* Conflict for Arthur: x");
  });

  it("{{#if::cond}}, {{#if {{getvar::a}}{{getvar::b}}}} and a negated one read the value", () => {
    const t = "{{#if {{getvar::a}}{{getvar::b}}}}some{{else}}none{{/if}} {{#if !{{getvar::a}}}}no-a{{/if}} {{#if::{{getvar::b}}}}b{{/if}}";
    expect(eng.expandMacros(t, mc({}))).toBe("none no-a ");
    expect(eng.expandMacros(t, mc({ b: "on" }))).toBe("some no-a b");
    expect(eng.expandMacros(t, mc({ a: "false" }))).toBe("none no-a ");
    expect(eng.expandMacros("{{#if::flag}}yes{{/if}}{{setvar::x::{{user}}}}", mc({ flag: "0" }))).toBe("");
  });

  it("a branch that is not taken runs none of its setvars", () => {
    const vars: Record<string, string> = { on: "" };
    eng.expandMacros("{{#if {{getvar::on}}}}{{setvar::hit::{{user}}}}{{else}}{{setvar::miss::{{char}}}}{{/if}}", mc(vars));
    expect(vars.hit).toBeUndefined();
    expect(vars.miss).toBe("Arthur");
  });

  it("the app's own {{#if}} still works inside such a text, on the variables set before it", () => {
    const pv = { mode: { value: "dark", picks: null } };
    const out = eng.expandMacros('{{setvar::x::{{user}}}}\n{{#if mode == "dark"}}\nD {{getvar::x}}\n{{/if}}\n{{#if x}}\nX\n{{/if}}\nend', mc({}, { presetVars: pv }));
    expect(out).toBe("\nD Anna\nX\nend");
  });

  it("comments, {{trim}} and the vertep.* flags behave as before", () => {
    const vars: Record<string, string> = {};
    const out = eng.expandMacros("{{// note {{user}}}}{{trim}}\n{{setvar::vertep.dice::{{user}}}}{{#if {{getvar::vertep.dice}}}}dice{{/if}}", mc(vars, { features: { dice: true } }));
    expect(out).toBe("dice");
    expect(vars["vertep.dice"]).toBeUndefined();
  });

  it("broken text stays readable: an unclosed {{#if}}, a stray {{/setvar}}, an unclosed {{", () => {
    expect(eng.expandMacros("{{#if::{{getvar::a}}}}open {{user}}", mc({}))).toBe("{{#if::{{getvar::a}}}}open Anna");
    expect(eng.expandMacros("a{{/setvar}}b{{setvar::x::{{user}}}}", mc({}))).toBe("ab");
    expect(eng.expandMacros("{{ broken {{user}} {{setvar::y::{{char}}}}", mc({}))).toBe("{{ broken Anna ");
  });

  it("a text without nested forms gives what the flat passes gave", () => {
    // the flat reader applies all setvars before the getvars: kept for every text it handled before
    const vars: Record<string, string> = {};
    expect(eng.expandMacros("{{getvar::x}}{{setvar::x::1}}", mc(vars))).toBe("1");
    expect(eng.expandMacros("{{random::a::b}} {{user}} {{#if user}}u{{/if}}", mc({}))).toMatch(/^[ab] Anna u$/);
  });
});
