// Home: a bento of blocks (docs/UI-CATALOG.md 7.5, 8). The order, the widths and the hidden blocks are the user's
// (Customize), kept in the settings; lib/home-layout.ts has the rules. Continue is the page's one filled button.

import { useMemo, useState } from 'react'
import { Gear, PencilSimple } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import type { MsgKey } from '@/lib/i18n'
import { cn, shortModel } from '@/lib/utils'
import { canOpenModelSettings, openModelSettings } from '@/lib/shell-bridge'
import { SectionPage } from '@/components/shell/section-page'
import {
  SPAN_CLASS, cycleSize, hideBlock, hiddenBlocks, moveBlock, resetHomeLayout, restoreBlock, setMarketSuggest,
  shownBlocks, sizeOf, sanitizeHomeLayout, type HomeBlockId, type HomeLayout,
} from '@/lib/home-layout'
import { useMarketSuggest } from '@/lib/home-market'
import { ContinueBlock } from '@/components/home/block-continue'
import { LibraryBlock } from '@/components/home/block-library'
import { MarketBlock } from '@/components/home/block-market'
import { WorldBlock } from '@/components/home/block-world'
import { WaitingBlock } from '@/components/home/block-waiting'
import { QuestsBlock } from '@/components/home/block-quests'
import { FavouritesBlock } from '@/components/home/block-favourites'
import { NewsBlock } from '@/components/home/block-news'
import { HelpBlock } from '@/components/home/block-help'
import { EditBar, CustomizePanel } from '@/components/home/home-edit'
import { WithMolfarButton } from '@/components/home/home-actions'

/** The name a block goes by in the tray and on its tools. */
const BLOCK_NAME: Record<HomeBlockId, MsgKey> = {
  continue: 'home.pickUp',
  library: 'home.library',
  market: 'home.market',
  world: 'home.createWorld',
  waiting: 'inbox.title',
  quests: 'home.quests',
  favourites: 'home.favourites',
  news: 'guide.whatsNew',
  help: 'home.help',
}

/** Home: the blocks in the user's order, Customize to move, resize and hide them. */
export function HomeView() {
  const t = useT()
  const model = useApp((s) => s.model)
  const navigate = useApp((s) => s.navigate)
  const updateSettings = useApp((s) => s.updateSettings)
  const stored = useApp((s) => s.settings.homeLayout)
  const layout: HomeLayout = useMemo(() => sanitizeHomeLayout(stored), [stored])
  const [editing, setEditing] = useState(false)
  const market = useMarketSuggest(layout.marketSuggest !== false)
  const shown = shownBlocks(layout, market.card !== null)
  const write = (next: HomeLayout) => updateSettings({ homeLayout: next })

  const actions = (
    <>
      <button
        type="button"
        // 0.9.2: models are chosen and set up in the shell's Settings
        onClick={() => {
          const hint = () => toast.info('Models are set up in the main Settings, under Connections.')
          if (!canOpenModelSettings()) { hint(); return }
          void openModelSettings(model).catch(hint)
        }}
        className="block max-w-[9rem] truncate rounded-lg border border-border bg-secondary px-2.5 py-1 font-mono text-caption text-muted-foreground transition-colors hover:text-foreground max-md:h-10 sm:max-w-[16rem]"
        aria-label={`${t('nav.connections')}: ${shortModel(model ?? '') || t('home.noModel')}`}
      >
        {shortModel(model ?? '') || t('home.noModel')}
      </button>
      {/* the Roleplay settings page has no rail item (docs/UI-CATALOG.md 8.2): this is its door until the shell's Settings lists it */}
      <Button variant="ghost" className="gap-1.5 max-md:h-10 max-md:w-10 max-md:px-0" data-guide="home.settings" aria-label={t('nav.settings')} title={t('nav.settings')} onClick={() => navigate('settings')}>
        <Gear aria-hidden="true" /> <span className="max-md:sr-only">{t('nav.settings')}</span>
      </Button>
      <WithMolfarButton />
      {!editing && (
        <Button variant="outline" className="gap-1.5 max-md:h-10" data-guide="home.customize" aria-expanded={editing} onClick={() => setEditing(true)}>
          <PencilSimple aria-hidden="true" /> {t('home.customize')}
        </Button>
      )}
    </>
  )

  const hidden = hiddenBlocks(layout).map((id) => ({ id, name: t(BLOCK_NAME[id]) }))

  const renderBlock = (id: HomeBlockId) => {
    switch (id) {
      case 'continue': return <ContinueBlock />
      case 'library': return <LibraryBlock />
      case 'market': return market.card ? <MarketBlock card={market.card} another={market.another} /> : null
      case 'world': return <WorldBlock />
      case 'waiting': return <WaitingBlock />
      case 'quests': return <QuestsBlock />
      case 'favourites': return <FavouritesBlock />
      case 'news': return <NewsBlock />
      case 'help': return <HelpBlock />
    }
  }

  return (
    <SectionPage section="home" actions={actions} flowActions>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-6 px-4 py-4 md:px-8 md:py-6">
          {editing && (
            <CustomizePanel
              hidden={hidden}
              marketSuggest={layout.marketSuggest !== false}
              onRestore={(id) => write(restoreBlock(layout, id as HomeBlockId))}
              onMarketSuggest={(on) => write(setMarketSuggest(layout, on))}
              onReset={() => write(resetHomeLayout(layout))}
              onDone={() => setEditing(false)}
            />
          )}
          <div className="grid grid-flow-dense grid-cols-1 gap-4 md:grid-cols-12">
            {shown.map((id, i) => {
              const size = sizeOf(layout, id)
              return (
                <div key={id} className={cn('flex min-w-0 flex-col gap-2', SPAN_CLASS[size])}>
                  {editing && (
                    <EditBar
                      name={t(BLOCK_NAME[id])}
                      canEarlier={i > 0}
                      canLater={i < shown.length - 1}
                      size={size}
                      onEarlier={() => write(moveBlock(layout, id, -1))}
                      onLater={() => write(moveBlock(layout, id, 1))}
                      onSize={() => write(cycleSize(layout, id))}
                      onHide={() => write(hideBlock(layout, id))}
                    />
                  )}
                  {renderBlock(id)}
                </div>
              )
            })}
          </div>
        </div>
      </ScrollArea>
    </SectionPage>
  )
}

