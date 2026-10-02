import { Plus } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import { shortModel } from '@/lib/utils'
import { canAskMolfar } from '@/lib/shell-bridge'
import { SectionPage } from '@/components/shell/section-page'
import { HomeHero } from '@/components/home/home-hero'
import { AchievementsBlock, AskMolfarBlock, CreateBlock, MyApps } from '@/components/home/home-blocks'
import { RecentChats } from '@/components/home/recent-chats'

/** Home: continue the latest story, create, ask Molfar, achievements, recent chats, apps. */
export function HomeView() {
  const t = useT()
  const model = useApp((s) => s.model)
  const setView = useApp((s) => s.setView)
  const molfar = canAskMolfar()

  const actions = (
    <>
      <button
        type="button"
        onClick={() => setView('connections')}
        className="hidden max-w-[16rem] truncate rounded-[3px] border border-border bg-secondary px-2.5 py-1 font-mono text-[11.5px] text-muted-foreground transition-colors hover:text-foreground sm:block"
        aria-label={t('nav.connections')}
      >
        {shortModel(model ?? '') || t('home.noModel')}
      </button>
      <Button variant="outline" className="gap-1.5 font-heading text-[14px]" onClick={() => setView('characters')}>
        <Plus aria-hidden="true" /> {t('home.newChat')}
      </Button>
    </>
  )

  return (
    <SectionPage section="home" actions={actions}>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-5 px-4 py-4 md:px-8 md:py-6">
          <HomeHero />
          <div className={molfar ? 'grid gap-4 md:grid-cols-[1.15fr_1.15fr_0.9fr]' : 'grid gap-4 md:grid-cols-[1.15fr_0.9fr]'}>
            <CreateBlock />
            {molfar && <AskMolfarBlock />}
            <AchievementsBlock />
          </div>
          <RecentChats />
          <MyApps />
        </div>
      </ScrollArea>
    </SectionPage>
  )
}
