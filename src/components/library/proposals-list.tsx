import { useT } from '@/hooks/use-t'
import type { MsgKey } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { LitFact, LitProposal } from './litopys-api'

const OP_KEYS: Record<string, MsgKey> = {
  merge: 'lit.op.merge',
  retire: 'lit.op.retire',
  rewrite: 'lit.op.rewrite',
  pin: 'lit.op.pin',
}
const PSTATUS_KEYS: Record<string, MsgKey> = {
  pending: 'lit.pstatus.pending',
  accepted: 'lit.pstatus.accepted',
  rejected: 'lit.pstatus.rejected',
}

export function ProposalList({ proposals, facts }: { proposals: LitProposal[]; facts: LitFact[] }) {
  const t = useT()
  const targetsOf = (p: LitProposal): string[] => (Array.isArray(p.targets) ? p.targets : [])

  const factMap = new Map<string, LitFact>()
  for (const f of facts) {
    factMap.set(f.id, f)
  }

  if (proposals.length === 0) {
    return <p className="text-xs text-muted-foreground">{t('lit.noProposals')}</p>
  }

  const ordered = proposals.slice().sort((a, b) => {
    const aPending = a.status === 'pending' ? 0 : 1
    const bPending = b.status === 'pending' ? 0 : 1
    return aPending - bPending
  })

  return (
    <div className="flex flex-col gap-2">
      {ordered.map((p) => {
        const isPending = p.status === 'pending'
        const opKey = OP_KEYS[p.op]
        const opLabel = opKey ? t(opKey) : p.op
        const statusKey = PSTATUS_KEYS[p.status]
        const statusLabel = statusKey ? t(statusKey) : p.status

        return (
          <div
            key={p.id}
            className={cn(
              'rounded-md border border-border bg-card p-3',
              !isPending && 'opacity-60'
            )}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="text-[10px]">
                {opLabel}
              </Badge>
              <Badge variant={isPending ? 'secondary' : 'outline'} className="text-[10px]">
                {statusLabel}
              </Badge>
              <span className="min-w-0 break-all font-mono text-[11px] text-muted-foreground">
                {p.id}
              </span>
            </div>

            {p.text && <p className="mt-2 text-sm break-words">{p.text}</p>}

            {p.reason && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {t('lit.reason', { text: p.reason })}
              </p>
            )}

            {targetsOf(p).length > 0 && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {t('lit.targets', { ids: targetsOf(p).join(', ') })}
              </p>
            )}

            <div className="mt-1.5 flex flex-col gap-1">
              {targetsOf(p).map((targetId) => {
                const f = factMap.get(targetId)
                if (!f) return null
                let snippet = f.text.slice(0, 200)
                if (f.text.length > 200) snippet += '…'
                return (
                  <blockquote
                    key={targetId}
                    className="border-l-2 border-border pl-2 text-xs text-muted-foreground break-words"
                  >
                    “{snippet}”
                  </blockquote>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
