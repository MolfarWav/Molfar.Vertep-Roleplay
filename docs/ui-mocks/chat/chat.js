// Chat screen mocks: the real controls (header, message actions, composer, quick moves, dashboard strip) in three arrangements.
Object.assign(P, {
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  dots: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  translate: '<path d="M4 5h8M8 3v2M6 5c0 4 3 7 6 8M12 5c-1 4-4 7-8 8M14 20l4-9 4 9M15.5 17h5"/>',
  expand: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/>',
  refresh: '<path d="M21 12a9 9 0 11-3-6.7M21 4v5h-5"/>',
  chevL: '<path d="M15 6l-6 6 6 6"/>', chevR: '<path d="M9 6l6 6-6 6"/>',
  next: '<path d="M5 5l7 7-7 7M13 5l7 7-7 7"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
})
const ib = (ic, label, cls = '', extra = '') => `<button class="ib ${cls}" type="button" aria-label="${label}" title="${label}">${icon(ic)}${extra}</button>`
const avatar = (t, tone) => `<span class="av t-${tone}" aria-hidden="true">${t}</span>`
const MSGS = [
  ['mira', 'M', 'violet', 'Mira', '21:04', '<em>Mira sets the ledger down and studies you across the lamplight.</em> “You came back. The guild thinks you burned the harbour. I’d like to hear you say you didn’t.”'],
  ['you', 'Y', 'sky', 'You', '21:05', '<em>I keep my hands where she can see them.</em> “I didn’t. But I know who did, and he’s sitting in your counting-house.”'],
  ['mira', 'M', 'violet', 'Mira', '21:06', '<em>Her fingers go still on the cover.</em> “Then we have until the tide turns,” she says quietly. “After that Captain Orrin will be asking the same questions, and he won’t ask kindly.”'],
]
function log(opts = {}) {
  const act = (ic, l) => `<button class="act" type="button" aria-label="${l}">${icon(ic)}<span class="lbl">${l}</span></button>`
  return `<div class="log"><div class="log-in">
    <div class="day">Today</div>
    ${MSGS.map(([c, a, tone, n, time, tx], i) => {
      const last = i === MSGS.length - 1
      return `<article class="msg ${c}">${avatar(a, tone)}<div class="body"><div class="hd"><b>${n}</b><span class="cap">${time}</span></div><p class="tx">${tx}</p>
      ${last ? `<div class="tools"><span class="sw3"><button class="act" type="button" aria-label="Previous">${icon('chevL')}</button>2 / 3<button class="act" type="button" aria-label="Next">${icon('chevR')}</button></span>${act('pen', 'Edit')}${act('copy', 'Copy')}${act('refresh', 'Regenerate')}${act('dots', 'More')}</div>
      <div class="live" style="margin-top:8px">${chip('Trust +2', 'emerald')}${chip('Tension −3', 'pink')}</div>` : ''}</div></article>`
    }).join('')}
  </div></div>`
}
const strip = () => `<aside class="strip hide-m" aria-label="Relationship dashboard"><div class="sh t-violet" style="margin:0"><i></i>Dashboard</div>
  <div class="chips">${chip('Mira', 'violet')}${chip('Harbour, night', 'teal')}${chip('guarded', 'sky')}</div>
  <div class="meter"><div class="l"><span>Trust</span><span class="up">62 +2</span></div><div class="bar2"><i style="width:62%"></i></div></div>
  <div class="meter"><div class="l"><span>Tension</span><span class="down">41 −3</span></div><div class="bar2"><i style="width:41%;background:var(--destructive)"></i></div></div>
  <p class="cap">Quests: “Find who burned the harbour”</p></aside>`
const area = (ph = 'Type a message…') => `<textarea rows="2" placeholder="${ph}" aria-label="Message input"></textarea>`
const sendBtn = (circle = false) => circle
  ? `<button class="btn pri circle" type="button" aria-label="Send message">${icon('send')}</button>`
  : `<button class="btn pri send" type="button" aria-label="Send message">${icon('send')}<span class="hide-m">Send</span></button>`

function mountChat({ label, blurb, header, below = '', composer, cls = '', bg = false, extra = '' }) {
  const q = new URLSearchParams(location.search)
  const theme = q.get('theme') || 'dark'
  document.documentElement.classList.toggle('dark', theme === 'dark')
  if (q.has('bare')) document.documentElement.classList.add('bare')
  const link = (t) => `<a class="${t === theme ? 'on' : ''}" href="?theme=${t}${q.has('bare') ? '&bare=1' : ''}">${t}</a>`
  const bgimg = `url('data:image/svg+xml;utf8,${encodeURIComponent(SCENE)}')`
  document.body.innerHTML = `<div class="bar"><b>${label}</b><span>${blurb}</span><span class="sp"></span>${link('dark')}${link('light')}<a href="../index.html">all mocks</a></div>
  <div class="app ${cls}">${bg ? `<div class="cbg" style="background-image:${bgimg}"></div>` : ''}
    ${header}${below}
    <div class="cmain"><div class="ccol">${log()}${composer}</div>${strip()}</div>${extra}
  </div>`
  wire()
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-sheet]'); if (t) { document.querySelector('.sheet').classList.toggle('show'); return }
  })
}
