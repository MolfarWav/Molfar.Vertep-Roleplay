
import { useEffect, useMemo, useRef, useState } from 'react'
import { Gauge, ArrowLeft, Translate, Star, Chats, Copy, Export, Plus, Trash, ClockCounterClockwise, Palette, Image as ImageIcon, CaretDown, CaretLeft, CaretRight, ClipboardText, Check, X, UserCircle, ListBullets, ChatsCircle, SlidersHorizontal, Sparkle, Brain, BookOpen, Smiley, Images, Code, SpeakerHigh, CircleNotch, type Icon as PhosphorIcon } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, tabsListVariants } from '@/components/ui/tabs'
import { useConfirm } from '@/components/ui/confirm'
import { VariantField } from '@/components/character/variant-field'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Pager, clampPage } from '@/components/ui/pager'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { FieldDescription } from '@/components/ui/field'
import { FieldTranslateButton } from '@/components/character/field-translate-button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { loadOwnBooks, useApp } from '@/lib/store'
import { useGuidePlace } from '@/components/guide/place'
import { useBackClose } from '@/hooks/use-back-close'
import { useT } from '@/hooks/use-t'
import type { MsgKey } from '@/lib/i18n'
import { ALL_PANELS, EDITOR_TABS, TAB_PANELS, panelGroup, panelStep, tabOfPanel } from '@/lib/editor-tabs'
import { SoulTab, type SoulStatus } from '@/components/dashboard/soul-tab'
import { MemoryTab } from '@/components/character/memory-tab'
import { ScrollStrip } from '@/components/ui/scroll-strip'
import { cn } from '@/lib/utils'
import { CardKindMenu } from '@/components/dashboard/card-kind'
import { CharacterBooks } from '@/components/character/character-books'
import { ProfileTab } from '@/components/character/profile-tab'
import { VoicesEditor } from '@/components/character/voices-editor'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { previewPendingTranslation } from '@/lib/card-translate'
import { usePendingTranslations, savePendingTranslation, discardPendingTranslation } from '@/lib/card-translate-store'
import { TranslateMenu } from '@/components/character/translate-menu'
import { useCardDraft } from '@/components/character/use-card-draft'
import { useCardTasks } from '@/components/character/use-card-tasks'
import { DraftDialogs } from '@/components/character/draft-dialogs'
import { estimateTokens, formatTokens, uid } from '@/lib/tokens'
import { characterToExportCard, fileToDataUrl, fetchEdgeVoices, storeImageAsset } from '@/lib/engine'
import { dominantColor } from '@/lib/image-gen'
import { STANDARD_EXPRESSIONS, expressionNameFromFile } from '@/lib/expressions'
import { ImageViewer } from '@/components/ui/image-viewer'
import { speakText, edgeVoiceLabel, ENGINE_VOICES } from '@/lib/tts'
import { buildCardPng, downloadCardPng } from '@/lib/png-card'
import { buildCharx, cardJson } from '@/lib/charx'
import { saveFile } from '@/lib/export'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { markProfileSections, setMarkProfileSections } from '@/lib/export-prefs'
import { profileOf } from '@/lib/profile'
import type { Character } from '@/lib/types'
import { copyText, DEFAULT_AVATAR } from '@/lib/utils'
import { cardTalkativeness, guessTalkativeness } from '@/lib/talkativeness'

function TokenBadge({ text }: { text: string }) {
  return <Badge variant="outline" className="text-[10px] text-muted-foreground">{formatTokens(estimateTokens(text))} tok</Badge>
}

const TAB_ICONS: Record<string, PhosphorIcon> = {
  core: UserCircle, profile: Smiley, dialogue: ChatsCircle, advanced: SlidersHorizontal, soul: Sparkle, memory: Brain,
  lorebook: BookOpen, colors: Palette, sprites: Images, gallery: ImageIcon, regex: Code, voice: SpeakerHigh,
  more: ListBullets,
}
/** The tinted border and fill per group: Core sky, Profile emerald, Soul violet, Memory pink, Lorebook amber,
 *  everything else slate. The desktop strip paints all twelve panels with their group's
 *  color; the phone strip paints the six groups the same way. */
const GROUP_TINT: Record<string, string> = {
  core: 'border-sky-500/30 bg-sky-500/10 data-active:bg-sky-500/25',
  profile: 'border-emerald-500/30 bg-emerald-500/10 data-active:bg-emerald-500/25',
  soul: 'border-violet-500/30 bg-violet-500/10 data-active:bg-violet-500/25',
  memory: 'border-pink-500/30 bg-pink-500/10 data-active:bg-pink-500/25',
  lorebook: 'border-amber-500/30 bg-amber-500/10 data-active:bg-amber-500/25',
  more: 'border-slate-500/30 bg-slate-500/10 data-active:bg-slate-500/25',
}
/** Arrow keys move the selection and the focus with it (the tab row is one tab stop, roving). */
function focusTab(list: HTMLElement, key: string) {
  requestAnimationFrame(() => list.querySelector<HTMLElement>(`[data-tab="${key}"]`)?.focus())
}
/** The look of a tab button: the app's own TabsTrigger look plus a tinted border. */
const TAB_BUTTON = 'inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs font-medium whitespace-nowrap text-foreground transition-all hover:brightness-125 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring data-active:shadow-sm'
/** The readable name of one panel: single panels reuse their group label. */
function panelLabel(panel: string, t: (key: MsgKey) => string): string {
  if (panel === 'soul') return t('soul.tab')
  if (panel === 'profile' || panel === 'lorebook' || panel === 'memory') return t(`editor.tab.${panel}` as MsgKey)
  return t(`editor.panel.${panel}` as MsgKey)
}

export function CharacterEditor({ character, onClose }: { character: Character; onClose: () => void }) {
  const t = useT()
  // the open panel (core, dialogue, advanced…); the six tabs are derived from it
  const [tab, setTab] = useState('core')
  // the last panel of the More tab, so that tab opens where the user left it
  const [lastMore, setLastMore] = useState('advanced')
  // the Soul tab stays mounted while hidden: only its own visit counts for the tour
  useGuidePlace('soul', tab === 'soul')
  const [soulStatus, setSoulStatus] = useState<SoulStatus>(null)
  /** Opens a panel: a panel name (a link, the store, an older build) or one of the six
   *  tabs. Panels keep the old names, so anything that asked for an old tab still lands
   *  on the panel it asked for, inside the tab that now holds it. */
  const openPanel = (asked: string | null | undefined) => {
    if (!asked) return
    const group = tabOfPanel(asked)
    if ((EDITOR_TABS as readonly string[]).includes(asked)) {
      if (tabOfPanel(tab) === group) return // the tab is open already: keep the panel
      setTab(group === 'more' ? lastMore : TAB_PANELS[group][0])
      return
    }
    const panel = TAB_PANELS[group].includes(asked) ? asked : TAB_PANELS[group][0]
    setTab(panel)
    if (group === 'more') setLastMore(panel)
  }
  /** A click on one of the twelve desktop buttons: that very panel. (`openPanel('core')` reads the word as the
   *  Core tab and keeps the open panel, so a click on Core while Example dialogue was open did nothing.) */
  const showPanel = (panel: string) => {
    setTab(panel)
    if (tabOfPanel(panel) === 'more') setLastMore(panel)
  }
  // opened on a given tab (the chat's "souls proposed" toast)
  const wantTab = useApp((s) => s.characterEditorTab)
  useEffect(() => {
    if (!wantTab) return
    openPanel(wantTab)
    useApp.setState({ characterEditorTab: null })
  }, [wantTab])
  const updateCharacter = useApp((s) => s.updateCharacter)
  const duplicateCharacter = useApp((s) => s.duplicateCharacter)
  const lorebooks = useApp((s) => s.lorebooks)
  // a translation waiting for Save / Discard: the fields show it, read-only
  const pending = usePendingTranslations((s) => s.byId[character.id])
  const preview = useMemo(
    () => (pending ? previewPendingTranslation(pending, character, lorebooks.find((b) => b.id === pending.bookId && !b.stub)) : null),
    [pending, character, lorebooks],
  )
  // every edit goes to the draft; the card is written once, by Save changes (GitHub #103)
  const tasks = useCardTasks(character.id)
  const draftState = useCardDraft(character, { frozen: !!preview, side: tasks.side })
  const { up, dirty, dirtyNow, count: changeCount, panels: changedPanelSet, cRef } = draftState
  const c: Character = preview ? { ...draftState.c, ...preview.patch } : draftState.c
  // the phone's back gesture asks about unsaved changes and stays when there are some
  useBackClose(true, () => { onClose(); return dirtyNow() ? false : undefined })
  const regexScripts = useApp((s) => s.regexScripts)
  const chats = useApp((s) => s.chats)
  const startChatAndOpen = useApp((s) => s.startChatAndOpen)
  const [tokenReportOpen, setTokenReportOpen] = useState(false)
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [compareVersion, setCompareVersion] = useState<Character['versions'][number] | null>(null)
  const [lightboxId, setLightboxId] = useState<string | null>(null)
  const [zoom, setZoom] = useState<{ src: string; title: string } | null>(null)
  const [newExpression, setNewExpression] = useState('')
  const [confirm, confirmDialog] = useConfirm()
  const [voiceOptions, setVoiceOptions] = useState<{ value: string; label: string }[]>(
    ENGINE_VOICES.map((v) => ({ value: v, label: v })))
  // galleries and version histories grow for years — both page
  const GALLERY_PAGE = 24
  const [galleryPage, setGalleryPage] = useState(0)
  const safeGalleryPage = clampPage(galleryPage, c.gallery.length, GALLERY_PAGE)
  const pagedGallery = c.gallery.slice(safeGalleryPage * GALLERY_PAGE, safeGalleryPage * GALLERY_PAGE + GALLERY_PAGE)
  const VERSION_PAGE = 20
  const [versionPage, setVersionPage] = useState(0)
  const safeVersionPage = clampPage(versionPage, c.versions.length, VERSION_PAGE)
  const pagedVersions = c.versions.slice(safeVersionPage * VERSION_PAGE, safeVersionPage * VERSION_PAGE + VERSION_PAGE)
  useEffect(() => {
    let alive = true
    void fetchEdgeVoices().then((vs) => {
      if (!alive) return
      setVoiceOptions([
        ...vs.map((v) => ({ value: v, label: edgeVoiceLabel(v) })),
        ...ENGINE_VOICES.map((v) => ({ value: v, label: `${v} (endpoint)` })),
      ])
    })
    return () => { alive = false }
  }, [])
  // "Mark the profile sections" (#105): a choice kept between exports, shown only for a card with a profile
  const [markSections, setMarkSections] = useState(markProfileSections)
  const hasProfile = !!profileOf(character)
  const avatarInput = useRef<HTMLInputElement>(null)
  const spriteInput = useRef<HTMLInputElement>(null)
  const galleryInput = useRef<HTMLInputElement>(null)

  const exportPng = async () => {
    try {
      const s = savedCard()
      // the card's own book is a summary until loaded: an export without it would lose the book
      const bytes = await buildCardPng(s.avatar || DEFAULT_AVATAR, characterToExportCard(s, await loadOwnBooks([s])))
      downloadCardPng(bytes, s.name)
      toast.success(`Exported ${s.name} as a PNG card`)
    } catch (e) { toast.error(String((e as Error).message ?? e)) }
  }

  /** Exports and Duplicate work on the card as saved; the editor asks first when there are unsaved changes. */
  const savedCard = (): Character => useApp.getState().characters.find((x) => x.id === character.id) ?? character
  const fileBaseOf = (card: Character) => card.name.replace(/[^\p{L}\p{N}-]+/gu, '_').slice(0, 60) || 'character'
  const exportCharx = async () => {
    try {
      const s = savedCard()
      const bytes = await buildCharx(s, await loadOwnBooks([s]))
      saveFile(new Blob([bytes as BlobPart], { type: 'application/zip' }), `${fileBaseOf(s)}.charx`)
      toast.success(`Exported ${s.name} as CHARX with ${s.expressions.length} emotion image${s.expressions.length === 1 ? '' : 's'}`)
    } catch (e) { toast.error(String((e as Error).message ?? e)) }
  }
  const exportJson = async () => {
    try {
      const s = savedCard()
      saveFile(new Blob([cardJson(s, await loadOwnBooks([s]))], { type: 'application/json' }), `${fileBaseOf(s)}.json`)
      toast.success(`Exported ${s.name} as JSON`)
    } catch (e) { toast.error(String((e as Error).message ?? e)) }
  }

  const changeAvatar = async (file: File | undefined) => {
    if (!file) return
    try {
      up({ avatar: await fileToDataUrl(file, 512) })
      toast.success('Avatar updated')
    } catch (e) { toast.error(String((e as Error).message ?? e)) }
  }

  /** Sprites: a whole pack at once. Each file goes to the expression its
   *  FILENAME names ("joy.png" → joy), creating the slot when the character
   *  doesn't have it yet, so a downloaded pack drops in without hand-typing
   *  a slot per emotion first. */
  const assignSprites = async (files: FileList | null) => {
    if (!files?.length) return
    const expressions = [...c.expressions]
    let n = 0
    for (const file of Array.from(files)) {
      let url: string
      try { url = await fileToDataUrl(file, 256, { alpha: true }) } catch { continue } // not an image
      const name = expressionNameFromFile(file.name)
      const at = expressions.findIndex((e) => e.name.toLowerCase() === name)
      if (at >= 0) expressions[at] = { ...expressions[at]!, url }
      else expressions.push({ name, url })
      n++
    }
    if (n) { up({ expressions }); toast.success(`Assigned ${n} sprite${n > 1 ? 's' : ''}`) }
  }

  const setSprite = async (name: string, file: File | undefined) => {
    if (!file) return
    try {
      const url = await fileToDataUrl(file, 256, { alpha: true })
      up({ expressions: c.expressions.map((e) => e.name === name ? { ...e, url } : e) })
    } catch (e) { toast.error(String((e as Error).message ?? e)) }
  }

  const addGallery = async (files: FileList | null) => {
    if (!files?.length) return
    // images go to the engine's asset store and the card keeps their URLs (GitHub #17)
    const added: typeof c.gallery = []
    let failed = ''
    for (const file of Array.from(files)) {
      // only images decode here: a video was skipped silently before, now it says so
      if (!file.type.startsWith('image/')) { failed = `${file.name}: only images can be added`; continue }
      const caption = file.name.replace(/\.[^.]+$/, '')
      try { added.push({ id: uid('gal'), url: await storeImageAsset(file, 1024, file.name), type: 'image', caption }) } catch (e) { failed = `${file.name}: ${(e as Error).message}` }
    }
    const n = added.length
    if (n) {
      // older items held as data URLs move to the store in the same save
      const kept = await Promise.all(c.gallery.map(async (g) => {
        if (!g.url.startsWith('data:')) return g
        try { return { ...g, url: await storeImageAsset(g.url, 1024, g.caption) } } catch { return g }
      }))
      up({ gallery: [...kept, ...added] })
      toast.success(`Added ${n} item${n > 1 ? 's' : ''}`)
    }
    if (failed) toast.error(`Not added: ${failed}`)
  }

  const lightboxIndex = c.gallery.findIndex((g) => g.id === lightboxId)
  const lightboxItem = lightboxIndex >= 0 ? c.gallery[lightboxIndex]! : null
  const totalTokens = estimateTokens(c.description + c.personality + c.scenario + c.firstMessage + c.exampleDialogue + c.systemPromptOverride + c.postHistoryInstructions)
  const permanentTokens = estimateTokens(c.description + c.personality)
  const chatCount = chats.filter((ch) => ch.characterId === c.id).length
  const openChatsFor = useApp((s) => s.openChatsFor)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {pending && (
        <div role="status" className="flex flex-wrap items-center gap-2 border-b border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm" data-testid="translation-banner">
          <Translate className="size-4 shrink-0 text-sky-600 dark:text-sky-300" aria-hidden="true" />
          <span className="min-w-0 flex-1 font-medium">{t('tr.banner', { target: pending.meta.target })}</span>
          <Button size="sm" className="h-7" onClick={() => savePendingTranslation(character.id, character.name)}>{t('tr.save')}</Button>
          <Button size="sm" variant="outline" className="h-7" onClick={() => discardPendingTranslation(character.id)}>{t('tr.discard')}</Button>
        </div>
      )}
      {/* header + tab strip scroll WITH the tab content (mobile keyboard room) */}
      <ImageViewer src={zoom?.src ?? null} title={zoom?.title ?? ''} onClose={() => setZoom(null)} />
      <Tabs value={tab} className="flex min-h-0 flex-1 flex-col">
        <ScrollArea className="min-h-0 flex-1">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Back to characters">
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Button>
        <img src={c.avatar || DEFAULT_AVATAR} alt="" className="size-8 rounded-md object-cover" />
        <h1 className="text-sm font-semibold max-md:min-w-0 max-md:flex-1 max-md:truncate" style={{ color: c.colors.name || undefined }}>{c.name}</h1>
        {!c.isGroup && <CardKindMenu c={character} />}
        {/* phone: the three counts are one line, the tools one row under it, so the header is three rows, not a pile of chips */}
        <div className="grid basis-full grid-cols-3 gap-2 md:hidden max-md:order-1" data-testid="card-facts">
          <div className="flex min-w-0 flex-col rounded-lg border border-sky-500/40 bg-sky-500/10 px-2.5 py-1.5" title="Estimated size of the whole card">
            <span className="truncate text-[11px] text-muted-foreground">tokens</span>
            <span className="text-sm font-semibold tabular-nums">{formatTokens(totalTokens)}</span>
          </div>
          <div className="flex min-w-0 flex-col rounded-lg border border-violet-500/40 bg-violet-500/10 px-2.5 py-1.5" title="Description and personality: sent with every reply">
            <span className="truncate text-[11px] text-muted-foreground">permanent</span>
            <span className="text-sm font-semibold tabular-nums">{formatTokens(permanentTokens)}</span>
          </div>
          <button
            type="button"
            disabled={chatCount === 0}
            onClick={() => openChatsFor(c.id)}
            aria-label={`Show the chats of ${c.name} (${chatCount})`}
            className="flex min-h-10 min-w-0 items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-60"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[11px] text-muted-foreground">{chatCount === 1 ? 'chat' : 'chats'}</span>
              <span className="text-sm font-semibold tabular-nums">{chatCount}</span>
            </span>
            {chatCount > 0 && <CaretRight className="size-4 shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden="true" />}
          </button>
        </div>
        <Badge variant="secondary" title="Estimated size of the whole card" className="max-md:hidden">{formatTokens(totalTokens)} tokens</Badge>
        <Badge variant="outline" title="Description and personality: sent with every reply" className="max-md:hidden">{formatTokens(permanentTokens)} permanent tokens</Badge>
        <button
          type="button"
          disabled={chatCount === 0}
          onClick={() => openChatsFor(c.id)}
          title="Show the chats of this card"
          aria-label={`Show the chats of ${c.name} (${chatCount})`}
          className="rounded-4xl outline-none focus-visible:ring-2 focus-visible:ring-ring/60 max-md:hidden"
        >
          <Badge variant="outline" className="font-semibold hover:bg-muted">{chatCount} {chatCount === 1 ? 'chat' : 'chats'}</Badge>
        </button>
        {/* the id is the card's folder: what to give Molfar so it edits this
            card and not one with a similar name */}
        <button
          type="button"
          onClick={() => {
            // the app runs in a sandboxed frame where the clipboard API is refused: copyText falls back
            void copyText(c.id).then((ok) => (ok ? toast.success(t('editor.idCopied', { id: c.id })) : toast.error(t('msg.copyFailed'))))
          }}
          title={t('editor.copyId')}
          aria-label={t('editor.copyId')}
          className="inline-flex max-w-48 items-center gap-1 rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground max-md:order-2 max-md:size-10 max-md:max-w-none max-md:shrink-0 max-md:justify-center max-md:border-0"
        >
          <span className="truncate max-md:sr-only">{c.id}</span>
          <ClipboardText className="size-3 shrink-0" aria-hidden="true" />
        </button>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5 max-md:order-2 max-md:ml-0 max-md:flex-1 max-md:flex-nowrap max-md:justify-start max-md:overflow-x-auto">
          {/* every icon says what it does: a tooltip always, a word beside it where there is room */}
          <Button variant="ghost" size="sm" className="max-md:size-10 max-md:shrink-0 max-md:px-0" onClick={() => updateCharacter(c.id, { favorite: !character.favorite })} aria-pressed={character.favorite} aria-label={t(character.favorite ? 'editor.unfavorite' : 'editor.favorite')} title={t(character.favorite ? 'editor.unfavorite' : 'editor.favorite')}>
            <Star weight={character.favorite ? 'fill' : 'regular'} className={character.favorite ? 'size-4 text-primary' : 'size-4'} aria-hidden="true" />
            <span className="hidden lg:inline">{t('editor.favoriteShort')}</span>
          </Button>
          {!c.isGroup && <TranslateMenu c={character} blocked={dirty} />}
          <Button variant="ghost" size="sm" className="max-md:size-10 max-md:shrink-0 max-md:px-0" onClick={() => setVersionsOpen(true)} aria-label={t('editor.versions')} title={t('editor.versions')}>
            <ClockCounterClockwise className="size-4" aria-hidden="true" />
            <span className="hidden lg:inline">{t('editor.versionsShort')}</span>
          </Button>
          <span role="status" aria-live="polite" className="flex min-w-16 items-center gap-1 text-[11px] text-muted-foreground max-md:sr-only" data-testid="draft-state">
            {dirty
              ? <span className="flex items-center gap-1 font-medium text-amber-700 dark:text-amber-300"><span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />{t('cd.unsaved')} ({changeCount})</span>
              : draftState.savedFlash && !preview && <><Check className="size-3.5 text-primary" aria-hidden="true" />{t('cd.saved')}</>}
          </span>
          <Button variant="ghost" size="sm" className="max-md:size-10 max-md:shrink-0 max-md:px-0" onClick={() => setTokenReportOpen(true)} aria-label="Token report" title="Token report">
            <Gauge className="size-4 md:hidden" aria-hidden="true" />
            <span className="max-md:hidden">Token report</span>
          </Button>
          {/* a group is not a card: no copy, no card export */}
          {!c.isGroup && (
            <>
            <Button variant="ghost" size="sm" className="max-md:size-10 max-md:shrink-0 max-md:px-0" onClick={() => draftState.withSavedCard(t('cd.act.duplicate'), () => { duplicateCharacter(c.id); toast.success('Duplicated') })} aria-label={t('editor.duplicate')} title={t('editor.duplicate')}>
              <Copy className="size-4" aria-hidden="true" />
              <span className="hidden lg:inline">{t('editor.duplicateShort')}</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={
                <Button variant="ghost" size="sm" className="max-md:size-10 max-md:shrink-0 max-md:px-0" aria-label={t('editor.export')} title={t('editor.export')}>
                  <Export className="size-4" aria-hidden="true" />
                  <span className="hidden lg:inline">{t('editor.exportShort')}</span>
                </Button>
              } />
              <DropdownMenuContent align="end" className="w-64">
                {hasProfile && (
                  <>
                    <DropdownMenuCheckboxItem checked={markSections} onCheckedChange={(v) => { setMarkSections(v); setMarkProfileSections(v) }} title={t('ex.markSectionsTip')}>
                      {t('ex.markSections')}
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={() => draftState.withSavedCard(t('cd.act.export'), () => void exportPng())} className="flex-col items-start gap-0">
                  <span>PNG card</span>
                  <span className="text-xs text-muted-foreground">The portrait with the card inside</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => draftState.withSavedCard(t('cd.act.export'), () => void exportCharx())} className="flex-col items-start gap-0">
                  <span>CHARX</span>
                  <span className="text-xs text-muted-foreground">With the emotion images and gallery</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => draftState.withSavedCard(t('cd.act.export'), () => void exportJson())} className="flex-col items-start gap-0">
                  <span>JSON</span>
                  <span className="text-xs text-muted-foreground">The card file alone (V2)</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </>
          )}
        </div>
        <Button size="sm" variant={dirty ? 'outline' : 'default'} className="max-md:h-10 max-md:shrink-0" onClick={() => { void startChatAndOpen(c.id) }}>
          <Chats className="size-4" aria-hidden="true" />Chat
        </Button>
      </header>

        <div className="mt-2 hidden max-w-full px-4 md:block">
          {/* Desktop: all twelve panels, wrapping to two rows so every tab fits without
              scrolling. Plain buttons, not Base UI tabs — the panels stay the editor
              Tabs' content. */}
          <div
            data-guide="editor.tabs"
            role="tablist"
            aria-label={t('editor.tabs')}
            onKeyDown={(e) => { const next = panelStep((ALL_PANELS as unknown as readonly string[]).filter((p) => !(c.isGroup && (p === 'profile' || p === 'soul' || p === 'memory'))), tab, e.key); if (next) { e.preventDefault(); showPanel(next); focusTab(e.currentTarget, next) } }}
            // the variant's own h-8 would clip the second row and let the panel overlap it: h-auto has to name the same variant to win
            className={cn(tabsListVariants(), 'h-auto w-full flex-wrap items-center gap-1 group-data-horizontal/tabs:h-auto')}
          >
            {ALL_PANELS.filter((p) => !(c.isGroup && (p === 'profile' || p === 'soul' || p === 'memory'))).map((p) => {
              const Icon = TAB_ICONS[p] ?? UserCircle
              const on = tab === p
              const g = panelGroup(p)
              return (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  data-tab={p}
                  tabIndex={on ? 0 : -1}
                  aria-selected={on}
                  data-active={on || undefined}
                  onClick={() => showPanel(p)}
                  className={cn(
                    TAB_BUTTON,
                    GROUP_TINT[g],
                    'h-8 flex-none',
                    p === 'soul' && soulStatus === 'unrated' && 'outline-1 -outline-offset-1 outline-dashed outline-amber-500',
                  )}
                >
                  <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                  {panelLabel(p, t)}
                  {p === 'soul' && soulStatus === 'unrated' && <span className="ml-1 size-1.5 animate-pulse rounded-full bg-amber-500 motion-reduce:animate-none" role="img" aria-label={t('soul.unratedDot')} title={t('soul.unratedDot')} />}
                  {p === 'soul' && soulStatus === 'pending' && <span className="ml-1 size-1.5 rounded-full bg-amber-500" role="img" aria-label={t('soul.proposalDot')} title={t('soul.proposalDot')} />}
                  {p === 'soul' && soulStatus === 'failed' && <span className="ml-1 size-1.5 rounded-full bg-red-500" role="img" aria-label={t('soul.failedDot')} title={t('soul.failedDot')} />}
                  {changedPanelSet.has(p) && <span className="ml-1 size-1.5 rounded-full bg-amber-500" role="img" aria-label={t('cd.unsavedTab')} title={t('cd.unsavedTab')} data-testid="tab-dot" />}
                </button>
              )
            })}
          </div>
        </div>
        <div className="mt-2 max-w-full md:hidden">
        <ScrollStrip className="px-4">
          {/* Phone: six groups in one row, no icons so they fit 390px. Groups that hold
              more than one panel open a dropdown — nothing overlaps the content anymore. */}
          <div
            role="tablist"
            aria-label={t('editor.tabs')}
            onKeyDown={(e) => { const next = panelStep((EDITOR_TABS as unknown as readonly string[]).filter((p) => !(c.isGroup && (p === 'profile' || p === 'soul' || p === 'memory'))), tabOfPanel(tab), e.key); if (next) { e.preventDefault(); openPanel(next); focusTab(e.currentTarget, next) } }}
            className={cn(tabsListVariants(), 'h-8 w-max max-w-full flex-nowrap items-center gap-1')}
          >
            {EDITOR_TABS.filter((tabName) => !(c.isGroup && (tabName === 'profile' || tabName === 'soul' || tabName === 'memory'))).map((tabName) => {
              const panels = TAB_PANELS[tabName]
              const on = tabOfPanel(tab) === tabName
              if (panels.length === 1) {
                return (
                  <button
                    key={tabName}
                    type="button"
                    role="tab"
                    data-tab={tabName}
                    tabIndex={on ? 0 : -1}
                    aria-selected={on}
                    data-active={on || undefined}
                    onClick={() => openPanel(tabName)}
                    className={cn(TAB_BUTTON, GROUP_TINT[tabName], 'h-[calc(100%-1px)] flex-none gap-1 px-1.5')}
                  >
                    {t(`editor.tab.${tabName}` as MsgKey)}
                    {tabName === 'soul' && soulStatus === 'unrated' && <span className="ml-1 size-1.5 animate-pulse rounded-full bg-amber-500 motion-reduce:animate-none" role="img" aria-label={t('soul.unratedDot')} title={t('soul.unratedDot')} />}
                    {tabName === 'soul' && soulStatus === 'pending' && <span className="ml-1 size-1.5 rounded-full bg-amber-500" role="img" aria-label={t('soul.proposalDot')} title={t('soul.proposalDot')} />}
                    {tabName === 'soul' && soulStatus === 'failed' && <span className="ml-1 size-1.5 rounded-full bg-red-500" role="img" aria-label={t('soul.failedDot')} title={t('soul.failedDot')} />}
                    {TAB_PANELS[tabName].some((q) => changedPanelSet.has(q)) && <span className="ml-1 size-1.5 rounded-full bg-amber-500" role="img" aria-label={t('cd.unsavedTab')} title={t('cd.unsavedTab')} data-testid="tab-dot" />}
                  </button>
                )
              }
              return (
                <DropdownMenu key={tabName}>
                  <DropdownMenuTrigger render={
                    <button
                      type="button"
                      role="tab"
                      data-tab={tabName}
                      tabIndex={on ? 0 : -1}
                      aria-selected={on}
                      data-active={on || undefined}
                      aria-haspopup="menu"
                      className={cn(TAB_BUTTON, GROUP_TINT[tabName], 'h-[calc(100%-1px)] flex-none gap-1 px-1.5')}
                    >
                      {t(`editor.tab.${tabName}` as MsgKey)}
                      {TAB_PANELS[tabName].some((q) => changedPanelSet.has(q)) && <span className="ml-1 size-1.5 rounded-full bg-amber-500" role="img" aria-label={t('cd.unsavedTab')} title={t('cd.unsavedTab')} data-testid="tab-dot" />}
                      <CaretDown className="size-3 shrink-0 opacity-70" aria-hidden="true" />
                    </button>
                  } />
                  <DropdownMenuContent align="start">
                    {panels.map((p) => {
                      const Icon = TAB_ICONS[p] ?? UserCircle
                      const active = tab === p
                      return (
                        <DropdownMenuItem key={p} onClick={() => openPanel(p)} className="gap-2">
                          <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                          <span>{panelLabel(p, t)}</span>
                          {changedPanelSet.has(p) && <span className="ml-1 size-1.5 rounded-full bg-amber-500" role="img" aria-label={t('cd.unsavedTab')} title={t('cd.unsavedTab')} data-testid="tab-dot" />}
                          {active && <Check className="ml-auto size-3.5" aria-hidden="true" />}
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              )
            })}
          </div>
        </ScrollStrip>
        </div>
          <fieldset disabled={!!preview} className={`mx-auto flex w-full min-w-0 flex-col gap-4 border-0 p-4 ${tab === 'soul' ? 'max-w-5xl' : 'max-w-3xl'} ${preview ? 'bg-sky-500/5 ring-1 ring-sky-500/40' : ''}`}>
            <TabsContent value="core" className="flex flex-col gap-4">
              <div className="grid grid-cols-[84px_1fr] gap-3 sm:grid-cols-[120px_1fr] sm:gap-4">
                <div className="flex flex-col items-center gap-2">
                  <input ref={avatarInput} type="file" accept="image/*" className="hidden" onChange={(e) => { void changeAvatar(e.target.files?.[0]); e.target.value = '' }} />
                  {c.avatar ? (
                    <button type="button" onClick={() => setZoom({ src: c.avatar, title: `${c.name}: portrait` })} className="cursor-zoom-in rounded-lg" aria-label="Open the portrait at full size">
                      <img src={c.avatar} alt={`${c.name} avatar`} className="size-20 rounded-lg object-cover sm:size-28" />
                    </button>
                  ) : (
                    <img src={DEFAULT_AVATAR} alt={`${c.name} avatar`} className="size-20 rounded-lg object-cover sm:size-28" />
                  )}
                  <Button variant="outline" size="sm" className="text-xs max-md:h-10" onClick={() => avatarInput.current?.click()}>Change</Button>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <Label className="flex items-center gap-2 text-xs">Name <TokenBadge text={c.name} /></Label>
                    <Input value={c.name} onChange={(e) => up({ name: e.target.value })} aria-label="Character name" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Tags (comma separated)</Label>
                    <Input value={c.tags.join(', ')} onChange={(e) => up({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} aria-label="Tags" />
                  </div>
                </div>
              </div>
              <VariantField
                label="Description"
                value={c.description}
                onChange={(v) => up({ description: v })}
                variants={c.descVariants}
                onVariantsChange={(descVariants) => up({ descVariants })}
                rows={5}
                translate
              />
              <Field label="First message" value={c.firstMessage} onChange={(v) => up({ firstMessage: v })} rows={4} translate />
              <div className="flex flex-col gap-2">
                <Label className="text-xs">Alternate greetings <span className="text-muted-foreground">(rendered as greeting swipes)</span></Label>
                {c.altGreetings.map((g, i) => (
                  <div key={i} className="flex gap-2">
                    <Textarea value={g} rows={2} onChange={(e) => up({ altGreetings: c.altGreetings.map((x, j) => j === i ? e.target.value : x) })} aria-label={`Alternate greeting ${i + 1}`} className="text-sm" />
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => up({ altGreetings: c.altGreetings.filter((_, j) => j !== i) })} aria-label={`Delete greeting ${i + 1}`}>
                        <Trash className="size-4" aria-hidden="true" />
                      </Button>
                      <FieldTranslateButton label={`Alternate greeting ${i + 1}`} value={g} onChange={(v) => up({ altGreetings: cRef.current.altGreetings.map((x, j) => j === i ? v : x) })} />
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-fit" onClick={() => up({ altGreetings: [...c.altGreetings, ''] })}>
                  <Plus className="size-4" aria-hidden="true" />Add greeting
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-xs">Group greetings <span className="text-muted-foreground">(group chats open with one of these)</span></Label>
                {c.groupGreetings.map((g, i) => (
                  <div key={i} className="flex gap-2">
                    <Textarea value={g} rows={2} onChange={(e) => up({ groupGreetings: c.groupGreetings.map((x, j) => j === i ? e.target.value : x) })} aria-label={`Group greeting ${i + 1}`} className="text-sm" />
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => up({ groupGreetings: c.groupGreetings.filter((_, j) => j !== i) })} aria-label={`Delete group greeting ${i + 1}`}>
                        <Trash className="size-4" aria-hidden="true" />
                      </Button>
                      <FieldTranslateButton label={`Group greeting ${i + 1}`} value={g} onChange={(v) => up({ groupGreetings: cRef.current.groupGreetings.map((x, j) => j === i ? v : x) })} />
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-fit" onClick={() => up({ groupGreetings: [...c.groupGreetings, ''] })}>
                  <Plus className="size-4" aria-hidden="true" />Add group greeting
                </Button>
              </div>
            </TabsContent>

            {!c.isGroup && (
              <TabsContent value="profile" className="flex flex-col gap-4">
                <ErrorBoundary resetKey={c.id} what="The profile">
                  <ProfileTab c={c} up={up} tasks={tasks} />
                </ErrorBoundary>
              </TabsContent>
            )}

            <TabsContent value="dialogue">
              <Field label="Example dialogue" hint="Use <START> to separate example chats. {{user}} / {{char}} macros supported." value={c.exampleDialogue} onChange={(v) => up({ exampleDialogue: v })} rows={12} mono translate />
            </TabsContent>

            <TabsContent value="advanced" className="flex flex-col gap-4">
              <Field label="System prompt override" description="Replaces the preset's main prompt in this character's chats. Empty = the preset's own." value={c.systemPromptOverride} onChange={(v) => up({ systemPromptOverride: v })} rows={3} />
              <Field label="Post-history instructions" description="Sent after the chat history, right before the reply. Good for reminders the model must not forget." value={c.postHistoryInstructions} onChange={(v) => up({ postHistoryInstructions: v })} rows={3} />
              <div className="grid gap-3 sm:grid-cols-[1fr_100px_140px]">
                <Field label="Depth prompt" description="A note placed inside the chat history instead of at the top." value={c.depthPrompt.text} onChange={(v) => up({ depthPrompt: { ...c.depthPrompt, text: v } })} rows={2} />
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">@ depth</Label>
                  <Input type="number" value={c.depthPrompt.depth} onChange={(e) => up({ depthPrompt: { ...c.depthPrompt, depth: Number(e.target.value) } })} aria-label="Depth" />
                  <FieldDescription className="text-[11px]">Messages from the end (0 = last).</FieldDescription>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Role</Label>
                  <Select value={c.depthPrompt.role} onValueChange={(v) => up({ depthPrompt: { ...c.depthPrompt, role: v as never } })}>
                    <SelectTrigger aria-label="Depth prompt role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system">system</SelectItem>
                      <SelectItem value="user">user</SelectItem>
                      <SelectItem value="assistant">assistant</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldDescription className="text-[11px]">Who the note speaks as. “system” is usual.</FieldDescription>
                </div>
              </div>
              <VariantField
                label="Scenario"
                hint="where and when the story starts"
                value={c.scenario}
                onChange={(v) => up({ scenario: v })}
                variants={c.scenarioVariants}
                onVariantsChange={(scenarioVariants) => up({ scenarioVariants })}
                rows={2}
                translate
              />
              <VariantField
                label="Personality summary"
                hint="a few words; the description says the rest"
                value={c.personality}
                onChange={(v) => up({ personality: v })}
                variants={c.personalityVariants}
                onVariantsChange={(personalityVariants) => up({ personalityVariants })}
                rows={2}
                translate
              />
              <Collapsible>
                <CollapsibleTrigger render={<Button variant="outline" size="sm" className="text-xs">Creator notes (spoiler)</Button>} />
                <CollapsibleContent className="pt-2">
                  <Textarea value={c.creatorNotes} rows={3} onChange={(e) => up({ creatorNotes: e.target.value })} aria-label="Creator notes" className="text-sm" />
                </CollapsibleContent>
              </Collapsible>
              <TalkativenessField
                value={(c.cardExtras?.extensions as { talkativeness?: unknown } | undefined)?.talkativeness}
                guessFrom={`${c.description}\n${c.personality}`}
                onChange={(v) => up({ cardExtras: { ...c.cardExtras, extensions: { ...(c.cardExtras?.extensions as Record<string, unknown> | undefined), talkativeness: String(v) } } })}
              />
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Creator</Label>
                  <Input value={c.creator} onChange={(e) => up({ creator: e.target.value })} aria-label="Creator" />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Version</Label>
                  <Input value={c.version} onChange={(e) => up({ version: e.target.value })} aria-label="Version" />
                </div>
              </div>
            </TabsContent>

            {/* stays mounted behind the other tabs: an unsaved working copy must not vanish on a tab switch */}
            {!c.isGroup && (
              <TabsContent value="soul" keepMounted className="min-w-0">
                <ErrorBoundary resetKey={c.id} what="The soul">
                  <SoulTab key={c.id} c={character} active={tab === 'soul'} onStatus={setSoulStatus} />
                </ErrorBoundary>
              </TabsContent>
            )}

            {!c.isGroup && (
              <TabsContent value="memory" className="flex flex-col gap-4">
                <ErrorBoundary resetKey={c.id} what="The memory">
                  <MemoryTab key={c.id} c={c} />
                </ErrorBoundary>
              </TabsContent>
            )}

            <TabsContent value="lorebook" className="flex flex-col gap-3">
              <CharacterBooks c={c} />
            </TabsContent>

            <TabsContent value="colors" className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Character CSS</Label>
                <Textarea
                  value={c.css}
                  onChange={(e) => up({ css: e.target.value })}
                  placeholder={'.mes_text q { color: #ffb454; }\n.mes_text { font-style: italic; }'}
                  className="min-h-24 font-mono text-xs"
                  aria-label="Character CSS"
                />
                <p className="text-[11px] text-muted-foreground">
                  Applied only while one of this character&apos;s chats is open. Hook message text with{' '}
                  <code className="font-mono">.mes_text</code>.
                </p>
              </div>
              {([['name', 'Name color'], ['dialogue', 'Dialogue highlight'], ['bubble', 'Bubble tint']] as const).map(([key, label]) => (
                <div key={key} className="flex items-center gap-3">
                  <Label className="w-36 text-xs">{label}</Label>
                  <input
                    type="color"
                    value={c.colors[key] || '#888888'}
                    onChange={(e) => up({ colors: { ...c.colors, [key]: e.target.value } })}
                    aria-label={label}
                    className="size-8 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                  <span className="text-xs text-muted-foreground">{c.colors[key] || 'unset'}</span>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-fit" onClick={() => {
                void dominantColor(c.avatar || DEFAULT_AVATAR)
                  .then((hex) => { up({ colors: { ...c.colors, name: hex } }); toast.success(`Name color set to ${hex} from the avatar`) })
                  .catch((e) => toast.error(String((e as Error).message ?? e)))
              }}>
                <Palette className="size-4" aria-hidden="true" />Extract from avatar
              </Button>
              <VoicesEditor voices={c.voices ?? []} onChange={(voices) => up({ voices })} />
            </TabsContent>

            <TabsContent value="sprites" className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                Sprites shown in chat as the speaker&apos;s mood changes, picked from the latest message. Add a whole pack at once: each file lands on the expression its name spells (joy.png, anger.png, neutral.png).
              </p>
              <div className="flex items-end gap-2">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs" htmlFor="new-expression">Add expression</Label>
                  <Input
                    id="new-expression"
                    list="standard-expressions"
                    value={newExpression}
                    onChange={(e) => setNewExpression(e.target.value.replace(/[^a-zA-Z0-9-_ ]/g, ''))}
                    placeholder="joy"
                    className="h-8 w-36 text-xs"
                    aria-label="New expression name"
                  />
                  <datalist id="standard-expressions">
                    {STANDARD_EXPRESSIONS.map((e) => <option key={e} value={e} />)}
                  </datalist>
                </div>
                <Button
                  variant="outline" size="sm" className="h-8 text-xs"
                  disabled={!newExpression.trim()}
                  onClick={() => {
                    const name = newExpression.trim()
                    if (!name || c.expressions.some((e) => e.name === name)) return
                    up({ expressions: [...c.expressions, { name, url: null }] })
                    setNewExpression('')
                  }}
                >
                  <Plus className="size-3.5" aria-hidden="true" /> Add
                </Button>
                <input ref={spriteInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void assignSprites(e.target.files); e.target.value = '' }} />
                <Button variant="outline" size="sm" className="ml-auto h-8 text-xs" onClick={() => spriteInput.current?.click()}>Add sprite pack</Button>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {c.expressions.map((e) => (
                  <div key={e.name} className="flex flex-col items-center gap-1 rounded-md border border-border p-2">
                    {e.url ? (
                      <button type="button" onClick={() => setZoom({ src: e.url!, title: `${c.name}: ${e.name}` })} className="cursor-zoom-in rounded" aria-label={`Open the ${e.name} sprite at full size`}>
                        <img src={e.url} alt={`${e.name} expression`} className="size-16 rounded object-cover" />
                      </button>
                    ) : (
                      <div className="flex size-16 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground">empty</div>
                    )}
                    <span className="flex w-full items-center gap-1 text-[11px]">
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left hover:text-primary"
                        title="Set as default expression"
                        onClick={() => up({ defaultExpression: e.name })}
                      >
                        {e.name}
                      </button>
                      {c.defaultExpression === e.name && <Badge variant="secondary" className="text-[9px]">def</Badge>}
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Delete ${e.name} sprite`}
                      onClick={() => up({
                        expressions: c.expressions.filter((x) => x.name !== e.name),
                        ...(c.defaultExpression === e.name ? { defaultExpression: c.expressions.find((x) => x.name !== e.name)?.name ?? undefined } : {}),
                      })}
                    ><X className="size-3" aria-hidden="true" /></button>
                    </span>
                    <label className="cursor-pointer text-[10px] text-primary hover:underline">
                      set
                      <input type="file" accept="image/*" className="hidden" onChange={(ev) => { void setSprite(e.name, ev.target.files?.[0]); ev.target.value = '' }} />
                    </label>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="gallery" className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {pagedGallery.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setLightboxId(g.id)}
                    className="group relative aspect-square overflow-hidden rounded-md border border-border transition-opacity hover:opacity-85"
                    aria-label={`Open ${g.caption || 'gallery item'}`}
                  >
                    {g.type === 'video' ? (
                      <video src={g.url} className="size-full object-cover" muted playsInline />
                    ) : (
                      <img src={g.url} alt={g.caption} className="size-full object-cover" loading="lazy" />
                    )}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => galleryInput.current?.click()}
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:bg-accent/50"
                >
                  <Plus className="size-5" aria-hidden="true" /> Add
                </button>
              </div>
              <Pager total={c.gallery.length} page={safeGalleryPage} pageSize={GALLERY_PAGE} onPage={setGalleryPage} />
              {c.gallery.length === 0 && (
                <p className="text-xs text-muted-foreground">No gallery items yet. Add images of this character.</p>
              )}
              <input ref={galleryInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void addGallery(e.target.files); e.target.value = '' }} />

              {/* Lightbox: full item + caption + set-as-avatar + delete */}
              <Dialog open={!!lightboxItem} onOpenChange={(o) => !o && setLightboxId(null)}>
                <DialogContent className="max-h-[85dvh] sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{lightboxItem?.caption || 'Gallery item'} · {lightboxIndex + 1} of {c.gallery.length}</DialogTitle>
                  </DialogHeader>
                  {lightboxItem && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-center overflow-hidden rounded-md border border-border bg-muted/30">
                        {lightboxItem.type === 'video' ? (
                          <video src={lightboxItem.url} className="max-h-[45dvh] w-full" controls />
                        ) : (
                          <button type="button" onClick={() => setZoom({ src: lightboxItem.url, title: lightboxItem.caption || 'Gallery item' })} className="w-full cursor-zoom-in" aria-label="Open at full size">
                            <img src={lightboxItem.url} alt={lightboxItem.caption} className="max-h-[45dvh] w-full object-contain" />
                          </button>
                        )}
                      </div>
                      <Input
                        value={lightboxItem.caption}
                        onChange={(e) => up({ gallery: c.gallery.map((x) => x.id === lightboxItem.id ? { ...x, caption: e.target.value } : x) })}
                        aria-label="Caption"
                        placeholder="Caption"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" size="sm" disabled={lightboxIndex === 0} onClick={() => setLightboxId(c.gallery[lightboxIndex - 1]!.id)} aria-label="Previous item">
                          <CaretLeft className="size-4" aria-hidden="true" />
                        </Button>
                        <Button variant="outline" size="sm" disabled={lightboxIndex >= c.gallery.length - 1} onClick={() => setLightboxId(c.gallery[lightboxIndex + 1]!.id)} aria-label="Next item">
                          <CaretRight className="size-4" aria-hidden="true" />
                        </Button>
                        {lightboxItem.type === 'image' && (
                          <Button variant="outline" size="sm" onClick={() => { up({ avatar: lightboxItem.url }); toast.success('Set as avatar') }}>
                            <ImageIcon className="size-4" aria-hidden="true" /> Set as avatar
                          </Button>
                        )}
                        <Button
                          variant="ghost" size="sm" className="ml-auto text-destructive"
                          onClick={() => void confirm({
                            title: 'Remove this item?',
                            description: 'It is deleted from the character card.',
                          }).then((yes) => {
                            if (!yes) return
                            up({ gallery: c.gallery.filter((x) => x.id !== lightboxItem.id) })
                            setLightboxId(null)
                          })}
                        >
                          <Trash className="size-4" aria-hidden="true" /> Delete
                        </Button>
                      </div>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </TabsContent>

            <TabsContent value="regex" className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">Character-scoped regex scripts. Manage all scripts in the Regex tab.</p>
              {regexScripts.filter((r) => r.scope === 'character' && r.scopeTargetId === c.id).map((r) => (
                <div key={r.id} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
                  <code className="text-xs text-muted-foreground">/{r.find}/{r.flags}</code>
                  <span>{r.name}</span>
                  <Badge variant={r.enabled ? 'secondary' : 'outline'} className="ml-auto text-[10px]">{r.enabled ? 'on' : 'off'}</Badge>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="voice" className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                Per-character voice, overrides the app TTS settings when set. Leave off to follow Tools → TTS.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">TTS provider</Label>
                  <Select value={c.voiceProvider || 'none'} onValueChange={(v) => up({ voiceProvider: v ?? 'none' })}>
                    <SelectTrigger aria-label="Voice provider"><SelectValue>{c.voiceProvider || 'none'}</SelectValue></SelectTrigger>
                    <SelectContent>
                      {['none', 'System (Web Speech)', 'Engine'].map((p) => <SelectItem key={p} value={p}>{p === 'none' ? 'none (follow app settings)' : p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Voice</Label>
                  <Select value={c.voiceId || ''} onValueChange={(v) => up({ voiceId: v ?? '' })}>
                    <SelectTrigger aria-label="Voice"><SelectValue>{c.voiceId ? (c.voiceId.includes('-') ? c.voiceId.replace(/^([a-z]{2}-[A-Z]{2})-(.+?)Neural$/, '$2 ($1)') : c.voiceId) : 'default'}</SelectValue></SelectTrigger>
                    <SelectContent>
                      {voiceOptions.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button variant="outline" size="sm" className="w-fit" onClick={() => {
                if (c.voiceProvider === 'none' || !c.voiceProvider) {
                  toast.info('Pick a provider first. Engine uses the speech endpoints configured in the app')
                  return
                }
                void speakText(`Hello, traveler. I am ${c.name}.`, {
                  provider: c.voiceProvider, narratorVoice: c.voiceId || 'alloy', speed: 1, model: 'tts-1', engineProvider: 'edge',
                  autoPlay: false, onlyQuotes: false, skipAsterisks: true, skipCodeblocks: true, charVoices: {},
                }).then((played) => {
                  if (!played) toast.info('Nothing played, check the voice settings')
                }).catch((e: Error) => toast.error(`TTS failed: ${e.message}`))
              }}>Test voice</Button>
            </TabsContent>
          </fieldset>
        </ScrollArea>
      </Tabs>

      {/* Save changes: always within reach, on a phone above the keyboard (GitHub #103) */}
      {dirty && !preview && (
        <div role="region" aria-label={t('cd.unsaved')} data-testid="save-bar" className="flex shrink-0 items-center gap-2 border-t border-amber-500/40 bg-amber-500/10 px-4 py-2">
          <span className="min-w-0 flex-1 text-sm leading-tight"><span className="mr-1.5 inline-block size-1.5 rounded-full bg-amber-500 align-middle" aria-hidden="true" />{t('cd.unsaved')} ({changeCount})</span>
          <Button variant="outline" size="sm" className="max-md:h-10" disabled={draftState.saving} title={t('cd.discardTip')} onClick={draftState.discard}>{t('cd.discard')}</Button>
          <Button size="sm" className="max-md:h-10" disabled={draftState.saving} onClick={() => void draftState.saveNow()}>
            {draftState.saving ? <><CircleNotch className="size-4 animate-spin" aria-hidden="true" />{t('cd.saving')}</> : t('cd.save')}
          </Button>
        </div>
      )}
      <DraftDialogs
        prompt={draftState.prompt}
        labels={draftState.labels}
        saving={draftState.saving}
        onSaveThen={(then) => void draftState.saveThen(then)}
        onDiscardThen={draftState.discardThen}
        onClose={draftState.closePrompt}
      />

      {/* Version compare: snapshot fields against the live card */}
      <Dialog open={!!compareVersion} onOpenChange={(o) => { if (!o) setCompareVersion(null) }}>
        <DialogContent className="max-h-[80dvh] sm:max-w-2xl">
          <DialogHeader><DialogTitle>Compare: {compareVersion?.label}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3 overflow-y-auto">
            {compareVersion && (Object.entries(compareVersion.snapshot) as [keyof Character, unknown][])
              .filter(([, v]) => typeof v === 'string')
              .map(([key, snap]) => {
                const cur = String(c[key] ?? '')
                const snapText = String(snap)
                const changed = snapText !== cur
                return (
                  <div key={String(key)} className="flex flex-col gap-1 rounded-md border border-border p-2 text-xs">
                    <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                      {String(key)} {changed && <Badge variant="outline" className="ml-1 text-[10px] text-primary">changed</Badge>}
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-muted-foreground">Snapshot</span>
                        <p className="max-h-24 overflow-y-auto whitespace-pre-wrap">{snapText}</p>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-muted-foreground">Current</span>
                        <p className="max-h-24 overflow-y-auto whitespace-pre-wrap">{cur}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Token report */}
      <Dialog open={tokenReportOpen} onOpenChange={setTokenReportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Token report: {c.name}</DialogTitle></DialogHeader>
          <ul className="flex flex-col gap-1.5 text-sm">
            {([
              ['Description', c.description], ['Personality', c.personality], ['Scenario', c.scenario],
              ['First message', c.firstMessage], ['Example dialogue', c.exampleDialogue],
              ['System override', c.systemPromptOverride], ['Post-history', c.postHistoryInstructions],
            ] as const).map(([label, text]) => {
              const t = estimateTokens(text)
              return (
                <li key={label} className="flex items-center gap-2">
                  <span className="w-32 text-xs text-muted-foreground">{label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${Math.min(100, (t / Math.max(1, totalTokens)) * 100)}%` }} />
                  </div>
                  <span className="w-14 text-right text-xs">{formatTokens(t)}</span>
                </li>
              )
            })}
            <li className="mt-1 flex justify-between border-t border-border pt-2 text-xs font-medium">
              <span>Total</span><span>{formatTokens(totalTokens)} tokens</span>
            </li>
          </ul>
        </DialogContent>
      </Dialog>

      {/* Version history */}
      <Dialog open={versionsOpen} onOpenChange={setVersionsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Version history</DialogTitle></DialogHeader>
          <Button variant="outline" size="sm" className="w-fit" onClick={() => {
            const label = `Snapshot: ${new Date().toLocaleString()}`
            up({ versions: [{ id: uid('v'), label, savedAt: Date.now(), snapshot: {
              description: c.description, personality: c.personality, scenario: c.scenario,
              firstMessage: c.firstMessage, exampleDialogue: c.exampleDialogue,
              systemPromptOverride: c.systemPromptOverride, postHistoryInstructions: c.postHistoryInstructions,
            } }, ...c.versions] })
            toast.success(`Saved “${label}”`)
          }}>
            <Plus className="size-4" aria-hidden="true" />Save current as version
          </Button>
          {c.versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No saved versions.</p>
          ) : (
            <>
            <ul className="flex flex-col gap-1.5">
              {pagedVersions.map((v) => (
                <li key={v.id} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
                  <ClockCounterClockwise className="size-4 text-muted-foreground" aria-hidden="true" />
                  {v.label}
                  <span className="text-[11px] text-muted-foreground">{new Date(v.savedAt).toLocaleString()}</span>
                  <div className="ml-auto flex gap-1">
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setCompareVersion(v); setVersionsOpen(false) }}>Compare</Button>
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => {
                      up({ ...v.snapshot })
                      toast.success(`Restored “${v.label}”`)
                    }}>Restore</Button>
                  </div>
                </li>
              ))}
            </ul>
            <Pager total={c.versions.length} page={safeVersionPage} pageSize={VERSION_PAGE} onPage={setVersionPage} />
            </>
          )}
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </div>
  )
}

function Field({ label, hint, description, value, onChange, rows = 3, mono = false, translate = false }: {
  label: string; hint?: string; description?: string; value: string; onChange: (v: string) => void; rows?: number; mono?: boolean
  /** a Translate button for this text (story texts; not prompts, which break when translated) */
  translate?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      {/* the Translate button stays outside the label: a label passes its clicks to the first button in it */}
      <div className="flex items-center gap-2 text-xs">
        <Label className="text-xs">{label}</Label>
        <TokenBadge text={value} />
        {hint && <span className="font-normal text-muted-foreground">{hint}</span>}
        {translate && <FieldTranslateButton label={label} value={value} onChange={onChange} />}
      </div>
      <Textarea value={value} rows={rows} onChange={(e) => onChange(e.target.value)} aria-label={label} className={mono ? 'font-mono text-xs' : 'text-sm'} />
      {description && <FieldDescription className="text-[11px]">{description}</FieldDescription>}
    </div>
  )
}

/** How readily this character speaks up in a group when nobody names them
 *  (stored where portable cards keep it). Unset, or SillyTavern's usual 0.5: the groups
 *  guess it from the card's text, and the slider shows that guess. */
function TalkativenessField({ value, guessFrom, onChange }: { value: unknown; guessFrom: string; onChange: (v: number) => void }) {
  const own = cardTalkativeness(value)
  const current = own ?? guessTalkativeness(guessFrom)
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">Talkativeness in groups: {Math.round(current * 100)}%{own == null && <span className="font-normal text-muted-foreground"> (guessed from the card)</span>}</Label>
      <Slider value={[current]} min={0} max={1} step={0.05} onValueChange={(v) => onChange(Array.isArray(v) ? v[0]! : (v as number))} aria-label="Talkativeness" />
    </div>
  )
}
