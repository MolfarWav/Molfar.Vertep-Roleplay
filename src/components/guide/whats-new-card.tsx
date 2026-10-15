// The What's new card: one tip at a time, non-modal. A corner card on desktop, a
// bottom sheet on phones. It never opens anything by itself.
import { X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useT } from '@/hooks/use-t'
import { tipText, type Tip } from '@/lib/guide'
import type { Lang } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface Props {
  tips: Tip[]
  index: number
  lang: Lang
  mobile: boolean
  onShowMe: (tip: Tip) => void
  onNext: () => void
  onClose: () => void
}

export function WhatsNewCard({ tips, index, lang, mobile, onShowMe, onNext, onClose }: Props) {
  const t = useT()
  const tip = tips[index]
  if (!tip) return null
  const last = index === tips.length - 1
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="guide-card-title"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}
      className={cn(
        'fixed z-[60] flex flex-col gap-2 border border-border bg-card p-4 text-card-foreground shadow-lg',
        mobile
          ? 'inset-x-0 bottom-0 rounded-t-xl border-x-0 border-b-0 pb-[calc(env(safe-area-inset-bottom)+1rem)]'
          : 'right-4 bottom-20 w-[340px] max-w-[calc(100vw-2rem)] rounded-xl',
      )}
    >
      <div className="flex items-center gap-2">
        <h2 id="guide-card-title" className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('guide.whatsNew')}
        </h2>
        {tips.length > 1 && (
          <span className="shrink-0 text-xs text-muted-foreground">{t('guide.counter', { n: index + 1, total: tips.length })}</span>
        )}
        <Button variant="ghost" size="icon-sm" className="-mr-1 shrink-0 max-md:size-10" onClick={onClose} aria-label={t('guide.close')}>
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="font-heading text-[17px] leading-tight text-foreground">{tipText(tip.title, lang)}</div>
      <p className="text-sm leading-relaxed text-muted-foreground">{tipText(tip.body, lang)}</p>
      <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
        {tip.open && (
          <Button variant="outline" size="sm" className="max-md:h-10" onClick={() => onShowMe(tip)}>
            {t('guide.showMe')}
          </Button>
        )}
        <Button size="sm" className="max-md:h-10" onClick={last ? onClose : onNext}>
          {last ? t('guide.gotIt') : t('guide.next')}
        </Button>
      </div>
    </div>
  )
}
