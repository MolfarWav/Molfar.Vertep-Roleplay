import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CaretLeft, MagicWand } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { useConfirm } from '@/components/ui/confirm'
import { PersonaQuestionnaire } from '@/components/persona/persona-questionnaire'
import { usePersonaProfile } from '@/components/persona/persona-profile'
import { PersonaHero, PersonaPhoneHeader, type HeroActions } from '@/components/persona/persona-hero'
import { PersonaSectionBody, PersonaSectionList, PersonaStatColumn, PersonaTabStrip, type BodyProps } from '@/components/persona/persona-tabs'
import { PersonaImageDialog } from '@/components/persona/persona-image-dialog'
import { useCardTasks } from '@/components/character/use-card-tasks'
import { useBackClose } from '@/hooks/use-back-close'
import { useIsMobile } from '@/hooks/use-mobile'
import { useT } from '@/hooks/use-t'
import { downloadTextFile } from '@/lib/export'
import { fileToDataUrl } from '@/lib/engine'
import { applyAnswers, personaAdditions, type PersonaAnswers } from '@/lib/profile'
import { personaTokens, profileFill } from '@/lib/persona-list'
import { addGallery, isSection, type PersonaSection } from '@/lib/persona-page'
import { useApp } from '@/lib/store'
import type { Persona } from '@/lib/types'

const TAB_KEY = 'rp.personas.tab'
const readTab = (): PersonaSection => {
  try { const v = sessionStorage.getItem(TAB_KEY); return isSection(v) ? v : 'core' } catch { return 'core' }
}
const rememberTab = (s: PersonaSection) => { try { sessionStorage.setItem(TAB_KEY, s) } catch { /* private window */ } }

const slug = (s: string) => s.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'persona'

/** The one-persona page: a hero and tabs on desktop; a header, a list of sections and a page per section on a phone.
 *  The caller keys it by persona id, so every persona starts with its own state. */
export function PersonaPage({ p, inUse, confirm, onBack, onUse, onDuplicate, onDelete }: {
  p: Persona
  inUse: boolean
  confirm: ReturnType<typeof useConfirm>[0]
  onBack: () => void
  onUse: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const t = useT()
  const isMobile = useIsMobile()
  const characters = useApp((s) => s.characters)
  const chats = useApp((s) => s.chats)
  const lorebooks = useApp((s) => s.lorebooks)
  const allTags = useApp((s) => s.tags)
  const updatePersona = useApp((s) => s.updatePersona)
  const addTag = useApp((s) => s.addTag)
  const openChatsForPersona = useApp((s) => s.openChatsForPersona)
  const update = (patch: Partial<Persona>) => updatePersona(p.id, patch)
  // the latest persona, for callbacks that finish later (a drawn picture arrives after the dialog rendered)
  const pRef = useRef(p)
  pRef.current = p

  const [section, setSectionState] = useState<PersonaSection>(readTab)
  const [phoneSection, setPhoneSection] = useState<PersonaSection | null>(null)
  const [statsOpen, setStatsOpen] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  const [imageOpen, setImageOpen] = useState(false)
  const avatarInput = useRef<HTMLInputElement>(null)
  const setSection = (s: PersonaSection) => { setSectionState(s); rememberTab(s) }
  useBackClose(phoneSection !== null, () => setPhoneSection(null))

  const tasks = useCardTasks({ personaId: p.id, saved: p.cardTasks, write: (own) => updatePersona(p.id, { cardTasks: own }) })
  const profile = usePersonaProfile(p, update, confirm, tasks)

  const registry = useMemo(() => allTags.filter((x) => x.scope === 'persona'), [allTags])
  const mine = useMemo(() => chats.filter((c) => c.personaId === p.id), [chats, p.id])
  const messages = useMemo(() => mine.reduce((n, c) => n + c.messages.filter((m) => m.role === 'user').length, 0), [mine])
  const tokens = personaTokens(p)
  const fill = profileFill(p)
  const goesWith = p.boundCharacterIds.map((id) => characters.find((c) => c.id === id)?.name).filter((n): n is string => !!n)

  const setTags = (next: string[]) => {
    // a new name joins the Personas section's tag list, so it has a colour and can become a folder
    for (const name of next) if (!registry.some((x) => x.name === name)) addTag(name, 'persona')
    update({ tags: next })
  }
  const uploadAvatar = async (file: File | undefined) => {
    if (!file) return
    try {
      update({ avatar: await fileToDataUrl(file, 512) })
      toast.success('Avatar updated')
    } catch (e) { toast.error(String((e as Error).message ?? e)) }
  }
  const exportOne = () => {
    downloadTextFile(`persona-${slug(p.name)}.json`, JSON.stringify([p], null, 2), 'application/json')
    toast.success(t('personas.exported', { n: 1 }))
  }

  const hero: HeroActions = {
    inUse, chats: mine.length, tokens, fill: fill.label, registry, update, setTags,
    onBack, onUse, onGenerate: () => setImageOpen(true), onPickPortrait: () => avatarInput.current?.click(),
    onChats: () => openChatsForPersona(p.id), onDuplicate, onExport: exportOne, onDelete, onUsage: () => setStatsOpen(true),
    onOpenProfile: () => setPhoneSection('profile'),
  }
  const body: BodyProps = {
    p, update, profile, tasks, characters, lorebooks, confirm,
    onAsk: () => setAskOpen(true),
    onGenerate: () => setImageOpen(true),
    onUseAsPortrait: (url) => { update({ avatar: url }); toast.success(t('personas.image.portraitSet')) },
  }
  const hints: Record<PersonaSection, string> = {
    core: t('personas.hint.core'),
    profile: t('personas.hint.profile', { n: fill.filled }),
    bindings: t('personas.hint.bindings', { n: p.boundCharacterIds.length }),
    lorebooks: t('personas.hint.lorebooks', { n: p.lorebookIds.length }),
    memory: t('personas.hint.memory'),
    colours: t('personas.hint.colours'),
    gallery: t('personas.hint.gallery', { n: (p.gallery ?? []).length }),
  }

  const dialogs = (
    <>
      <input ref={avatarInput} type="file" accept="image/*" className="hidden" onChange={(e) => { void uploadAvatar(e.target.files?.[0]); e.target.value = '' }} />
      <PersonaQuestionnaire
        persona={p}
        open={askOpen}
        onOpenChange={setAskOpen}
        onSave={(a: PersonaAnswers) => {
          const write = () => { update(applyAnswers(p, a)); setAskOpen(false); toast.success('Persona written') }
          // an edit inside the lines the answers wrote would be replaced: ask first
          if (personaAdditions(p) !== null) return write()
          void confirm({
            title: 'Replace your edits?',
            description: 'You changed the description by hand where the answers wrote it. Saving rewrites those lines from the answers.',
            actionLabel: 'Rewrite',
          }).then((yes) => { if (yes) write() })
        }}
      />
      <PersonaImageDialog
        open={imageOpen}
        onOpenChange={setImageOpen}
        persona={p}
        onGenerated={(url) => updatePersona(p.id, { gallery: addGallery(pRef.current.gallery, url) })}
        onUseAsPortrait={body.onUseAsPortrait}
      />
      <Dialog open={statsOpen} onOpenChange={setStatsOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Usage: {p.name}</DialogTitle></DialogHeader>
          {(() => {
            const words = mine.flatMap((ch) => ch.messages.filter((m) => m.role === 'user')).reduce((n, m) => n + (m.swipes[m.activeSwipe]?.content.trim().split(/\s+/).filter(Boolean).length ?? 0), 0)
            const pairs = new Map<string, number>()
            for (const ch of mine) if (ch.characterId) pairs.set(ch.characterId, (pairs.get(ch.characterId) ?? 0) + 1)
            const top = [...pairs.entries()].sort((a, b) => b[1] - a[1])[0]
            const topChar = characters.find((c) => c.id === top?.[0])
            return (
              <ul className="flex flex-col gap-1 text-sm">
                <li className="flex justify-between"><span className="text-muted-foreground">Chats using this persona</span><span>{mine.length}</span></li>
                <li className="flex justify-between"><span className="text-muted-foreground">Messages sent</span><span>{messages}</span></li>
                <li className="flex justify-between"><span className="text-muted-foreground">Words written</span><span>{words.toLocaleString()}</span></li>
                <li className="flex justify-between"><span className="text-muted-foreground">Most-paired character</span><span>{topChar?.name ?? '—'}</span></li>
              </ul>
            )
          })()}
        </DialogContent>
      </Dialog>
    </>
  )

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col" data-testid="persona-page">
      {!isMobile ? (
      <ScrollArea className="min-h-0 flex-1">
        <PersonaHero p={p} a={hero} />
        <PersonaTabStrip value={section} onChange={setSection} counts={{ profile: fill.label, bindings: p.boundCharacterIds.length, lorebooks: p.lorebookIds.length, gallery: (p.gallery ?? []).length }} />
        <div className="flex gap-6 px-5 pb-8 max-lg:pt-0" role="tabpanel" aria-label={t(`personas.sec.${section}` as Parameters<typeof t>[0])}>
          <PersonaStatColumn chats={mine.length} tokens={tokens} messages={messages} goesWith={goesWith} onChats={hero.onChats} />
          <div className="min-w-0 max-w-4xl flex-1">
            <PersonaSectionBody section={section} b={body} />
          </div>
        </div>
      </ScrollArea>
      ) : (
      /* phone: the list, or one section as a page */
      <div className="flex min-h-0 flex-1 flex-col">
        {phoneSection === null ? (
          <>
            <ScrollArea className="min-h-0 flex-1">
              <PersonaPhoneHeader p={p} a={hero} />
              <PersonaSectionList onOpen={setPhoneSection} hints={hints} />
            </ScrollArea>
            <div className="flex shrink-0 gap-2 border-t border-border bg-card px-4 py-2.5" data-testid="persona-phone-bar">
              {inUse
                ? <Button className="h-12 flex-1 rounded-xl text-sm" disabled>{t('personas.inUse')}</Button>
                : <Button className="h-12 flex-1 rounded-xl text-sm font-bold" onClick={onUse}>{t('personas.useThis')}</Button>}
              <Button variant="outline" className="h-12 rounded-xl border-sky-500/50 px-4 text-sky-700 dark:text-sky-300" onClick={() => setImageOpen(true)} data-testid="persona-phone-image">
                <MagicWand className="size-4" aria-hidden="true" />{t('personas.image.short')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1.5">
              <Button variant="ghost" className="size-11 p-0" onClick={() => setPhoneSection(null)} aria-label={t('personas.page.backToList')} data-testid="persona-section-back"><CaretLeft className="size-5" aria-hidden="true" /></Button>
              <h2 className="min-w-0 flex-1 truncate text-base font-bold">{t(`personas.sec.${phoneSection}` as Parameters<typeof t>[0])}</h2>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="min-w-0 p-4 pb-8" data-testid="persona-section-page"><PersonaSectionBody section={phoneSection} b={body} /></div>
            </ScrollArea>
          </>
        )}
      </div>
      )}
      {dialogs}
    </div>
  )
}
