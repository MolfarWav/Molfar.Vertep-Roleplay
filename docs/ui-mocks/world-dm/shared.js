const OFF = new URLSearchParams(location.search).has('off')
// Shared pieces of the World DM mocks: the page frame (tabs row, DM switch + profile, "So far", model) is the
// same in every variant, so only the settings block differs. Strings are the app's real English strings.

const P = {
  caret: '<path d="M6 9l6 6 6-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  book: '<path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3V4zM5 17a3 3 0 013-3h11"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/>',
  save: '<path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
}
const icon = (n, c = '') => `<svg class="i ${c}" viewBox="0 0 24 24" aria-hidden="true">${P[n]}</svg>`

const info = (label, text) => `<button class="info" type="button" aria-label="More about: ${label}" data-pop>${icon('info')}</button>`
const row = ({ label, hint, status, ctl, off }) => `
  <div class="rowwrap"${off ? ' style="opacity:.55"' : ''}>
    <div class="row"><span class="lab"><span>${label}</span>${hint ? info(label, hint) : ''}</span>${ctl}</div>
    ${hint ? `<div class="pop">${hint}</div>` : ''}
    ${status ? `<p class="cap row-st">${status}</p>` : ''}
  </div>`
const num = (v, label = '') => `<input class="num" type="number" value="${v}" aria-label="${label}">`
const sw = (on, label = '') => `<button class="sw" type="button" role="switch" aria-checked="${on}" aria-label="${label}"></button>`
const seg = (opts, active, full = false, label = '') =>
  `<div class="seg${full ? ' full' : ''}" role="radiogroup" aria-label="${label}">${opts.map((o) => `<button type="button" role="radio" aria-checked="${o === active}">${o}</button>`).join('')}</div>`
const sel = (opts, v, label = '') =>
  `<span class="selw"><select class="sel" aria-label="${label}">${opts.map((o) => `<option${o === v ? ' selected' : ''}>${o}</option>`).join('')}</select>${icon('caret')}</span>`
const chip = (text, tone = '') => `<span class="chip ${tone ? 't-' + tone : 'n'}">${text}</span>`
const fold = ({ id, title, summary, open = false, tone = '', body, cls = '' }) => `
  <div class="fold ${cls} ${tone ? 't-' + tone : ''}" data-fold="${id}" data-open="${open}">
    <button type="button" aria-expanded="${open}">${tone ? '<i class="sq"></i>' : ''}<b>${title}</b><span class="sum">${summary}</span>${icon('caret', 'car')}</button>
    <div class="fb">${body}</div>
  </div>`

// The settings' content, defined once so the variants only choose how it is grouped.
const S = {
  everyN: () => row({ label: 'Run after every N replies', hint: 'Profile default: 3.', status: 'Next run in 2 replies, or now with World turn.', ctl: num(3, 'Run after every N replies') }),
  turnBtn: () => `<div class="action"><button class="btn pri lg" type="button">${icon('globe')}World turn</button></div>`,
  still: () => row({ label: 'When the scene stands still for N replies', hint: 'Same place, same people. Slower at home, faster on the road, paused in a fight. 0 = never.', ctl: num(8, 'Scene stands still') }),
  skip: () => row({ label: 'On a time skip', hint: 'A good moment for the world to move: the DM runs right after it.', ctl: sw(true, 'On a time skip') }),
  place: () => row({ label: 'Write the scene when the story changes place', hint: 'A short run when the Dashboard sees the characters move somewhere else, so the place they left is on record. Records only.', ctl: sw(true, 'Place') }),
  recEvery: () => row({ label: 'Write records every N replies', hint: '0 = together with the run above. A smaller number writes records more often; fronts and events keep the run above.', ctl: num(5, 'Write records every N replies') }),
  textMax: () => row({ label: 'Size of a record, in characters', hint: 'Longer records hold more, and cost more tokens on every run and in the prompt. 200 to 3000.', ctl: num(800, 'Size of a record') }),
  changesMax: () => row({ label: 'Changes in one run', hint: 'How many records the DM may add, change or retire at once. 4 to 20.', ctl: num(8, 'Changes in one run') }),
  outfit: (stack = false) => row({ label: 'Outfit and what is in the hands come from', hint: 'Dashboard sensor: cheapest, one field of the sensor’s own report; lists of carried and nearby things stay empty. World DM: the DM keeps lists of what is worn, carried and nearby; costs a few more tokens per run. Changing it applies from the next reply.', ctl: seg(['Dashboard sensor', 'World DM'], 'Dashboard sensor', false, 'Outfit source') }),
  insert: () => row({ label: 'Send events to the story', hint: 'Off: the DM keeps the world, but the story model gets no events. Also on the Canvas prompt board.', ctl: sw(true, 'Send events to the story') }),
  diceMode: () => `<div class="dice-mode"><div style="display:flex;align-items:center;gap:8px"><span class="lab" style="flex:1;font-weight:600">Dice</span></div>${seg(['Off', 'Hint', 'Binding'], 'Hint', true, 'Dice')}<p class="cap" aria-live="polite">The model may soften the result to stay in character. If you wrote the outcome yourself, the roll decides how the others react.</p></div>`,
  diceStat: () => row({ label: 'Stat', hint: 'Auto: the model picks the person and stat that fit your action.', ctl: sel(['By the action', 'Trust', 'Comfort', 'Attraction', 'Respect', 'Affection'], 'By the action', 'Stat') }),
  diceTilt: () => row({ label: 'How luck runs', hint: 'Full success: 8% harsh, 17% even, 28% kind.', ctl: sel(['Kind', 'Even', 'Harsh'], 'Even', 'How luck runs') }),
  diceChance: () => row({ label: 'Replies with a roll, %', hint: '1 to 100. About 30 to 200 tokens each.', ctl: num(30, 'Replies with a roll') }),
  diceShow: () => row({ label: 'Show under the reply', hint: 'A small mark under each reply that had a roll. Recent replies only.', ctl: sw(false, 'Show under the reply') }),
  diceLife: () => row({ label: 'World intervenes, %', hint: 'Share of replies where something unrelated breaks in. A d6 sets how big. 0 = never.', ctl: num(10, 'World intervenes') }),
  rolls: (cls = '') => fold({ id: 'rolls', title: 'Recent rolls', summary: 'Last: 9, clean · 10 shown', cls, body: `<div class="note cap">8 + 1 = 9: clean · Trust (Mira)<br>5 + 2 = 7: costly · Respect (Dan)<br>Quiet: roll 61, chance 30%</div>` }),
}


const SCENE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 220" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1640"/><stop offset=".55" stop-color="#5b2f6b"/><stop offset=".82" stop-color="#e08a52"/><stop offset="1" stop-color="#f2c27a"/></linearGradient><linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2350"/><stop offset="1" stop-color="#0f0d22"/></linearGradient></defs><rect width="1200" height="220" fill="url(#s)"/><circle cx="930" cy="62" r="26" fill="#fbe9c4" opacity=".95"/><circle cx="930" cy="62" r="46" fill="#fbe9c4" opacity=".12"/><path d="M0 150 L120 128 L210 140 L330 118 L470 142 L600 130 L760 146 L900 126 L1040 140 L1200 122 V220 H0Z" fill="#2a1e4a" opacity=".85"/><rect y="150" width="1200" height="70" fill="url(#w)"/><g fill="#0c0a1c"><path d="M160 150 h110 l-14 14 h-82z"/><rect x="214" y="104" width="3" height="46"/><path d="M217 108 l34 34 h-34z"/><path d="M217 112 l-26 30 h26z"/><path d="M520 152 h150 l-18 16 h-114z"/><rect x="590" y="96" width="3" height="56"/><path d="M593 100 l44 42 h-44z"/><path d="M593 106 l-34 36 h34z"/><path d="M820 150 h90 l-10 12 h-70z"/><rect x="860" y="116" width="2" height="34"/><path d="M862 120 l24 26 h-24z"/></g><g fill="#f2c27a"><circle cx="60" cy="146" r="3"/><circle cx="1130" cy="140" r="3"/><circle cx="410" cy="150" r="2.5"/></g></svg>`

function profileBlock() {
  return `
  <section class="stack" id="profile">
    <div class="dm-row"><span><b style="font-weight:600">DM in this chat</b><span class="cap" style="display:block">${OFF ? 'Off: no events and no dice. Places and things the story names are still recorded, and the book is still shown to the reply model.' : 'The DM keeps this story’s world book after replies.'}</span></span>${sw(!OFF, 'DM in this chat')}</div>
    <div class="stack" style="gap:6px"><span class="field-l">Profile</span>
      <div class="profile t-teal">${icon('compass')}<span>Living world</span><span class="cap">· Own</span>${icon('caret')}</div>
      <p class="cap">Factions and threats move off screen. News may reach the characters as a rumour; nothing is forced.</p>
      <button class="btn sm" type="button" style="align-self:flex-start">${icon('pen')}Edit profile</button>
    </div>
  </section>`
}
function statusBlock() {
  return `
  <section class="stack" id="status" aria-live="polite">
    <h3 class="sh t-sky"><i></i>So far</h3>
    <div class="tiles">
      <div class="tile t-emerald">${icon('book')}<span class="cap">Records</span><b>12</b></div>
      <div class="tile t-slate">${icon('clock')}<span class="cap">Retired</span><b>2</b></div>
      <div class="tile t-pink">${icon('compass')}<span class="cap">Fronts</span><b>3</b></div>
      <div class="tile t-sky">${icon('globe')}<span class="cap">Runs</span><b>18</b></div>
    </div>
    <div class="chips">${chip('Scene now: intrigue', 'sky')}${chip('An event waits for the next reply', 'amber')}</div>
    <p class="cap">Last run 14 minutes ago · 4.6k in · 1.2k out · $0.002 · 4.1 s</p>
    <div class="quote"><p>The harbour guild closed ranks after the fire. Mira learned the ledger was altered; the watch captain now watches her back.</p><button class="link" type="button">Show all</button></div>
    <div class="btns"><button class="btn sm tonal" type="button">${icon('plus')}New chat in this world</button><button class="btn sm" type="button">${icon('save')}Save world</button><button class="btn sm ghost" type="button">${icon('eye')}Look at the world</button></div>
    <p class="cap">The world book is hidden from the Lorebooks library. The prompt Inspector shows what reaches the model.</p>
  </section>`
}
function modelBlock() {
  return `
  <section class="stack" id="model">
    <h3 class="sh t-slate"><i></i>DM model (all chats)</h3>
    <div class="card" style="padding:12px 16px"><span class="cap">Model in force</span><div class="mono">deepseek/deepseek-chat-v3.1</div><span class="cap">set for the World DM</span></div>
    <button class="btn sm" type="button" style="align-self:flex-start">World settings</button>
    <p class="cap">One more call after a reply, when the DM is due. A small, cheap model is enough.</p>
  </section>`
}
function tabsRow() {
  const T = [['Overview', 'sky'], ['Places', 'teal'], ['World book', 'emerald'], ['Start', 'violet'], ['Backgrounds', 'pink'], ['Runs', 'slate']]
  return `<div class="tabs" role="tablist">${T.map(([l, t], i) => `<button class="t-${t}" role="tab" aria-selected="${i === 0}"><i></i><span>${l}</span></button>`).join('')}</div>`
}

// settingsHTML: what the variant puts in the right column. leftExtra: nothing; the rest is shared.
function mount({ label, blurb, settingsHTML }) {
  const q = new URLSearchParams(location.search)
  const theme = q.get('theme') || 'dark'
  document.documentElement.classList.toggle('dark', theme === 'dark')
  if (q.has('bare')) document.documentElement.classList.add('bare')
  const link = (t) => `<a class="${t === theme ? 'on' : ''}" href="?theme=${t}${q.has('bare') ? '&bare=1' : ''}">${t}</a>`
  document.body.innerHTML = `
  <div class="bar"><b>${label}</b><span>${blurb}</span><span class="sp"></span>${link('dark')}${link('light')}<a href="index.html">all variants</a></div>
  <div class="page">
    <header class="hub-head">
      <div class="hero" style="background-image:url('data:image/svg+xml;utf8,${encodeURIComponent(SCENE)}')">
        <div class="hero-in">
          <h2>Harbour of Ash</h2>
          <div class="who"><span class="av t-violet">M</span><span class="av t-pink">D</span><span>Mira, Dan</span><span class="chip dark">Living world</span></div>
        </div>
        <button class="btn onimg" type="button">Open chat</button>
      </div>
      ${tabsRow()}
    </header>
    <main class="hub-body">
      <div class="col left">${profileBlock()}${statusBlock()}${modelBlock()}</div>
      <div class="col" id="settings">${settingsHTML}</div>
    </main>
  </div>`
  wire()
}

function wire() {
  document.addEventListener('click', (e) => {
    const f = e.target.closest('.fold > button')
    if (f) { const p = f.parentElement; const o = p.dataset.open !== 'true'; p.dataset.open = o; f.setAttribute('aria-expanded', o) ; return }
    const i = e.target.closest('[data-pop]')
    if (i) { const w = i.closest('.rowwrap'); const pop = w && w.querySelector('.pop'); if (pop) pop.classList.toggle('show'); return }
    const s = e.target.closest('.sw')
    if (s) { s.setAttribute('aria-checked', s.getAttribute('aria-checked') !== 'true'); return }
    const r = e.target.closest('.seg button')
    if (r) { r.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', b === r)); return }
    const t = e.target.closest('.ptabs button')
    if (t) {
      const id = t.dataset.pane
      t.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', b === t))
      document.querySelectorAll('.pane').forEach((p) => p.dataset.on = p.dataset.pane === id)
    }
  })
}
