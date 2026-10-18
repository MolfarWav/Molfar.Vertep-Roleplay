import { useEffect, useState } from 'react'
import { MagnifyingGlassMinus, MagnifyingGlassPlus } from '@phosphor-icons/react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

/**
 * A picture at full size: fitted to the screen first, then "Actual size"
 * shows every pixel (scroll to move around). For portraits, sprites and
 * gallery items, whose thumbnails are too small to judge a picture by.
 */
export function ImageViewer({ src, title, onClose }: { src: string | null; title: string; onClose: () => void }) {
  const [actual, setActual] = useState(false)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => { setActual(false); setSize(null) }, [src])
  return (
    <Dialog open={!!src} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-auto max-w-[calc(100vw-1rem)] flex-col gap-2 p-2 sm:max-w-[calc(100vw-2rem)]">
        <div className="flex items-center gap-2 pr-9">
          <DialogTitle className="min-w-0 flex-1 truncate text-sm">{title}</DialogTitle>
          {size && <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{size.w}×{size.h}</span>}
          <Button variant="outline" size="sm" className="h-8 shrink-0 text-xs" onClick={() => setActual((v) => !v)} aria-pressed={actual}>
            {actual ? <MagnifyingGlassMinus className="size-4" aria-hidden="true" /> : <MagnifyingGlassPlus className="size-4" aria-hidden="true" />}
            {actual ? 'Fit' : 'Actual size'}
          </Button>
        </div>
        {src && (
          <div className={actual ? 'max-h-[calc(100dvh-5rem)] max-w-[calc(100vw-2rem)] overflow-auto overscroll-contain rounded-md' : 'flex items-center justify-center'}>
            <img
              src={src}
              alt={title}
              onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              onClick={() => setActual((v) => !v)}
              className={actual ? 'max-w-none cursor-zoom-out' : 'max-h-[calc(100dvh-5rem)] max-w-full cursor-zoom-in rounded-md object-contain'}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
