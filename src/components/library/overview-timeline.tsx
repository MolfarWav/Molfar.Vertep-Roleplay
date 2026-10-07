import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import type { LitChapter, LitFact, LitSkipped } from './litopys-api'
import { ChapterRow } from './ledger-chapters'
import { FactItem, type FactControls, type TabProps } from './ledger-facts'

const SHOWN = 4

/** Up to SHOWN facts, the rest behind "Show all". */
function FactStack({ facts, ctl, slot }: { facts: LitFact[]; ctl: FactControls; slot: string }) {
  const t = useT()
  const [all, setAll] = useState(false)
  if (!facts.length) return null
  const shown = all ? facts : facts.slice(0, SHOWN)
  return (
    <div className="flex flex-col gap-1.5">
      {shown.map((f) => (
        <FactItem key={f.id} fact={f} ctl={ctl} compact slot={slot} />
      ))}
      {facts.length > SHOWN && !all && (
        <Button variant="ghost" size="xs" className="self-start" onClick={() => setAll(true)}>
          {t('lit.ov.showAll', { n: facts.length })}
        </Button>
      )}
    </div>
  )
}

/** A node on the line: a dot whose look says the chapter's state. */
function Node({ tone, children }: { tone: 'ok' | 'stale' | 'edited' | 'gap' | 'open'; children: React.ReactNode }) {
  return (
    <li className="relative pl-6">
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-3 left-[3px] size-2.5 rounded-full',
          tone === 'ok' && 'bg-primary',
          tone === 'stale' && 'bg-amber-500',
          tone === 'edited' && 'border-2 border-primary bg-background',
          tone === 'gap' && 'border-2 border-dashed border-muted-foreground bg-background',
          tone === 'open' && 'animate-pulse bg-muted-foreground',
        )}
      />
      {children}
    </li>
  )
}

/**
 * The Overview's timeline (mockup A): chapters in story order, each with the facts written from
 * it, scenes kept out of the record in their place, the scene in progress at the end, and the
 * facts that came from no chapter (the user's, the dashboard's, old Memory) after it.
 */
export function Timeline({ chat, onChat, ctl }: TabProps & { ctl: FactControls }) {
  const t = useT()
  const active = chat.facts.filter((f) => f.status === 'active')
  const ids = new Set(chat.chapters.map((c) => c.id))
  const byChapter = new Map<string, LitFact[]>()
  const loose: LitFact[] = []
  for (const f of active) {
    const id = f.src?.chapter
    if (id && ids.has(id)) byChapter.set(id, [...(byChapter.get(id) ?? []), f])
    else loose.push(f)
  }
  const items: { at: number; chapter?: LitChapter; skip?: LitSkipped }[] = [
    ...chat.chapters.map((chapter) => ({ at: chapter.fromNo || Number.MAX_SAFE_INTEGER, chapter })),
    ...chat.skipped.map((skip) => ({ at: skip.fromNo, skip })),
  ].sort((x, y) => x.at - y.at)

  if (!items.length && !loose.length) return <p className="text-xs text-muted-foreground">{t('lit.noChapters')}</p>

  return (
    <ol className="relative flex flex-col gap-4 before:absolute before:top-2 before:bottom-2 before:left-[7px] before:w-px before:bg-border" data-testid="timeline">
      {items.map((it) =>
        it.chapter ? (
          <Node key={it.chapter.id} tone={it.chapter.stale ? 'stale' : it.chapter.edited ? 'edited' : 'ok'}>
            <div className="flex flex-col gap-2">
              <ChapterRow chat={chat} chapter={it.chapter} onChat={onChat} disabled={!!chat.rebuilding} />
              <FactStack facts={byChapter.get(it.chapter.id) ?? []} ctl={ctl} slot="tl:" />
            </div>
          </Node>
        ) : (
          <Node key={`skip-${it.skip!.fromNo}`} tone="gap">
            <p className="rounded-md border border-dashed border-border bg-muted/40 p-2 text-xs text-muted-foreground">
              {t('lit.skippedRange', { from: it.skip!.fromNo, to: it.skip!.toNo })}
            </p>
          </Node>
        ),
      )}
      {chat.scene.openFrom && (
        <Node tone="open">
          <p className="pt-1.5 text-xs text-muted-foreground">
            {t('lit.scene', { label: chat.scene.label || t('lit.sceneNoLabel'), n: chat.sceneFromNo })}
          </p>
        </Node>
      )}
      {loose.length > 0 && (
        <Node tone="gap">
          <div className="flex flex-col gap-2">
            <p className="pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('lit.ov.loose')}</p>
            <FactStack facts={loose} ctl={ctl} slot="tl:" />
          </div>
        </Node>
      )}
    </ol>
  )
}
