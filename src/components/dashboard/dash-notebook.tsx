import { useState } from 'react'
import { Brain, Ear, Eye, EyeSlash } from '@phosphor-icons/react'
import type { DashChar, How } from '@/lib/dashboard'
import { useT } from '@/hooks/use-t'
import { Box, Label, useTx } from './dash-common'

function HowIcon({ how }: { how: How }) {
  const cls = 'mt-0.5 size-3.5 shrink-0 text-muted-foreground'
  if (how === 'saw') return <Eye className={cls} aria-hidden="true" />
  if (how === 'heard') return <Ear className={cls} aria-hidden="true" />
  return <Brain className={cls} aria-hidden="true" />
}

export function Notebook({ name, char, userName, className, id }: {
  name: string
  char: DashChar
  userName: string
  className?: string
  /** makes the box a scroll target (the strip's note chips) */
  id?: string
}) {
  const t = useT()
  const tx = useTx()
  const [showBlind, setShowBlind] = useState(false)
  const you = userName || t('dash.you')
  const entries = [...char.notebook].sort((a, b) => b.turn - a.turn)
  return (
    <Box id={id} title={t('dash.notebook', { name })} className={className}>
      <div className="mb-2 min-w-0 text-sm break-words">
        {char.name?.knowsUserName ? t('dash.name.known') : t('dash.name.unknown')}
        {char.name?.calls ? <span className="text-muted-foreground"> · {t('dash.name.calls', { calls: char.name.calls })}</span> : null}
      </div>
      {entries.length === 0 ? (
        <div className="text-sm text-muted-foreground">{t('dash.notebook.none')}</div>
      ) : (
        <ul className="flex flex-col">
          {entries.map((n) => {
            const from = n.from === 'user' ? you : n.from
            const source = n.how === 'heard' && n.from && n.from !== 'user' && from
              ? t('dash.how.heardFrom', { from })
              : tx('dash.how', n.how)
            return (
              <li key={n.id} className="flex min-w-0 items-start gap-2 border-b border-dashed border-border py-1.5 first:pt-0 last:border-b-0 last:pb-0">
                <HowIcon how={n.how} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm leading-snug break-words">{n.text}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-2 font-mono text-[10.5px] text-muted-foreground">
                    <span>{source}</span>
                    {n.believes === false && <span>{t('dash.how.doubts')}</span>}
                    <span>{t('dash.story.turn', { n: n.turn })}</span>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {char.blindSpot && (
        <div className="mt-3 border-t border-border pt-2">
          <button
            type="button"
            onClick={() => setShowBlind((v) => !v)}
            aria-expanded={showBlind}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <EyeSlash className="size-3.5" aria-hidden="true" />
            {t('dash.blind.show')}
          </button>
          {showBlind && (
            <div className="mt-2 border border-dashed border-border bg-muted/40 p-2">
              <Label className="mb-1">{t('dash.blind')}</Label>
              <div className="text-sm break-words">{char.blindSpot}</div>
            </div>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5 opacity-50">
        <span className="border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">{t('dash.later.rumor')}</span>
        <span className="border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">{t('dash.later.leak')}</span>
      </div>
    </Box>
  )
}
