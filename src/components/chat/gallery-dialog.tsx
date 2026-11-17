import { useState } from 'react'
import { CaretLeft, CaretRight, Paperclip } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useT } from '@/hooks/use-t'
import { useApp } from '@/lib/store'
import type { Character, ID } from '@/lib/types'

type Item = Character['gallery'][number] & { owner: string }

/** The gallery of whoever is in the chat: the character, or every member of a
 *  group. Reachable in chat as /gallery so reference art is one command away
 *  mid-scene instead of a trip through the character editor. */
export function GalleryDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  characterId: ID | null
  onAttach?: (item: { url: string; name: string; type: string }) => void
}) {
  const t = useT()
  const characters = useApp((s) => s.characters)
  const [lightboxId, setLightboxId] = useState<ID | null>(null)

  const character = characters.find((c) => c.id === props.characterId)
  const owners: Character[] = character?.isGroup
    ? (character.members ?? []).map((id) => characters.find((c) => c.id === id)).filter((c): c is Character => !!c)
    : character
      ? [character]
      : []
  const items: Item[] = owners.flatMap((o) => o.gallery.map((g) => ({ ...g, owner: o.name })))

  const at = items.findIndex((g) => g.id === lightboxId)
  const open = at >= 0 ? items[at]! : null

  return (
    <>
      <Dialog open={props.open} onOpenChange={props.onOpenChange}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{character ? t('gal.title', { name: character.name }) : t('gal.titleBare')}</DialogTitle>
          </DialogHeader>
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t('gal.empty')}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {items.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setLightboxId(g.id)}
                  className="relative aspect-square overflow-hidden rounded-md border border-border transition-opacity hover:opacity-85"
                  aria-label={t('gal.open', { name: g.caption || t('gal.item') })}
                >
                  {g.type === 'video' ? (
                    <video src={g.url} className="size-full object-cover" muted playsInline />
                  ) : (
                    <img src={g.url} alt={g.caption} className="size-full object-cover" loading="lazy" />
                  )}
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!open} onOpenChange={(o) => { if (!o) setLightboxId(null) }}>
        <DialogContent className="w-full max-w-[min(92vw,900px)] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-normal">
              {t('gal.position', { name: open?.caption || open?.owner || '', n: at + 1, total: items.length })}
            </DialogTitle>
          </DialogHeader>
          {open && (
            <>
              {open.type === 'video' ? (
                <video src={open.url} className="max-h-[65dvh] w-full rounded-md object-contain" controls playsInline />
              ) : (
                <img src={open.url} alt={open.caption} className="max-h-[65dvh] w-full rounded-md object-contain" />
              )}
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={at <= 0} onClick={() => setLightboxId(items[at - 1]!.id)} aria-label={t('gal.prev')}>
                  <CaretLeft className="size-4" aria-hidden="true" />
                </Button>
                <Button variant="outline" size="sm" disabled={at >= items.length - 1} onClick={() => setLightboxId(items[at + 1]!.id)} aria-label={t('gal.next')}>
                  <CaretRight className="size-4" aria-hidden="true" />
                </Button>
                {props.onAttach && open.type === 'image' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="ml-auto"
                    onClick={() => {
                      props.onAttach?.({ url: open.url, name: open.caption || t('gal.imageName'), type: 'image/*' })
                      setLightboxId(null)
                      props.onOpenChange(false)
                    }}
                  >
                    <Paperclip className="size-4" aria-hidden="true" />
                    {t('gal.attach')}
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
