// The help list ("?" in the rail): every help tip of the guide, searchable, grouped.
// A dialog on desktop, a full-height bottom sheet on phones. "Show me" hands the tip to
// the guide host, which closes the list, opens the place and points at the element.
import { useMemo, useRef } from 'react'
import { MagnifyingGlass } from '@phosphor-icons/react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useT } from '@/hooks/use-t'
import { HELP_GROUPS, searchHelp, tipText, type HelpGroup, type Tip } from '@/lib/guide'
import type { Lang, MsgKey } from '@/lib/i18n'
import { TIPS } from '@/lib/guide-tips'

const GROUP_KEY: Record<HelpGroup, MsgKey> = {
  chat: 'guide.group.chat',
  story: 'guide.group.story',
  characters: 'guide.group.characters',
  world: 'guide.group.world',
  canvas: 'guide.group.canvas',
  setup: 'guide.group.setup',
  help: 'guide.group.help',
}

interface Props {
  open: boolean
  onClose: () => void
  query: string
  onQuery: (q: string) => void
  onShowMe: (tip: Tip) => void
  /** the footer link: the commands and macros reference */
  onReference: () => void
  lang: Lang
  mobile: boolean
}

export function HelpList(p: Props) {
  const t = useT()
  const searchRef = useRef<HTMLInputElement>(null)
  const found = useMemo(() => searchHelp(TIPS, p.query), [p.query])
  const groups = HELP_GROUPS.map((g) => ({ id: g, tips: found.filter((tip) => tip.help === g) })).filter((g) => g.tips.length > 0)

  const body = (
    <>
      <div className="relative shrink-0 px-4 pb-2">
        <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-7 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          ref={searchRef}
          type="search"
          value={p.query}
          onChange={(e) => p.onQuery(e.target.value)}
          placeholder={t('guide.help.search')}
          aria-label={t('guide.help.search')}
          className="h-10 pl-9 text-base md:h-9 md:text-sm"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4" data-testid="help-results">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center gap-1 px-4 py-10 text-center" role="status">
            <p className="font-heading text-[17px] text-foreground">{t('guide.help.empty')}</p>
            <p className="max-w-xs text-sm text-muted-foreground">{t('guide.help.emptyHint')}</p>
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.id} className="mb-4 last:mb-0" aria-labelledby={`help-group-${g.id}`}>
              <h3 id={`help-group-${g.id}`} className="sticky top-0 z-10 bg-popover py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t(GROUP_KEY[g.id])}
              </h3>
              <ul className="flex flex-col divide-y divide-border">
                {g.tips.map((tip) => (
                  <li key={tip.id} className="flex flex-col gap-1.5 py-3 first:pt-1.5">
                    <div className="font-heading text-[16px] leading-tight text-foreground">{tipText(tip.title, p.lang)}</div>
                    <p className="text-sm leading-relaxed text-muted-foreground">{tipText(tip.body, p.lang)}</p>
                    {(tip.open || tip.target) && (
                      <div>
                        <Button variant="outline" size="sm" className="max-md:h-10" onClick={() => p.onShowMe(tip)}>
                          {t('guide.showMe')}
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
      <div className="shrink-0 border-t border-border px-4 py-2">
        <Button variant="ghost" size="sm" className="-ml-2 max-md:h-10" onClick={p.onReference}>
          {t('guide.help.reference')}
        </Button>
      </div>
    </>
  )

  if (p.mobile) {
    return (
      <Sheet open={p.open} onOpenChange={(o) => { if (!o) p.onClose() }}>
        <SheetContent
          side="bottom"
          className="gap-0 p-0 data-[side=bottom]:h-[100dvh] data-[side=bottom]:max-h-none data-[side=bottom]:rounded-none"
        >
          <SheetHeader className="shrink-0 pr-14">
            <SheetTitle className="font-heading text-lg">{t('guide.help.title')}</SheetTitle>
            <SheetDescription className="sr-only">{t('guide.help.desc')}</SheetDescription>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    )
  }
  return (
    <Dialog open={p.open} onOpenChange={(o) => { if (!o) p.onClose() }}>
      <DialogContent
        initialFocus={searchRef}
        className="flex h-[min(720px,calc(100dvh-4rem))] max-h-none flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogHeader className="shrink-0 px-4 pt-4 pb-3 pr-12">
          <DialogTitle className="font-heading text-lg">{t('guide.help.title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('guide.help.desc')}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  )
}
