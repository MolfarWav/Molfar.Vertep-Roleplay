// The help list ("?" in the rail): every help tip of the guide, searchable, grouped.
// A dialog on desktop, a full-height bottom sheet on phones. "Show me" hands the tip to
// the guide host, which closes the list, opens the place and points at the element.
import { useCallback, useMemo, useRef, useState } from 'react'
import { CaretDown, MagnifyingGlass } from '@phosphor-icons/react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useT } from '@/hooks/use-t'
import { HELP_GROUPS, canShowMe, searchHelp, tipText, type HelpGroup, type Text, type Tip } from '@/lib/guide'
import type { Lang, MsgKey } from '@/lib/i18n'
import { TIPS } from '@/lib/guide-tips'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'

const GROUP_KEY: Record<HelpGroup, MsgKey> = {
  chat: 'guide.group.chat',
  story: 'guide.group.story',
  characters: 'guide.group.characters',
  world: 'guide.group.world',
  canvas: 'guide.group.canvas',
  setup: 'guide.group.setup',
  help: 'guide.group.help',
}

const TIPS_BY_ID = new Map(TIPS.map((tip) => [tip.id, tip]))

/** An article's long text: paragraphs split on a blank line, a run of "- " lines is a list. */
function ArticleText({ text, lang }: { text: Text; lang: Lang }) {
  const blocks = tipText(text, lang).split(/\n{2,}/)
  return (
    <div className="flex flex-col gap-2">
      {blocks.map((block, i) => {
        const lines = block.split('\n')
        if (lines.every((line) => line.startsWith('- '))) {
          return (
            <ul key={i} className="list-disc pl-5">
              {lines.map((line, k) => (
                <li key={k}>{line.slice(2)}</li>
              ))}
            </ul>
          )
        }
        return <p key={i}>{block}</p>
      })}
    </div>
  )
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
  const hasChats = useApp((s) => s.chats.length > 0)
  const searchRef = useRef<HTMLInputElement>(null)
  const found = useMemo(() => searchHelp(TIPS, p.query), [p.query])
  // With a query the list is one ranked run (the best match first); without one it is grouped.
  const ranked = p.query.trim() !== ''
  const groups = ranked
    ? [{ id: undefined, tips: found }].filter((g) => g.tips.length > 0)
    : HELP_GROUPS.map((g) => ({ id: g as HelpGroup | undefined, tips: found.filter((tip) => tip.help === g) })).filter((g) => g.tips.length > 0)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const toggle = (id: string) =>
    setExpanded((cur) => {
      const next = new Set(cur)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const listed = useMemo(() => new Set(TIPS.filter((tip) => tip.help).map((tip) => tip.id)), [])
  /** A "See also" link: clear the search so the target is in the list, open it, scroll to it. */
  const jump = useCallback(
    (id: string) => {
      p.onQuery('')
      setExpanded((cur) => new Set(cur).add(id))
      requestAnimationFrame(() =>
        requestAnimationFrame(() => document.querySelector(`[data-help-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'start' })),
      )
    },
    [p],
  )

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
            <section key={g.id ?? 'ranked'} className="mb-4 last:mb-0" aria-labelledby={g.id ? `help-group-${g.id}` : undefined}>
              {g.id && (
                <h3 id={`help-group-${g.id}`} className="sticky top-0 z-10 bg-popover py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t(GROUP_KEY[g.id])}
                </h3>
              )}
              <ul className="flex flex-col divide-y divide-border">
                {g.tips.map((tip) => {
                  const open = expanded.has(tip.id)
                  const related = (tip.related ?? []).filter((id) => listed.has(id) && id !== tip.id)
                  return (
                    <li key={tip.id} data-help-id={tip.id} className="flex scroll-mt-10 flex-col gap-1.5 py-3 first:pt-1.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="font-heading text-[16px] leading-tight text-foreground">{tipText(tip.helpTitle ?? tip.title, p.lang)}</div>
                        {ranked && tip.help && <span className="shrink-0 text-xs text-muted-foreground">{t(GROUP_KEY[tip.help])}</span>}
                      </div>
                      <p className="text-sm leading-relaxed text-muted-foreground">{tipText(tip.helpBody ?? tip.body, p.lang)}</p>
                      {(tip.details || tip.open || tip.target) && (
                        <div className="flex flex-wrap items-center gap-2">
                          {tip.details && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="-ml-2 max-md:h-10"
                              aria-expanded={open}
                              aria-controls={`help-more-${tip.id}`}
                              onClick={() => toggle(tip.id)}
                            >
                              {t(open ? 'guide.help.less' : 'guide.help.more')}
                              <CaretDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden="true" />
                            </Button>
                          )}
                          {(tip.open || tip.target) &&
                            (canShowMe(tip.open, { hasChats, narrow: p.mobile }) ? (
                              <Button variant="outline" size="sm" className="max-md:h-10" onClick={() => p.onShowMe(tip)}>
                                {t('guide.showMe')}
                              </Button>
                            ) : (
                              <p className="text-xs text-muted-foreground">{t('guide.needsChat')}</p>
                            ))}
                        </div>
                      )}
                      {open && tip.details && (
                        <div id={`help-more-${tip.id}`} className="flex flex-col gap-2 text-sm leading-relaxed text-foreground/90">
                          {tip.where && (
                            <p className="text-muted-foreground">
                              <span className="font-medium text-foreground">{t('guide.help.where')}:</span> {tipText(tip.where, p.lang)}
                            </p>
                          )}
                          <ArticleText text={tip.details} lang={p.lang} />
                          {related.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs text-muted-foreground">{t('guide.help.related')}:</span>
                              {related.map((id) => (
                                <Button key={id} variant="outline" size="sm" className="h-7 px-2 text-xs max-md:h-10" onClick={() => jump(id)}>
                                  {tipText(TIPS_BY_ID.get(id)!.helpTitle ?? TIPS_BY_ID.get(id)!.title, p.lang)}
                                </Button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
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
