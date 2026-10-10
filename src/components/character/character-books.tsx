import { useState } from 'react'
import { ArrowSquareOut, LinkBreak, Plus, Swap } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import { bookUsage } from '@/lib/lore-usage'
import type { Character, Lorebook } from '@/lib/types'

type Picker = 'replace' | 'add' | null

/** The Lorebook tab of a card: its own book, the extra books it links, and a
 *  picker for more. Links live ONLY on the card (`embeddedLorebookId`, `linkedLorebookIds`). */
export function CharacterBooks({ c }: { c: Character }) {
  const t = useT()
  const lorebooks = useApp((s) => s.lorebooks)
  const characters = useApp((s) => s.characters)
  const updateCharacter = useApp((s) => s.updateCharacter)
  const addLorebook = useApp((s) => s.addLorebook)
  const updateLorebook = useApp((s) => s.updateLorebook)
  const focusLorebook = useApp((s) => s.focusLorebook)
  const [picker, setPicker] = useState<Picker>(null)

  const own = c.embeddedLorebookId ? lorebooks.find((b) => b.id === c.embeddedLorebookId) ?? null : null
  const linked = c.linkedLorebookIds.map((id) => lorebooks.find((b) => b.id === id)).filter((b): b is Lorebook => !!b)
  const attached = new Set([c.embeddedLorebookId, ...c.linkedLorebookIds].filter(Boolean))
  const candidates = lorebooks.filter((b) => !attached.has(b.id))
  const globalCount = lorebooks.filter((b) => b.globalActive).length

  const usedElsewhere = (b: Lorebook) => bookUsage(characters, b.id).users.filter((u) => u.id !== c.id).length

  const pick = (b: Lorebook) => {
    if (picker === 'replace') {
      // the old own book stays in the library; the picked one stops being a plain link
      updateCharacter(c.id, { embeddedLorebookId: b.id, linkedLorebookIds: c.linkedLorebookIds.filter((x) => x !== b.id) })
    } else {
      updateCharacter(c.id, { linkedLorebookIds: [...c.linkedLorebookIds, b.id] })
    }
    setPicker(null)
  }

  const createBook = () => {
    const id = addLorebook()
    updateLorebook(id, { name: t('lore.cb.newName', { name: c.name }) })
    if (!c.embeddedLorebookId) updateCharacter(c.id, { embeddedLorebookId: id })
    else updateCharacter(c.id, { linkedLorebookIds: [...c.linkedLorebookIds, id] })
    toast.success(t('lore.cb.created'))
  }

  const row = (b: Lorebook, isOwn: boolean) => (
    <li key={b.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border px-2.5 py-2 text-sm">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 truncate font-medium">{b.name}</span>
          {isOwn && <Badge variant="secondary" className="shrink-0 text-[10px]">{t('lore.cb.ownBadge')}</Badge>}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {t('lore.books.entries', { n: b.entries.length })}
          {usedElsewhere(b) > 0 ? ` · ${t('lore.cb.alsoUsed', { n: usedElsewhere(b) })}` : ''}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => focusLorebook(b.id)}>
          <ArrowSquareOut className="size-3.5" aria-hidden="true" />{t('lore.open')}
        </Button>
        {isOwn && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPicker('replace')}>
            <Swap className="size-3.5" aria-hidden="true" />{t('lore.cb.replace')}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          title={t('lore.cb.unlinkTip')}
          onClick={() => updateCharacter(c.id, isOwn ? { embeddedLorebookId: null } : { linkedLorebookIds: c.linkedLorebookIds.filter((x) => x !== b.id) })}
        >
          <LinkBreak className="size-3.5" aria-hidden="true" />{t('lore.cb.unlink')}
        </Button>
      </div>
    </li>
  )

  return (
    <div className="flex flex-col gap-3" data-testid="character-books">
      <Label className="text-xs">{t('lore.cb.title')}</Label>
      {!own && linked.length === 0 && <p className="text-xs text-muted-foreground">{t('lore.cb.empty')}</p>}
      <ul className="flex flex-col gap-1.5">
        {own && row(own, true)}
        {linked.map((b) => row(b, false))}
      </ul>
      {c.embeddedLorebookId && !own && (
        <p className="text-xs text-muted-foreground">{t('lore.cb.missing')}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="h-8 text-xs" disabled={candidates.length === 0} onClick={() => setPicker('add')}>
          <Plus className="size-3.5" aria-hidden="true" />{t('lore.cb.add')}
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={createBook}>
          <Plus className="size-3.5" aria-hidden="true" />{t('lore.cb.new')}
        </Button>
      </div>
      {globalCount > 0 && <p className="text-[11px] text-muted-foreground">{t('lore.cb.globals', { n: globalCount })}</p>}

      <Dialog open={picker != null} onOpenChange={(o) => { if (!o) setPicker(null) }}>
        <DialogContent className="max-h-[70dvh] overflow-y-auto sm:max-w-sm">
          <DialogHeader><DialogTitle>{picker === 'replace' ? t('lore.cb.replaceTitle') : t('lore.cb.addTitle')}</DialogTitle></DialogHeader>
          <ul className="flex flex-col gap-1">
            {candidates.map((b) => (
              <li key={b.id}>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => pick(b)}>
                  <span className="truncate">{b.name}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{t('lore.books.entries', { n: b.entries.length })}</span>
                </Button>
              </li>
            ))}
            {candidates.length === 0 && <p className="text-xs text-muted-foreground">{t('lore.cb.noMore')}</p>}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  )
}
