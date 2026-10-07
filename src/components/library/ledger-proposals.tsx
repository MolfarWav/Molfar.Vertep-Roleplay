import { useMemo, useState } from 'react'
import { Check, X, CaretDown, CaretRight } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useT, useRelativeTime } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { LitChat, LitFact, LitProposal } from './litopys-api'
import { acceptLitProposal, rejectLitProposal } from './litopys-api'
import type { TabProps } from './ledger-facts'
import { usePinFlow } from './ledger-facts'
import type { MsgKey } from '@/lib/i18n'

const opKeys: Record<string, MsgKey> = {
  merge: 'lit.op.merge',
  retire: 'lit.op.retire',
  rewrite: 'lit.op.rewrite',
  pin: 'lit.op.pin',
}

const pstatusKeys: Record<string, MsgKey> = {
  pending: 'lit.pstatus.pending',
  accepted: 'lit.pstatus.accepted',
  rejected: 'lit.pstatus.rejected',
  expired: 'lit.pstatus.expired',
}

function resolveFacts(chat: LitChat, ids: string[]) {
  return ids.map((id) => chat.facts.find((f) => f.id === id))
}

interface ProposalRowProps {
  chat: LitChat
  proposal: LitProposal
  onChat: (c: LitChat) => void
  onRefresh: () => void
  pin: (fact: LitFact, proposalId?: string) => Promise<void>
  busy: boolean
  setBusy: (v: boolean) => void
}

function ProposalRow({ chat, proposal, onChat, onRefresh, pin, busy, setBusy }: ProposalRowProps) {
  const t = useT()
  const rel = useRelativeTime()
  const targets = resolveFacts(chat, proposal.targets)
  const allMissing = targets.every((f) => !f)

  const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

  const handleAccept = async () => {
    if (busy) return
    setBusy(true)
    try {
      if (proposal.op === 'pin') {
        const target = targets.find((f) => f)
        if (target) await pin(target, proposal.id)
        else {
          toast.error(t('lit.targetGone'))
          onRefresh()
        }
      } else {
        const c = await acceptLitProposal(chat.chatId, proposal.id)
        onChat(c)
      }
    } catch (e) {
      const msg = errText(e)
      if (msg === 'target gone') {
        toast.error(t('lit.targetGone'))
        onRefresh()
      } else toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  const handleReject = async () => {
    if (busy) return
    setBusy(true)
    try {
      const c = await rejectLitProposal(chat.chatId, proposal.id)
      onChat(c)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const settleTime = proposal.settledAt ? rel(proposal.settledAt) : ''

  return (
    <li
      data-testid="proposal-row"
      className={cn('rounded-md border border-border bg-card p-3', proposal.status !== 'pending' && 'opacity-70')}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="text-[10px]">{t(opKeys[proposal.op] ?? 'lit.op.merge')}</Badge>
            {proposal.status !== 'pending' && (
              <Badge variant="outline" className="text-[10px]">{t(pstatusKeys[proposal.status] ?? 'lit.pstatus.pending')}</Badge>
            )}
            {proposal.status !== 'pending' && settleTime && (
              <span className="text-[11px] text-muted-foreground">{settleTime}</span>
            )}
          </div>
          <div className="mt-1.5 text-sm space-y-1">
            {proposal.op === 'rewrite' && targets[0] && (
              <>
                {/* an accepted rewrite already is the fact's text: "now" would just repeat it */}
                {proposal.status !== 'accepted' && <div><span className="text-muted-foreground">{t('lit.now')}</span> {targets[0].text}</div>}
                {proposal.text != null && (
                  <div><span className="text-muted-foreground">{t('lit.proposed')}</span> {proposal.text}</div>
                )}
              </>
            )}
            {proposal.op === 'merge' && (
              <>
                <div className="flex flex-col gap-0.5">
                  {targets.map((f, i) => f && <div key={i} className="text-muted-foreground">· {f.text}</div>)}
                </div>
                {proposal.text != null && (
                  <div><span className="text-muted-foreground">{t('lit.into')}</span> {proposal.text}</div>
                )}
              </>
            )}
            {proposal.op === 'retire' && targets[0] && (
              <>
                <div>{targets[0].text}</div>
                {proposal.reason && <div className="text-muted-foreground">{t('lit.reason', { text: proposal.reason })}</div>}
              </>
            )}
            {proposal.op === 'pin' && targets[0] && (
              <>
                <div>{targets[0].text}</div>
                <div className="text-muted-foreground">{t('lit.pinWhy')}</div>
              </>
            )}
            {allMissing && <div className="text-muted-foreground">{t('lit.factGone')}</div>}
          </div>
        </div>
        {proposal.status === 'pending' && (
          <div className="flex shrink-0 gap-1.5">
            <Button size="sm" disabled={busy} onClick={() => void handleAccept()}>
              <Check className="size-3.5" aria-hidden="true" />
              {t('lit.accept')}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void handleReject()}>
              <X className="size-3.5" aria-hidden="true" />
              {t('lit.reject')}
            </Button>
          </div>
        )}
      </div>
    </li>
  )
}

export function ProposalsTab({ chat, onChat, onRefresh }: TabProps) {
  const t = useT()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const { pin, dialog } = usePinFlow(chat, onChat)

  const pending = useMemo(
    () => chat.proposals.filter((p) => p.status === 'pending').sort((a, b) => (b.at ?? 0) - (a.at ?? 0)),
    [chat.proposals]
  )
  const settled = useMemo(
    () => chat.proposals.filter((p) => p.status !== 'pending').sort((a, b) => (b.settledAt ?? 0) - (a.settledAt ?? 0)),
    [chat.proposals]
  )

  return (
    <div className="flex flex-col gap-2">
      {dialog}
      {pending.length === 0 && settled.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('lit.noProposals')}</p>
      ) : (
        <>
          {pending.length === 0 && <p className="text-xs text-muted-foreground">{t('lit.noProposals')}</p>}
          {pending.length > 0 && (
            <ul className="flex flex-col gap-2">
              {pending.map((p) => (
                <ProposalRow
                  key={p.id}
                  chat={chat}
                  proposal={p}
                  onChat={onChat}
                  onRefresh={onRefresh}
                  pin={pin}
                  busy={busyId === p.id}
                  setBusy={(v) => setBusyId(v ? p.id : null)}
                />
              ))}
            </ul>
          )}
          {settled.length > 0 && (
            <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
              <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground py-1">
                {historyOpen ? <CaretDown className="size-3" aria-hidden="true" /> : <CaretRight className="size-3" aria-hidden="true" />}
                {t('lit.proposalHistory', { n: settled.length })}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="mt-1 flex flex-col gap-2">
                  {settled.map((p) => (
                    <ProposalRow
                      key={p.id}
                      chat={chat}
                      proposal={p}
                      onChat={onChat}
                      onRefresh={onRefresh}
                      pin={pin}
                      busy={busyId === p.id}
                      setBusy={(v) => setBusyId(v ? p.id : null)}
                    />
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          )}
        </>
      )}
    </div>
  )
}
