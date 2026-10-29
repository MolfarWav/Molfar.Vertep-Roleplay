import { useState } from 'react'
import { Brain, CaretRight } from '@phosphor-icons/react'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import type { MemoryOwner } from './memory-api'
import { MemoryPanel } from './memory-panel'

const openKey = (kind: string) => `rp-mem-section:${kind}`
const readOpen = (kind: string) => { try { return sessionStorage.getItem(openKey(kind)) === '1' } catch { return false } }
const writeOpen = (kind: string, on: boolean) => { try { sessionStorage.setItem(openKey(kind), on ? '1' : '0') } catch { /* private window */ } }

/** "Memory across chats" on a persona's page and a saved world's page: a folded section (closed until the
 *  user opens it; remembered for this browser tab) around the same `MemoryPanel` the card's Memory tab uses.
 *  The panel loads only when the section is open, so the page costs nothing until then. */
export function MemorySection({ owner, framed }: { owner: MemoryOwner; /** a bordered box (the persona page) instead of a rule above (the world page) */ framed?: boolean }) {
  const t = useT()
  const [open, setOpen] = useState(() => readOpen(owner.kind))
  const toggle = () => setOpen((v) => { writeOpen(owner.kind, !v); return !v })
  const bodyId = `mem-section-${owner.kind}`
  return (
    <section className={cn('flex flex-col gap-3', framed ? 'rounded-lg border border-border p-3' : 'border-t border-border pt-4')} data-testid={`mem-section-${owner.kind}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={toggle}
        className="flex min-h-10 w-full items-start gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <CaretRight className={cn('mt-1 size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none', open && 'rotate-90')} aria-hidden="true" />
        <Brain className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className={cn('block', framed ? 'text-xs font-semibold uppercase text-muted-foreground' : 'font-heading text-base')}>{t('memx.section')}</span>
          <span className="block text-xs text-muted-foreground">{t(owner.kind === 'world' ? 'memx.section.world' : 'memx.section.persona')}</span>
        </span>
      </button>
      {open && (
        <div id={bodyId}>
          <MemoryPanel owner={owner} />
        </div>
      )}
    </section>
  )
}
