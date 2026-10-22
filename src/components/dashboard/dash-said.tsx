import { useState } from 'react'
import { CaretDown, CaretRight, DotsThree, Eye, EyeSlash, Quotes } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import type { DashChar, SaidNote } from '@/lib/dashboard'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { MARK, SAID_MARK, TitleBar, useTx } from './dash-common'
import { useNotesAct } from './dash-context'

const FIELD = 'rounded-none'
const NOTE_MAX = 300

/** dangers (threat, order) read red, a hidden truth (lie, secret) amber, a pledge or an open word (vow, promise, confession) green, the rest neutral: colour never carries the kind alone, the word is always there. */
function KindChip({ kind }: { kind: SaidNote['kind'] }) {
  const tx = useTx()
  return (
    <span className={cn('inline-flex shrink-0 items-center border px-1 py-px font-sans text-[10px] uppercase tracking-wide', MARK[SAID_MARK[kind] ?? 'neutral'])}>
      {tx('dash.said.kind', kind)}
    </span>
  )
}

function SaidEditor({ initial, onSave, onCancel }: { initial: string; onSave: (text: string) => void; onCancel: () => void }) {
  const t = useT()
  const [text, setText] = useState(initial)
  return (
    <div className="flex flex-col gap-1.5">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={NOTE_MAX} rows={3} className={cn(FIELD, 'min-h-0 text-sm')} aria-label={t('dash.said.edit')} />
      <div className="flex gap-2">
        <Button size="xs" className={FIELD} disabled={!text.trim() || text.trim() === initial} onClick={() => onSave(text.trim())}>{t('dash.set.save')}</Button>
        <Button size="xs" variant="ghost" className={FIELD} onClick={onCancel}>{t('home.cancel')}</Button>
      </div>
    </div>
  )
}

function SaidRow({ item, revealed, editable }: { item: SaidNote; revealed: boolean; editable: boolean }) {
  const t = useT()
  const act = useNotesAct()
  const [editing, setEditing] = useState(false)
  const covered = item.hidden && !revealed
  return (
    <li className="flex min-w-0 items-start gap-2 border-b border-dashed border-border py-1.5 first:pt-0 last:border-b-0 last:pb-0">
      <div className="min-w-0 flex-1">
        {editing ? (
          <SaidEditor
            initial={item.text}
            onCancel={() => setEditing(false)}
            onSave={(text) => { void act({ op: 'edit', id: item.id, text }).then((ok) => { if (ok) setEditing(false) }) }}
          />
        ) : covered ? (
          <div className="text-sm text-muted-foreground">{t('dash.said.coveredRow')}</div>
        ) : (
          <div className="text-sm leading-snug break-words italic">“{item.text}”</div>
        )}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10.5px] text-muted-foreground">
          {!covered && <KindChip kind={item.kind} />}
          {item.edited && <span>{t('dash.note.edited')}</span>}
          <span>{t('dash.story.turn', { n: item.turn })}</span>
        </div>
      </div>
      {editable && !editing && !covered && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-xs" className={cn(FIELD, 'max-md:size-10')} aria-label={t('dash.said.menu')} title={t('dash.said.menu')}><DotsThree weight="bold" aria-hidden="true" /></Button>}
          />
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuItem onClick={() => setEditing(true)}>{t('dash.note.edit')}</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => { void act({ op: 'retire', id: item.id }) }}>{t('dash.note.remove')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  )
}

/**
 * What one character said and is held to (#98), under their notebook: its own list, with lies covered until
 * the user asks to see them. Nothing here when the plugin is older than the list.
 */
export function SaidBlock({ name, char }: { name: string; char: DashChar }) {
  const t = useT()
  const act = useNotesAct()
  const [reveal, setReveal] = useState(false)
  if (!char.said) return null
  const editable = Array.isArray(char.saidRemoved)
  const hiddenCount = char.said.filter((s) => s.hidden).length
  const removed = char.saidRemoved ?? []
  return (
    <div className="mt-3" data-guide="dash.said" data-testid="dash-said">
      <TitleBar tone="memory" icon={Quotes} className="-mx-3 mb-2 border-t">{t('dash.said', { name })}</TitleBar>
      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">{t('dash.said.hint', { name })}</p>
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-pressed={reveal}
            className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground max-md:min-h-10"
          >
            {reveal ? <Eye className="size-3.5" aria-hidden="true" /> : <EyeSlash className="size-3.5" aria-hidden="true" />}
            {reveal ? t('dash.said.hide', { n: hiddenCount }) : t('dash.said.show', { n: hiddenCount })}
          </button>
        )}
      </div>
      {char.said.length === 0 ? (
        <div className="text-sm text-muted-foreground">{t('dash.said.none', { name })}</div>
      ) : (
        <ul className="flex flex-col">
          {char.said.map((s) => <SaidRow key={s.id} item={s} revealed={reveal} editable={editable} />)}
        </ul>
      )}
      {removed.length > 0 && (
        <Collapsible className="mt-2">
          <CollapsibleTrigger className="group/rm flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground max-md:min-h-10">
            <CaretRight className="size-3 group-data-[panel-open]/rm:hidden" aria-hidden="true" />
            <CaretDown className="hidden size-3 group-data-[panel-open]/rm:block" aria-hidden="true" />
            {t('dash.note.removed', { n: removed.length })}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-1 flex flex-col">
              {removed.map((s) => (
                <li key={s.id} className="flex min-w-0 items-start gap-2 border-b border-dashed border-border py-1 text-muted-foreground last:border-b-0">
                  <span className="min-w-0 flex-1 text-xs break-words line-through">{s.hidden && !reveal ? t('dash.said.coveredRow') : s.text}</span>
                  <Button size="xs" variant="ghost" className={cn(FIELD, 'max-md:h-10')} onClick={() => { void act({ op: 'restore', id: s.id }) }}>{t('dash.note.restore')}</Button>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}
