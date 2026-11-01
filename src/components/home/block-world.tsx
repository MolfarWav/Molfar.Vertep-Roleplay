// Create a world: a tile on a picture from the library's backgrounds (drawn once per visit, the shuffle button picks
// another) or on a plain tone when there are none. The button on the art is the onImage variant.

import { Globe, Plus, Shuffle } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import { BlockCard } from '@/components/home/home-frame'
import { useVisitPick } from '@/components/home/use-visit-pick'

export interface WorldViewProps {
  background: { url: string; name: string } | null
  onOpen: () => void
  /** shown only when there is more than one picture to pick from */
  onShuffle?: () => void
}

export function WorldView({ background, onOpen, onShuffle }: WorldViewProps) {
  const t = useT()
  return (
    <BlockCard className="relative isolate min-h-[240px] overflow-hidden text-white">
      {background ? (
        <>
          <img src={background.url} alt="" aria-hidden="true" className="absolute inset-0 -z-10 size-full object-cover" />
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/40 to-black/10" />
        </>
      ) : (
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-br from-teal-600 via-teal-900 to-slate-900" />
      )}
      <div className="mt-auto flex flex-col gap-2 p-5">
        <p className="flex items-center gap-1.5 text-caption font-semibold uppercase opacity-90">
          <Globe aria-hidden="true" className="size-4" /> {t('nav.world')}
        </p>
        <h3 className="font-heading text-display leading-tight [text-shadow:0_1px_8px_rgb(0_0_0/0.5)]">{t('home.createWorld')}</h3>
        <p className="text-body opacity-90">{t('home.worldText')}</p>
        {background && <p className="sr-only">{t('home.worldBackground', { name: background.name })}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button variant="onImage" size="lg" onClick={onOpen}>
            <Plus aria-hidden="true" /> {t('home.openWorld')}
          </Button>
          {onShuffle && (
            <Button
              variant="outline"
              size="icon"
              className="size-11 border-white/40 bg-black/30 text-white hover:bg-black/50 hover:text-white max-md:size-11"
              aria-label={t('home.shuffleBackground')}
              title={background ? t('home.worldBackground', { name: background.name }) : t('home.shuffleBackground')}
              onClick={onShuffle}
            >
              <Shuffle aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
    </BlockCard>
  )
}

export function WorldBlock() {
  const navigate = useApp((s) => s.navigate)
  const backgrounds = useApp((s) => s.backgrounds)
  const pictures = backgrounds.filter((b) => b.type === 'image' && b.url)
  const { index, another } = useVisitPick(pictures.length)
  const pick = index >= 0 ? pictures[index] : undefined
  return (
    <WorldView
      background={pick ? { url: pick.url, name: pick.name } : null}
      onOpen={() => navigate('world')}
      onShuffle={pictures.length > 1 ? another : undefined}
    />
  )
}
