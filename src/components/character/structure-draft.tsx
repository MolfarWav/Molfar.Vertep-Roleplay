import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CircleNotch, MagicWand } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { j } from '@/lib/engine'
import { estimateTokens, formatTokens } from '@/lib/tokens'
import { acceptDraft, compileProfile, type ProfileDraft } from '@/lib/profile'
import type { Character } from '@/lib/types'

/** "Structure it": one model call (plugins/profile) splits the card's text into
 *  profile fields. The result is a draft shown here next to what the card's text
 *  would become; nothing on the card changes until Accept. */
export function useStructureDraft(c: Character, up: (patch: Partial<Character>) => void) {
  const [draft, setDraft] = useState<ProfileDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const query = `/profile/draft?characterId=${encodeURIComponent(c.id)}`

  useEffect(() => {
    let alive = true
    setDraft(null)
    j<{ draft: ProfileDraft | null }>(query).then((r) => { if (alive) setDraft(r.draft) }).catch(() => { /* no plugin: no draft */ })
    return () => { alive = false }
  }, [query])

  const run = async () => {
    setBusy(true)
    try {
      const r = await j<{ ok?: boolean; draft?: ProfileDraft; error?: string }>('/profile/structure', { method: 'POST', body: JSON.stringify({ characterId: c.id }) })
      if (r.ok && r.draft) setDraft(r.draft)
      else toast.error(`Structure it failed: ${r.error ?? 'no answer'}`)
    } catch (e) {
      toast.error(`Structure it failed: ${String((e as Error).message ?? e)}`)
    } finally {
      setBusy(false)
    }
  }
  const drop = () => { setDraft(null); void j(query, { method: 'DELETE' }).catch(() => {}) }
  const accept = () => {
    if (!draft) return
    up(acceptDraft(c, draft))
    drop()
    toast.success('Profile filled. The old text is in Versions.')
  }
  return { draft, busy, run, drop, accept }
}

export function StructureButton({ busy, onClick, variant = 'outline' }: { busy: boolean; onClick: () => void; variant?: 'outline' | 'default' }) {
  return (
    <Button variant={variant} size="sm" className="w-fit" disabled={busy} onClick={onClick} title="A model reads Description and Personality and proposes the fields; you review before anything changes">
      {busy ? <CircleNotch className="size-4 animate-spin" aria-hidden="true" /> : <MagicWand className="size-4" aria-hidden="true" />}
      {busy ? 'Reading the card…' : 'Structure it'}
    </Button>
  )
}

export function StructureDraftPanel({ c, draft, onAccept, onDiscard }: { c: Character; draft: ProfileDraft; onAccept: () => void; onDiscard: () => void }) {
  const next = compileProfile({ ...draft.profile, notes: draft.leftover })
  const filled = Object.keys(draft.profile).length
  const block = (title: string, now: string, after: string) => (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
        {title}
        <Badge variant="outline" className="text-[10px]">{formatTokens(estimateTokens(now))} → {formatTokens(estimateTokens(after))} tok</Badge>
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background/60 p-2 font-sans text-xs">{after || '(empty)'}</pre>
    </div>
  )
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-sky-500/40 bg-sky-500/10 p-3" data-testid="structure-draft">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">Proposed profile</h2>
        <p className="text-xs text-muted-foreground">
          {filled} section{filled === 1 ? '' : 's'} filled{draft.model ? ` by ${draft.model}` : ''}. Text that fit no field stays as notes. Accepting rewrites Description and Personality as shown; the current text goes to Versions.
        </p>
        {draft.note && <p className="text-xs italic text-muted-foreground">{draft.note}</p>}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {block('Description would become', c.description, next.description)}
        {block('Personality would become', c.personality, next.personality)}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onAccept}>Accept</Button>
        <Button size="sm" variant="outline" onClick={onDiscard}>Discard</Button>
      </div>
    </section>
  )
}
