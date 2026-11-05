import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useRelativeTime, useT } from '@/hooks/use-t'
import { useApp } from '@/lib/store'
import { loadBookPreview, saveBook, type BookPreview } from '@/lib/books'
import { ChatPickerList } from '@/components/memory/chat-picker-list'

/**
 * "Save as a book" (#184): a copy of this chat's story on the Data Bank shelf, read by the chats you pick.
 * The copy does not change when the chat does; saving again makes the next version and switches the old one off.
 */
export function BookDialog({ chatId, open, onOpenChange }: { chatId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT()
  const ago = useRelativeTime()
  const tRef = useRef(t)
  tRef.current = t
  const refreshDataBank = useApp((s) => s.refreshDataBank)
  const [preview, setPreview] = useState<BookPreview | null>(null)
  const [failed, setFailed] = useState(false)
  const [name, setName] = useState('')
  const [readers, setReaders] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    let gone = false
    setPreview(null)
    setFailed(false)
    void loadBookPreview(chatId)
      .then((p) => {
        if (gone) return
        setPreview(p)
        setName(p.title)
        setReaders(p.readers)
      })
      .catch(() => { if (!gone) setFailed(true) })
    return () => { gone = true }
  }, [open, chatId])

  const save = async (update?: string) => {
    setBusy(true)
    try {
      const r = await saveBook({ chatId, readers, ...(update ? { update } : { name: name.trim() || undefined }) })
      await refreshDataBank().catch(() => undefined)
      toast.success(tRef.current('book.saved', { name: r.name, n: r.chunks }))
      onOpenChange(false)
    } catch (e) {
      toast.error(tRef.current('book.failed', { error: e instanceof Error ? e.message : String(e) }))
    } finally {
      setBusy(false)
    }
  }

  const empty = !!preview && preview.chapters + preview.arcs + preview.facts === 0
  const canSave = !!preview && !empty && readers.length > 0 && !busy
  const newest = preview ? preview.books.filter((b) => b.enabled)[0] ?? preview.books[0] : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] grid-cols-1 overflow-y-auto sm:max-w-lg" data-testid="book-dialog">
        <DialogHeader>
          <DialogTitle>{t('book.title')}</DialogTitle>
          <DialogDescription>{t('book.intro')}</DialogDescription>
        </DialogHeader>
        {failed ? (
          <p className="text-sm text-destructive">{t('book.loadFailed')}</p>
        ) : !preview ? (
          <p className="text-sm text-muted-foreground">…</p>
        ) : (
          <div className="flex min-w-0 flex-col gap-4">
            <p className="text-sm" data-testid="book-counts">
              {empty ? t('book.empty') : t('book.counts', { chapters: preview.chapters, arcs: preview.arcs, facts: preview.facts, tokens: Math.max(10, Math.round(preview.tokens / 10) * 10) })}
              {preview.capped && <span className="text-muted-foreground"> {t('book.capped')}</span>}
            </p>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t('book.name')}
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className="h-10 md:h-9" />
            </label>
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium">{t('book.readers')}</p>
              <p className="text-xs text-muted-foreground">{t('book.readersHint')}</p>
              <ChatPickerList picked={readers} onChange={setReaders} />
              {readers.length === 0 && <p className="text-xs text-amber-700 dark:text-amber-300">{t('book.pickOne')}</p>}
            </div>
            {preview.books.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-medium">{t('book.made')}</p>
                <ul className="divide-y divide-border rounded-lg border border-border text-sm">
                  {preview.books.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate">{b.name}</span>
                      <span className="text-xs text-muted-foreground">{b.enabled ? ago(b.takenAt) : t('book.off', { when: ago(b.takenAt) })}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              {newest && (
                <Button variant="outline" className="min-h-10 sm:min-h-8" disabled={!canSave} onClick={() => void save(newest.id)} data-testid="book-update">
                  {t('book.update')}
                </Button>
              )}
              <Button className="min-h-10 sm:min-h-8" disabled={!canSave} onClick={() => void save()} data-testid="book-save">
                {t('book.save')}
              </Button>
            </div>
            {newest && <p className="text-xs text-muted-foreground">{t('book.updateHint')}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
