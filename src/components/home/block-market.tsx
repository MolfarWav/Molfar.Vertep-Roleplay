// From the Marketplace: a random card from the Marketplace's top listings (one request an hour, shared with the
// Marketplace's own cache rules, see lib/home-market.ts). It says where it comes from, so it is not taken for the
// library. HomeView only renders it when there is a card; a failed or switched-off suggestion leaves no block.

import { ArrowsClockwise, Storefront } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/section'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import { shortCount, type MarketCard } from '@/lib/home-pick'
import { queueMarketOpen } from '@/lib/home-market'
import { ProxyImage } from '@/components/marketplace/proxy-image'
import { BlockCard, BlockHead } from '@/components/home/home-frame'

/** The source's name as a chip; it is a brand, so it is not translated. */
export const MARKET_SOURCE = 'Chub'

export interface MarketViewProps {
  card: MarketCard
  onOpen: () => void
  onAnother: () => void
}

export function MarketView({ card, onOpen, onAnother }: MarketViewProps) {
  const t = useT()
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:flex-row">
      <ProxyImage
        url={card.avatar}
        alt=""
        aria-hidden="true"
        className="aspect-[3/4] w-28 shrink-0 rounded-xl border border-border object-cover max-sm:w-full max-sm:max-w-40"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h4 className="font-heading text-title leading-tight">{card.name}</h4>
        {card.creator && <p className="text-caption text-muted-foreground">{t('home.marketBy', { name: card.creator })}</p>}
        {card.tagline && <p className="line-clamp-2 text-body text-muted-foreground">{card.tagline}</p>}
        <div className="flex flex-wrap gap-1.5">
          <Chip>{MARKET_SOURCE}</Chip>
          {card.downloads > 0 && <Chip>{t('home.downloads', { n: shortCount(card.downloads) })}</Chip>}
        </div>
        {/* Button is nowrap and never shrinks: a long label ("Open in Marketplace", longer in other languages) ran past the card's edge and was
            clipped. The buttons may now wrap their label inside the card, and keep a touch-sized minimum height */}
        <div className="mt-auto flex min-w-0 flex-wrap gap-2 pt-2">
          <Button variant="tonal" className="h-auto min-h-8 max-w-full whitespace-normal px-3 py-1.5 text-left max-md:min-h-10" onClick={onOpen}>
            <Storefront aria-hidden="true" /> {t('home.openMarket')}
          </Button>
          <Button variant="ghost" className="h-auto min-h-8 max-w-full whitespace-normal px-3 py-1.5 text-left max-md:min-h-10" onClick={onAnother}>
            <ArrowsClockwise aria-hidden="true" /> {t('home.another')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function MarketBlock({ card, another }: { card: MarketCard; another: () => void }) {
  const t = useT()
  const navigate = useApp((s) => s.navigate)
  return (
    <BlockCard>
      <BlockHead tone="amber" icon={Storefront} title={t('home.market')} aside={<Chip tone="amber">{t('home.marketTop')}</Chip>} />
      <MarketView
        card={card}
        onOpen={() => {
          // the card's own page opens on arrival, not just the list
          queueMarketOpen(card)
          navigate('marketplace')
        }}
        onAnother={another}
      />
    </BlockCard>
  )
}
