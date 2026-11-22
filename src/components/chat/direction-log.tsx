import { useT } from '@/hooks/use-t'
import { relativeTime, resolveLanguage } from '@/lib/i18n'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import type { DirectionState } from '@/lib/direction'
import { logWords } from '@/lib/direction-ui'

/** The log in words, newest first: the director's reports, the genre rules (fired, rolled and missed, how it ended) and every switch, lock, release and error. */
export function DirectionLog({ state }: { state: DirectionState }) {
  const t = useT()
  const lang = resolveLanguage(useApp((s) => s.settings.language))
  if (state.log.length === 0) return <p className="text-xs text-muted-foreground" data-testid="director-log-empty">{t('dir.log.empty')}</p>
  return (
    <ol className="flex flex-col gap-1.5" data-testid="director-log-list">
      {state.log.map((e, i) => {
        const { line, detail } = logWords(t, state, e, lang)
        return (
          <li key={`${e.at}-${i}`} data-kind={e.kind} className={cn('rounded-md border px-2.5 py-1.5 text-xs', e.kind === 'error' ? 'border-destructive/40 text-destructive' : 'border-border')}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 break-words font-medium">{line}</span>
              <span className="shrink-0 text-muted-foreground">{relativeTime(e.at, lang)}</span>
            </div>
            {detail && <p className="break-words text-muted-foreground">{detail}</p>}
          </li>
        )
      })}
    </ol>
  )
}
