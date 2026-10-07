import { useMemo, useState } from 'react'
import { AvatarImg } from '@/components/dashboard/dash-common'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { LitChat, LitFact } from './litopys-api'
import { type FactControls, FactItem } from './ledger-facts'

export interface CastProps {
  chat: LitChat
  onChat: (c: LitChat) => void
  onRefresh: () => void
  ctl: FactControls
}

interface SubjectGroup {
  name: string
  facts: LitFact[]
  knownByOthers: { subject: string; fact: LitFact }[]
}

const SECTION_LIMIT = 4

function sortFacts(facts: LitFact[]): LitFact[] {
  const weightOrder = { key: 0, important: 1, everyday: 2 }
  return [...facts].sort((a, b) => {
    if (a.weight !== b.weight) return weightOrder[a.weight] - weightOrder[b.weight]
    return b.updatedAt - a.updatedAt
  })
}

/** name → portrait: character cards and personas, matched by lower-cased name (the record keeps the story's spelling). */
function usePortraits(): Map<string, string> {
  const characters = useApp((s) => s.characters)
  const personas = useApp((s) => s.personas)
  return useMemo(() => {
    const map = new Map<string, string>()
    for (const p of personas) if (p.avatar) map.set(p.name.toLowerCase(), p.avatar)
    for (const c of characters) if (c.avatar) map.set(c.name.toLowerCase(), c.avatar)
    return map
  }, [characters, personas])
}

export function CastCards({ chat, onChat, ctl }: CastProps) {
  const t = useT()
  const portraits = usePortraits()
  
  const activeFacts = useMemo(
    () => chat.facts.filter((f) => f.status === 'active'),
    [chat.facts]
  )

  const subjects = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>()
    
    for (const fact of activeFacts) {
      const key = fact.subject.toLowerCase()
      const existing = map.get(key)
      if (existing) {
        existing.count++
      } else {
        map.set(key, { name: fact.subject, count: 1 })
      }
    }
    
    return [...map.values()].sort((a, b) => {
      if (a.name.toLowerCase() === 'world') return 1
      if (b.name.toLowerCase() === 'world') return -1
      return b.count - a.count || a.name.localeCompare(b.name)
    })
  }, [activeFacts])

  const groups = useMemo(() => {
    return subjects.map((subject) => {
      const facts = activeFacts.filter(
        (f) => f.subject.toLowerCase() === subject.name.toLowerCase()
      )
      const knownByOthers = activeFacts
        .filter((f) => {
          if (f.subject.toLowerCase() === subject.name.toLowerCase()) return false
          if (f.subject.toLowerCase() === 'world') return false
          return Array.isArray(f.knownBy) && f.knownBy.some(
            (name) => name.toLowerCase() === subject.name.toLowerCase()
          )
        })
        .map((f) => ({ subject: f.subject, fact: f }))
      
      return { name: subject.name, facts, knownByOthers }
    })
  }, [subjects, activeFacts])

  if (activeFacts.length === 0) {
    return (
      <div className="text-muted-foreground text-sm" data-testid="cast-empty">
        {t('lit.ov.noCast')}
      </div>
    )
  }

  return (
    <div className="@container">
      <div className="grid gap-3 @xl:grid-cols-2">
        {groups.map((group) => (
          <CastCard
            key={group.name}
            group={group}
            chat={chat}
            ctl={ctl}
            isWorld={group.name.toLowerCase() === 'world'}
            portrait={portraits.get(group.name.toLowerCase())}
          />
        ))}
      </div>
    </div>
  )
}

function CastCard({
  group,
  chat,
  ctl,
  isWorld,
  portrait,
}: {
  group: SubjectGroup
  chat: LitChat
  ctl: FactControls
  isWorld: boolean
  portrait?: string
}) {
  const t = useT()
  const pinned = group.facts.filter((f) => f.pinned)
  const traits = group.facts.filter((f) => f.type === 'trait' && !f.pinned)
  const changes = group.facts.filter((f) => f.type === 'change' && !f.pinned)
  const relations = group.facts.filter((f) => f.type === 'relation' && !f.pinned)
  const other = group.facts.filter(
    (f) => !f.pinned && f.type !== 'trait' && f.type !== 'change' && f.type !== 'relation'
  )

  return (
    <div
      data-testid="cast-card"
      className={cn(
        'rounded-lg border border-border bg-card p-3',
        isWorld && '@xl:col-span-2'
      )}
    >
      <div className="mb-2 flex items-center gap-2.5">
        {!isWorld && <AvatarImg name={group.name} url={portrait} className="size-9 rounded-md after:rounded-md" />}
        <div className="min-w-0">
        <h3 className="font-heading text-base">{isWorld ? t('lit.ov.world') : group.name}</h3>
        <p
          className={cn(
            'text-xs',
            pinned.length === chat.pinLimit
              ? 'text-primary'
              : 'text-muted-foreground'
          )}
        >
          {t('lit.ov.cardCounts', {
            facts: group.facts.length,
            pinned: pinned.length,
            limit: chat.pinLimit,
          })}
        </p>
        </div>
      </div>

      <CastSection title={t('lit.ov.pinned')} facts={pinned} ctl={ctl} />
      <CastSection title={t('lit.ov.traits')} facts={traits} ctl={ctl} />
      <CastSection title={t('lit.ov.changes')} facts={changes} ctl={ctl} />
      <CastSection title={t('lit.ov.relations')} facts={relations} ctl={ctl} />
      <CastSection title={t('lit.ov.other')} facts={sortFacts(other)} ctl={ctl} />
      
      {!isWorld && group.knownByOthers.length > 0 && (
        <CastKnowsSection
          title={t('lit.ov.knows')}
          items={group.knownByOthers}
          ctl={ctl}
        />
      )}
    </div>
  )
}

function CastSection({
  title,
  facts,
  ctl,
}: {
  title: string
  facts: LitFact[]
  ctl: FactControls
}) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)

  if (facts.length === 0) return null

  const visible = expanded ? facts : facts.slice(0, SECTION_LIMIT)

  return (
    <div className="mb-3">
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <div className="space-y-1">
        {visible.map((fact) => (
          <FactItem key={fact.id} fact={fact} ctl={ctl} compact />
        ))}
      </div>
      {facts.length > SECTION_LIMIT && !expanded && (
        <Button
          variant="ghost"
          size="xs"
          className="mt-1"
          onClick={() => setExpanded(true)}
        >
          {t('lit.ov.showAll', { n: facts.length })}
        </Button>
      )}
    </div>
  )
}

function CastKnowsSection({
  title,
  items,
  ctl,
}: {
  title: string
  items: { subject: string; fact: LitFact }[]
  ctl: FactControls
}) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)

  if (items.length === 0) return null

  const visible = expanded ? items : items.slice(0, SECTION_LIMIT)

  return (
    <div className="mb-3">
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <div className="space-y-1">
        {visible.map(({ subject, fact }) => (
          <div key={fact.id} className="flex flex-col">
            <span className="text-xs text-muted-foreground">{subject}</span>
            <FactItem fact={fact} ctl={ctl} compact />
          </div>
        ))}
      </div>
      {items.length > SECTION_LIMIT && !expanded && (
        <Button
          variant="ghost"
          size="xs"
          className="mt-1"
          onClick={() => setExpanded(true)}
        >
          {t('lit.ov.showAll', { n: items.length })}
        </Button>
      )}
    </div>
  )
}
