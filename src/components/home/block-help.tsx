// Did you know?: one tip from the guide's registry, drawn once per visit (tips the user has not had in What's new yet
// first, newest release first). Show me takes the user to the tip's place with its spotlight; Next tip draws another.

import { useMemo } from 'react'
import { Lightbulb, Play, ShuffleSimple } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import { useIsMobile } from '@/hooks/use-mobile'
import { TIPS } from '@/lib/guide-tips'
import { canShowMe, tipText, type Tip } from '@/lib/guide'
import { tipPool } from '@/lib/home-pick'
import { GUIDE_SHOW_EVENT } from '@/components/guide/events'
import { BlockCard, BlockHead, useLang } from '@/components/home/home-frame'
import { useVisitPick } from '@/components/home/use-visit-pick'

export interface TipViewProps {
  title: string
  body: string
  where?: string
  /** a button, a line saying a chat is needed first, or nothing (the tip has no place to show) */
  showMe: 'button' | 'needsChat' | 'none'
  onShowMe: () => void
  onNext: () => void
  onAll: () => void
}

export function TipView({ title, body, where, showMe, onShowMe, onNext, onAll }: TipViewProps) {
  const t = useT()
  return (
    <BlockCard>
      <BlockHead
        tone="teal"
        icon={Lightbulb}
        title={t('home.help')}
        aside={<Button variant="ghost" size="sm" className="max-md:h-10" onClick={onAll}>{t('home.allHelp')}</Button>}
      />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <h4 className="font-heading text-heading leading-snug">{title}</h4>
        <p className="text-body">{body}</p>
        {where && <p className="text-caption text-muted-foreground">{t('guide.help.where')}: {where}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          {showMe === 'button' && (
            <Button variant="tonal" className="max-md:h-10" onClick={onShowMe}>
              <Play weight="fill" aria-hidden="true" /> {t('guide.showMe')}
            </Button>
          )}
          {showMe === 'needsChat' && <p className="text-caption text-muted-foreground">{t('guide.needsChat')}</p>}
          <Button variant="ghost" className="max-md:h-10" onClick={onNext}>
            <ShuffleSimple aria-hidden="true" /> {t('home.nextTip')}
          </Button>
        </div>
      </div>
    </BlockCard>
  )
}

export function HelpBlock() {
  const t = useT()
  const lang = useLang()
  const mobile = useIsMobile()
  const hasChats = useApp((s) => s.chats.length > 0)
  const setHelpOpen = useApp((s) => s.setGuideHelpOpen)
  const seen = useApp((s) => s.settings.guide?.seen)
  const pool = useMemo(() => tipPool(TIPS, seen ?? []), [seen])
  const { index, another } = useVisitPick(pool.length)
  const tip: Tip | undefined = index >= 0 ? pool[index] : undefined
  if (!tip) return null
  const showMe = !(tip.open || tip.target) ? 'none' : canShowMe(tip.open, { hasChats, narrow: mobile }) ? 'button' : 'needsChat'
  return (
    <TipView
      title={tipText(tip.helpTitle ?? tip.title, lang)}
      body={tipText(tip.helpBody ?? tip.body, lang)}
      where={tip.where ? tipText(tip.where, lang) : undefined}
      showMe={showMe}
      onShowMe={() => window.dispatchEvent(new CustomEvent(GUIDE_SHOW_EVENT, { detail: { id: tip.id } }))}
      onNext={another}
      onAll={() => setHelpOpen(true)}
    />
  )
}
