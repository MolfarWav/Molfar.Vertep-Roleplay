// Dashboard settings > Sensor: the real strings and values, grouped three ways. Needs ../world-dm/shared.js.
P.check = '<path d="M5 12l5 5 9-10"/>'
const D = {
  mode: () => `<div class="modebox"><span style="font-weight:600">Mode</span>${seg(['Sensor', 'Fast: inside the story reply', 'Manual'], 'Sensor', true, 'Mode').replace('seg full', 'seg full wrapseg')}<p class="cap">The state updates after each reply.</p></div>`,
  model: () => `<div class="mrow"><span style="font-weight:600">Sensor model</span><span class="mono" style="flex:1">the chat’s model</span><button class="btn sm" type="button">Choose a model</button></div>`,
  catchUp: () => row({ label: 'Catch up', hint: 'Read the turns the dashboard missed.', ctl: sw(true, 'Catch up') }),
  autoSoul: () => row({ label: 'Rate characters automatically', hint: 'Propose a soul for a character who has none.', ctl: sw(true, 'Rate characters automatically') }),
  sensorTokens: () => row({ label: 'Sensor reply limit, tokens', hint: 'A higher limit makes the sensor’s replies longer, slower and costlier. Raise it only when its replies get cut off (the notice “The last reading was cut short”).', ctl: num(1200, 'Sensor reply limit') }),
  insert: () => row({ label: 'Prompt insert', hint: 'Tell each character how they feel about the others before they reply.', ctl: sw(true, 'Prompt insert') }),
  insTokens: () => row({ label: 'Tokens per character', ctl: num(80, 'Tokens per character') }),
  saidInject: () => row({ label: 'Remind the model what characters said', hint: 'Adds a short part to the prompt with what the speaking character promised, threatened or confessed. It can also be switched off per chat on the Prompt board.', ctl: sw(true, 'Remind') }),
  said: () => row({ label: 'What characters said: at most this many per turn (1 to 4)', hint: 'Vows, threats, confessions and lies the Dashboard keeps from one reply. They have their own list, apart from the notebook.', ctl: num(1, 'Said per turn') }),
  noteAge: () => row({ label: 'Notes leave the insert after N turns (5 to 500)', ctl: num(30, 'Notes leave') }),
  maxMain: () => row({ label: 'Main quests at most', ctl: num(2, 'Main quests') }),
  maxThreads: () => row({ label: 'Side quests at most', ctl: num(4, 'Side quests') }),
  maxSteps: () => row({ label: 'Steps per main quest at most', ctl: num(4, 'Steps') }),
  everyday: () => row({ label: 'Everyday quests end after N turns (0 = never)', ctl: num(8, 'Everyday') }),
  retire: () => row({ label: 'Ask to close a quest after N old-quest checks (0 = never)', ctl: num(3, 'Retire') }),
  check: () => row({ label: 'Check old quests every N turns (0 = never)', ctl: num(5, 'Check') }),
  groups: (on = 7) => ['Trust', 'Warmth', 'Power', 'Body', 'Conflict', 'Care', 'Knowledge'].map((g, i) => `<button class="tchip" type="button" aria-pressed="${i < on}">${icon('check')}${g}</button>`).join(''),
  prompts: () => fold({ id: 'prompts', title: 'Advanced: prompts', summary: 'Sensor prompt and 4 more · all default', body: `<div class="note cap">Sensor prompt, the four-part view and the “Restore” buttons: unchanged from today, shown closed.</div>` }),
  use: () => `<div class="chips">${chip('42 calls')}${chip('61k in / 9.4k out')}${chip('last reading 2.1 s')}</div>`,
}
const dsec = (tone, ic, title, chips, body) => `<section class="card tcard t-${tone}"><div class="thead">${icon(ic)}<h3>${title}</h3><div class="chips">${chips.map((c) => chip(c, tone)).join('')}</div></div><div class="rows">${body}</div></section>`

function mountDash({ label, blurb, html }) {
  const q = new URLSearchParams(location.search)
  const theme = q.get('theme') || 'dark'
  document.documentElement.classList.toggle('dark', theme === 'dark')
  if (q.has('bare')) document.documentElement.classList.add('bare')
  const link = (t) => `<a class="${t === theme ? 'on' : ''}" href="?theme=${t}${q.has('bare') ? '&bare=1' : ''}">${t}</a>`
  const nav = ['Sensor', 'Event vocabulary', 'What the model sees', 'Tune with Molfar']
  document.body.innerHTML = `
  <div class="bar"><b>${label}</b><span>${blurb}</span><span class="sp"></span>${link('dark')}${link('light')}<a href="../index.html">all mocks</a></div>
  <div class="dwrap">
    <header class="dhead"><button class="btn sm ghost" type="button" aria-label="Back">←</button><h2>Dashboard settings</h2></header>
    <div class="dbody">
      <nav class="dnav">${nav.map((n, i) => `<button type="button"${i === 0 ? ' aria-current="page"' : ''}>${n}</button>`).join('')}</nav>
      <main class="dmain">${html}</main>
    </div>
    <div class="savebar"><button class="btn pri lg" type="button">Save</button><span class="chip t-amber">Unsaved changes</span><span class="sp"></span></div>
  </div>`
  wire()
  document.addEventListener('click', (e) => { const c = e.target.closest('.tchip'); if (c) c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') !== 'true') })
}
