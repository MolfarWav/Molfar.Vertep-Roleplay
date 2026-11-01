// One finding of the agent checker, in words: what is wrong, how to fix it, the card it blames; the stable code stays as a small
// chip for reports and the checker's English message is in the tooltip (or shown, muted, when the code has no text yet).

import { useT } from '@/hooks/use-t'
import { issueText } from '@/lib/agent-issues'
import { cn } from '@/lib/utils'

export interface IssueLike { code: string; message: string; nodeTitle?: string }

export function AgentIssueText({ issue, className }: { issue: IssueLike; className?: string }) {
  const t = useT()
  const s = issueText(issue.code, t, { card: issue.nodeTitle })
  return (
    <span className={cn('min-w-0', className)} title={issue.message}>
      {s.plain ? <>{s.what} {s.fix} </> : <>{issue.message} </>}
      <span className="whitespace-nowrap rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">{issue.code}</span>
    </span>
  )
}
