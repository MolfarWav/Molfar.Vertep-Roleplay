import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { PencilSimple, Trash } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm } from '@/components/ui/confirm'
import { TONES, type ToneName } from '@/components/ui/tone'
import { useT } from '@/hooks/use-t'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { knownNames } from '@/lib/known-by'
import { dropPassage, editPassage, loadBookPassages, passageWho, setBookReaders, type BookPassage } from '@/lib/books'
import type { DataBankFile } from '@/lib/types'
import { ChatPickerList } from '@/components/memory/chat-picker-list'
import type { MsgKey } from '@/lib/i18n'

const KIND_TONE: Record<BookPassage['kind'], ToneName> = { fact: 'emerald', chapter: 'violet', arc: 'pink' }

/**
 * A snapshot book's readers and passages (#184). After it is saved only these change: which chats read it, the text of a
 * passage, and the removal of a passage. Nothing is rebuilt from the chat.
 */
export function BookPassages({ book, open, onOpenChange }: { book: DataBankFile; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT()
  const tRef = useRef(t)
  tRef.current = t
  const refreshDataBank = useApp((s) => s.refreshDataBank)
  const [passages, setPassages] = useState<BookPassage[] | null>(null)
  const [readers, setReaders] = useState<string[]>(book.scopeChatIds ?? [])
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [confirm, confirmDialog] = useConfirm()

  useEffect(() => {
    if (!open) return
    let gone = false
    setPassages(null)
    setEditing(null)
    setReaders(book.scopeChatIds ?? [])
    void loadBookPassages(book.id)
      .then((r) => { if (!gone) setPassages(r.file.chunks) })
      .catch(() => { if (!gone) toast.error(tRef.current('book.loadFailed')) })
    return () => { gone = true }
    // the readers are read once per opening: a change of them refreshes the shelf list, which must not reset a passage being edited
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, book.id])

  const run = async (job: Promise<unknown>, after: () => void) => {
    try {
      await job
      after()
      await refreshDataBank().catch(() => undefined)
    } catch (e) {
      toast.error(tRef.current('book.failed', { error: e instanceof Error ? e.message : String(e) }))
    }
  }
  const saveReaders = (next: string[]) => {
    setReaders(next)
    if (next.length) void run(setBookReaders(book.id, next), () => undefined)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] grid-cols-1 overflow-y-auto sm:max-w-2xl" data-testid="book-passages">
        <DialogHeader>
          <DialogTitle className="break-words">{book.name}</DialogTitle>
          <DialogDescription>{t('book.passagesIntro')}</DialogDescription>
        </DialogHeader>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">{t('book.readers')}</p>
            <ChatPickerList picked={readers} onChange={saveReaders} />
            {readers.length === 0 && <p className="text-xs text-amber-700 dark:text-amber-300">{t('book.pickOne')}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">{t('book.passages', { n: passages?.length ?? book.chunks })}</p>
            {!passages ? (
              <p className="text-sm text-muted-foreground">…</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {passages.map((p) => {
                  const who = passageWho(p)
                  return (
                    <li key={p.i} className="flex flex-col gap-1.5 px-3 py-2" data-testid="book-passage">
                      <div className="flex flex-wrap items-center gap-1.5 text-caption text-muted-foreground">
                        <span className={cn('inline-flex h-5 items-center rounded-full border px-1.5 font-medium', TONES[KIND_TONE[p.kind]].chip)}>{t(`book.kind.${p.kind}` as MsgKey)}</span>
                        <span className="min-w-0 break-words">{who === 'all' ? t('book.everyone') : t('book.knownTo', { names: knownNames(who, t) })}</span>
                      </div>
                      {editing === p.i ? (
                        <div className="flex flex-col gap-2">
                          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-20" aria-label={t('book.editText')} />
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" className="min-h-10 sm:min-h-8" onClick={() => setEditing(null)}>{t('book.cancel')}</Button>
                            <Button
                              size="sm"
                              className="min-h-10 sm:min-h-8"
                              disabled={!draft.trim()}
                              onClick={() => void run(editPassage(book.id, p.i, draft.trim()), () => {
                                setPassages((list) => list && list.map((x) => (x.i === p.i ? { ...x, text: draft.trim() } : x)))
                                setEditing(null)
                              })}
                            >
                              {t('book.saveText')}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm">{p.text}</p>
                          <Button variant="ghost" size="icon" className="size-10 shrink-0 sm:size-8" aria-label={t('book.editText')} onClick={() => { setEditing(p.i); setDraft(p.text) }}>
                            <PencilSimple className="size-4" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-10 shrink-0 text-muted-foreground hover:text-destructive sm:size-8"
                            aria-label={t('book.dropPassage')}
                            onClick={() => void confirm({ title: t('book.dropTitle'), description: t('book.dropBody') }).then((yes) => {
                              if (yes) void run(dropPassage(book.id, p.i), () => setPassages((list) => list && list.filter((x) => x.i !== p.i)))
                            })}
                          >
                            <Trash className="size-4" aria-hidden="true" />
                          </Button>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
        {confirmDialog}
      </DialogContent>
    </Dialog>
  )
}
