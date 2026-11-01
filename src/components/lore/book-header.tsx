import { useState } from 'react'
import { Copy, DotsThreeVertical, Flask, Trash, Translate, UploadSimple } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/section'
import { Input } from '@/components/ui/input'
import { InfoTip } from '@/components/ui/info-tip'
import { Switch } from '@/components/ui/switch'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { BookTranslateDialog } from '@/components/lore/book-translate-menu'
import { KIND_ICON } from '@/components/lore/lore-kind'
import { entriesKey } from '@/components/lore/lore-labels'
import { useT } from '@/hooks/use-t'
import { exportOneBook } from '@/lib/lore-export'
import { estimateTokens, formatTokens } from '@/lib/tokens'
import { bookKind, bookUsageLabel } from '@/lib/lore-usage'
import type { Character, Lorebook } from '@/lib/types'

/**
 * The book's title row: the name, three chips (entries, tokens, who uses it), the Global switch, "Test triggers" and
 * one "more" menu (translate, export, duplicate, delete). Phone: name, then the chips, then Test triggers and more.
 */
export function BookHeader({ book, characters, onUpdate, onDelete, onDuplicate, onTest }: {
  book: Lorebook
  characters: Character[]
  onUpdate: (p: Partial<Lorebook>) => void
  onDelete: () => void
  onDuplicate: () => void
  onTest: () => void
}) {
  const t = useT()
  const [translateOpen, setTranslateOpen] = useState(false)
  const totalTokens = book.entries.reduce((a, e) => a + estimateTokens(e.content), 0)
  const use = bookUsageLabel(characters, book.id)
  const kind = KIND_ICON[bookKind(characters, book.id)]
  const exportBook = () => exportOneBook(book)
  return (
    <header className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-border px-4 py-3">
      <Input
        value={book.name}
        onChange={(e) => onUpdate({ name: e.target.value })}
        className="order-1 h-9 min-w-0 basis-full text-heading font-medium md:flex-1 md:basis-auto"
        aria-label={t('lore.book.name')}
      />
      <div className="order-2 flex basis-full flex-wrap items-center gap-2 md:order-3">
        <label data-guide="lore.global" title={t('lore.global.tip')} className="inline-flex h-8 items-center gap-2 rounded-full border border-border px-2.5 text-caption max-md:h-10">
          <Switch tone="cta" checked={book.globalActive} onCheckedChange={(v) => onUpdate({ globalActive: v })} aria-label={t('lore.global.label')} />
          {t('lore.global.label')}
        </label>
        <InfoTip label={t('lore.global.label')}>{t('lore.global.info')}</InfoTip>
        <Chip tone="violet">{t(entriesKey(book.entries.length), { n: book.entries.length })}</Chip>
        <Chip tone="amber">{t('lore.header.tokens', { n: formatTokens(totalTokens) })}</Chip>
        <Chip>
          <kind.icon className={`size-3.5 shrink-0 ${kind.cls}`} aria-hidden="true" />
          <span className={use.muted ? 'opacity-70' : undefined}>{t(use.key, use.vars)}</span>
        </Chip>
      </div>
      <div className="order-3 flex flex-1 items-center gap-2 md:order-2 md:flex-none">
        <Button data-guide="lore.test" variant="outline" className="flex-1 max-md:h-10 md:flex-none" onClick={onTest}>
          <Flask className="size-4" aria-hidden="true" />{t('lore.testKeys')}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={
            <Button variant="outline" size="icon" className="max-md:size-10" aria-label={t('lore.header.more')} title={t('lore.header.more')}>
              <DotsThreeVertical className="size-4" aria-hidden="true" />
            </Button>
          } />
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={book.entries.length === 0} onClick={() => setTranslateOpen(true)}>
              <Translate className="size-4" aria-hidden="true" />{t('lore.tr.button')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportBook}>
              <UploadSimple className="size-4" aria-hidden="true" />{t('lore.export')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="size-4" aria-hidden="true" />{t('lore.book.duplicate')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash className="size-4" aria-hidden="true" />{t('lore.book.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <BookTranslateDialog book={book} open={translateOpen} onOpenChange={setTranslateOpen} />
    </header>
  )
}
