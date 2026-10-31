// Lorebooks mock (variant L1, picked): the list with the app's own kind icons, the book page with Entries | Rules | Used by, and the entry editor
// in a side panel. Every real setting of the book rules and of "More options" is here, regrouped by what the player wants. Needs ../world-dm/shared.js.
Object.assign(P, {
  book: '<path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3V4zM5 17a3 3 0 013-3h11"/>', plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  dots: '<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>', flask: '<path d="M9 3h6M10 3v6L4 19a2 2 0 002 3h12a2 2 0 002-3l-6-10V3"/>',
  up: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>', globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>', back: '<path d="M19 12H5M12 19l-7-7 7-7"/>', warn: '<path d="M12 3l10 18H2zM12 10v5M12 18h.01"/>', pin: '<path d="M12 17v5M8 3h8l-1 7 3 3H6l3-3z"/>',
  key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v4M15 12v3"/>', spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>', copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', sort: '<path d="M4 6h10M4 12h7M4 18h4M17 5v14M14 16l3 3 3-3"/>', check: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>',
  persona: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.5 18c1-3 3.2-4 5.5-4s4.5 1 5.5 4"/>', users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-5.5 7-5.5"/><circle cx="17" cy="9" r="2.8"/><path d="M13 20c0-3 2.5-4.5 5-4.5s4 1.5 4 4.5"/>',
  unlink: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3A4 4 0 0010 18.7l1-1M4 4l3 3M20 20l-3-3"/>', translate: '<path d="M4 5h8M8 3v2M6 5c0 4 3 7 6 8M12 5c-1 4-4 7-8 8M14 20l4-9 4 9M15.5 17h5"/>',
  chevR: '<path d="M9 6l6 6-6 6"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>',
})
// The app's own icons for how a book is tied to cards (KIND_ICON in lorebooks-view.tsx): they stay, with the same colours.
const KIND = { own: ['persona', 'amber', 'Own book'], shared: ['users', 'sky', 'Shared'], unlinked: ['unlink', 'slate', 'Not linked'], global: ['globe', 'emerald', 'Global'] }
const BOOKS = [
  ['Harbour Quarter — Lorebook B (guilds and factions, always-on)', 'own', 12, 'Own book of Mira', '2.9k'],
  ['Mira — World Lorebook', 'own', 7, 'Own book of Mira', '1.6k'],
  ['Beach House — Lorebook', 'shared', 8, 'Used by 4 cards', '2.1k'],
  ['Kyiv, 1918', 'global', 31, 'Global', '12.4k'],
  ['Night Train — Session Files (Eli)', 'own', 9, 'Own book of Eli', '2.2k'],
  ['Magic rules for every winter court', 'shared', 18, 'Used by 2 cards', '5.6k'],
  ['The lighthouse', 'unlinked', 6, 'Not linked', '1.1k'],
]
const kindIc = (k) => { const [ic, tone] = KIND[k]; return `<span class="kd t-${tone}">${icon(ic)}</span>` }
const ST = { always: ['amber', 'pin', 'Always on'], keys: ['sky', 'key', 'When mentioned'], meaning: ['violet', 'spark', 'By meaning'] }
const ENTRIES = [
  ['ENGINE — the filtered portal (ALWAYS ON)', 'always', [], '365', 1, ''], ['Harbour guild', 'keys', ['guild', 'harbour guild', 'dockmaster'], '320', 1, ''], ['CAST ROSTER (ALWAYS ON)', 'always', [], '196', 1, ''],
  ['Smuggler routes', 'keys', [], '240', 1, 'nokeys'], ['Lighthouse', 'meaning', [], '150', 1, ''], ['Tide table', 'keys', ['tide', 'low water'], '90', 1, 'sticky'], ['Old Quarter', 'keys', ['quarter', 'old town'], '260', 0, ''],
]
const masterHtml = (cur = 0) => `<aside class="master"><div class="mh"><h2>Lorebooks <span class="cnt">23</span></h2>
  <div class="l"><button class="btn tonal" type="button" style="flex:1">${icon('plus')}New lorebook</button><button class="ib" aria-label="Import">${icon('up')}</button><button class="ib" aria-label="More">${icon('dots')}</button></div>
  <button class="btn ghost" type="button" style="justify-content:flex-start">${icon('spark')}Make one with Molfar</button>
  <div class="srch">${icon('search')}Search books…</div>
  <div class="fchips" role="group" aria-label="Filter">${[['All', 23, 'sky', 1, ''], ['Global', 3, 'emerald', 0, 'globe'], ['Own', 9, 'amber', 0, 'persona'], ['Shared', 8, 'sky', 0, 'users'], ['Not linked', 3, 'slate', 0, 'unlink']].map(([n, c, t, on, ic]) => `<button class="fc t-${t}" aria-pressed="${!!on}">${ic ? icon(ic) : ''}${n} <span class="n">${c}</span></button>`).join('')}</div></div>
  <div class="blist">${BOOKS.map(([n, k, e, use, tok], i) => `<button class="bk" ${i === cur ? 'aria-current="true"' : ''}>${kindIc(k)}<span class="tx"><b>${n}</b><span class="cap">${e} entries · ${use}</span></span><span class="cap">${tok}</span></button>`).join('')}</div></aside>`
const filterChips = () => `<div class="fchips" role="group" aria-label="Filter entries">${[['All', 12, 'sky', 1], ['On', 11, 'sky', 0], ['Off', 1, 'slate', 0], ['Always on', 3, 'amber', 0], ['When mentioned', 7, 'sky', 0], ['By meaning', 2, 'violet', 0]].map(([n, c, t, on]) => `<button class="fc t-${t}" aria-pressed="${!!on}">${n} <span class="n">${c}</span></button>`).join('')}<button class="fc warn" aria-pressed="false">${icon('warn')}No keys <span class="n">1</span></button></div>`
const entryRow = ([t, st, keys, tok, on, flag], i) => { const [tone, ic, lab] = ST[st]; return `<div class="ent ${on ? '' : 'off'}" role="button" tabindex="0" ${i === 3 ? 'aria-current="true"' : ''}>${sw(!!on, 'On')}<span class="tx"><b>${t}</b><span class="keys"><span class="stc t-${tone}">${icon(ic)}${lab}</span>${keys.slice(0, 3).map((k) => `<span class="k">${k}</span>`).join('')}${flag === 'nokeys' ? `<span class="warnk">${icon('warn')}Needs keys, will never fire</span>` : ''}${flag === 'sticky' ? `<span class="cap">${icon('pin')} stays 3 messages</span>` : ''}</span></span><span class="tok">${tok} tokens</span>${icon('chevR')}</div>` }
const entriesTab = () => `<div class="tool"><div class="srch" style="max-width:360px">${icon('search')}Search title, keys, text…</div><span class="sel2">${icon('sort')}Order</span><button class="ib" aria-label="Select several">${icon('check')}</button><span class="sp"></span><button class="btn pri" type="button">${icon('plus')}Add entry</button></div>${filterChips()}<div class="list">${ENTRIES.map(entryRow).join('')}</div>`
const hdr = (tone, ic, title, chips, body) => `<section class="card tcard t-${tone}"><div class="thead">${icon(ic)}<h3>${title}</h3><div class="chips">${chips.map((c) => chip(c, tone)).join('')}</div></div><div class="rows">${body}</div></section>`
// Book rules: every setting of the old "Settings" block, grouped by what it does for the player.
const rulesTab = () => `<div class="rulesgrid">` +
  hdr('sky', 'search', 'What it reads', ['last 6 messages', 'whole words'],
    row({ label: 'Scan depth', hint: 'How many of the latest messages are searched for keys.', ctl: num(6, 'Scan depth') }) +
    row({ label: 'Include names', hint: '“Name: text” is scanned, so a speaker’s name can be a key.', ctl: sw(true, 'Include names') }) +
    row({ label: 'Whole words', hint: 'A key matches a whole word, not a piece of a longer one.', ctl: sw(true, 'Whole words') }) +
    row({ label: 'Word forms', hint: 'Ukrainian and Russian keys match every form of the word.', ctl: sw(true, 'Word forms') }) +
    row({ label: 'Case sensitive', hint: 'Capital and small letters must match exactly.', ctl: sw(false, 'Case sensitive') }) +
    fold({ id: 'min', title: 'If too few entries fire', summary: 'off', cls: 'flat', body: `<div class="rows">${row({ label: 'Min activations', hint: 'If fewer entries fire, look deeper into the chat until this many do. 0 = off.', ctl: num(0, 'Min activations') })}${row({ label: 'Min activations max depth', hint: 'How far back that search may go. 0 = the whole chat.', ctl: num(0, 'Min activations max depth') })}</div>` })) +
  hdr('emerald', 'book', 'How much fits', ['25% of the context', 'no hard cap'],
    row({ label: 'Context %', hint: 'Share of the context the entries may take.', ctl: num(25, 'Context percent') }) +
    row({ label: 'Budget cap', hint: 'A hard limit in characters. 0 = none.', ctl: num(0, 'Budget cap') }) +
    row({ label: 'Overflow alert', hint: 'Warn when entries do not fit the budget.', ctl: sw(true, 'Overflow alert') })) +
  hdr('violet', 'spark', 'Order and chains', ['character first', 'recursion off'],
    `<div class="dice-mode"><span class="lab" style="font-weight:600">Insertion strategy</span>${seg(['Character first', 'Global first', 'Evenly'], 'Character first', true, 'Insertion strategy')}<p class="cap" aria-live="polite">This card’s books come first and claim the budget first. (Global first: global books come first. Evenly: only the order number counts.)</p></div>` +
    row({ label: 'Group scoring', hint: 'In a group, the entry whose keys hit most wins.', ctl: sw(false, 'Group scoring') }) +
    row({ label: 'Recursive scan', hint: 'The text of a fired entry is searched for more keys.', ctl: sw(false, 'Recursive scan') }) +
    row({ label: 'Max recursion', hint: 'How many extra rounds recursion may run.', ctl: num(2, 'Max recursion'), off: true, status: 'Turn on Recursive scan first.' })) +
  hdr('slate', 'copy', 'Wrapper text', ['blank: entries go in as they are'],
    `<div class="fld" style="padding:12px 16px"><div style="display:flex;align-items:center;gap:8px"><span class="lbl" style="flex:1;font-weight:600">Format template</span><button class="btn sm" type="button">Use default</button></div><textarea placeholder="Blank (inject entries as-is)" style="min-height:90px"></textarea><p class="cap">Wraps every activated entry from this book. Use {{original}} for the entry text.</p></div>`) + `</div>`
const usedTab = () => `<div class="list"><div class="ent"><span class="pt" style="--h:300;width:44px;height:44px;border-radius:10px">M</span><span class="tx"><b>Mira</b><span class="cap">Own book · card</span></span><button class="btn sm">Open card</button></div><div class="ent"><span class="pt" style="--h:150;width:44px;height:44px;border-radius:10px">T</span><span class="tx"><b>Tomas</b><span class="cap">Linked book</span></span><button class="btn sm">Open card</button></div></div>`
const tri = (label, v = 'Book default') => `<div class="fld"><label>${label}</label>${sel(['Book default', 'On', 'Off'], v, label)}</div>`
const chk = (items, on) => `<div class="tchips" style="padding:0">${items.map((n) => `<label class="fc" style="gap:8px"><input type="checkbox" ${on.includes(n) ? 'checked' : ''}>${n}</label>`).join('')}</div>`
// the entry editor: always visible = what most people touch; five folds = everything else, grouped by purpose, each with a summary
const drawerHtml = (more) => `<div class="scrim"></div><aside class="drawer t-sky" role="dialog" aria-label="Edit entry"><div class="dhd"><h3>Smuggler routes</h3>${sw(true, 'Entry on')}<button class="ib g" aria-label="More">${icon('dots')}</button><button class="ib g" aria-label="Close">${icon('x')}</button></div>
  <div class="dbd">
    <div class="fld"><label>Title</label><input class="tx2" value="Smuggler routes"></div>
    <div class="fld"><label>Content</label><textarea>Three routes run through the old quarter: the tannery stair, the dry dock and the lamplighter’s alley. Orrin’s watch covers the first two on odd nights.</textarea><span class="cap">240 tokens · sent whole when it fires</span></div>
    <div class="fld"><span class="lbl">When it appears</span>${seg(['Always on', 'When mentioned', 'By meaning'], 'When mentioned', true, 'Status')}</div>
    <div class="fld"><span style="display:flex;align-items:center;gap:8px"><span class="lbl" style="flex:1;font-weight:600">Keys</span><label style="display:flex;align-items:center;gap:8px" class="cap">${sw(false, 'Regex keys')}regex</label></span><div class="chipin"><input placeholder="Type a word and press Enter"></div><span class="warnk">${icon('warn')}No keys yet: a keyed entry without keys never fires.</span><span class="cap">Ukrainian and Russian: one base form is enough (вежа also finds вежі, вежу).</span></div>
    ${fold({ id: 'where', title: 'Where it goes', summary: 'after the card · system · order 100', open: more, tone: 'sky', body: `<div class="grid3" style="padding:16px"><div class="fld"><label>Position</label>${sel(['After the card', 'Before the card', 'At depth'], 'After the card', 'Position')}</div><div class="fld"><label>Role</label>${sel(['System', 'User', 'Assistant'], 'System', 'Role')}</div><div class="fld"><label>Depth</label>${num(4, 'Depth')}<span class="cap">only “At depth”</span></div><div class="fld"><label>Order</label>${num(100, 'Order')}<span class="cap">Higher = later in the prompt and wins the budget.</span></div></div><div class="rows">${row({ label: 'Ignore budget', hint: 'Insert even when the budget is used up.', ctl: sw(false, 'Ignore budget') })}</div>` })}
    ${fold({ id: 'cond', title: 'Only when…', summary: 'no second keys · any speaker · 100%', open: more, tone: 'violet', body: `<div style="padding:16px;display:flex;flex-direction:column;gap:16px"><div class="fld"><label>Also needs one of these keys</label><div class="chipin"><input placeholder="Second keys (optional)"></div>${sel(['and any of', 'and all of', 'not any of', 'not all of'], 'and any of', 'Logic')}<span class="cap">A key from the main list must hit; then these are checked by the chosen rule.</span></div>
      <div class="fld"><label>Chance</label>${num(100, 'Chance')}<span class="cap">100 = always when keyed.</span></div>
      <div class="fld"><label>Only these speakers</label><div class="chipin"><input placeholder="Pick characters (none = anyone)"></div><label class="cap" style="display:flex;gap:8px;align-items:center">${sw(false, 'Exclude them instead')}Exclude them instead</label></div>
      <div class="fld"><label>Only speakers with these tags</label><div class="chipin"><input placeholder="Pick tags"></div></div>
      <div class="fld"><label>Only for these kinds of reply</label>${chk(['Normal', 'Continue', 'Swipe', 'Regenerate', 'Impersonate', 'Quiet'], [])}<span class="cap">None checked = all.</span></div></div>` })}
    ${fold({ id: 'time', title: 'How long it stays', summary: 'no sticky · no cooldown · no delay', open: more, tone: 'teal', body: `<div class="rows">${row({ label: 'Stays on after firing, messages', hint: 'Stays on for this many messages after firing.', ctl: num(0, 'Sticky') })}${row({ label: 'Cooldown, messages', hint: 'Messages to wait before it can fire again.', ctl: num(0, 'Cooldown') })}${row({ label: 'Delay, messages', hint: 'Does not fire until the chat has this many messages.', ctl: num(0, 'Delay') })}</div>` })}
    ${fold({ id: 'grp', title: 'Groups and chains', summary: 'no group · chains allowed', open: more, tone: 'pink', body: `<div style="padding:16px"><div class="grid3"><div class="fld" style="grid-column:1/-1"><label>Group name</label><input class="tx2" placeholder="e.g. weather"><span class="cap">Of one group only one entry fires.</span></div><div class="fld"><label>Weight</label>${num(100, 'Weight')}</div><div class="fld"><label>Group scoring</label>${sel(['Book default', 'On', 'Off'], 'Book default', 'Group scoring')}</div></div></div><div class="rows">${row({ label: 'Prioritize in group', ctl: sw(false, 'Prioritize') })}${row({ label: 'Not triggered by other entries', ctl: sw(false, 'Non recursable') })}${row({ label: 'Does not trigger others', ctl: sw(true, 'Prevent further') })}${row({ label: 'Waits for recursion level', hint: '0 = off.', ctl: num(0, 'Recursion level') })}</div>` })}
    ${fold({ id: 'match', title: 'How its keys match', summary: 'book defaults · also scans nothing extra', open: more, tone: 'slate', body: `<div class="grid3" style="padding:16px">${tri('Case sensitive')}${tri('Whole words')}${tri('Word forms')}<div class="fld"><label>Scan depth</label>${num(0, 'Scan depth')}<span class="cap">empty = from the book</span></div><div class="fld" style="grid-column:1/-1"><label>Also scan the card’s</label>${chk(['description', 'personality', 'scenario', 'persona'], [])}</div><div class="fld" style="grid-column:1/-1"><label>Automation id</label><input class="tx2" placeholder="for Shortcuts that watch this entry"></div></div>` })}
  </div>
  <div class="ft"><span class="cap" style="flex:1">Saved as you type</span><button class="btn" type="button">${icon('copy')}Copy to a book…</button><button class="btn" type="button">Duplicate</button><button class="btn" type="button" style="color:var(--destructive);border-color:color-mix(in oklab,var(--destructive) 50%,transparent)">${icon('trash')}Delete</button></div></aside>`
const bookHead = (tabs, cur) => `<header class="dh t-violet"><div class="t1"><h1>Harbour Quarter — Lorebook B (guilds and factions, always-on)</h1></div>
  <div class="chips"><span class="glob">${sw(false, 'Global')}Global ${'<button class="info" aria-label="About Global" style="width:24px;height:24px;margin:0">' + icon('info') + '</button>'}</span><span class="stc t-amber">${icon('persona')}Own book of Mira</span>${chip('12 entries', 'violet')}${chip('2.9k tokens', 'amber')}<span class="sp"></span><span class="hact"><button class="btn" type="button">${icon('flask')}Test triggers</button><button class="ib" aria-label="Translate, export, duplicate, delete">${icon('dots')}</button></span></div>
  <div class="tabs2" role="tablist">${tabs.map(([n, c], i) => `<button role="tab" aria-selected="${i === cur}">${n}${c ? `<span class="n">${c}</span>` : ''}</button>`).join('')}</div></header>`
const TABS = [['Entries', 12], ['Rules', ''], ['Used by', 1]]
function pageBase(label, blurb, body) {
  const q = new URLSearchParams(location.search)
  const theme = q.get('theme') || 'dark'
  document.documentElement.classList.toggle('dark', theme === 'dark')
  if (q.has('bare')) document.documentElement.classList.add('bare')
  const link = (t) => `<a class="${t === theme ? 'on' : ''}" href="?theme=${t}${q.has('bare') ? '&bare=1' : ''}">${t}</a>`
  document.body.innerHTML = `<div class="bar"><b>${label}</b><span>${blurb}</span><span class="sp"></span>${link('dark')}${link('light')}<a href="../index.html">all mocks</a></div>${body}`
  wire()
  document.addEventListener('click', (e) => { const t = e.target.closest('.tabs2 button'); if (t) t.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', b === t)); const x = e.target.closest('.drawer [aria-label=Close], .scrim'); if (x) document.querySelectorAll('.drawer,.scrim').forEach((n) => (n.style.display = 'none')) })
}
