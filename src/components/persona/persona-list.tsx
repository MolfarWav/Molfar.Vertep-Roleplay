import { Folder as FolderIcon, Star } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { useT } from '@/hooks/use-t'
import type { Persona, Tag } from '@/lib/types'
import { DEFAULT_AVATAR, cn } from '@/lib/utils'
import { formatTokens } from '@/lib/tokens'
import { DRAG_TYPE } from '@/components/persona/persona-filters'

/** What the list shows about one persona; the owner computes it once per change. */
export interface PersonaItem {
  p: Persona
  line: string
  chats: number
  tokens: number
  fill: string
  tags: string[]
  folders: string[]
}

export interface PersonaListProps {
  items: PersonaItem[]
  /** the persona being spoken as now */
  activeId: string | null
  /** the persona the preview shows */
  previewId: string | null
  selectMode: boolean
  picked: ReadonlySet<string>
  tagMeta: ReadonlyMap<string, Tag>
  /** a tap or click: previews the persona (select mode: ticks it) */
  onTap: (id: string) => void
  /** double click (desktop): opens the persona */
  onOpen: (id: string) => void
  onTick: (id: string, on: boolean) => void
}

function InUse() {
  const t = useT()
  return <Badge variant="secondary" className="shrink-0 px-1.5 text-[10px] font-normal" data-testid="persona-in-use-badge">{t('personas.inUse')}</Badge>
}

function DefaultStar() {
  const t = useT()
  return <Star weight="fill" className="size-3.5 shrink-0 text-amber-500" role="img" aria-label={t('personas.defaultTip')}><title>{t('personas.defaultTip')}</title></Star>
}

function TagChip({ name, meta }: { name: string; meta: Tag | undefined }) {
  return (
    <span
      style={meta ? { backgroundColor: meta.color, color: meta.textColor, borderColor: 'transparent' } : undefined}
      className={cn('max-w-full truncate whitespace-nowrap rounded-full border px-2 text-[11px] leading-4', !meta && 'border-border text-muted-foreground')}
    >{name}</span>
  )
}

/** The pronoun chip and up to two tags (+N for the rest). */
export function ChipLine({ pronouns, tags, tagMeta, max = 2 }: { pronouns: string; tags: string[]; tagMeta: ReadonlyMap<string, Tag>; max?: number }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {pronouns.trim() && <span className="whitespace-nowrap rounded-full border border-sky-500/50 px-2 text-[11px] leading-4 text-sky-700 dark:text-sky-300">{pronouns.trim()}</span>}
      {tags.slice(0, max).map((n) => <TagChip key={n} name={n} meta={tagMeta.get(n)} />)}
      {tags.length > max && <span className="text-[11px] text-muted-foreground">+{tags.length - max}</span>}
    </div>
  )
}

/** The two-column grid of cards (desktop). A card can be dragged onto a folder chip. */
export function PersonaGrid({ items, activeId, previewId, selectMode, picked, tagMeta, onTap, onOpen, onTick }: PersonaListProps) {
  const t = useT()
  return (
    <div className="@container min-w-0">
      <ul className="grid min-w-0 grid-cols-1 gap-3 p-4 @xl:grid-cols-2" data-testid="persona-grid">
        {items.map(({ p, line, chats, tokens, fill, tags, folders }) => {
          const ticked = picked.has(p.id)
          const on = selectMode ? ticked : previewId === p.id
          return (
            <li
              key={p.id}
              draggable
              onDragStart={(e) => {
                const ids = selectMode && ticked ? [...picked] : [p.id]
                e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(ids))
                e.dataTransfer.effectAllowed = 'copy'
              }}
              className={cn('group relative min-w-0 rounded-xl border bg-card transition-colors hover:border-primary/50', on ? 'border-primary' : 'border-border')}
              data-testid="persona-card"
            >
              {selectMode && (
                <Checkbox
                  checked={ticked}
                  onCheckedChange={(v) => onTick(p.id, !!v)}
                  className="absolute left-4 top-4 z-10 bg-background"
                  aria-label={t('personas.selectOne', { name: p.name })}
                />
              )}
              <button
                type="button"
                onClick={() => onTap(p.id)}
                onDoubleClick={() => { if (!selectMode) onOpen(p.id) }}
                aria-current={!selectMode && previewId === p.id ? 'true' : undefined}
                className="flex w-full min-w-0 gap-3 rounded-xl p-2.5 text-left"
              >
                <img src={p.avatar || DEFAULT_AVATAR} alt="" draggable={false} className="h-28 w-[84px] shrink-0 rounded-lg bg-muted object-cover" />
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 truncate text-[15px] font-bold">{p.name}</span>
                    {p.id === activeId && <InUse />}
                    {p.isDefault && <DefaultStar />}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{line}</span>
                  <ChipLine pronouns={p.pronouns} tags={tags} tagMeta={tagMeta} />
                  <span className="mt-auto flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                    {folders.length > 0 && <span className="flex min-w-0 items-center gap-1"><FolderIcon className="size-3 shrink-0" aria-hidden="true" /><span className="truncate">{folders.join(', ')}</span><span aria-hidden="true">·</span></span>}
                    <span>{t('personas.chatsN', { n: chats })}</span><span aria-hidden="true">·</span>
                    <span className="text-amber-700 dark:text-amber-400">{t('personas.tokensN', { n: formatTokens(tokens) })}</span><span aria-hidden="true">·</span>
                    <span title={t('personas.profileTip')}>{fill}</span>
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** One row per persona (phone): avatar, name, line, chats and tokens. Tap opens the preview sheet. */
export function PersonaRows({ items, activeId, previewId, selectMode, picked, onTap, onTick }: PersonaListProps) {
  const t = useT()
  return (
    <ul className="flex min-w-0 flex-col px-2 pb-2" data-testid="persona-rows">
      {items.map(({ p, line, chats, tokens }) => {
        const ticked = picked.has(p.id)
        return (
          <li key={p.id} className={cn('flex min-h-[68px] min-w-0 items-center gap-1 border-b border-border/60', (selectMode ? ticked : previewId === p.id) && 'rounded-lg bg-accent/60')}>
            {selectMode && (
              <span className="flex size-11 shrink-0 items-center justify-center">
                <Checkbox checked={ticked} onCheckedChange={(v) => onTick(p.id, !!v)} aria-label={t('personas.selectOne', { name: p.name })} />
              </span>
            )}
            <button type="button" onClick={() => onTap(p.id)} className="flex min-h-[68px] min-w-0 flex-1 items-center gap-3 px-2 py-2 text-left">
              <img src={p.avatar || DEFAULT_AVATAR} alt="" className="size-[50px] shrink-0 rounded-[10px] bg-muted object-cover" />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="min-w-0 truncate text-[15px] font-bold">{p.name}</span>
                  {p.id === activeId && <InUse />}
                  {p.isDefault && <DefaultStar />}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{line}</span>
              </span>
              <span className="shrink-0 text-right text-[11px] text-muted-foreground">
                <span className="block">{t('personas.chatsN', { n: chats })}</span>
                <span className="block text-amber-700 dark:text-amber-400">{t('personas.tokensN', { n: formatTokens(tokens) })}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
