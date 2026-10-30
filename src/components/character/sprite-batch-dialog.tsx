import { useEffect, useMemo, useState } from 'react'
import { CaretDown, CaretRight, WarningCircle } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useT } from '@/hooks/use-t'
import { STANDARD_EXPRESSIONS, outfitName, type SpriteLike, type SpriteOwner } from '@/lib/expressions'
import {
  batchFromNames, batchGroups, countClashes, planBatch, setGroup, setSkip,
  type BatchFile, type BatchPlan, type ClashMode,
} from '@/lib/sprite-batch'

/** Files shown per group before "Show more": 440 files must not mean 440 inputs at once. */
const PAGE = 30
/** The select's value for "the card itself": an empty string is not a usable item value. */
const CARD = '__card__'
const KEEP = '__keep__'

export interface SpriteChoice { key: string; label: string }

/** Which file goes where, as the dialog leaves it. */
export interface SpriteBatchResult { plan: BatchPlan; files: File[] }

/** A small picture of the file, made only for the rows on screen and freed when the row goes. */
function Thumb({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  return url ? <img src={url} alt="" loading="lazy" decoding="async" className="size-8 rounded bg-muted object-cover" /> : <span className="size-8 rounded bg-muted" aria-hidden="true" />
}

/** A text field that hands its value over on blur or Enter: the groups move only when the user is done typing. */
function CommitInput({ value, onCommit, ...props }: { value: string; onCommit: (v: string) => void } & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'onBlur'>) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <Input
      {...props}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onCommit(draft) }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (draft !== value) onCommit(draft) } }}
    />
  )
}

function CharacterSelect({ value, choices, onChange, label, extra }: { value: string; choices: SpriteChoice[]; onChange: (key: string) => void; label: string; extra?: { value: string; label: string } }) {
  const known = choices.some((c) => c.key === value)
  return (
    <Select value={extra && value === KEEP ? KEEP : value === '' ? CARD : value} onValueChange={(v) => onChange(v === CARD ? '' : (v as string))}>
      <SelectTrigger aria-label={label} className="w-full min-w-0 max-md:h-10"><SelectValue /></SelectTrigger>
      <SelectContent>
        {extra && <SelectItem value={extra.value}>{extra.label}</SelectItem>}
        {choices.map((c) => <SelectItem key={c.key || CARD} value={c.key || CARD}>{c.label}</SelectItem>)}
        {!known && value && value !== KEEP && <SelectItem value={value}>{value}</SelectItem>}
      </SelectContent>
    </Select>
  )
}

function Body({ files, owners, choices, existing, outfits, onCancel, onConfirm }: {
  files: File[]
  owners: SpriteOwner[]
  choices: SpriteChoice[]
  existing: SpriteLike[]
  outfits: string[]
  onCancel: () => void
  onConfirm: (r: SpriteBatchResult) => void
}) {
  const t = useT()
  const [items, setItems] = useState<BatchFile[]>(() => batchFromNames(files.map((f) => f.name), owners))
  const [mode, setMode] = useState<ClashMode | null>(null)
  const groups = useMemo(() => batchGroups(items), [items])
  const [open, setOpen] = useState<Set<number>>(() => new Set(batchGroups(items).length <= 4 ? batchGroups(items).map((g) => g.ids[0]!) : []))
  const [shown, setShown] = useState<Record<number, number>>({})
  const [bulkChar, setBulkChar] = useState(KEEP)
  const [bulkOutfit, setBulkOutfit] = useState('')
  const clashes = useMemo(() => countClashes(items, existing), [items, existing])
  // a drop that shares slots inside itself (joy and joy2) keeps both by default; a plain re-upload replaces
  const effective: ClashMode = mode ?? (clashes.shared > 0 ? 'both' : 'replace')
  const plan = useMemo(() => planBatch(items, existing, effective), [items, existing, effective])
  const standard = useMemo(() => new Set([...STANDARD_EXPRESSIONS, ...existing.map((s) => s.name.toLowerCase())]), [existing])
  // a card with no voices has one owner: nothing to choose, so the character is not asked
  const multi = choices.length > 1
  const labelOf = (key: string) => choices.find((c) => c.key === key)?.label ?? key
  const toggle = (id: number) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const edit = (id: number, patch: Partial<BatchFile>) => setItems((list) => list.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  const chosen = items.filter((f) => !f.skip).length

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('spriteDlg.title')}</DialogTitle>
        <DialogDescription>{t('spriteDlg.lead', { n: items.length })}</DialogDescription>
      </DialogHeader>
      <datalist id="sprite-dlg-emotions">{STANDARD_EXPRESSIONS.map((e) => <option key={e} value={e} />)}</datalist>
      <datalist id="sprite-dlg-outfits">{outfits.map((o) => <option key={o} value={o} />)}</datalist>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain pr-1" data-testid="sprite-batch-body">
        {groups.length > 1 && (
          <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-3">
            <p className="text-xs font-medium">{t('spriteDlg.bulk')}</p>
            <div className={`grid gap-2 sm:items-end ${multi ? 'sm:grid-cols-[1fr_1fr_auto]' : 'sm:grid-cols-[1fr_auto]'}`}>
              {multi && (
                <div className="flex min-w-0 flex-col gap-1">
                  <Label className="text-xs">{t('spriteDlg.character')}</Label>
                  <CharacterSelect value={bulkChar} choices={choices} onChange={setBulkChar} label={`${t('spriteDlg.bulk')}: ${t('spriteDlg.character')}`} extra={{ value: KEEP, label: t('spriteDlg.bulkKeep') }} />
                </div>
              )}
              <div className="flex min-w-0 flex-col gap-1">
                <Label className="text-xs" htmlFor="sprite-bulk-outfit">{t('spriteDlg.outfit')}</Label>
                <Input id="sprite-bulk-outfit" list="sprite-dlg-outfits" value={bulkOutfit} onChange={(e) => setBulkOutfit(e.target.value)} placeholder={t('spriteDlg.bulkKeep')} className="max-md:h-10" />
              </div>
              <Button
                variant="outline" size="sm" className="max-md:h-10"
                disabled={bulkChar === KEEP && !bulkOutfit.trim()}
                onClick={() => setItems((list) => setGroup(list, list.map((f) => f.id), { ...(bulkChar !== KEEP ? { character: bulkChar } : {}), ...(bulkOutfit.trim() ? { outfit: bulkOutfit } : {}) }))}
              >
                {t('spriteDlg.bulkApply')}
              </Button>
            </div>
          </div>
        )}

        {(clashes.replaces > 0 || clashes.shared > 0) && (
          <fieldset className="flex flex-col gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs" data-testid="sprite-batch-clash">
            <legend className="flex items-center gap-1 px-1 text-xs font-medium">
              <WarningCircle className="size-4 text-amber-600 dark:text-amber-300" aria-hidden="true" />{t('spriteDlg.clashTitle')}
            </legend>
            {clashes.replaces > 0 && <p>{t('spriteDlg.clashCard', { n: clashes.replaces })}</p>}
            {clashes.shared > 0 && <p>{t('spriteDlg.clashBatch', { n: clashes.shared })}</p>}
            <div role="radiogroup" className="flex flex-col gap-1">
              {(['replace', 'both', 'skip'] as ClashMode[]).map((m) => (
                <label key={m} className="flex cursor-pointer items-start gap-2 max-md:min-h-10 max-md:items-center">
                  <input type="radio" name="sprite-clash" className="mt-0.5 size-4 accent-primary" checked={effective === m} onChange={() => setMode(m)} />
                  <span>{t(`spriteDlg.mode.${m}` as 'spriteDlg.mode.replace')}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <ul className="flex flex-col gap-2" aria-label={t('spriteDlg.title')}>
          {groups.map((g) => {
            const gid = g.ids[0]!
            const isOpen = open.has(gid)
            const title = multi ? `${labelOf(g.character)} · ${outfitName(g)}` : outfitName(g)
            const skipped = g.ids.length - g.active
            const unknown = g.ids.filter((id) => !items[id]!.skip && !standard.has(items[id]!.emotion.toLowerCase())).length
            const count = shown[gid] ?? PAGE
            return (
              <li key={gid} className="rounded-md border border-border" data-testid="sprite-batch-group">
                <button
                  type="button"
                  onClick={() => toggle(gid)}
                  aria-expanded={isOpen}
                  aria-label={t('spriteDlg.groupToggle', { group: title })}
                  className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left max-md:min-h-11"
                >
                  {isOpen ? <CaretDown className="size-4 shrink-0" aria-hidden="true" /> : <CaretRight className="size-4 shrink-0" aria-hidden="true" />}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t('spriteDlg.groupFiles', { n: g.ids.length })}{skipped > 0 ? ` · ${t('spriteDlg.groupSkipped', { n: skipped })}` : ''}
                  </span>
                </button>
                {unknown > 0 && (
                  <p className="flex items-center gap-1 px-3 pb-2 text-[11px] text-amber-700 dark:text-amber-300">
                    <WarningCircle className="size-3.5 shrink-0" aria-hidden="true" />{t('spriteDlg.unknownCount', { n: unknown })}
                  </p>
                )}
                {isOpen && (
                  <div className="flex flex-col gap-3 border-t border-border p-3">
                    <div className={`grid gap-2 ${multi ? 'sm:grid-cols-2' : ''}`}>
                      {multi && (
                        <div className="flex min-w-0 flex-col gap-1">
                          <Label className="text-xs">{t('spriteDlg.character')}</Label>
                          <CharacterSelect value={g.character} choices={choices} onChange={(key) => setItems((list) => setGroup(list, g.ids, { character: key }))} label={`${title}: ${t('spriteDlg.character')}`} />
                        </div>
                      )}
                      <div className="flex min-w-0 flex-col gap-1">
                        <Label className="text-xs" htmlFor={`sprite-outfit-${gid}`}>{t('spriteDlg.outfit')}</Label>
                        <CommitInput
                          id={`sprite-outfit-${gid}`}
                          list="sprite-dlg-outfits"
                          value={g.outfit}
                          placeholder={t('spriteDlg.outfitPh')}
                          className="max-md:h-10"
                          onCommit={(v) => setItems((list) => setGroup(list, g.ids, { outfit: v }))}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" className="max-md:h-10" onClick={() => setItems((list) => setSkip(list, g.ids, true))}>{t('spriteDlg.skipAll')}</Button>
                      <Button variant="outline" size="sm" className="max-md:h-10" onClick={() => setItems((list) => setSkip(list, g.ids, false))}>{t('spriteDlg.useAll')}</Button>
                    </div>
                    <ul className="flex flex-col gap-2">
                      {g.ids.slice(0, count).map((id) => {
                        const f = items[id]!
                        const isNew = !standard.has(f.emotion.toLowerCase())
                        return (
                          <li key={id} className={`grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1 sm:grid-cols-[2rem_minmax(0,1fr)_9rem_auto] ${f.skip ? 'opacity-50' : ''}`}>
                            <Thumb file={files[id]!} />
                            <span className="min-w-0 truncate text-xs text-muted-foreground" title={f.name}>{f.name}</span>
                            <div className="col-start-2 flex min-w-0 items-center gap-2 sm:contents">
                              <CommitInput
                                value={f.emotion}
                                list="sprite-dlg-emotions"
                                aria-label={t('spriteDlg.fileEmotion', { name: f.name })}
                                title={isNew ? t('spriteDlg.unknown') : undefined}
                                className={`h-8 min-w-0 flex-1 text-xs max-md:h-10 sm:w-full ${isNew ? 'border-amber-500/70' : ''}`}
                                onCommit={(v) => { const e = v.trim().toLowerCase(); if (e) edit(id, { emotion: e }) }}
                              />
                              <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs max-md:min-h-10">
                                <input type="checkbox" className="size-4 accent-primary" checked={f.skip} onChange={(e) => edit(id, { skip: e.target.checked })} aria-label={t('spriteDlg.fileSkip', { name: f.name })} />
                                {t('spriteDlg.skip')}
                              </label>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                    {g.ids.length > count && (
                      <Button variant="ghost" size="sm" className="w-fit max-md:h-10" onClick={() => setShown((s) => ({ ...s, [gid]: count + PAGE }))}>
                        {t('spriteDlg.moreFiles', { n: Math.min(PAGE, g.ids.length - count) })}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>

      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground" aria-live="polite">
          {chosen === 0 ? t('spriteDlg.noneLeft') : t('spriteDlg.willAdd', { n: plan.adds.length })}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" className="max-md:h-11" onClick={onCancel}>{t('spriteDlg.cancel')}</Button>
          <Button className="max-md:h-11" disabled={plan.adds.length === 0} onClick={() => onConfirm({ plan, files })}>
            {t('spriteDlg.confirm', { n: plan.adds.length })}
          </Button>
        </div>
      </div>
    </>
  )
}

/**
 * The step between dropping sprite files and storing them (#170): the names are read into groups (character · outfit),
 * the user fixes what was guessed wrong, sees which slots collide and picks what happens to them, and only then
 * "Add N sprites" starts the upload. All the choosing lives in lib/sprite-batch.ts.
 */
export function SpriteBatchDialog({ files, owners, choices, existing, outfits, onCancel, onConfirm }: {
  files: File[] | null
  owners: SpriteOwner[]
  choices: SpriteChoice[]
  existing: SpriteLike[]
  outfits: string[]
  onCancel: () => void
  onConfirm: (r: SpriteBatchResult) => void
}) {
  return (
    <Dialog open={!!files} onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none flex-col gap-3 overflow-hidden sm:max-w-2xl">
        {files && <Body files={files} owners={owners} choices={choices} existing={existing} outfits={outfits} onCancel={onCancel} onConfirm={onConfirm} />}
      </DialogContent>
    </Dialog>
  )
}
