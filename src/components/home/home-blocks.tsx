import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Sparkle, UploadSimple } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import { resolveLanguage } from '@/lib/i18n'
import { importCardFiles } from '@/lib/card-import'
import { ASK_MOLFAR_MAX, askMolfar, canAskMolfar, canListApps, listOtherApps, openShellApp, type ShellApp } from '@/lib/shell-bridge'
import { cn } from '@/lib/utils'
import { Block, BlockLabel, Chip } from '@/components/home/home-ui'

// Drafts handed to Molfar. They stay English on purpose: Molfar answers in the
// user's own language, and the user reviews the text before sending it.
const DRAFT_CHARACTER = 'Create a new Roleplay character card. My idea: '
const DRAFT_APP = 'Build me a small app for my Roleplay workspace: '
const DRAFT_CHIPS = [
  { key: 'home.chip1', draft: 'Create a Roleplay character card from this description: ' },
  { key: 'home.chip2', draft: 'Build me a dashboard for my Roleplay workspace that shows: ' },
  { key: 'home.chip3', draft: 'Review my Litopys memory (the Litopys section of Roleplay: chapters and facts per chat, stored in data/litopys/chats): look for contradictions, duplicates and stale facts, and propose a cleanup.' },
] as const

/** Hands a draft to Molfar and keeps the engine's refusal for an inline message. */
function useAskMolfar() {
  const t = useT()
  const [error, setError] = useState<string | null>(null)
  const ask = async (text: string): Promise<boolean> => {
    setError(null)
    try {
      await askMolfar(text)
      return true
    } catch (e) {
      const why = e instanceof Error ? e.message : ''
      setError(why ? `${t('home.askError')}: ${why}` : t('home.askError'))
      return false
    }
  }
  return { ask, error, clear: () => setError(null) }
}

/** New character (red), Import card, With Molfar. */
export function CreateButtons({ className }: { className?: string }) {
  const t = useT()
  const newCharacter = useApp((s) => s.newCharacter)
  const openCharacter = useApp((s) => s.openCharacter)
  const setView = useApp((s) => s.setView)
  const hydrate = useApp((s) => s.hydrate)
  const importRef = useRef<HTMLInputElement>(null)
  const molfar = useAskMolfar()
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Button
          variant="accent"
          size="lg"
          className="h-10 gap-2 px-4 font-heading text-[15px]"
          onClick={() => { const id = newCharacter(); openCharacter(id); setView('characters') }}
        >
          <Plus aria-hidden="true" /> {t('home.newCharacter')}
        </Button>
        <input
          ref={importRef}
          type="file"
          accept=".png,.json"
          multiple
          className="sr-only"
          aria-label={t('home.importCard')}
          onChange={(e) => { void importCardFiles(e.target.files, hydrate); e.target.value = '' }}
        />
        <Button variant="outline" size="lg" className="h-10 gap-2 px-4 font-heading text-[15px]" onClick={() => importRef.current?.click()}>
          <UploadSimple aria-hidden="true" /> {t('home.importCard')}
        </Button>
        {canAskMolfar() && (
          <Button
            variant="outline"
            size="lg"
            className="col-span-2 h-10 gap-2 px-4 font-heading text-[15px] sm:col-span-1"
            onClick={() => void molfar.ask(DRAFT_CHARACTER)}
          >
            <Sparkle aria-hidden="true" /> {t('home.withMolfar')}
          </Button>
        )}
      </div>
      {molfar.error && <p role="alert" className="text-xs text-destructive">{molfar.error}</p>}
    </div>
  )
}

export function CreateBlock() {
  const t = useT()
  return (
    <Block label={t('home.create')}>
      <p className="text-sm text-muted-foreground">{t('home.createText')}</p>
      <CreateButtons />
    </Block>
  )
}

export function AskMolfarBlock() {
  const t = useT()
  const [text, setText] = useState('')
  const molfar = useAskMolfar()
  const send = async () => { if (text.trim() && (await molfar.ask(text))) setText('') }
  return (
    <Block label={t('home.ask')}>
      <p className="text-sm text-muted-foreground">{t('home.askText')}</p>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void send() }}>
        <Input
          value={text}
          maxLength={ASK_MOLFAR_MAX}
          onChange={(e) => { setText(e.target.value); molfar.clear() }}
          placeholder={t('home.askPlaceholder')}
          aria-label={t('home.ask')}
          className="h-9 min-w-0 flex-1 font-heading text-sm"
        />
        <Button type="submit" className="h-9 shrink-0 px-3 font-heading text-[14px]" disabled={!text.trim()}>
          {t('home.askOpen')}
        </Button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {DRAFT_CHIPS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => { setText(c.draft); molfar.clear() }}
            className="rounded-[3px] border border-border bg-secondary px-2.5 py-1 font-heading text-[12.5px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            {t(c.key)}
          </button>
        ))}
      </div>
      {molfar.error && <p role="alert" className="text-xs text-destructive">{molfar.error}</p>}
    </Block>
  )
}

/** progress ring: cyan arc, red when the goal is met */
function Ring({ value, goal, label }: { value: number; goal: number; label: string }) {
  const r = 24
  const c = 2 * Math.PI * r
  const done = value >= goal
  const frac = Math.min(1, value / goal)
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
      <svg viewBox="0 0 58 58" className="size-[58px]" role="img" aria-label={`${label}: ${value}/${goal}`}>
        <circle cx="29" cy="29" r={r} fill="none" strokeWidth="4" className="stroke-border" />
        <circle
          cx="29" cy="29" r={r} fill="none" strokeWidth="4" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform="rotate(-90 29 29)"
          className={done ? 'stroke-primary' : 'stroke-cta'}
        />
      </svg>
      <span className="font-mono text-[11.5px]">{value.toLocaleString()}/{goal}</span>
      <span className="max-w-full truncate text-center font-heading text-[12px] text-muted-foreground">{label}</span>
    </div>
  )
}

/** The app's existing derived stats, nothing new: the three that have a goal
 *  become rings, the rest stay compact tiles and badges. */
export function AchievementsBlock() {
  const t = useT()
  const chats = useApp((s) => s.chats)
  const characters = useApp((s) => s.characters)
  const lorebooks = useApp((s) => s.lorebooks)
  const d = useMemo(() => {
    const size = (c: (typeof chats)[number]) => c.messageCount ?? c.messages.length
    return {
      messages: chats.reduce((n, c) => n + size(c), 0),
      longest: chats.reduce((n, c) => Math.max(n, size(c)), 0),
      biggestBook: lorebooks.reduce((n, b) => Math.max(n, b.entries.length), 0),
      biggestGroup: characters.reduce((n, c) => Math.max(n, c.isGroup ? c.members?.length ?? 0 : 0), 0),
      firstContact: chats.some((c) => c.hasUser === true),
      branching: chats.some((c) => c.parentChatId),
    }
  }, [chats, characters, lorebooks])
  return (
    <Block label={t('home.achievements')}>
      <div className="flex items-start justify-around gap-2">
        <Ring value={d.longest} goal={500} label={t('home.marathon')} />
        <Ring value={d.biggestBook} goal={20} label={t('home.archivist')} />
        <Ring value={d.biggestGroup} goal={3} label={t('home.puppeteer')} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Tile label={t('home.statMessages')} value={d.messages} />
        <Tile label={t('home.statChats')} value={chats.length} />
        <Tile label={t('home.statCharacters')} value={characters.length} />
      </div>
      {(d.firstContact || d.branching) && (
        <div className="flex flex-wrap gap-1.5">
          {d.firstContact && <Chip>{t('home.firstContact')}</Chip>}
          {d.branching && <Chip>{t('home.branching')}</Chip>}
        </div>
      )}
    </Block>
  )
}

function Tile({ label, value }: { label: string; value: number }) {
  // a long word ("Повідомлення") in a third of a narrow column: hyphenate in the UI language, else break it
  const lang = resolveLanguage(useApp((s) => s.settings.language))
  return (
    <div className="min-w-0 rounded-[3px] border border-border bg-secondary/60 px-2.5 py-1.5">
      <p className="font-mono text-base font-semibold tabular-nums">{value.toLocaleString()}</p>
      <p lang={lang} className="font-heading text-[11.5px] leading-tight text-muted-foreground hyphens-auto [overflow-wrap:anywhere]">{label}</p>
    </div>
  )
}

/** Cards for the user's other apps (from the shell), plus the "build one" card. */
export function MyApps() {
  const t = useT()
  const [apps, setApps] = useState<ShellApp[] | null>(null)
  const molfar = useAskMolfar()
  useEffect(() => {
    let live = true
    if (canListApps()) void listOtherApps().then((a) => { if (live) setApps(a) })
    return () => { live = false }
  }, [])
  if (!canListApps() || apps === null) return null
  return (
    <section aria-label={t('home.myApps')} className="flex flex-col gap-2">
      <BlockLabel>{t('home.myApps')}</BlockLabel>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {apps.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => void openShellApp(a.id).catch(() => undefined)}
            className="flex items-center gap-3 rounded border border-border bg-card p-3 text-left transition-colors hover:border-primary/50"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded border border-border bg-secondary font-heading text-lg uppercase">
              {a.name.slice(0, 1)}
            </span>
            <span className="min-w-0 truncate font-heading text-[17px]">{a.name}</span>
          </button>
        ))}
        {canAskMolfar() && (
          <button
            type="button"
            onClick={() => void molfar.ask(DRAFT_APP)}
            className="flex items-center gap-3 rounded border border-dashed border-primary/45 bg-primary/5 p-3 text-left transition-colors hover:bg-primary/10"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded border border-primary/45 text-2xl font-light text-primary">+</span>
            <span className="min-w-0">
              <span className="block font-heading text-[17px]">{t('home.appPlaceholderTitle')}</span>
              <span className="block text-xs text-muted-foreground">{t('home.appPlaceholder')}</span>
            </span>
          </button>
        )}
      </div>
      {molfar.error && <p role="alert" className="text-xs text-destructive">{molfar.error}</p>}
    </section>
  )
}
