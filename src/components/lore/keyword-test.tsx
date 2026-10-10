import { useEffect, useState } from 'react'
import { CircleNotch } from '@phosphor-icons/react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import { lorebookToEngine, wiTest, type WITestResult } from '@/lib/engine'
import type { Lorebook } from '@/lib/types'
import { BudgetLine, WhyRows } from '@/components/lore/why-rows'

const NO_CHAT = '__none__'

/** The keyword test: the real scanner on a pasted message, against the book
 *  as it is in the editor right now (unsaved edits included). */
export function KeywordTest({ open, onOpenChange, book }: { open: boolean; onOpenChange: (o: boolean) => void; book: Lorebook | null }) {
  const t = useT()
  const chats = useApp((s) => s.chats)
  const [text, setText] = useState('')
  const [chatId, setChatId] = useState(NO_CHAT)
  const [result, setResult] = useState<WITestResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // live results 400 ms after the typing stops
  useEffect(() => {
    if (!open || !book || !text.trim()) { setResult(null); setError(null); setBusy(false); return }
    const ctl = new AbortController()
    const timer = setTimeout(() => {
      setBusy(true)
      wiTest({ text, books: [lorebookToEngine(book)], ...(chatId !== NO_CHAT ? { chatId } : {}) }, ctl.signal)
        .then((r) => { if (!ctl.signal.aborted) { setResult(r); setError(null) } })
        .catch((e: unknown) => { if (!ctl.signal.aborted) setError(e instanceof Error ? e.message : 'failed') })
        .finally(() => { if (!ctl.signal.aborted) setBusy(false) })
    }, 400)
    return () => { clearTimeout(timer); ctl.abort() }
  }, [open, book, text, chatId])

  const sortedChats = [...chats].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:w-screen max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:content-start max-sm:rounded-none sm:max-w-lg">
        <DialogHeader><DialogTitle>{t('lore.test.title', { name: book?.name ?? '' })}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-1">
          <Label className="text-xs" htmlFor="kw-test-text">{t('lore.test.paste')}</Label>
          <Textarea
            id="kw-test-text"
            value={text}
            rows={4}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('lore.test.placeholder')}
            aria-label={t('lore.test.paste')}
            className="text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">{t('lore.test.useChat')}</Label>
          <Select value={chatId} onValueChange={(v) => v && setChatId(v)}>
            <SelectTrigger className="h-8 w-full text-xs" aria-label={t('lore.test.useChat')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CHAT}>{t('lore.test.noChat')}</SelectItem>
              {sortedChats.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">{t('lore.test.chatHint')}</p>
        </div>
        <div className="flex min-h-0 flex-col gap-1.5" aria-live="polite">
          {!text.trim() ? (
            <p className="text-xs text-muted-foreground">{t('lore.test.empty')}</p>
          ) : error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : !result ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><CircleNotch className="size-3.5 animate-spin" aria-hidden="true" />{t('lore.test.checking')}</p>
          ) : (
            <>
              <BudgetLine usedChars={result.usedChars} budgetChars={result.budgetChars} />
              <div className={busy ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
                <WhyRows
                  fired={result.fired}
                  skipped={result.skipped}
                  blocked={result.blocked ?? []}
                  depthOfBook={() => book?.settings.scanDepth ?? null}
                />
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
