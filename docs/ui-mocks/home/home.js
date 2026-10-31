// Home mocks: the real blocks (hero, create, ask Molfar, achievements, recent chats, apps) arranged three ways. Needs ../world-dm/shared.js.
Object.assign(P, {
  play: '<path d="M7 5v14l12-7z"/>',
  branch: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="9" r="2"/><path d="M6 7v10M18 11c0 4-6 3-12 6"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  chevR: '<path d="M9 6l6 6-6 6"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 01-8 0zM8 6H4v1a4 4 0 004 4M16 6h4v1a4 4 0 01-4 4M12 13v4M8 20h8"/>',
})
const CH = [
  ['Harbour of Ash', 'Mira', '“Then we have until the tide turns,” she says quietly.', '14 min ago', 300, 'Captain Ren', 38],
  ['Night train', 'Eli', 'He folds the ticket into a small, careful square.', '2 h ago', 200, 'Captain Ren', 112],
  ['Winter court', 'Queen Isolde', 'The candles gutter as the doors open.', 'yesterday', 270, 'Mara', 64],
  ['The lighthouse', 'Tomas', '“You should not have climbed the stairs.”', '3 days ago', 150, 'Mara', 21],
  ['School corridor', 'Sina Rose', 'Her bare toes curl against the cold concrete.', '4 days ago', 20, 'Denis', 203],
  ['Market day', 'Ayako Kurosawa', 'She weighs the apple in her palm and smiles.', '1 week ago', 340, 'Denis', 47],
]
const pt = (name, h, cls = '', style = '') => `<span class="pt ${cls}" style="--h:${h};${style}">${name.slice(0, 1)}</span>`
const ringSvg = (v, g, tone) => { const r = 24, c = 2 * Math.PI * r, f = Math.min(1, v / g); return `<svg viewBox="0 0 58 58" role="img" aria-label="${v}/${g}"><circle cx="29" cy="29" r="${r}" fill="none" stroke-width="4" stroke="var(--border)"/><circle cx="29" cy="29" r="${r}" fill="none" stroke-width="4" stroke-linecap="round" stroke="var(--${tone})" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - f)}" transform="rotate(-90 29 29)"/></svg>` }
const heroBg = () => `background-image:url('data:image/svg+xml;utf8,${encodeURIComponent(SCENE)}')`
const hero = (opts = {}) => `<section class="hero2" style="${heroBg()}" aria-label="Pick up the story">
  <span class="kick">Pick up the story</span><h3>Harbour of Ash</h3>
  <p class="q">“Then we have until the tide turns,” she says quietly. “After that Captain Orrin will be asking the same questions, and he won’t ask kindly.”</p>
  <div class="chips"><span class="chip dark">${icon('user')}Persona: Captain Ren</span><span class="chip dark">Lorebook: Harbour</span></div>
  <p class="meta">Mira · 38 messages · 14 minutes ago</p>
  <div class="btns"><button class="btn pri lgx" type="button">${icon('play')}Continue</button><button class="btn ghostw lgx" type="button" style="font-weight:500">${icon('branch')}Branches</button></div></section>`
const rcards = () => `<div class="scroller">${CH.map(([t, c, l, w, h, p]) => `<button class="rcard" type="button">${pt(c, h, 'art')}<span class="in"><b>${t}</b><span class="cap ln">${c} · ${p}</span><span class="ln">${l}</span><span class="cap">${w}</span></span></button>`).join('')}<button class="rcard" type="button" style="align-items:center;justify-content:center;min-height:200px;color:var(--muted-foreground);font-weight:500;gap:8px">All chats ${icon('chevR')}</button></div>`
const rlist = (n = 4) => `<div class="rlist">${CH.slice(0, n).map(([t, c, l, w, h, p, m]) => `<button class="rrow" type="button" style="text-align:left;color:inherit">${pt(c, h)}<span class="tx"><b>${t}</b><span class="cap">${l}</span></span><span class="tm cap">${w}<br>${m} messages</span></button>`).join('')}</div>`
const createBtns = (v = 'tonal') => `<div class="brow"><button class="btn ${v}" type="button">${icon('plus')}New character</button><button class="btn" type="button">${icon('upload')}Import card</button><button class="btn ghost" type="button">${icon('spark')}With Molfar</button></div>`
const askBox = (btn = 'tonal') => `<div class="ask"><input placeholder="Describe what to make or change…" aria-label="Ask Molfar"><button class="btn ${btn}" type="button">Open in Molfar</button></div>`
const chips3 = () => `<div class="draftc"><button type="button">Character from a description</button><button type="button">A dashboard</button><button type="button">Review my memory</button></div>`
const sec = (tone, title, body, more = '') => `<section class="t-${tone}"><h3 class="sh2"><i></i>${title}${more ? `<button class="more" type="button">${more}</button>` : ''}</h3>${body}</section>`
const ringsRow = () => `<div class="rings">${[['Marathon', 120, 500, 'sky'], ['Archivist', 8, 20, 'emerald'], ['Puppeteer', 2, 3, 'violet']].map(([n, v, g, t]) => `<div class="ringc">${ringSvg(v, g, t)}<span class="cap" style="font-variant-numeric:tabular-nums">${v}/${g}</span><span class="cap">${n}</span></div>`).join('')}</div>`
const statLine = () => `<div class="statline">${[['Marathon', '120/500', 120, 500, 'sky'], ['Archivist', '8/20', 8, 20, 'emerald'], ['Puppeteer', '2/3', 2, 3, 'violet']].map(([n, t, v, g, tone]) => `<span class="rg t-${tone}">${ringSvg(v, g, tone)}<span>${n}</span><span class="v">${t}</span></span>`).join('')}<span class="cap">1,284 messages · 14 chats · 30 characters</span></div>`
const apps = () => `<div class="apps"><div class="app"><span class="pt ic" style="--h:200">P</span><b style="font-family:var(--font-heading);font-weight:400;font-size:var(--fs-heading)">Plot board</b></div><div class="app"><span class="pt ic" style="--h:150">D</span><b style="font-family:var(--font-heading);font-weight:400;font-size:var(--fs-heading)">Dice tray</b></div><button class="app new t-teal" type="button"><span class="pt ic" style="background:none;border:1px dashed var(--tl);color:var(--ti)">+</span><span style="text-align:left"><b style="display:block;font-weight:600">Build an app</b><span class="cap" style="color:var(--ti)">Molfar drafts it for your workshop</span></span></button></div>`

function mountHome({ label, blurb, html, dock = '' }) {
  const q = new URLSearchParams(location.search)
  const theme = q.get('theme') || 'dark'
  document.documentElement.classList.toggle('dark', theme === 'dark')
  if (q.has('bare')) document.documentElement.classList.add('bare')
  const link = (t) => `<a class="${t === theme ? 'on' : ''}" href="?theme=${t}${q.has('bare') ? '&bare=1' : ''}">${t}</a>`
  document.body.innerHTML = `<div class="bar"><b>${label}</b><span>${blurb}</span><span class="sp"></span>${link('dark')}${link('light')}<a href="../index.html">all mocks</a></div>
  <div class="hpage"><header class="htop"><h2>Home</h2><span class="sp"></span><button class="model" type="button">deepseek-chat-v3.1</button></header>
  <main class="hbody">${html}</main>${dock}</div>`
  wire()
}
