import { useEffect, useState } from 'react'
import { TONES, type ToneName } from '@/components/ui/tone'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import type { MsgKey } from '@/lib/i18n'
import { bookMeaning, type BookMeaningState, type FiredBooks } from '@/lib/fired'
import { canOpenSettingsTab, openSettingsTab } from '@/lib/shell-bridge'
import { loadEmbedSetup } from '@/lib/vectors-load'
import type { EmbedSetup } from '@/lib/vectors'
import { Button } from '@/components/ui/button'

const TONE: Record<BookMeaningState, ToneName> = { off: 'slate', empty: 'slate', all: 'emerald', partial: 'amber', none: 'amber', other: 'amber' }

/**
 * "Lorebook entries by meaning" (#259): of the entries the chat's books mark "By meaning", how many have a usable vector.
 * Read-only: the engine makes the missing vectors while it prepares the next reply, so there is no button, only the state in
 * the words of the two cards above it. Hidden when the plugin is too old to answer.
 */
export function LoreMeaningCard({ books, className }: { books: FiredBooks | null; className?: string }) {
  const t = useT()
  const [setup, setSetup] = useState<EmbedSetup>('unknown')
  useEffect(() => {
    let gone = false
    void loadEmbedSetup().then((s) => { if (!gone) setSetup(s) })
    return () => { gone = true }
  }, [])
  if (!books) return null
  const m = bookMeaning(books, setup)
  // books switched off for this chat take no part, so they are not listed
  const withVec = m.books
  const settings = () => void openSettingsTab('memory').catch(() => undefined)

  const line =
    m.state === 'off' ? t('meaning.off')
    : m.state === 'empty' ? t('meaning.lore.empty')
    : m.state === 'none' ? t('meaning.lore.none', { items: m.items })
    : m.state === 'other' ? t('meaning.lore.other', { n: m.other, have: m.have, items: m.items })
    : m.state === 'partial' ? t('meaning.lore.partial', { have: m.have, items: m.items })
    : t('meaning.lore.all', { items: m.items })
  const pct = m.items > 0 ? Math.min(100, Math.round((m.have / m.items) * 100)) : 0

  return (
    <section className={cn('rounded-xl border border-border bg-card p-3', className)} data-testid="lore-meaning-card" data-state={m.state} aria-label={t('meaning.lore.title')}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-body font-semibold">{t('meaning.lore.title')}</h3>
        <span className={cn('inline-flex h-5 items-center rounded-full border px-1.5 text-caption font-medium', TONES[TONE[m.state]].chip)}>{t(`meaning.state.${m.state}` as MsgKey)}</span>
        {m.state === 'all' && books.model && <code className="min-w-0 truncate rounded bg-muted px-1 text-caption text-foreground/70">{books.model}</code>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">{line}</p>
      {(m.state === 'partial' || m.state === 'other') && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted-foreground/20" role="img" aria-label={t('meaning.progress', { have: m.have, items: m.items })}>
          <div className={cn('h-full rounded-full', TONES[TONE[m.state]].square)} style={{ width: `${Math.max(pct, 3)}%` }} />
        </div>
      )}
      {m.state === 'off' && canOpenSettingsTab() && (
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={settings} className="min-h-10 sm:min-h-8">{t('lit.emb.setup')}</Button>
        </div>
      )}
      {withVec.length > 0 && m.state !== 'off' && (
        <ul className="mt-2 divide-y divide-border" data-testid="lore-meaning-books">
          {withVec.map((b) => (
            <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5 text-sm">
              <span className="min-w-0 break-words font-medium">{b.name}</span>
              <span className="shrink-0 tabular-nums text-caption text-muted-foreground">{t('meaning.lore.book', { have: b.vec.have, items: b.vec.items })}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
