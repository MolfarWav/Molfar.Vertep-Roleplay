// The side panel as it is today (groups, Kurale labels, ornament dividers, primary bar and gradient on the current item) with one change
// of look: every item has its own colour, and Settings is no longer in the rail (it lives in the shell's Settings). Needs ../world-dm/shared.js.
Object.assign(P, {
  home: '<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>', chat: '<path d="M4 5h16v11H9l-5 4z"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-5.5 7-5.5"/><circle cx="17" cy="9" r="2.8"/><path d="M13 20c0-3 2.5-4.5 5-4.5s4 1.5 4 4.5"/>',
  store: '<path d="M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9c0 2 3 2 4 0 1 2 3 2 4 0 1 2 3 2 4 0 1 2 4 2 4 0"/>',
  persona: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.5 18c1-3 3.2-4 5.5-4s4.5 1 5.5 4"/>',
  scroll: '<path d="M8 4h10v13a3 3 0 01-3 3H6a3 3 0 003-3V4zM8 4a2 2 0 00-2 2v2h2"/>',
  graph: '<circle cx="6" cy="6" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="12" cy="18" r="2"/><path d="M8 6l8 1.5M7 8l4 8M17 10l-4 6"/>',
  bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>', puzzle: '<path d="M10 4h4v3a2 2 0 104 0h2v6h-3a2 2 0 100 4h3v3H4v-5h3a2 2 0 100-4H4V4z"/>',
  tray: '<path d="M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5"/>', help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 115 0c0 2-2.5 2-2.5 4M12 17h.01"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  book: '<path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3V4zM5 17a3 3 0 013-3h11"/>', globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  chevL: '<path d="M15 6l-6 6 6 6"/>', chevR: '<path d="M9 6l6 6-6 6"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  split: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>', full: '<path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5"/>', plug: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  refresh: '<path d="M21 12a9 9 0 11-3-6.7M21 4v5h-5"/>', dl: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>', server: '<rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1"/><path d="M7 7h.01M7 17h.01"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  robot: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9 17h6"/>',
})
// label, icon, hue (oklch hue; each item its own), group. Hues: 237 sky, 16 rose, 293 violet, 205 cyan, 70 amber, 322 fuchsia,
// 162 emerald, 47 orange, 277 indigo, 130 lime-green, 260 blue, 95 yellow, 250 slate-ish (low chroma set below).
const NAV = [
  ['Home', 'home', 237, 0], ['Chats', 'chat', 16, 0],
  ['Characters', 'user', 293, 1], ['Groups', 'users', 205, 1], ['Marketplace', 'store', 70, 1], ['Personas', 'persona', 322, 1],
  ['Lorebooks', 'book', 162, 2], ['Library', 'scroll', 47, 2], ['Canvas', 'graph', 277, 2], ['World', 'globe', 130, 2], ['Agents', 'robot', 350, 2],
  ['Presets', 'sliders', 260, 3],
  ['Shortcuts', 'bolt', 95, 4], ['Tools', 'puzzle', 0, 4],
]
const ORN = new URL('divider-mute.svg', document.currentScript.src).href
function railHtml(current) {
  const item = ([l, ic, h]) => `<button class="it t-h" style="--hue:${h};${h === 0 ? '--tl:var(--slate);--ti:var(--muted-foreground)' : ''}" ${l === current ? 'aria-current="page"' : ''} data-tip="${l}" aria-label="${l}">${icon(ic)}<span class="lb">${l}</span></button>`
  let out = '<nav class="rail x" id="rail" aria-label="Primary sections"><div class="tgrow"><button class="tg" id="tg" aria-label="Hide labels" title="Hide labels">' + icon('chevL') + '</button></div>'
  let last = -1
  NAV.forEach((n) => { if (n[3] !== last) { if (last >= 0) out += `<img class="orn" src="${ORN}" alt="" aria-hidden="true"><div class="rl"></div>`; last = n[3] } out += item(n) })
  out += `<span class="sp"></span><img class="orn" src="${ORN}" alt="" aria-hidden="true"><div class="rl"></div>`
  out += `<button class="it t-h" style="--hue:237" data-tip="Inbox" aria-label="Inbox, 5 waiting">${icon('tray')}<span class="lb">Inbox</span><span class="bdg">5</span></button>`
  out += `<button class="it" data-tip="Help" aria-label="Help">${icon('help')}<span class="lb">Help</span></button></nav>`
  return out
}
const tabbarHtml = (cur) => '<nav class="tabbar" aria-label="Sections">' + ['home|Home|237', 'chat|Chats|16', 'user|Characters|293'].map((s, k) => { const [i, l, h] = s.split('|'); return `<button class="t-h" style="--hue:${h}" ${k === cur ? 'aria-current="page"' : ''} aria-label="${l}">${icon(i)}</button>` }).join('') + `<button aria-label="Menu, 5 waiting">${icon('menu')}<span class="bdg">5</span></button></nav>`
// the app's own palette in the owner's theme: primary red, second accent cyan (a ?accent=green switches to the default)
function applyPalette(q, theme) {
  if (q.get('accent') === 'green') return
  const s = document.createElement('style')
  s.textContent = theme === 'dark'
    ? ':root.dark { --primary: oklch(62% .22 22); --primary-foreground: white; --cta: oklch(82% .14 210); --cta-foreground: oklch(20% .04 220); --ring: oklch(82% .14 210); }'
    : ':root { --primary: oklch(56% .22 25); --primary-foreground: white; --cta: oklch(66% .13 215); --cta-foreground: white; --ring: oklch(66% .13 215); }'
  document.head.appendChild(s)
}
function topbar(on) {
  const b = (ic, t, cls = '') => `<button class="${cls}">${icon(ic)}${t}</button>`
  return `<div class="topbar"><span style="font-family:var(--font-heading);font-size:18px;color:var(--foreground);margin-right:8px">VERTEP</span><span class="sp"></span>${b('split', 'Split')}${b('full', 'Fullscreen')}${b('plug', 'Plugins')}${b('refresh', 'Rebuild')}${b('dl', '')}<button class="${on ? 'on' : ''}" aria-label="Settings" title="Settings">${icon('gear')}</button><button class="user">${icon('user')}molfarwav2</button></div>`
}
function mountShell({ label, blurb, current, tab, content, settingsOpen = false }) {
  const q = new URLSearchParams(location.search)
  const theme = q.get('theme') || 'dark'
  document.documentElement.classList.toggle('dark', theme === 'dark')
  if (q.has('bare')) document.documentElement.classList.add('bare')
  applyPalette(q, theme)
  const link = (t) => `<a class="${t === theme ? 'on' : ''}" href="?theme=${t}${q.has('bare') ? '&bare=1' : ''}">${t}</a>`
  document.body.innerHTML = `<div class="bar"><b>${label}</b><span>${blurb}</span><span class="sp"></span>${link('dark')}${link('light')}<a href="../index.html">all mocks</a></div>
  <div class="stage">${topbar(settingsOpen)}<div class="shell" style="height:calc(100vh - 36px - 36px)">${railHtml(current)}<div class="main">${content}</div></div>${tabbarHtml(tab)}</div>`
  wire()
  document.getElementById('tg').addEventListener('click', () => {
    const r = document.getElementById('rail'); const open = r.classList.contains('x')
    r.classList.toggle('x', !open); r.classList.toggle('c', open)
    const b = document.getElementById('tg'); b.setAttribute('aria-label', open ? 'Show labels' : 'Hide labels'); b.title = open ? 'Show labels' : 'Hide labels'; b.innerHTML = icon(open ? 'chevR' : 'chevL')
  })
  if (q.get('rail') === 'closed') document.getElementById('tg').click()
}
