import { useMemo, useState } from 'react'
import { PushPin } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { useT } from '@/hooks/use-t'
import type { MsgKey } from '@/lib/i18n'
import type {
  LitFact,
  LitFactStatus,
  LitFactType,
  LitFactWeight,
} from './litopys-api'

type Filter = 'all' | LitFactStatus

const knownTypes: Record<LitFactType, MsgKey> = {
  event: 'lit.type.event',
  trait: 'lit.type.trait',
  change: 'lit.type.change',
  relation: 'lit.type.relation',
  world: 'lit.type.world',
  plan: 'lit.type.plan',
}

const knownWeights: Record<LitFactWeight, MsgKey> = {
  everyday: 'lit.weight.everyday',
  important: 'lit.weight.important',
  key: 'lit.weight.key',
}

const knownStatuses: Record<LitFactStatus, MsgKey> = {
  active: 'lit.status.active',
  retired: 'lit.status.retired',
  superseded: 'lit.status.superseded',
}

function typeLabel(type: string, t: (key: MsgKey) => string): string {
  const key = knownTypes[type as keyof typeof knownTypes]
  return key ? t(key) : type
}

function weightLabel(weight: string, t: (key: MsgKey) => string): string {
  const key = knownWeights[weight as keyof typeof knownWeights]
  return key ? t(key) : weight
}

function statusLabel(status: string, t: (key: MsgKey) => string): string {
  const key = knownStatuses[status as keyof typeof knownStatuses]
  return key ? t(key) : status
}

export function FactList({ facts }: { facts: LitFact[] }) {
  const t = useT()
  const [status, setStatus] = useState<Filter>('active')

  const counts = useMemo(
    () => ({
      all: facts.length,
      active: facts.filter((f) => f.status === 'active').length,
      retired: facts.filter((f) => f.status === 'retired').length,
      superseded: facts.filter((f) => f.status === 'superseded').length,
    }),
    [facts]
  )

  const visible = useMemo(() => {
    if (status === 'all') return facts
    return facts.filter((f) => f.status === status)
  }, [facts, status])

  const filters: { key: Filter; label: MsgKey }[] = [
    { key: 'all', label: 'lit.status.all' },
    { key: 'active', label: 'lit.status.active' },
    { key: 'retired', label: 'lit.status.retired' },
    { key: 'superseded', label: 'lit.status.superseded' },
  ]

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">{t('lit.status')}</span>
        <div role="group" className="flex flex-wrap gap-1.5">
          {filters.map(({ key, label }) => {
            const pressed = status === key
            return (
              <button
                key={key}
                type="button"
                aria-pressed={pressed}
                onClick={() => setStatus(key)}
                className={cn(
                  'min-h-9 rounded-md border px-2.5 text-xs transition-colors',
                  pressed
                    ? 'border-primary/50 bg-accent text-foreground'
                    : 'border-border text-muted-foreground hover:bg-accent/50'
                )}
              >
                {t(label)} ({counts[key]})
              </button>
            )
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('lit.noFacts')}</p>
      ) : (
        <ul className="flex min-w-0 flex-col gap-2">
          {visible.map((fact) => (
            <li
              key={fact.id}
              className={cn(
                'rounded-md border border-border bg-card p-3',
                fact.status !== 'active' && 'opacity-60'
              )}
            >
              <p
                className={cn(
                  'break-words text-sm',
                  (fact.status === 'retired' || fact.status === 'superseded') &&
                    'line-through decoration-muted-foreground/50'
                )}
              >
                {fact.text}
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <Badge variant="outline" className="text-[10px]">
                  {typeLabel(fact.type, t)}
                </Badge>

                <Badge
                  variant={
                    fact.weight === 'key'
                      ? 'default'
                      : fact.weight === 'important'
                        ? 'secondary'
                        : 'outline'
                  }
                  className="text-[10px]"
                >
                  {weightLabel(fact.weight, t)}
                </Badge>

                {fact.pinned && (
                  <Badge variant="secondary" className="gap-1 text-[10px]">
                    <PushPin
                      weight="fill"
                      className="size-3"
                      aria-hidden="true"
                    />
                    {t('lit.pinned')}
                  </Badge>
                )}

                {!fact.pinned && fact.pinProposed && (
                  <Badge variant="outline" className="gap-1 text-[10px]">
                    <PushPin
                      weight="regular"
                      className="size-3"
                      aria-hidden="true"
                    />
                    {t('lit.pinProposed')}
                  </Badge>
                )}

                {fact.status !== 'active' && (
                  <Badge variant="outline" className="text-[10px]">
                    {statusLabel(fact.status, t)}
                  </Badge>
                )}

                {typeof fact.subject === 'string' && fact.subject.trim().length > 0 && (
                  <span>{t('lit.subject', { name: fact.subject })}</span>
                )}

                {!Array.isArray(fact.knownBy) ? (
                  <span>{t('lit.knownByAll')}</span>
                ) : (
                  <span>
                    {t('lit.knownBy', { names: fact.knownBy.join(', ') })}
                  </span>
                )}

                {typeof fact.supersedes === 'string' &&
                  fact.supersedes.length > 0 && (
                    <span>
                      {t('lit.supersedes', { id: fact.supersedes })}
                    </span>
                  )}

                <span className="font-mono">{fact.id}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
