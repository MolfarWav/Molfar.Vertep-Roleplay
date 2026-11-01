// What's new: the newest release notes, from the same tips the What's new card shows, so it works offline. The
// link goes to the project's releases page (the repository in manifest.json).

import { ArrowSquareOut, Newspaper } from '@phosphor-icons/react'
import { Chip } from '@/components/ui/section'
import { TIPS } from '@/lib/guide-tips'
import { tipText } from '@/lib/guide'
import { latestTips, RELEASES_URL } from '@/lib/home-pick'
import { useT } from '@/hooks/use-t'
import { BlockCard, BlockHead, useLang } from '@/components/home/home-frame'

export interface NewsItem {
  id: string
  version: string
  title: string
  body: string
}

export function NewsView({ items, releasesUrl }: { items: NewsItem[]; releasesUrl: string }) {
  const t = useT()
  return (
    <BlockCard>
      <BlockHead
        tone="slate"
        icon={Newspaper}
        title={t('guide.whatsNew')}
        aside={
          <a href={releasesUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-caption font-medium hover:bg-accent md:min-h-8">
            {t('home.allReleases')} <ArrowSquareOut aria-hidden="true" className="size-3.5" />
          </a>
        }
      />
      <ul className="flex flex-col divide-y divide-border">
        {items.map((n) => (
          <li key={n.id} className="flex flex-col gap-1 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Chip>{t('home.version', { v: n.version })}</Chip>
              <span className="text-body font-medium">{n.title}</span>
            </div>
            <p className="line-clamp-2 text-body text-muted-foreground">{n.body}</p>
          </li>
        ))}
      </ul>
    </BlockCard>
  )
}

export function NewsBlock() {
  const lang = useLang()
  const items = latestTips(TIPS, 3).map((tip) => ({
    id: tip.id,
    version: tip.since ?? '',
    title: tipText(tip.title, lang),
    body: tipText(tip.body, lang),
  }))
  return <NewsView items={items} releasesUrl={RELEASES_URL} />
}
