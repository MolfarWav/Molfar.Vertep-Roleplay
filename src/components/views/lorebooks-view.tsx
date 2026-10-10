
import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpenText, Plus, Trash, Copy, MagnifyingGlass, Globe, Flask, Pulse, CaretDown, CaretRight } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Pager, clampPage } from '@/components/ui/pager'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { useApp } from '@/lib/store'
import { SectionPage, PaneTitle } from '@/components/shell/section-page'
import { estimateTokens, formatTokens, uid } from '@/lib/tokens'
import { importLorebookFiles, fetchWIStatus, type WIStatus } from '@/lib/engine'
import { cn } from '@/lib/utils'
import type { Lorebook, LoreEntry } from '@/lib/types'
import { MasterDetail } from '@/components/shell/master-detail'
import { LoreStatusIcon, LORE_STATUS_LABEL } from '@/components/lore-status-icon'
import { useConfirm } from '@/components/ui/confirm'

const positions: LoreEntry['position'][] = ['before_char', 'after_char', 'before_em', 'after_em', 'before_an', 'after_an', 'at_depth', 'before_examples', 'after_examples']

export function LorebooksView() {
  const lorebooks = useApp((s) => s.lorebooks)
  const updateLorebook = useApp((s) => s.updateLorebook)
  const addLorebook = useApp((s) => s.addLorebook)
  const duplicateLorebook = useApp((s) => s.duplicateLorebook)
  const deleteLorebook = useApp((s) => s.deleteLorebook)
  const [selectedId, setSelectedId] = useState(lorebooks[0]?.id ?? null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [testOpen, setTestOpen] = useState(false)
  const [confirm, confirmDialog] = useConfirm()
  const [activeViewerOpen, setActiveViewerOpen] = useState(false)
  const importInput = useRef<HTMLInputElement>(null)
  const refreshLorebooks = useApp((s) => s.refreshLorebooks)
  const hydrate = useApp((s) => s.hydrate)
  const book = lorebooks.find((b) => b.id === selectedId) ?? lorebooks[0]

  /** Import: native studio lorebook JSON (PUT as-is) or world-info
   *  JSON (normalized server-side by the import plugin). World files
   *  carry no book name — the FILE name is the book's name, so it
   *  rides along as `name`. */
  const importFiles = async (files: FileList | null) => {
    if (!files) return
    const ids = await importLorebookFiles(Array.from(files), (m) => toast.error(m))
    const added = ids.length
    const lastId = ids.at(-1) ?? null
    if (added) {
      // one list refresh — the WS look_changed echo does the full hydrate
      await (lastId ? refreshLorebooks() : hydrate())
      toast.success(`Imported ${added} book${added > 1 ? 's' : ''}`)
      if (lastId) select(lastId)
      else { const last = useApp.getState().lorebooks.at(-1); if (last) select(last.id) }
    }
  }

  const select = (id: string) => {
    setSelectedId(id)
    setDetailOpen(true)
  }

  // lorebooks grow for years — the sidebar pages through them
  const BOOK_PAGE = 100
  const [bookPage, setBookPage] = useState(0)
  const pagedBooks = lorebooks.slice(clampPage(bookPage, lorebooks.length, BOOK_PAGE) * BOOK_PAGE, (clampPage(bookPage, lorebooks.length, BOOK_PAGE) + 1) * BOOK_PAGE)

  return (
    <SectionPage section="lorebooks" count={lorebooks.length} hideOnPhone={detailOpen && !!book}>
    <>
    <MasterDetail
      detailOpen={detailOpen && !!book}
      onBack={() => setDetailOpen(false)}
      detailTitle={book?.name}
      masterWidth="w-60"
      master={
        <aside className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <PaneTitle section="lorebooks" icon={<BookOpenText className="size-4 text-primary" aria-hidden="true" />} />
          <Button variant="ghost" size="sm" className="ml-auto size-7 p-0" onClick={() => select(addLorebook())} aria-label="New lorebook">
            <Plus className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <ul className="flex flex-col p-1.5">
            {pagedBooks.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => select(b.id)}
                  className={cn('flex min-h-11 w-full flex-col justify-center gap-0.5 rounded-md px-2 py-1.5 text-left text-sm', b.id === book?.id ? 'bg-accent' : 'hover:bg-accent/50')}
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    {b.name}
                    {b.globalActive && <Globe className="size-3 text-primary" aria-hidden="true" />}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {b.entries.length} entries{b.isEmbedded ? ' · embedded' : ''}{b.linkedCharacterIds.length > 0 ? ` · ${b.linkedCharacterIds.length} linked` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Pager total={lorebooks.length} page={clampPage(bookPage, lorebooks.length, BOOK_PAGE)} pageSize={BOOK_PAGE} onPage={setBookPage} />
        </ScrollArea>
        <div className="flex gap-1 border-t border-border p-1.5">
          <input ref={importInput} type="file" accept="application/json" multiple className="hidden" onChange={(e) => { void importFiles(e.target.files); e.target.value = '' }} />
          <Button variant="ghost" size="sm" className="flex-1 text-xs" onClick={() => importInput.current?.click()}>Import</Button>
          <Button variant="ghost" size="sm" className="flex-1 text-xs" onClick={() => setActiveViewerOpen(true)}>
            <Pulse className="size-3.5" aria-hidden="true" />Active
          </Button>
        </div>
      </aside>
      }
      detail={
        book ? (
          <BookEditor
            key={book.id}
            book={book}
            onUpdate={(patch) => updateLorebook(book.id, patch)}
      onDelete={() => void confirm({
        title: `Delete ${book.name}?`,
        description: 'The lorebook file is removed from disk, every entry in it goes too.',
      }).then((yes) => {
        if (!yes) return
        deleteLorebook(book.id); setSelectedId(lorebooks.find((b) => b.id !== book.id)?.id ?? ""); setDetailOpen(false)
      })}
      onDuplicate={() => { setSelectedId(duplicateLorebook(book.id)); toast.success('Lorebook duplicated') }}
      onTest={() => setTestOpen(true)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">No lorebooks</div>
        )
      }
    />

      <KeywordTest open={testOpen} onOpenChange={setTestOpen} book={book ?? null} />
      <ActiveEntriesViewer open={activeViewerOpen} onOpenChange={setActiveViewerOpen} />
      {confirmDialog}
    </>
    </SectionPage>
  )
}

function BookEditor({ book, onUpdate, onDelete, onDuplicate, onTest }: {
  book: Lorebook; onUpdate: (p: Partial<Lorebook>) => void; onDelete: () => void; onDuplicate: () => void; onTest: () => void
}) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('order')
  const [openIds, setOpenIds] = useState<string[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [copyEntry, setCopyEntry] = useState<LoreEntry | null>(null)
  const allBooks = useApp((s) => s.lorebooks)
  const updateLorebook = useApp((s) => s.updateLorebook)

  const entries = useMemo(() => {
    const q = query.toLowerCase()
    let list = book.entries.filter((e) => !q || e.title.toLowerCase().includes(q) || e.keys.some((k) => k.includes(q)) || e.content.toLowerCase().includes(q))
    switch (sort) {
      case 'title': list = [...list].sort((a, b) => a.title.localeCompare(b.title)); break
      case 'tokens': list = [...list].sort((a, b) => estimateTokens(b.content) - estimateTokens(a.content)); break
      case 'priority': list = [...list].sort((a, b) => b.order - a.order); break
      case 'trigger': list = [...list].sort((a, b) => b.probability - a.probability); break
    }
    return list
  }, [book.entries, query, sort])

  const ENTRY_PAGE = 50
  const [entryPage, setEntryPage] = useState(0)
  const safeEntryPage = clampPage(entryPage, entries.length, ENTRY_PAGE)
  const pagedEntries = entries.slice(safeEntryPage * ENTRY_PAGE, safeEntryPage * ENTRY_PAGE + ENTRY_PAGE)

  const upEntry = (id: string, patch: Partial<LoreEntry>) =>
    onUpdate({ entries: book.entries.map((e) => e.id === id ? { ...e, ...patch } : e) })

  return (
    // @container: the detail pane spans from a phone page to a narrow drawer
    // to a full page; the grids below must follow the PANE's width, not the
    // viewport, or fixed-width label+input rows crush into each other
    <div className="flex min-h-0 min-w-0 flex-1 flex-col @container">
      {/* header + settings + entries toolbar scroll WITH the entries — the
          toolbar pinning at the top was eating the viewport on mobile */}
      <ScrollArea className="min-h-0 flex-1">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <Input value={book.name} onChange={(e) => onUpdate({ name: e.target.value })} className="h-8 w-full text-sm font-medium md:w-52" aria-label="Book name" />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Switch checked={book.globalActive} onCheckedChange={(v) => onUpdate({ globalActive: v })} aria-label="Global activation" />
          Global
        </label>
        <Badge variant="outline" className="text-[10px]">{formatTokens(book.entries.reduce((a, e) => a + estimateTokens(e.content), 0))} tok total</Badge>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          <Button variant="outline" size="sm" className="text-xs" onClick={onTest}>
            <Flask className="size-3.5" aria-hidden="true" />Keyword test
          </Button>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowSettings(!showSettings)}>Settings</Button>
          <Button variant="ghost" size="sm" onClick={onDuplicate} aria-label="Duplicate book"><Copy className="size-4" aria-hidden="true" /></Button>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete} aria-label="Delete book"><Trash className="size-4" aria-hidden="true" /></Button>
        </div>
      </header>

      {showSettings && (
        <div className="grid grid-cols-1 gap-x-4 gap-y-2 border-b border-border px-4 py-3 @[22rem]:grid-cols-2 @[34rem]:grid-cols-3 @[48rem]:grid-cols-4">
          {([
            ['scanDepth', 'Scan depth'], ['contextPercent', 'Context %'], ['budgetCap', 'Budget cap'],
            ['minActivations', 'Min activations'], ['maxRecursion', 'Max recursion'],
          ] as const).map(([key, label]) => (
            <div key={key} className="flex items-center gap-2">
              <Label className="w-24 text-[11px]">{label}</Label>
              <Input type="number" value={book.settings[key]} onChange={(e) => onUpdate({ settings: { ...book.settings, [key]: Number(e.target.value) } })} className="h-6 w-16 text-[11px]" aria-label={label} />
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Label className="w-24 text-[11px]">Strategy</Label>
            <Select value={book.settings.insertionStrategy} onValueChange={(v) => onUpdate({ settings: { ...book.settings, insertionStrategy: v as never } })}>
              <SelectTrigger className="h-6 w-32 text-[11px]" aria-label="Insertion strategy"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="evenly">Evenly</SelectItem>
                <SelectItem value="character_first">Character first</SelectItem>
                <SelectItem value="global_first">Global first</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {([
            ['caseSensitive', 'Case sensitive'], ['wholeWords', 'Whole words'], ['groupScoring', 'Group scoring'],
            ['recursiveScan', 'Recursive scan'], ['includeNames', 'Include names'], ['overflowAlert', 'Overflow alert'],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Switch checked={book.settings[key]} onCheckedChange={(v) => onUpdate({ settings: { ...book.settings, [key]: v } })} aria-label={label} />
              {label}
            </label>
          ))}
          {/* World-info format template, per book: the wrapper every activated
              entry is injected inside. {{original}} stands for the entry text;
              a blank template injects the entries verbatim. */}
          <div className="col-span-full flex flex-col gap-1.5 border-t border-border pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-[11px] font-medium" htmlFor={`wi-format-${book.id}`}>
                Format template
              </Label>
              <Input
                id={`wi-format-${book.id}`}
                value={book.formatTemplate}
                onChange={(e) => onUpdate({ formatTemplate: e.target.value })}
                placeholder="Blank (inject entries as-is)"
                className="h-6 min-w-0 flex-1 font-mono text-[11px]"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[11px]"
                onClick={() => onUpdate({ formatTemplate: '[Relevant lore: {{original}}]' })}
              >
                Use default
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Wraps every activated entry from this book. Use{' '}
              <code className="font-mono">{'{{original}}'}</code> for the entry text.
              {!book.formatTemplate.includes('{{original}}') && book.formatTemplate.trim() !== '' && (
                <span className="text-destructive">
                  {' '}Template has no {'{{original}}'}: entry text would be dropped.
                </span>
              )}
            </p>
            <code className="truncate rounded bg-muted/60 px-2 py-1 font-mono text-[11px] text-muted-foreground">
              {(book.formatTemplate || '{{original}}').replace(
                '{{original}}',
                book.entries[0]?.content.slice(0, 60) || 'entry text',
              )}
            </code>
          </div>
          {/* Vectorization is an imported feature the engine has no embedding
              service for — entries keep their imported vectorized STATUS, but
              there is no re-embed run to perform, so no button pretends one. */}
          <div className="col-span-full flex flex-wrap items-center gap-3 border-t border-border pt-2">
            <Button variant="outline" size="sm" className="h-6 text-[11px]" onClick={onTest}>
              Diagnose chat
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-1.5">
        <div className="relative w-full sm:w-48">
          <MagnifyingGlass className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search entries…" className="h-7 pl-8 text-xs" aria-label="Search entries" />
        </div>
        <Select value={sort} onValueChange={(v) => v && setSort(v)}>
          <SelectTrigger className="h-7 w-28 text-xs" aria-label="Sort entries"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="order">Custom</SelectItem>
            <SelectItem value="priority">Priority</SelectItem>
            <SelectItem value="title">Title</SelectItem>
            <SelectItem value="tokens">Tokens</SelectItem>
            <SelectItem value="trigger">Trigger %</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpenIds(openIds.length ? [] : entries.map((e) => e.id))}>
          {openIds.length ? 'Close all' : 'Open all'}
        </Button>
        {selected.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">{selected.length} selected</span>
            <Button variant="outline" size="sm" className="h-6 text-[11px]" onClick={() => { onUpdate({ entries: book.entries.map((e) => selected.includes(e.id) ? { ...e, status: 'constant' } : e) }); setSelected([]) }}>Make constant</Button>
            <Button variant="outline" size="sm" className="h-6 text-[11px]" onClick={() => { onUpdate({ entries: book.entries.filter((e) => !selected.includes(e.id)) }); setSelected([]); toast.success('Deleted') }}>Delete</Button>
          </div>
        )}
        <Button size="sm" className={cn('h-7 text-xs', selected.length === 0 && 'ml-auto')} onClick={() => {
          const e: LoreEntry = { id: uid('we'), title: 'New entry', memo: '', keys: [], keysRegex: false, secondaryKeys: [], logic: 'AND_ANY', status: 'normal', content: '', position: 'after_char', depth: 4, role: 'system', order: 100, probability: 100, useProbability: false, group: '', groupWeight: 100, groupPrioritize: false, sticky: 0, cooldown: 0, delay: 0, enabled: true, characterFilter: [], characterFilterExclude: false, tagFilter: [], triggerFilters: [], nonRecursable: false, preventFurtherRecursion: false, delayUntilRecursion: false, ignoreBudget: false, scanDepthOverride: null, caseSensitiveOverride: null, wholeWordsOverride: null, wordFormsOverride: null, groupScoringOverride: null, automationId: '', matchSources: { description: false, personality: false, scenario: false, persona: false } }
          onUpdate({ entries: [e, ...book.entries] })
          setOpenIds((o) => [...o, e.id])
        }}>
          <Plus className="size-3.5" aria-hidden="true" />Entry
        </Button>
      </div>

        <ul className="flex flex-col gap-1.5 p-3">
          {pagedEntries.map((e) => {
            const open = openIds.includes(e.id)
            return (
              <li key={e.id} className={cn('rounded-md border border-border', !e.enabled && 'opacity-50')}>
                <div className="flex items-center gap-2 px-2.5 py-1.5">
                  <input
                    type="checkbox"
                    checked={selected.includes(e.id)}
                    onChange={(ev) => setSelected((s) => ev.target.checked ? [...s, e.id] : s.filter((x) => x !== e.id))}
                    aria-label={`Select ${e.title}`}
                    className="size-3.5 accent-primary"
                  />
                  <button type="button" onClick={() => setOpenIds((o) => open ? o.filter((x) => x !== e.id) : [...o, e.id])} className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left" aria-expanded={open}>
                    <span className="flex w-full min-w-0 items-center gap-2">
                      {open ? <CaretDown className="size-3.5 shrink-0" aria-hidden="true" /> : <CaretRight className="size-3.5 shrink-0" aria-hidden="true" />}
                      <LoreStatusIcon status={e.status} />
                      <span className="sr-only">{LORE_STATUS_LABEL[e.status]}</span>
                      {/* title owns the line — keys wrap below it, sharing a row
                          with three badges starved it to nothing in the drawer */}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.title}</span>
                      <span className="ml-auto flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                        {e.probability < 100 && <span>{e.probability}%</span>}
                        <span>{formatTokens(estimateTokens(e.content))} tok</span>
                      </span>
                    </span>
                    {e.keys.length > 0 && (
                      <span className="flex w-full flex-wrap gap-1 pl-11">
                        {e.keys.slice(0, 3).map((k) => (
                          <Badge key={k} variant="secondary" className="min-w-0 max-w-40 text-[10px]"><span className="truncate">{k}</span></Badge>
                        ))}
                        {e.keys.length > 3 && <span className="self-center text-[10px] text-muted-foreground">+{e.keys.length - 3}</span>}
                      </span>
                    )}
                  </button>
                  <Switch checked={e.enabled} onCheckedChange={(v) => upEntry(e.id, { enabled: v })} aria-label={`Enable ${e.title}`} />
                </div>
                <Collapsible open={open}>
                  <CollapsibleContent>
                    <EntryEditor
                      entry={e}
                      onChange={(patch) => upEntry(e.id, patch)}
                      onDelete={() => onUpdate({ entries: book.entries.filter((x) => x.id !== e.id) })}
                      onDuplicate={() => { onUpdate({ entries: [...book.entries, { ...e, id: uid('entry'), title: `${e.title} (copy)` }] }); toast.success('Entry duplicated') }}
                      onCopyToBook={() => setCopyEntry(e)}
                    />
                  </CollapsibleContent>
                </Collapsible>
              </li>
            )
          })}
        </ul>
        <Pager total={entries.length} page={safeEntryPage} pageSize={ENTRY_PAGE} onPage={setEntryPage} />
      </ScrollArea>
      <Dialog open={!!copyEntry} onOpenChange={(o) => { if (!o) setCopyEntry(null) }}>
        <DialogContent className="max-h-[70dvh] overflow-y-auto sm:max-w-sm">
          <DialogHeader><DialogTitle>Copy “{copyEntry?.title}” to…</DialogTitle></DialogHeader>
          <ul className="flex flex-col gap-1">
            {allBooks.filter((b) => b.id !== book.id).map((b) => (
              <li key={b.id}>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => {
                  if (copyEntry) updateLorebook(b.id, { entries: [...b.entries, { ...copyEntry, id: uid('entry') }] })
                  toast.success(`Copied to ${b.name}`)
                  setCopyEntry(null)
                }}>
                  {b.name}
                  <span className="ml-auto text-[11px] text-muted-foreground">{b.entries.length} entries</span>
                </Button>
              </li>
            ))}
            {allBooks.length <= 1 && <p className="text-xs text-muted-foreground">No other lorebooks yet, create one first.</p>}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function KeyListInput({ keys, label, onChange }: { keys: string[]; label: string; onChange: (keys: string[]) => void }) {
  // Local draft holds the RAW text so delimiters survive keystrokes (a
  // controlled `value={keys.join(', ')}` would eat the comma mid-typing);
  // parsed keys still commit on every change — engine stays live.
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? keys.join(', ')
  return (
    <Input
      value={shown}
      onChange={(ev) => {
        setDraft(ev.target.value)
        onChange(ev.target.value.split(',').map((k) => k.trim()).filter(Boolean))
      }}
      onBlur={() => setDraft(null)}
      className="h-7 font-mono text-xs"
      aria-label={label}
    />
  )
}

function EntryEditor({ entry: e, onChange, onDelete, onDuplicate, onCopyToBook }: { entry: LoreEntry; onChange: (p: Partial<LoreEntry>) => void; onDelete: () => void; onDuplicate: () => void; onCopyToBook: () => void }) {
  return (
    <div className="flex flex-col gap-2.5 border-t border-border px-3 py-2.5">
      <div className="grid grid-cols-1 gap-2 @[26rem]:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label className="text-[11px]">Title / memo</Label>
          <Input value={e.title} onChange={(ev) => onChange({ title: ev.target.value })} className="h-7 text-xs" aria-label="Entry title" />
        </div>
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <Label className="text-[11px]">Status</Label>
            <Select value={e.status} onValueChange={(v) => onChange({ status: v as never })}>
              <SelectTrigger className="h-7 text-xs" aria-label="Status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="constant">Constant</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="vectorized">Vectorized</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-1.5 pb-1 text-[11px] text-muted-foreground">
            <Switch checked={e.keysRegex} onCheckedChange={(v) => onChange({ keysRegex: v })} aria-label="Regex keys" />
            regex keys
          </label>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 @[26rem]:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label className="text-[11px]">Primary keys (comma separated)</Label>
          <KeyListInput keys={e.keys} label="Primary keys" onChange={(keys) => onChange({ keys })} />
        </div>
        <div className="flex gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <Label className="text-[11px]">Secondary keys</Label>
            <KeyListInput keys={e.secondaryKeys} label="Secondary keys" onChange={(secondaryKeys) => onChange({ secondaryKeys })} />
          </div>
          <div className="flex w-28 flex-col gap-1">
            <Label className="text-[11px]">Logic</Label>
            <Select value={e.logic} onValueChange={(v) => onChange({ logic: v as never })}>
              <SelectTrigger className="h-7 text-xs" aria-label="Key logic"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['AND_ANY', 'AND_ALL', 'NOT_ANY', 'NOT_ALL'].map((l) => <SelectItem key={l} value={l}>{l.replace('_', ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="flex items-center gap-2 text-[11px]">Content <Badge variant="outline" className="text-[10px]">{formatTokens(estimateTokens(e.content))} tok</Badge></Label>
        <Textarea value={e.content} rows={3} onChange={(ev) => onChange({ content: ev.target.value })} aria-label="Entry content" className="text-xs" />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex w-36 flex-col gap-1">
          <Label className="text-[11px]">Position</Label>
          <Select value={e.position} onValueChange={(v) => onChange({ position: v as never })}>
            <SelectTrigger className="h-7 text-xs" aria-label="Position"><SelectValue /></SelectTrigger>
            <SelectContent>
              {positions.map((p) => <SelectItem key={p} value={p}>{p.replace(/_/g, ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {e.position === 'at_depth' && (
          <>
            <NumMini label="Depth" value={e.depth} onChange={(v) => onChange({ depth: v })} />
            <div className="flex w-24 flex-col gap-1">
              <Label className="text-[11px]">Role</Label>
              <Select value={e.role} onValueChange={(v) => onChange({ role: v as never })}>
                <SelectTrigger className="h-7 text-xs" aria-label="Role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['system', 'user', 'assistant'].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
        <NumMini label="Order" value={e.order} onChange={(v) => onChange({ order: v })} />
        <NumMini label="Trigger %" value={e.probability} onChange={(v) => onChange({ probability: v })} />
        <NumMini label="Sticky" value={e.sticky} onChange={(v) => onChange({ sticky: v })} />
        <NumMini label="Cooldown" value={e.cooldown} onChange={(v) => onChange({ cooldown: v })} />
        <NumMini label="Delay" value={e.delay} onChange={(v) => onChange({ delay: v })} />
        <div className="flex w-28 flex-col gap-1">
          <Label className="text-[11px]">Group</Label>
          <Input value={e.group} onChange={(ev) => onChange({ group: ev.target.value })} className="h-7 text-xs" aria-label="Inclusion group" />
        </div>
        <NumMini label="Weight" value={e.groupWeight} onChange={(v) => onChange({ groupWeight: v })} />
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        {([
          ['nonRecursable', 'non-recursable'], ['preventFurtherRecursion', 'prevent further recursion'],
          ['delayUntilRecursion', 'delay until recursion'], ['groupPrioritize', 'prioritize in group'],
          ['ignoreBudget', 'ignore budget'],
        ] as const).map(([key, label]) => (
          <label key={key} className="flex items-center gap-1.5">
            <Switch checked={!!e[key]} onCheckedChange={(v) => onChange({ [key]: v })} aria-label={label} />
            {label}
          </label>
        ))}
        <span className="ml-1">match:</span>
        {(['description', 'personality', 'scenario', 'persona'] as const).map((k) => (
          <label key={k} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={e.matchSources[k]}
              onChange={(ev) => onChange({ matchSources: { ...e.matchSources, [k]: ev.target.checked } })}
              aria-label={`Match ${k}`}
              className="size-3 accent-primary"
            />
            {k}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input value={e.automationId} onChange={(ev) => onChange({ automationId: ev.target.value })} placeholder="Automation ID" className="h-7 w-40 text-xs" aria-label="Automation ID" />
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onCopyToBook}>Copy to book</Button>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onDuplicate}>Duplicate</Button>
        <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs text-destructive" onClick={onDelete}>
          <Trash className="size-3.5" aria-hidden="true" />Delete entry
        </Button>
      </div>
    </div>
  )
}

function NumMini({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex w-20 flex-col gap-1">
      <Label className="text-[11px]">{label}</Label>
      <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-7 text-xs" aria-label={label} />
    </div>
  )
}

function KeywordTest({ open, onOpenChange, book }: { open: boolean; onOpenChange: (o: boolean) => void; book: Lorebook | null }) {
  const [text, setText] = useState('')
  const matches = useMemo(() => {
    if (!book || !text) return []
    const lower = text.toLowerCase()
    return book.entries.filter((e) => e.enabled && (e.status === 'constant' || e.keys.some((k) => lower.includes(k.toLowerCase()))))
  }, [book, text])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Keyword test: {book?.name}</DialogTitle></DialogHeader>
        <Textarea value={text} rows={4} onChange={(e) => setText(e.target.value)} placeholder="Paste chat text here to see which entries would fire…" aria-label="Test text" className="text-sm" />
        <div className="flex min-h-0 flex-col gap-1.5">
          <Label className="text-xs shrink-0">{matches.length} entries match</Label>
          <div className="flex max-h-[45dvh] flex-col gap-1.5 overflow-y-auto overscroll-contain">
            {matches.map((e) => (
              <div key={e.id} className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1.5 text-sm">
                <LoreStatusIcon status={e.status} />
                {e.title}
                <span className="ml-auto flex gap-1">
                  {e.keys.filter((k) => text.toLowerCase().includes(k.toLowerCase())).map((k) => (
                    <Badge key={k} className="text-[10px]">{k}</Badge>
                  ))}
                  {e.status === 'constant' && <Badge variant="secondary" className="text-[10px]">constant</Badge>}
                </span>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** REAL world-info activation for the active chat — the same activation
 *  path a generation runs (constants + key matches over recent messages,
 *  context-scaled budget). Numbers come from the engine, not a mock. */
function ActiveEntriesViewer({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const chat = useApp((s) => (s.activeChatId ? s.chats.find((c) => c.id === s.activeChatId) : null))
  const [status, setStatus] = useState<WIStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !chat) { setStatus(null); setError(null); return }
    let alive = true
    fetchWIStatus(chat.id)
      .then((s) => { if (alive) { setStatus(s); setError(null) } })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'failed') })
    return () => { alive = false }
  }, [open, chat])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>World info: {chat?.title ?? 'no chat'}</DialogTitle></DialogHeader>
        {!chat ? (
          <p className="text-sm text-muted-foreground">
            Open a chat first, activation is evaluated against its recent messages.
          </p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !status ? (
          <p className="text-sm text-muted-foreground">Checking…</p>
        ) : (
          <div className="flex min-h-0 flex-col gap-1.5">
            <p className="shrink-0 text-[11px] text-muted-foreground">
              {(status.usedChars / 4 | 0).toLocaleString()}t used of ~{(status.budgetChars / 4 | 0).toLocaleString()}t WI budget
              · context {status.contextTokens.toLocaleString()}t
            </p>
            <div className="flex max-h-[50dvh] flex-col gap-1.5 overflow-y-auto overscroll-contain">
              <Label className="text-xs">Fired ({status.fired.length})</Label>
              {status.fired.map((r, i) => (
                <div key={`${r.book}-${r.uid}-${i}`} className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{r.title}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{r.book}</span>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">{r.constant ? 'constant' : 'keyed'}</Badge>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{Math.ceil(r.chars / 4)}t</span>
                </div>
              ))}
              {status.skipped.length > 0 && (
                <>
                  <Label className="mt-1 text-xs">Cut by budget ({status.skipped.length})</Label>
                  {status.skipped.map((r, i) => (
                    <div key={`skip-${r.book}-${r.uid}-${i}`} className="flex items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-1.5 text-sm text-muted-foreground">
                      <span className="min-w-0 flex-1 truncate">{r.title}</span>
                      <span className="shrink-0 text-[10px]">{r.book}</span>
                      <span className="shrink-0 text-[11px]">+{Math.ceil(r.chars / 4)}t over</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
