// Home v2: a library-style start page. Blocks the owner asked for: continue, a random character, create a world (random library
// background), favourites, what waits for me, quests and threads, news from the repo. Needs ../world-dm/shared.js.
Object.assign(P, {
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z"/>',
  play: '<path d="M7 5v14l12-7z"/>', branch: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="9" r="2"/><path d="M6 7v10M18 11c0 4-6 3-12 6"/>',
  shuffle: '<path d="M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4M18 4l3 3-3 3M18 14l3 3-3 3"/>', tray: '<path d="M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>', news: '<path d="M4 5h13v14H6a2 2 0 01-2-2zM17 9h3v8a2 2 0 01-2 2M8 9h5M8 13h5"/>', star: '<path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1L3.2 9.4l6.1-.8z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  grip: '<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
  eyeoff: '<path d="M3 3l18 18M10.6 6.2A9.8 9.8 0 0112 6c6 0 9 6 9 6a15 15 0 01-3 3.8M6.5 7.6C4 9.2 3 12 3 12s3 6 9 6c1.3 0 2.5-.3 3.5-.8"/>',
  resize: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>', plus: '<path d="M12 5v14M5 12h14"/>', sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>', ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5"/>',
})
// A few stand-in background scenes. In the app they come from the user's library (World > Backgrounds, chat backgrounds) and, when
// there are none, from a small set we ship ourselves.
const SCENES = {
  harbour: ['#1b1640', '#5b2f6b', '#e08a52', '#f2c27a'],
  forest: ['#07161a', '#0f3b3a', '#2b7a5c', '#8fd0a0'],
  desert: ['#2a1330', '#8a3a52', '#e8854a', '#f6d28a'],
  snow: ['#0c1a33', '#33507f', '#8fb0d8', '#e8f1fb'],
  neon: ['#0d0a24', '#3a1466', '#c0306e', '#58d0e8'],
}
function sceneSvg(k) {
  const [a, b, c, d] = SCENES[k]
  const shapes = {
    harbour: '<circle cx="930" cy="62" r="26" fill="#fbe9c4"/><path d="M0 150 L200 128 L360 142 L560 120 L760 146 L1000 126 L1200 140 V220 H0Z" fill="#241a44"/><rect y="150" width="1200" height="70" fill="#0f0d22"/><path d="M160 150 h110 l-14 14 h-82z M217 108 l34 34 h-34z M217 112 l-26 30 h26z" fill="#0c0a1c"/>',
    forest: '<circle cx="250" cy="60" r="22" fill="#e6f5d8"/><path d="M0 220 V130 L40 70 L80 130 L120 60 L170 130 L210 80 L260 140 L320 70 L380 140 L430 90 L500 150 L560 80 L630 150 L700 100 L780 150 L860 70 L930 140 L1000 90 L1080 150 L1140 100 L1200 140 V220Z" fill="#04100f"/>',
    desert: '<circle cx="600" cy="120" r="46" fill="#ffe9b0"/><path d="M0 170 Q200 130 400 165 T800 160 T1200 150 V220 H0Z" fill="#4a1c2e"/><path d="M0 195 Q300 165 600 190 T1200 185 V220 H0Z" fill="#2a0f1e"/>',
    snow: '<circle cx="980" cy="50" r="18" fill="#fff"/><path d="M0 170 L150 90 L260 150 L420 70 L560 150 L700 100 L860 160 L1000 90 L1200 160 V220 H0Z" fill="#dce8f6" opacity=".85"/><path d="M0 190 L200 140 L400 185 L650 135 L900 190 L1200 150 V220 H0Z" fill="#8fb0d8"/>',
    neon: '<g fill="#07051a"><rect x="80" y="90" width="70" height="130"/><rect x="170" y="60" width="60" height="160"/><rect x="250" y="110" width="90" height="110"/><rect x="380" y="40" width="70" height="180"/><rect x="480" y="100" width="100" height="120"/><rect x="620" y="70" width="60" height="150"/><rect x="720" y="120" width="110" height="100"/><rect x="870" y="50" width="70" height="170"/><rect x="980" y="95" width="90" height="125"/></g><g fill="#58d0e8"><rect x="190" y="80" width="6" height="6"/><rect x="400" y="70" width="6" height="6"/><rect x="640" y="100" width="6" height="6"/><rect x="890" y="80" width="6" height="6"/></g>',
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 220" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset=".85" stop-color="${c}"/><stop offset="1" stop-color="${d}"/></linearGradient></defs><rect width="1200" height="220" fill="url(#g)"/>${shapes[k]}</svg>`
}
const bg = (k) => `background-image:url('data:image/svg+xml;utf8,${encodeURIComponent(sceneSvg(k))}')`
const pt = (name, h, cls = '', style = '') => `<span class="pt ${cls}" style="--h:${h};${style}">${name.slice(0, 1)}</span>`
const tools = () => `<div class="tools"><button aria-label="Move">${icon('grip')}</button><button aria-label="Change size">${icon('resize')}</button><button aria-label="Hide this block">${icon('eyeoff')}</button></div>`

const B = {
  cont: (cls = '') => `<section class="bt art ${cls}" style="${bg('harbour')};min-height:300px" aria-label="Pick up the story">${tools()}<div class="tin"><span class="kick">${icon('play')}Pick up the story</span><h3>Harbour of Ash</h3>
    <p class="q">“Then we have until the tide turns,” she says quietly. “After that Captain Orrin will be asking the same questions, and he won’t ask kindly.”</p>
    <div class="chips"><span class="chip dark">Persona: Captain Ren</span><span class="chip dark">Mira · 38 messages · 14 minutes ago</span></div>
    <div class="btns"><button class="btn pri lgx" type="button">${icon('play')}Continue</button><button class="btn onart lgx" type="button" style="font-weight:500">${icon('branch')}Branches</button></div></div></section>`,
  rand: (cls = '') => `<section class="bt ${cls}" aria-label="Meet someone from your library">${tools()}
    <div style="display:flex;gap:16px;padding:16px">${pt('Tomas', 150, '', 'width:112px;height:148px;border-radius:12px;font-size:36px')}<div style="display:flex;flex-direction:column;gap:6px;min-width:0;flex:1"><span class="kick" style="color:var(--ti)">${icon('shuffle')}From your library</span><h3>Tomas</h3><div class="chips">${chip('Keeper', 'violet')}${chip('Male', 'violet')}</div><p class="cap" style="display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">The lighthouse keeper who never leaves the stairs. 1 chat, 2 lorebooks.</p></div></div>
    <div class="btns" style="padding:0 16px 16px;margin:0"><button class="btn tonal" type="button">${icon('chat')}Start a chat</button><button class="btn ghost" type="button">${icon('shuffle')}Another</button></div></section>`,
  market: (cls = '') => `<section class="bt t-amber ${cls}" aria-label="From the Marketplace">${tools()}
    <div style="display:flex;gap:16px;padding:16px">${pt('Kestrel', 40, '', 'width:112px;height:148px;border-radius:12px;font-size:36px')}<div style="display:flex;flex-direction:column;gap:6px;min-width:0;flex:1"><span class="kick" style="color:var(--ti)">${icon('globe')}From the Marketplace</span><h3>Captain Vael</h3><p class="cap">by Kestrel · Chub · top this week</p><div class="chips">${chip('↓ 12.4k', 'amber')}${chip('1.8k tokens', 'amber')}</div><p class="cap" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">A smuggler captain with a debt to the harbour guild.</p></div></div>
    <div class="btns" style="padding:0 16px 16px;margin:0"><button class="btn tonal" type="button">${icon('ext')}Preview</button><button class="btn ghost" type="button">${icon('shuffle')}Another</button></div></section>`,
  world: (cls = '') => `<section class="bt art t-teal ${cls}" style="${bg('forest')};min-height:200px" aria-label="Create a world">${tools()}<div class="tin"><span class="kick">${icon('globe')}World</span><h3>Create a world</h3><p class="cap" style="color:rgb(255 255 255 / .85)">A DM keeps places, factions and a story that moves on its own.</p>
    <div class="btns"><button class="btn tonalw" type="button">${icon('plus')}Open World</button><button class="btn onart" type="button" aria-label="Another background" title="Background: Forest at night (your library)">${icon('shuffle')}</button></div></div></section>`,
  favs: (cls = '') => `<section class="bt ${cls}" aria-label="Favourite characters">${tools()}<div class="th t-amber">${icon('star')}<h3>Favourites</h3><span class="n">8</span><button class="more" type="button">All characters →</button></div>
    <div class="favs">${[['Mira', 300], ['Sina Rose', 20], ['Eli', 200], ['Isolde', 270], ['Ayako', 340], ['Tomas', 150], ['Yuki', 200], ['Orrin', 10]].map(([n, h]) => `<button class="fav" type="button"><span class="pt" style="--h:${h}">${n[0]}<i>${icon('star')}</i></span><span>${n}</span></button>`).join('')}</div></section>`,
  waits: (cls = '') => `<section class="bt ${cls}" aria-label="What waits for you">${tools()}<div class="th t-sky">${icon('tray')}<h3>Waiting for you</h3><span class="n red">5</span><button class="more" type="button">Inbox →</button></div>
    <button class="li t-amber"><span class="dotc"></span><span class="tx"><b>Night train</b><span class="cap">An agent asks a question</span></span>${icon('chevR')}</button>
    <button class="li t-sky"><span class="dotc"></span><span class="tx"><b>Harbour of Ash</b><span class="cap">The sensor is 12 messages behind</span></span>${icon('chevR')}</button>
    <button class="li t-pink"><span class="dotc" style="background:var(--destructive)"></span><span class="tx"><b>World DM · Winter court</b><span class="cap" style="color:var(--destructive)">The last run failed</span></span>${icon('chevR')}</button></section>`,
  quests: (cls = '') => `<section class="bt ${cls}" aria-label="Quests and plot threads">${tools()}<div class="th t-pink">${icon('flag')}<h3>Quests and threads</h3><span class="n">7</span><button class="more" type="button">All →</button></div>
    ${[['Find who burned the harbour', 'Harbour of Ash · main quest', '2/4'], ['Reach the border before dawn', 'Night train · main quest', '1/3'], ['Return the ledger', 'Harbour of Ash · side thread', '—']].map(([a, b, c]) => `<button class="li t-pink"><span class="dotc"></span><span class="tx"><b>${a}</b><span class="cap">${b}</span></span><span class="prog">${c}</span></button>`).join('')}</section>`,
  help: (cls = '') => `<section class="bt t-teal ${cls}" aria-label="A tip">${tools()}<div class="th t-teal">${icon('bulb')}<h3>Did you know?</h3><button class="more" type="button">All help →</button></div>
    <div class="news"><b style="font-size:var(--fs-heading)">Profile (card tab)</b><p class="cap" style="color:var(--foreground)">The Profile tab splits a card into fields (identity, appearance, goals and more). Every save writes them back into Description and Personality.</p><p class="cap">Open a card, then the Profile tab.</p>
    <div class="btns" style="margin:4px 0 0"><button class="btn tonal" type="button">${icon('play')}Show me</button><button class="btn ghost" type="button">${icon('shuffle')}Next tip</button></div></div></section>`,
  news: (cls = '') => `<section class="bt ${cls}" aria-label="What's new">${tools()}<div class="th t-violet">${icon('news')}<h3>What’s new</h3><button class="more" type="button">All releases ${icon('ext')}</button></div>
    <div class="news"><div class="ver"><b>Roleplay 4.79.0</b><span class="cap">Oct 30</span></div><ul><li>The Personas page was reworked</li><li>A cut-short reply now says why</li><li>New chats start from a chooser</li></ul><p class="cap">Molfar Vertep 1.8.1 · from the project’s release notes</p></div></section>`,
}
const header = (edit) => `<header class="htop"><h2>Home</h2><button class="ask" type="button" aria-label="Ask Molfar">${icon('sparkle')}<span>Ask Molfar: describe what to make or change…</span></button><span class="sp"></span><button class="btn sm ${edit ? 'tonal' : ''}" type="button" id="cust" style="height:40px">${icon('gear')}Customize</button></header>`

function mountHome2({ label, blurb, html, edit = false }) {
  const q = new URLSearchParams(location.search)
  const theme = q.get('theme') || 'dark'
  document.documentElement.classList.toggle('dark', theme === 'dark')
  if (q.has('bare')) document.documentElement.classList.add('bare')
  const link = (t) => `<a class="${t === theme ? 'on' : ''}" href="?theme=${t}${q.has('bare') ? '&bare=1' : ''}">${t}</a>`
  document.body.innerHTML = `<div class="bar"><b>${label}</b><span>${blurb}</span><span class="sp"></span>${link('dark')}${link('light')}<a href="../index.html">all mocks</a></div>
  <div class="hpage ${q.has('edit') ? 'edit-on' : ''}" id="pg">${header(edit)}<main class="hbody ${q.has('edit') ? 'edit' : ''}" id="mn">${html}<div class="hidden-tray t-teal"><span class="cap">Hidden blocks:</span><button class="btn sm" type="button">${icon('plus')}Ask Molfar bar</button><button class="btn sm" type="button">${icon('plus')}Random lorebook</button><button class="btn sm" type="button">${icon('plus')}Recent chats</button><button class="btn sm ghost" type="button">Reset to default</button></div></main></div>`
  wire()
  document.getElementById('cust').addEventListener('click', () => { document.getElementById('pg').classList.toggle('edit-on'); document.getElementById('mn').classList.toggle('edit') })
}
