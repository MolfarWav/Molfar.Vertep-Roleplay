import { describe, expect, test } from 'bun:test'
import { drawTemplate, escapeHtml, renderTemplate, sampleState, slotsFor, widgetDoc } from '../src/lib/agent-template'
import { templateProblems, validateAgent } from '../src/canvas-kit/boards/agent-check'

const schema = {
  hp: { type: 'number', min: 0, max: 20 },
  mood: { type: 'text' },
  armed: { type: 'flag' },
  bag: { type: 'list', item: { name: 'text', qty: 'number' } },
}

describe('renderTemplate', () => {
  test('fills slots and escapes every value', () => {
    const html = renderTemplate('<b>{{mood}}</b> {{hp}}', { hp: 7, mood: '<img src=x onerror=1> & "q"' })
    expect(html).toBe('<b>&lt;img src=x onerror=1&gt; &amp; &quot;q&quot;</b> 7')
  })
  test('{{#each}} reads the fields of each entry and escapes them', () => {
    const html = renderTemplate('{{#each bag}}<i>{{name}}×{{qty}}</i>{{/each}}', { bag: [{ name: 'a<b', qty: 2 }, { name: 'rope', qty: 1.25 }] })
    expect(html).toBe('<i>a&lt;b×2</i><i>rope×1.3</i>')
  })
  test('{{#if}} shows its body for a non-empty value only', () => {
    const t = '{{#if armed}}A{{/if}}{{#if bag}}B{{/if}}{{#if mood}}C{{/if}}{{#if hp}}D{{/if}}'
    expect(renderTemplate(t, { armed: true, bag: [{}], mood: 'x', hp: 3 })).toBe('ABCD')
    expect(renderTemplate(t, { armed: false, bag: [], mood: ' ', hp: 0 })).toBe('')
  })
  test('a missing field prints nothing and a list in a slot prints nothing', () => {
    expect(renderTemplate('[{{gone}}][{{bag}}]', { bag: [{ name: 'x' }] })).toBe('[][]')
  })
  test('a broken template never throws', () => {
    expect(() => renderTemplate('{{#each bag}}{{/if}}{{ {{x}', { bag: [] })).not.toThrow()
  })
  test('takes at most 50 entries', () => {
    const bag = Array.from({ length: 80 }, (_, i) => ({ n: i }))
    expect(renderTemplate('{{#each bag}}.{{/each}}', { bag })).toHaveLength(50)
  })
})

describe('drawTemplate', () => {
  test('draws a good template', () => {
    expect(drawTemplate('<p>{{hp}}</p>', schema, { hp: 4 })).toEqual({ html: '<p>4</p>' })
  })
  test('draws nothing for a template the checker would refuse', () => {
    const r = drawTemplate('<script>alert(1)</script>{{hp}}', schema, { hp: 4 })
    expect('problems' in r && r.problems[0]!.code).toBe('E_TPL_FORBIDDEN')
    expect('problems' in drawTemplate('<p onclick="x">{{hp}}</p>', schema, {})).toBe(true)
    expect('problems' in drawTemplate('<p style="background:url(http://x)">{{hp}}</p>', schema, {})).toBe(true)
  })
})

describe('templateProblems', () => {
  test('names what is wrong, without the widget prefix', () => {
    expect(templateProblems('{{nope}}', schema)[0]).toEqual({ code: 'E_TPL_FIELD', message: '{{nope}} is not a field here' })
    expect(templateProblems('{{#each bag}}x', schema)[0]!.code).toBe('E_TPL_UNCLOSED')
    expect(templateProblems('{{#each hp}}x{{/each}}', schema)[0]!.code).toBe('E_TPL_FIELD')
    expect(templateProblems('{{bag}}', schema)[0]!.code).toBe('E_TPL_FIELD')
    expect(templateProblems('   ', schema)[0]!.code).toBe('E_WIDGET')
    expect(templateProblems('{{hp}} {{#if armed}}{{mood}}{{/if}}', schema)).toEqual([])
  })
  test('the checker of a whole file says the same', () => {
    const file = (panels: unknown) => ({ id: 'x', title: 'X', state: schema, panels })
    const bad = validateAgent({ format: 'vertep-canvas', version: 1, kind: 'agent', title: 'X', nodes: [], edges: [], agent: file([{ id: 'p', title: 'P', widgets: [{ w: 'html', template: '{{nope}}' }] }]) })
    expect(bad.errors.some((e) => e.code === 'E_TPL_FIELD')).toBe(true)
  })
  test('height is checked', () => {
    const run = (height: unknown) => validateAgent({ format: 'vertep-canvas', version: 1, kind: 'agent', title: 'X', nodes: [], edges: [], agent: { id: 'x', title: 'X', state: schema, panels: [{ id: 'p', title: 'P', widgets: [{ w: 'html', template: '{{hp}}', height }] }] } }).errors.filter((e) => e.code === 'E_WIDGET')
    expect(run(200)).toEqual([])
    expect(run(10)).toHaveLength(1)
    expect(run('tall')).toHaveLength(1)
  })
})

describe('sampleState', () => {
  test('full has a value for every field, empty has the blanks of a new chat', () => {
    const full = sampleState(schema, true, 'Sample')
    expect(full.hp).toBe(12)
    expect(full.mood).toBe('Sample')
    expect(full.armed).toBe(true)
    expect(full.bag).toHaveLength(3)
    expect((full.bag as Record<string, unknown>[])[0]).toEqual({ name: 'Sample 1', qty: 3 })
    expect(sampleState(schema, false, 'Sample')).toEqual({ hp: 0, mood: '', armed: false, bag: [] })
  })
  test('a sample of a good template draws', () => {
    const tpl = '{{#each bag}}{{name}}{{/each}}{{#if armed}}!{{/if}}'
    expect(drawTemplate(tpl, schema, sampleState(schema, true, 'S'))).toEqual({ html: 'S 1S 2S 3!' })
  })
})

describe('slots and the page', () => {
  test('every slot the form offers passes the checker', () => {
    for (const s of slotsFor(schema)) expect(templateProblems(s.insert.replace('…', 'x'), schema)).toEqual([])
  })
  test('the page forbids the network and escapes nothing it was not given', () => {
    expect(widgetDoc('<p>x</p>', true)).toContain("default-src 'none'")
    expect(widgetDoc('<p>x</p>', true)).toContain('color-scheme:dark')
    expect(escapeHtml(`<'">&`)).toBe('&lt;&#39;&quot;&gt;&amp;')
  })
})
