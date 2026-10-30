import { useMemo, useRef, useState } from 'react'
import { CaretDown, CaretRight, Plus, Trash, UploadSimple, X } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useConfirm } from '@/components/ui/confirm'
import { ImageViewer } from '@/components/ui/image-viewer'
import { SpriteBatchDialog, type SpriteBatchResult, type SpriteChoice } from '@/components/character/sprite-batch-dialog'
import { useT } from '@/hooks/use-t'
import { storeImageAsset, SPRITE_MAX_PX, SPRITE_QUALITY } from '@/lib/engine'
import { beginImport } from '@/lib/import-progress'
import {
  DEFAULT_OUTFIT, STANDARD_EXPRESSIONS, hasSpriteSets, outfitName, spriteKey,
  type SpriteLike, type SpriteOwner,
} from '@/lib/expressions'
import { mergeSprites } from '@/lib/sprite-batch'
import type { Character } from '@/lib/types'

type Sprite = Character['expressions'][number]

/** A sprite goes to the asset store at full quality with its transparency, and the card keeps the URL (#167). */
const storeSprite = (file: File) => storeImageAsset(file, SPRITE_MAX_PX, file.name, { alpha: true, quality: SPRITE_QUALITY })
/** Sprites an older version kept as data URLs inside the card move to the store in the same save. */
const moveOldSprites = (list: Sprite[]) => Promise.all(list.map(async (e) => {
  if (!e.url?.startsWith('data:')) return e
  try { return { ...e, url: await storeImageAsset(e.url, SPRITE_MAX_PX, e.name) } } catch { return e }
}))

const low = (s: string) => s.trim().toLowerCase()
const IMAGE_NAME = /\.(png|jpe?g|webp|gif|avif|bmp)$/i

/** One picture slot: the picture (zoom), its name (click: the default expression), a delete mark and a replace link. */
function SpriteCell({ s, isDefault, onZoom, onDefault, onDelete, onReplace }: {
  s: Sprite
  isDefault: boolean
  onZoom: () => void
  onDefault: () => void
  onDelete: () => void
  onReplace: (file: File | undefined) => void
}) {
  const t = useT()
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 rounded-md border border-border p-2">
      {s.url ? (
        <button type="button" onClick={onZoom} className="cursor-zoom-in rounded" aria-label={t('sprites.slotOpen', { name: s.name })}>
          <img src={s.url} alt={`${s.name} expression`} loading="lazy" decoding="async" className="size-16 rounded object-cover" />
        </button>
      ) : (
        <div className="flex size-16 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground">{t('sprites.slotEmpty')}</div>
      )}
      <span className="flex w-full min-w-0 items-center gap-1 text-[11px]">
        <button type="button" className="min-w-0 flex-1 truncate text-left hover:text-primary max-md:min-h-8" title={t('sprites.slotDefault')} onClick={onDefault}>
          {s.name}
        </button>
        {isDefault && <Badge variant="secondary" className="text-[9px]">{t('sprites.defBadge')}</Badge>}
        <button type="button" className="text-muted-foreground hover:text-destructive max-md:p-2" aria-label={t('sprites.slotDelete', { name: s.name })} onClick={onDelete}>
          <X className="size-3" aria-hidden="true" />
        </button>
      </span>
      <label className="cursor-pointer text-[10px] text-primary hover:underline max-md:py-1.5 max-md:text-xs">
        {t('sprites.slotReplace')}
        <input type="file" accept="image/*" className="hidden" aria-label={t('sprites.slotReplaceAria', { name: s.name })} onChange={(ev) => { onReplace(ev.target.files?.[0]); ev.target.value = '' }} />
      </label>
    </div>
  )
}

/**
 * The card editor's Sprites tab. A card with no characters or outfits keeps the flat grid it always had; once a sprite
 * belongs to a voice or an outfit the tab groups them: one section per voice (and "Shared"), one fold per outfit.
 * Adding files goes through the dialog (sprite-batch-dialog.tsx) and then one progress card (#169, #170).
 */
export function SpritesPanel({ c, up, cRef }: { c: Character; up: (patch: Partial<Character>) => void; cRef: { current: Character } }) {
  const t = useT()
  const [confirm, confirmDialog] = useConfirm()
  const [newExpression, setNewExpression] = useState('')
  const [zoom, setZoom] = useState<{ src: string; title: string } | null>(null)
  const [pending, setPending] = useState<File[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [folds, setFolds] = useState<Record<string, boolean>>({})
  const input = useRef<HTMLInputElement>(null)

  const voices = useMemo(() => (c.voices ?? []).filter((v) => v.name.trim()), [c.voices])
  const sets = hasSpriteSets(c.expressions)
  const worn = low(c.outfit ?? '') || DEFAULT_OUTFIT

  // who a file name can name: the card itself (its name), and each voice
  const owners = useMemo<SpriteOwner[]>(() => [{ label: c.name, key: '' }, ...voices.map((v) => ({ label: v.name, key: v.name }))], [c.name, voices])
  const choices = useMemo<SpriteChoice[]>(() => [{ key: '', label: t('spriteDlg.cardItself') }, ...voices.map((v) => ({ key: v.name, label: v.name }))], [voices, t])
  const outfitNames = useMemo(() => [...new Set(c.expressions.map(outfitName))], [c.expressions])

  const choose = (list: FileList | File[] | null) => {
    const all = Array.from(list ?? [])
    if (!all.length) return
    const images = all.filter((f) => f.type.startsWith('image/') || IMAGE_NAME.test(f.name))
    if (images.length < all.length) toast.warning(t('sprites.notImages', { n: all.length - images.length }))
    // a stable order: "later wins" and "keep both" mean the same thing every time
    images.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    if (images.length) setPending(images)
  }

  /** Stores the planned files one by one under the progress card, then puts them on the card in one edit. */
  const addBatch = async ({ plan, files }: SpriteBatchResult) => {
    setPending(null)
    const items = plan.adds.map((a) => ({ file: files[a.id]!, name: a.name, character: a.character, outfit: a.outfit }))
    if (!items.length) return
    setBusy(true)
    const job = beginImport(t('sprites.job'), items.length)
    const stored: { name: string; character: string; outfit: string; url: string }[] = []
    let summary: string | undefined
    try {
      for (const it of items) {
        if (job.cancelled()) break
        job.start(it.file.name)
        try {
          stored.push({ name: it.name, character: it.character, outfit: it.outfit, url: await storeSprite(it.file) })
          job.finish()
        } catch (e) {
          job.finish(false, String((e as Error)?.message ?? e))
        }
      }
      let replaced = 0
      if (stored.length) {
        job.step(t('sprites.saving'))
        // merged into the card as it is NOW: the user may have edited other things while the files were stored
        const merged = mergeSprites(cRef.current.expressions, stored)
        replaced = merged.replaced
        up({ expressions: await moveOldSprites(merged.list as Sprite[]) })
      }
      const parts = [job.cancelled() ? t('sprites.sumStopped', { added: stored.length, total: items.length }) : stored.length ? t('sprites.sumDone', { added: stored.length }) : t('sprites.sumNone')]
      if (replaced) parts.push(t('sprites.sumReplaced', { n: replaced }))
      summary = `${parts.join(', ')}.${stored.length ? ` ${t('sprites.sumSave')}` : ''}`
    } catch (e) {
      toast.error(String((e as Error)?.message ?? e))
    } finally {
      job.end(summary)
      setBusy(false)
    }
  }

  const replaceOne = async (s: Sprite, file: File | undefined) => {
    if (!file) return
    try {
      const url = await storeSprite(file)
      const key = spriteKey(s)
      up({ expressions: await moveOldSprites(cRef.current.expressions.map((e) => (spriteKey(e) === key ? { ...e, url } : e))) })
    } catch (e) { toast.error(String((e as Error).message ?? e)) }
  }

  const removeWhere = (drop: (e: Sprite) => boolean) => {
    const rest = c.expressions.filter((e) => !drop(e))
    const lostDefault = !rest.some((e) => e.name === c.defaultExpression)
    const outfitGone = !!c.outfit && !rest.some((e) => low(outfitName(e)) === low(c.outfit!))
    up({
      expressions: rest,
      ...(lostDefault && c.expressions.some((e) => e.name === c.defaultExpression) ? { defaultExpression: rest[0]?.name ?? undefined } : {}),
      ...(outfitGone ? { outfit: undefined } : {}),
    } as Partial<Character>)
  }

  const addSlot = () => {
    const name = newExpression.trim()
    if (!name || c.expressions.some((e) => spriteKey(e) === spriteKey({ name }))) return
    up({ expressions: [...c.expressions, { name, url: null }] })
    setNewExpression('')
  }

  const cell = (s: Sprite) => (
    <SpriteCell
      key={spriteKey(s)}
      s={s}
      isDefault={c.defaultExpression === s.name}
      onZoom={() => setZoom({ src: s.url!, title: `${c.name}: ${[s.character, s.outfit, s.name].filter(Boolean).join(' · ')}` })}
      onDefault={() => up({ defaultExpression: s.name })}
      onDelete={() => removeWhere((e) => spriteKey(e) === spriteKey(s))}
      onReplace={(file) => { void replaceOne(s, file) }}
    />
  )

  // sections for the grouped view: [voice or shared] → [outfit] → sprites
  const sections = useMemo(() => {
    const byChar = new Map<string, Sprite[]>()
    for (const s of c.expressions) {
      const k = s.character?.trim() ?? ''
      byChar.set(k, [...(byChar.get(k) ?? []), s])
    }
    const known = new Set(voices.map((v) => low(v.name)))
    const keys: { key: string; label: string; note?: string; list: Sprite[] }[] = []
    const sharedList = byChar.get('') ?? []
    if (sharedList.length || !voices.length) keys.push({ key: '', label: voices.length ? t('sprites.shared') : '', note: voices.length ? t('sprites.sharedHint') : undefined, list: sharedList })
    for (const v of voices) {
      const own = [...byChar.entries()].filter(([k]) => low(k) === low(v.name)).flatMap(([, l]) => l)
      keys.push({ key: v.name, label: v.name, list: own })
    }
    for (const [k, l] of byChar) if (k && !known.has(low(k))) keys.push({ key: k, label: k, note: t('sprites.notAVoice'), list: l })
    return keys.map((s) => {
      const outfits = new Map<string, Sprite[]>()
      for (const e of s.list) outfits.set(outfitName(e), [...(outfits.get(outfitName(e)) ?? []), e])
      return { ...s, outfits: [...outfits.entries()] }
    })
  }, [c.expressions, voices, t])

  const deleteOutfit = async (character: string, outfit: string, n: number) => {
    const ok = await confirm({ title: t('sprites.deleteOutfitAsk', { outfit }), description: t('sprites.deleteOutfitBody', { n }), actionLabel: t('sprites.delete') })
    if (ok) removeWhere((e) => low(e.character ?? '') === low(character) && low(outfitName(e)) === low(outfit))
  }

  const foldKey = (character: string, outfit: string) => `${character}\u0001${outfit}`

  return (
    <div
      className={`flex flex-col gap-3 rounded-md ${dragging ? 'ring-2 ring-primary/60 ring-offset-2 ring-offset-background' : ''}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true) } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false) }}
      onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); setDragging(false); if (!busy) choose(e.dataTransfer.files) } }}
      data-testid="sprites-panel"
    >
      <p className="text-xs text-muted-foreground">{t('sprites.intro')}</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs" htmlFor="new-expression">{t('sprites.addSlot')}</Label>
          <Input
            id="new-expression"
            list="standard-expressions"
            value={newExpression}
            onChange={(e) => setNewExpression(e.target.value.replace(/[^a-zA-Z0-9-_ ]/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSlot() } }}
            placeholder="joy"
            className="h-8 w-36 text-xs max-md:h-10"
            aria-label={t('sprites.addSlotName')}
          />
          <datalist id="standard-expressions">
            {STANDARD_EXPRESSIONS.map((e) => <option key={e} value={e} />)}
          </datalist>
        </div>
        <Button variant="outline" size="sm" className="h-8 text-xs max-md:h-10" disabled={!newExpression.trim()} onClick={addSlot}>
          <Plus className="size-3.5" aria-hidden="true" /> {t('sprites.addSlotBtn')}
        </Button>
        <input ref={input} type="file" accept="image/*" multiple className="hidden" data-testid="sprite-files" onChange={(e) => { choose(e.target.files); e.target.value = '' }} />
        <Button variant="outline" size="sm" className="ml-auto h-8 text-xs max-md:h-10" disabled={busy} onClick={() => input.current?.click()}>
          <UploadSimple className="size-3.5" aria-hidden="true" /> {busy ? `${t('sprites.job')}…` : t('sprites.addPack')}
        </Button>
      </div>

      {c.expressions.length === 0 && (
        <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
          <p>{t('sprites.empty')}</p>
          <Button variant="outline" size="sm" className="max-md:h-10" disabled={busy} onClick={() => input.current?.click()}>
            <UploadSimple className="size-4" aria-hidden="true" /> {t('sprites.addPack')}
          </Button>
        </div>
      )}

      {!sets && c.expressions.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{c.expressions.map(cell)}</div>
      )}

      {sets && sections.map((sec) => (
        <section key={sec.key || '__shared__'} className="flex flex-col gap-2" aria-label={sec.label || t('sprites.cardItself')} data-testid="sprite-section">
          {sec.label && (
            <header className="flex flex-wrap items-baseline gap-x-2 border-b border-border pb-1">
              <h3 className="text-sm font-medium">{sec.label}</h3>
              <span className="text-[11px] text-muted-foreground">{t('sprites.count', { n: sec.list.length })}</span>
              {sec.note && <span className="min-w-0 text-[11px] text-muted-foreground">{sec.note}</span>}
            </header>
          )}
          {sec.list.length === 0 && <p className="text-xs text-muted-foreground">{t('sprites.emptyCharacter', { name: sec.label })}</p>}
          {sec.outfits.map(([outfit, list]) => {
            const fk = foldKey(sec.key, outfit)
            const isWorn = low(outfit) === worn
            const open = folds[fk] ?? (isWorn || sec.outfits.length === 1)
            return (
              <div key={outfit} className="rounded-md border border-border" data-testid="sprite-outfit">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setFolds((f) => ({ ...f, [fk]: !open }))}
                    className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-xs font-medium max-md:min-h-10"
                  >
                    {open ? <CaretDown className="size-4 shrink-0" aria-hidden="true" /> : <CaretRight className="size-4 shrink-0" aria-hidden="true" />}
                    <span className="min-w-0 truncate">{outfit === DEFAULT_OUTFIT ? t('sprites.outfitDefault') : outfit}</span>
                    <span className="shrink-0 font-normal text-muted-foreground">{t('sprites.count', { n: list.length })}</span>
                    {isWorn && <Badge variant="secondary" className="shrink-0 text-[9px]">{t('sprites.worn')}</Badge>}
                  </button>
                  {!isWorn && (
                    <Button variant="ghost" size="sm" className="h-7 text-[11px] max-md:h-10" onClick={() => up({ outfit: low(outfit) === DEFAULT_OUTFIT ? undefined : outfit })}>
                      {t('sprites.wear')}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-7 text-[11px] text-muted-foreground hover:text-destructive max-md:h-10" onClick={() => { void deleteOutfit(sec.key, outfit, list.length) }}>
                    <Trash className="size-3.5" aria-hidden="true" /> {t('sprites.deleteOutfit')}
                  </Button>
                </div>
                {open && <div className="grid grid-cols-3 gap-2 border-t border-border p-2 sm:grid-cols-5">{list.map(cell)}</div>}
              </div>
            )
          })}
        </section>
      ))}

      <SpriteBatchDialog
        files={pending}
        owners={owners}
        choices={choices}
        existing={c.expressions as SpriteLike[]}
        outfits={outfitNames}
        onCancel={() => setPending(null)}
        onConfirm={(r) => { void addBatch(r) }}
      />
      <ImageViewer src={zoom?.src ?? null} title={zoom?.title ?? ''} onClose={() => setZoom(null)} />
      {confirmDialog}
    </div>
  )
}
