import { useEffect, useId, useRef } from 'react'
import { Copy, DotsThreeVertical, Trash, Warning, X } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Segmented } from '@/components/ui/setting-row'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { TONES } from '@/components/ui/tone'
import { EntryFolds } from '@/components/lore/entry-folds'
import { KeyChips } from '@/components/lore/key-chips'
import { useT } from '@/hooks/use-t'
import { APPEARANCE_HINT_KEY, APPEARANCE_KEY, APPEARANCES, appearanceOf, statusOf, type Appearance } from '@/lib/lore-entry'
import { estimateTokens, formatTokens } from '@/lib/tokens'
import type { LoreEntry } from '@/lib/types'
import { needsKeys } from '@/lib/lore-filters'

/**
 * The entry panel: a side panel over the book page on desktop (non-modal: the list stays in use and an entry row opens
 * another entry), a full page on a phone. The top has the title, the on switch, a "more" menu (copy, duplicate, delete)
 * and Close. Then the three things most people change (content, when it appears, keys), then the five folds. Edits
 * are saved as the person types, through `onChange`, as they always were. Escape closes it.
 */
export function EntryEditor({ entry: e, onChange, onDelete, onDuplicate, onCopyToBook, onClose }: {
  entry: LoreEntry
  onChange: (p: Partial<LoreEntry>) => void
  onDelete: () => void
  onDuplicate: () => void
  onCopyToBook: () => void
  onClose: () => void
}) {
  const t = useT()
  const ids = useId()
  const panelRef = useRef<HTMLElement>(null)
  const appearance: Appearance = appearanceOf(e.status)

  // opening the panel puts the focus in it (no field is focused: phone keyboards)
  useEffect(() => { panelRef.current?.focus({ preventScroll: true }) }, [e.id])

  // Escape closes the panel wherever the focus is (the list too). It is taken in the capture phase, so the book's
  // drawer does not also close; while a menu, select, popover or dialog has the focus, Escape is theirs.
  useEffect(() => {
    const onKey = (ev: globalThis.KeyboardEvent) => {
      if (ev.key !== 'Escape' || ev.defaultPrevented) return
      const focus = document.activeElement
      if (focus?.closest?.('[data-slot="popover-content"],[data-slot="select-content"],[data-slot="dropdown-menu-content"],[data-slot="dialog-content"],[data-slot="alert-dialog-content"]')) return
      ev.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="false"
      aria-label={t('lore.ed.panel')}
      data-testid="entry-panel"
      className="absolute inset-0 z-20 flex min-h-0 min-w-0 flex-col bg-background outline-none @[680px]:static @[680px]:z-auto @[680px]:shrink @[680px]:basis-[440px] @[680px]:min-w-[320px] @[680px]:border-l @[680px]:border-border"
    >
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Input
          value={e.title}
          onChange={(ev) => onChange({ title: ev.target.value })}
          aria-label={t('lore.ed.title')}
          className="h-8 min-w-0 flex-1 text-body font-medium max-md:h-10"
        />
        <Switch tone="cta" checked={e.enabled} onCheckedChange={(v) => onChange({ enabled: v })} aria-label={t('lore.entry.enable', { title: e.title })} />
        <DropdownMenu>
          <DropdownMenuTrigger render={
            <Button variant="ghost" size="icon" className="max-md:size-10" aria-label={t('lore.ed.menu')} title={t('lore.ed.menu')}>
              <DotsThreeVertical className="size-4" aria-hidden="true" />
            </Button>
          } />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onCopyToBook}>
              <Copy className="size-4" aria-hidden="true" />{t('lore.ed.copyToBook')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="size-4" aria-hidden="true" />{t('lore.ed.duplicate')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash className="size-4" aria-hidden="true" />{t('lore.ed.deleteEntry')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon" className="max-md:size-10" onClick={onClose} aria-label={t('lore.ed.close')} title={t('lore.ed.close')}>
          <X className="size-4" aria-hidden="true" />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 py-4">
        <section className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`${ids}-content`}>{t('lore.ed.content')}</Label>
            <Badge variant="outline" className="text-caption font-normal">{t('lore.header.tokens', { n: formatTokens(estimateTokens(e.content)) })}</Badge>
          </div>
          <Textarea
            id={`${ids}-content`}
            value={e.content}
            rows={6}
            onChange={(ev) => onChange({ content: ev.target.value })}
            className="min-h-32 text-body"
          />
        </section>

        <section className="flex flex-col gap-1.5">
          <span id={`${ids}-appears`} className="text-body font-medium">{t('lore.ed.appears')}</span>
          <Segmented
            label={t('lore.ed.appears')}
            value={appearance}
            options={APPEARANCES.map((a) => ({ id: a, label: t(APPEARANCE_KEY[a]), className: 'flex-1 justify-center' }))}
            onChange={(a) => onChange({ status: statusOf(a) })}
            className="flex w-full"
          />
          <p className="text-caption text-muted-foreground">{t(APPEARANCE_HINT_KEY[appearance])}</p>
        </section>

        <section className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`${ids}-keys`}>{t('lore.ed.keys')}</Label>
            <label className="flex min-h-10 items-center gap-2 text-caption text-muted-foreground md:min-h-8">
              <Switch tone="cta" checked={e.keysRegex} onCheckedChange={(v) => onChange({ keysRegex: v })} aria-label={t('lore.ed.regex')} />
              {t('lore.ed.regex')}
            </label>
          </div>
          <KeyChips
            id={`${ids}-keys`}
            keys={e.keys}
            onChange={(keys) => onChange({ keys })}
            label={t('lore.ed.keys')}
            placeholder={t('lore.ed.keysPlaceholder')}
          />
          <p className="text-caption text-muted-foreground">{t('lore.ed.keysHint')}</p>
          {needsKeys(e) && (
            <p className={`flex items-center gap-1 text-caption ${TONES.amber.ink}`}>
              <Warning className="size-3.5 shrink-0" aria-hidden="true" />
              {t('lore.ed.noKeysWarn')}
            </p>
          )}
        </section>

        <EntryFolds entry={e} onChange={onChange} />

        <p className="text-caption text-muted-foreground">{t('lore.ed.saved')}</p>
      </div>
    </aside>
  )
}

