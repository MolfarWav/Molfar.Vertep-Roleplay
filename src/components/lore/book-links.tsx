import { useState } from 'react'
import { ArrowSquareOut, LinkBreak, MagnifyingGlass, Plus, Swap, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import type { Lorebook } from '@/lib/types'
import { entriesKey } from '@/components/lore/lore-labels'
import { bookEntryCount } from '@/lib/engine'

type Picker = 'replace' | 'add' | null

/** The books an owner (a card, a persona) carries: the own one (when the owner has such a thing) and the linked ones. */
export interface BookSet { ownId: string | null; linkedIds: string[] }

/** The attached books in the order shown: the own one first, then the linked ones; `book` is null for an id the library does not have. */
export function attachedBooks(value: BookSet, lorebooks: readonly Lorebook[], allowOwn: boolean): { id: string; own: boolean; book: Lorebook | null }[] {
  const byId = new Map(lorebooks.map((b) => [b.id, b]))
  const rows = value.linkedIds.map((id) => ({ id, own: false, book: byId.get(id) ?? null }))
  return allowOwn && value.ownId ? [{ id: value.ownId, own: true, book: byId.get(value.ownId) ?? null }, ...rows] : rows
}

/** The Lorebook tab of a card or a persona: the own book, the books it links (each with its entry count, who else uses it, Open and
 *  Unlink), an id the library no longer has (shown, so it can be removed), and a picker with a search for more. The owner keeps
 *  the links; this component only reads them and reports a change. */
export function BookLinks({
  value, onChange, ownerName, usedElsewhere, allowOwn, testId, title, empty,
}: {
  value: BookSet
  onChange: (next: BookSet) => void
  ownerName: string
  /** How many other owners (cards, personas) use this book. */
  usedElsewhere: (bookId: string) => number
  /** The owner may have a book of its own (a card does; a persona does not). */
  allowOwn: boolean
  testId: string
  /** A heading over the list; left out when the tab already has one. */
  title?: string
  empty: string
}) {
  const t = useT()
  const lorebooks = useApp((s) => s.lorebooks)
  const addLorebook = useApp((s) => s.addLorebook)
  const focusLorebook = useApp((s) => s.focusLorebook)
  const [picker, setPicker] = useState<Picker>(null)
  const [pickQuery, setPickQuery] = useState('')

  const attached = new Set([value.ownId, ...value.linkedIds].filter(Boolean))
  const candidates = lorebooks.filter((b) => !attached.has(b.id))
  const globalCount = lorebooks.filter((b) => b.globalActive).length

  const pq = pickQuery.trim().toLowerCase()
  const shown = pq ? candidates.filter((b) => b.name.toLowerCase().includes(pq)) : candidates
  const openPicker = (p: Picker) => { setPickQuery(''); setPicker(p) }

  const pick = (b: Lorebook) => {
    if (picker === 'replace') {
      // the old own book stays in the library; the picked one stops being a plain link
      onChange({ ownId: b.id, linkedIds: value.linkedIds.filter((x) => x !== b.id) })
    } else {
      onChange({ ...value, linkedIds: [...value.linkedIds, b.id] })
    }
    setPicker(null)
  }

  const createBook = () => {
    const id = addLorebook(t('lore.cb.newName', { name: ownerName }))
    if (allowOwn && !value.ownId) onChange({ ...value, ownId: id })
    else onChange({ ...value, linkedIds: [...value.linkedIds, id] })
    toast.success(t('lore.cb.created'))
  }

  const unlink = (id: string, isOwn: boolean) => onChange(isOwn ? { ...value, ownId: null } : { ...value, linkedIds: value.linkedIds.filter((x) => x !== id) })

  const missingRow = (id: string, isOwn: boolean) => (
    <li key={`missing-${id}`} className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-amber-500/50 px-2.5 py-2 text-sm" data-testid="book-missing">
      <Warning className="size-4 shrink-0 text-amber-500" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium">{t('lore.cb.missingRow')}</span>
        <span className="truncate text-[11px] text-muted-foreground">{id}</span>
      </div>
      <Button variant="outline" size="sm" className="h-7 text-xs max-md:h-11" title={t('lore.cb.unlinkTip')} onClick={() => unlink(id, isOwn)}>
        <LinkBreak className="size-3.5" aria-hidden="true" />{t('lore.cb.unlink')}
      </Button>
    </li>
  )

  const row = (b: Lorebook, isOwn: boolean) => (
    <li key={b.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border px-2.5 py-2 text-sm">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 truncate font-medium">{b.name}</span>
          {isOwn && <Badge variant="secondary" className="shrink-0 text-[10px]">{t('lore.cb.ownBadge')}</Badge>}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {t(entriesKey(bookEntryCount(b)), { n: bookEntryCount(b) })}
          {usedElsewhere(b.id) > 0 ? ` · ${t('lore.cb.alsoUsed', { n: usedElsewhere(b.id) })}` : ''}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="outline" size="sm" className="h-7 text-xs max-md:h-11" onClick={() => focusLorebook(b.id)}>
          <ArrowSquareOut className="size-3.5" aria-hidden="true" />{t('lore.open')}
        </Button>
        {isOwn && (
          <Button variant="outline" size="sm" className="h-7 text-xs max-md:h-11" onClick={() => openPicker('replace')}>
            <Swap className="size-3.5" aria-hidden="true" />{t('lore.cb.replace')}
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-7 text-xs max-md:h-11" title={t('lore.cb.unlinkTip')} onClick={() => unlink(b.id, isOwn)}>
          <LinkBreak className="size-3.5" aria-hidden="true" />{t('lore.cb.unlink')}
        </Button>
      </div>
    </li>
  )

  const rows = attachedBooks(value, lorebooks, allowOwn).map((r) => (r.book ? row(r.book, r.own) : missingRow(r.id, r.own)))

  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      {title && <Label className="text-xs">{title}</Label>}
      {rows.length === 0 && <p className="text-xs text-muted-foreground">{empty}</p>}
      <ul className="flex flex-col gap-1.5">{rows}</ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="h-8 text-xs max-md:h-11" disabled={candidates.length === 0} onClick={() => openPicker('add')}>
          <Plus className="size-3.5" aria-hidden="true" />{t('lore.cb.add')}
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs max-md:h-11" onClick={createBook}>
          <Plus className="size-3.5" aria-hidden="true" />{t('lore.cb.new')}
        </Button>
      </div>
      {globalCount > 0 && <p className="text-[11px] text-muted-foreground">{t('lore.cb.globals', { n: globalCount })}</p>}

      <Dialog open={picker != null} onOpenChange={(o) => { if (!o) setPicker(null) }}>
        <DialogContent className="max-h-[70dvh] overflow-y-auto sm:max-w-sm">
          <DialogHeader><DialogTitle>{picker === 'replace' ? t('lore.cb.replaceTitle') : t('lore.cb.addTitle')}</DialogTitle></DialogHeader>
          {candidates.length > 0 && (
            <div className="relative">
              <MagnifyingGlass className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                autoFocus
                value={pickQuery}
                onChange={(e) => setPickQuery(e.target.value)}
                placeholder={t('lore.books.search')}
                aria-label={t('lore.books.search')}
                className="h-8 pl-8 text-sm"
              />
            </div>
          )}
          <ul className="flex max-h-[45dvh] flex-col gap-1 overflow-y-auto overscroll-contain">
            {shown.map((b) => (
              <li key={b.id}>
                <Button variant="outline" size="sm" className="w-full justify-start max-md:h-11" onClick={() => pick(b)}>
                  <span className="truncate">{b.name}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{t(entriesKey(bookEntryCount(b)), { n: bookEntryCount(b) })}</span>
                </Button>
              </li>
            ))}
            {candidates.length === 0 && <p className="text-xs text-muted-foreground">{t('lore.cb.noMore')}</p>}
            {candidates.length > 0 && shown.length === 0 && <p className="text-xs text-muted-foreground">{t('lore.books.noMatch')}</p>}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  )
}
