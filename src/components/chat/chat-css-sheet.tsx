import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Warning } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { lintCss } from '@/components/settings/custom-css-section'
import { useT } from '@/hooks/use-t'

export const CHAT_CSS_MAX = 20000

/** Examples that work in one chat: they reach only this chat's view (`html` and `:root` mean the chat itself). */
export const CHAT_CSS_EXAMPLES: { key: 'serif' | 'wide' | 'flat' | 'quotes'; css: string }[] = [
  { key: 'serif', css: '.mes_text {\n  font-family: Georgia, "Times New Roman", serif;\n  font-size: 1.05em;\n}' },
  { key: 'wide', css: '.chat-column {\n  --chat-max: 64rem;\n}' },
  { key: 'flat', css: '.group\\/msg > div {\n  border-color: transparent;\n  background: transparent;\n}' },
  { key: 'quotes', css: '.mes_text q {\n  background: color-mix(in srgb, var(--tap-quotes) 12%, transparent);\n  border-radius: 3px;\n  padding: 0 3px;\n}' },
]

/**
 * "Chat CSS" in the chat menu: a stylesheet for this one chat. What is typed shows in the chat at once (`onDraft`);
 * Save keeps it in the chat's file, closing the sheet without saving puts the chat back as it was. It comes after the
 * global Custom CSS and the character's CSS, so it wins where they disagree.
 */
export function ChatCssSheet({ open, onOpenChange, saved, onDraft, onSave }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** the CSS kept for this chat */
  saved: string
  /** the text now in the box (valid CSS only), null = show what is saved */
  onDraft: (css: string | null) => void
  onSave: (css: string) => void
}) {
  const t = useT()
  const [draft, setDraft] = useState(saved)
  useEffect(() => { if (open) setDraft(saved) }, [open, saved])
  useEffect(() => { if (!open) onDraft(null) }, [open, onDraft])

  const error = lintCss(draft)
  const dirty = draft !== saved
  const change = (css: string) => {
    setDraft(css)
    onDraft(lintCss(css) ? null : css)
  }
  const insert = (css: string) => change(draft.trim() ? `${draft.replace(/\s+$/, '')}\n\n${css}` : css)
  const save = () => {
    if (error) { toast.error(error); return }
    onSave(draft)
    toast.success(draft.trim() ? t('chatCss.saved') : t('chatCss.cleared'))
    onOpenChange(false)
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md" overlayClassName="md:bg-transparent md:supports-backdrop-filter:backdrop-blur-none">
        <SheetHeader>
          <SheetTitle>{t('chatCss.title')}</SheetTitle>
          <SheetDescription>{t('chatCss.hint')}</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-4">
          <Textarea
            value={draft}
            onChange={(ev) => change(ev.target.value.slice(0, CHAT_CSS_MAX))}
            rows={12}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder={t('chatCss.placeholder')}
            aria-label={t('chatCss.title')}
            data-testid="chat-css-text"
            className="max-h-[50dvh] min-h-48 overflow-y-auto font-mono text-caption"
          />
          {error && (
            <p className="flex items-center gap-1 text-caption text-destructive"><Warning className="size-3.5 shrink-0" aria-hidden="true" />{error}</p>
          )}
          <p className="text-caption text-muted-foreground">{t('chatCss.live')}</p>
          <div className="flex flex-col gap-1.5">
            <span className="text-caption font-medium">{t('chatCss.examples')}</span>
            <div className="flex flex-wrap gap-1.5">
              {CHAT_CSS_EXAMPLES.map((ex) => (
                <Button key={ex.key} variant="outline" size="sm" className="text-caption max-md:h-10" onClick={() => insert(ex.css)}>
                  {t(`chatCss.ex.${ex.key}` as const)}
                </Button>
              ))}
            </div>
          </div>
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
            <Button className="max-md:h-10" disabled={!dirty || !!error} onClick={save}>{t('chatCss.save')}</Button>
            <Button variant="outline" className="max-md:h-10" disabled={!dirty} onClick={() => change(saved)}>{t('chatCss.revert')}</Button>
            <Button variant="ghost" className="max-md:h-10" disabled={!draft.trim() && !saved.trim()} onClick={() => change('')}>{t('chatCss.clear')}</Button>
            <span className="ml-auto text-caption text-muted-foreground">{draft.length} / {CHAT_CSS_MAX}</span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
