
import { useEffect, useState } from 'react'
import { CircleNotch } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { promptPreview } from '@/lib/engine'
import { MarkedPre, PromptSourcesPanel } from '@/components/chat/prompt-sources'
import { estimateTokens, formatTokens } from '@/lib/tokens'
import { cn } from '@/lib/utils'

type Preview = Awaited<ReturnType<typeof promptPreview>>

/**
 * The REAL assembled prompt for a chat, straight from the engine's preview
 * route — macros expanded, world info / summary / depth injections spliced,
 * exactly what the next generation would send. Every block renders its exact
 * text, fully expanded.
 */
export function PromptPeekDialog({
  open, onOpenChange, chatId, userText, messageId, title,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  chatId: string | null
  /** optional not-yet-sent composer text, staged as the last user turn */
  userText?: string
  /** scope the assembly to one message: the prompt as of that point */
  messageId?: string
  title?: string
}) {
  const [data, setData] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // the source part whose marks are highlighted (index in sources.parts)
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    if (!open || !chatId) return
    setBusy(true)
    setError(null)
    setActive(null)
    promptPreview(chatId, { userText, messageId })
      .then(setData)
      .catch((e) => setError(String((e as Error).message ?? e)))
      .finally(() => setBusy(false))
  }, [open, chatId, userText, messageId])

  // msg: -1 = the system prompt, else the index in data.messages (what sourceSpans refer to)
  const blocks = data
    ? [
        ...(data.systemPrompt ? [{ role: 'system', content: data.systemPrompt, name: 'System prompt', msg: -1 }] : []),
        ...data.messages.map((m, i) => ({ role: m.role, content: m.content, name: `Message ${i + 1}`, msg: i })),
      ]
    : []
  const total = blocks.reduce((a, b) => a + estimateTokens(b.content), 0)
  const sources = data?.sources?.parts.length ? data.sources : null
  const spans = data?.sourceSpans ?? []
  // the block holding the first mark of the active part is the one to scroll to
  const firstBlock = active == null ? -2 : (blocks.find((b) => spans.some((s) => s.msg === b.msg && s.part === active))?.msg ?? -2)

  // Esc clears the highlight first; a second Esc closes the dialog
  useEffect(() => {
    if (active == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      setActive(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [active])
  // the exact request envelope a generation would send from this state —
  // what the pretty blocks above are assembled from
  const rawRequest = data
    ? JSON.stringify(
        {
          model: data.model,
          ...(data.systemPrompt ? { systemPrompt: data.systemPrompt } : {}),
          messages: data.messages,
          ...(Object.keys(data.presetParams ?? {}).length ? { presetParams: data.presetParams } : {}),
          ...(data.reasoning ? { reasoning: data.reasoning } : {}),
          ...(data.thinkingBudget ? { thinkingBudget: data.thinkingBudget } : {}),
          ...(data.assistantPrefill ? { assistantPrefill: data.assistantPrefill } : {}),
          ...(data.tools?.length ? { tools: data.tools } : {}),
        },
        null,
        2,
      )
    : ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-baseline gap-2">
            {title ?? 'Prompt peek'}
            {data && <span className="text-xs font-normal text-muted-foreground">preset: {data.presetName} · {formatTokens(total)} tokens · {blocks.length} blocks</span>}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {busy && (
            <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <CircleNotch className="size-4 animate-spin" aria-hidden="true" /> Assembling the exact prompt…
            </p>
          )}
          {error && <p className="p-4 text-sm text-destructive">{error}</p>}
          {data && !busy && (
            <div className="flex flex-col gap-2 pb-2">
              {sources && <PromptSourcesPanel sources={sources} total={total} active={active} onPick={setActive} />}
              {blocks.map((b, i) => (
                <div key={i} className={cn('rounded-md border border-border px-2.5 py-2', b.role === 'system' && 'bg-muted/30')}>
                  <div className="mb-1 flex items-center gap-2">
                    <Badge variant={b.role === 'system' ? 'secondary' : b.role === 'user' ? 'outline' : 'outline'} className="text-[10px]">{b.role}</Badge>
                    <span className="text-[11px] text-muted-foreground">{b.name}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">{formatTokens(estimateTokens(b.content))} tok</span>
                  </div>
                  <MarkedPre
                    text={b.content}
                    spans={sources ? spans.filter((s) => s.msg === b.msg) : undefined}
                    parts={sources?.parts}
                    active={active}
                    scrollToActive={b.msg === firstBlock}
                  />
                </div>
              ))}
              {rawRequest && (
                <details className="rounded-md border border-border px-2.5 py-2">
                  <summary className="cursor-pointer text-[11px] text-muted-foreground">Raw request (exactly what the API receives)</summary>
                  <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground">{rawRequest}</pre>
                </details>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
