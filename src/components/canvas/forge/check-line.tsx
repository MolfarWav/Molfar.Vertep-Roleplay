import { useT } from '@/hooks/use-t'
import { explainCheck, type CheckItem } from '@/lib/agent-check-text'
import { cn } from '@/lib/utils'

/**
 * One line of the checker, in words: what is wrong, what to do, and the stable code as a small chip (for a bug report).
 * `bad` = an error (red); otherwise a warning (amber). `cardTitle` is the card the error blames, when the caller can look it up.
 */
export function CheckLine({ item, cardTitle, bad, className }: { item: CheckItem; cardTitle?: string; bad: boolean; className?: string }) {
  const t = useT()
  const text = explainCheck(item, t, cardTitle)
  return (
    <span className={cn('flex flex-col gap-0.5 text-left', className)} data-testid="check-line" data-code={item.code}>
      <span className={cn('text-xs leading-snug', bad ? 'text-destructive' : 'text-amber-700 dark:text-amber-400')}>{text.what}</span>
      {text.fix && <span className="text-xs leading-snug text-muted-foreground">{text.fix}</span>}
      {text.detail && <span className="text-xs leading-snug text-muted-foreground" lang="en">{t('fg.ck.detail')}: {text.detail}</span>}
      <span className="font-mono text-xs text-muted-foreground" title={t('fg.ck.code')}>{item.code}</span>
    </span>
  )
}
