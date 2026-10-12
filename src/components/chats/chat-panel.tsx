import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  ArrowRight, BookOpenText, ChatCircleText, DotsThree, DownloadSimple, Folder as FolderIcon, GitBranch,
  ListBullets, PencilSimple, Plus, PushPin, PushPinSlash, Trash, Users,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useApp, scopeBookIds } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import { cleanPreview } from '@/lib/preview'
import { estimateTokens, formatTokens, timeAgo } from '@/lib/tokens'
import { memberColor } from '@/lib/dialogue-voices'
import { exportChatJSONL, exportChatTxt } from '@/lib/export'
import { fetchLitChat, type LitChapter } from '@/components/library/litopys-api'
import { ChatRecordSheet } from '@/components/library/chat-record-sheet'
import { DEFAULT_AVATAR, cn } from '@/lib/utils'
import type { Character, Chat } from '@/lib/types'

/** A chat's portrait: the card's, or for a group a collage of its members (violet ring). */
export function ChatAvatar({ owner, members, size }: { owner: Character | undefined; members: Character[]; size: number }) {
  if (owner?.isGroup && members.length > 0 && !owner.group?.avatar) {
    const shown = members.slice(0, 3)
    return (
      <span
        className={cn('grid shrink-0 gap-px overflow-hidden rounded-md bg-group ring-2 ring-group/80', shown.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        {shown.map((m, i) => (
          <img key={m.id} src={m.avatar || DEFAULT_AVATAR} alt="" className={cn('size-full min-h-0 min-w-0 object-cover', shown.length === 3 && i === 0 && 'row-span-2')} />
        ))}
      </span>
    )
  }
  return (
    <img
      src={owner?.avatar || DEFAULT_AVATAR}
      alt=""
      className={cn('shrink-0 rounded-md object-cover', owner?.isGroup && 'ring-2 ring-group/80')}
      style={{ width: size, height: size }}
    />
  )
}

/** A section of the panel: a readable heading with an icon, then its body. */
function Section({ icon, title, action, children }: { icon: ReactNode; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-border px-5 py-4 last:border-b-0 sm:px-6">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-primary" aria-hidden="true">{icon}</span>
        <h3 className="flex-1 text-xs font-semibold uppercase tracking-wider text-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium">{children}</dd>
    </div>
  )
}

/** The right side of the Chats page: what this chat is, how far the story got, its last lines and settings. */
export function ChatPanel({ chat, onDelete, onRename }: { chat: Chat; onDelete: () => void; onRename: () => void }) {
  const t = useT()
  const characters = useApp((s) => s.characters)
  const personas = useApp((s) => s.personas)
  const presets = useApp((s) => s.presets)
  const lorebooks = useApp((s) => s.lorebooks)
  const models = useApp((s) => s.models)
  const appModel = useApp((s) => s.model)
  const folders = useApp((s) => s.folders)
  const openChat = useApp((s) => s.openChat)
  const updateChat = useApp((s) => s.updateChat)
  const ensureChatMessages = useApp((s) => s.ensureChatMessages)
  const startChatAndOpen = useApp((s) => s.startChatAndOpen)
  const forkAndOpen = useApp((s) => s.forkAndOpen)
  const [chapters, setChapters] = useState<LitChapter[] | null>(null)
  const [recordOpen, setRecordOpen] = useState(false)

  const owner = characters.find((c) => c.id === chat.characterId)
  const isGroup = !!owner?.isGroup
  const members = useMemo(
    () => (isGroup ? (owner?.group?.memberIds ?? owner?.members ?? []).map((id) => characters.find((c) => c.id === id)).filter((c): c is Character => !!c) : []),
    [isGroup, owner, characters],
  )

  // the transcript (last lines, size) and the story record load when a chat is picked
  useEffect(() => { void ensureChatMessages(chat.id) }, [chat.id, ensureChatMessages])
  useEffect(() => {
    let alive = true
    setChapters(null)
    fetchLitChat(chat.id).then((r) => { if (alive) setChapters(r.chapters ?? []) }).catch(() => { if (alive) setChapters([]) })
    return () => { alive = false }
  }, [chat.id])

  const shown = chat.messages.filter((m) => !m.picture && m.role !== 'system')
  const last = shown.slice(-3)
  const msgCount = chat.messages.length > 0 ? chat.messages.length : chat.messageCount ?? 0
  const persona = personas.find((p) => p.id === chat.personaId) ?? personas.find((p) => p.isDefault)
  const preset = presets.find((p) => p.id === chat.presetId) ?? presets.find((p) => p.isDefault)
  const modelRef = chat.model || appModel || ''
  const model = models.find((m) => m.ref === modelRef)
  const history = shown.reduce((n, m) => n + estimateTokens(m.swipes[m.activeSwipe]?.content), 0)
  const books = scopeBookIds(lorebooks, chat, characters).map((id) => lorebooks.find((b) => b.id === id)?.name).filter(Boolean) as string[]
  const chatFolders = folders.filter((f) => f.scope === 'chats')
  const lastSpeaker = [...chat.messages].reverse().find((m) => m.role === 'assistant' && !m.picture)

  const speaker = (m: Chat['messages'][number]) => {
    if (m.role === 'user') return { name: m.authorName || persona?.name || t('chats.panel.you'), color: undefined }
    const c = characters.find((x) => x.id === m.characterId)
    if (isGroup && owner && c && !c.isGroup) return { name: c.name, color: memberColor(owner, c) }
    return { name: c?.name ?? owner?.name ?? '', color: c?.colors?.dialogue || undefined }
  }
  const story = (chapters ?? []).slice(-3)
  const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
  const firstNo = Math.max(0, (chapters?.length ?? 0) - story.length)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <header className="relative overflow-hidden border-b border-border px-5 pb-4 pt-5 sm:px-6">
          {owner?.avatar && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 scale-125 bg-cover bg-[center_20%] opacity-20 blur-2xl"
              style={{ backgroundImage: `url(${owner.avatar})` }}
            />
          )}
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end">
            <ChatAvatar owner={owner} members={members} size={80} />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                <span className={cn('font-medium', isGroup ? 'text-group' : 'text-foreground')}>{owner?.name ?? t('chats.panel.unknown')}</span>
                {isGroup && <> · {t('chats.panel.groupChat')}</>}
                {' · '}{t('chats.panel.messages', { n: msgCount })}{' · '}{timeAgo(chat.updatedAt)}
              </p>
              <h2 className="mt-1 font-heading text-2xl leading-tight text-balance">{chat.title}</h2>
              {isGroup && (
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={t('chats.panel.members')}>
                  {members.map((m) => (
                    <li key={m.id} className="flex items-center gap-1.5 rounded-full border border-border bg-background/40 py-0.5 pl-0.5 pr-2 text-xs">
                      <img src={m.avatar || DEFAULT_AVATAR} alt="" className="size-5 rounded-full object-cover" />
                      {m.name}
                      {owner && <span className="size-2 rounded-full" style={{ background: memberColor(owner, m) }} aria-hidden="true" />}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="relative mt-4 flex flex-wrap gap-2">
            <Button onClick={() => openChat(chat.id)} className={cn('max-sm:h-10', isGroup && 'bg-group text-group-foreground hover:bg-group/90')}>
              <ChatCircleText className="size-4" aria-hidden="true" />{t('chats.panel.continue')}
            </Button>
            <Button variant="secondary" className="max-sm:h-10" onClick={() => updateChat(chat.id, { pinned: !chat.pinned })}>
              {chat.pinned ? <PushPinSlash className="size-4" aria-hidden="true" /> : <PushPin className="size-4" aria-hidden="true" />}
              {t(chat.pinned ? 'chats.panel.unpin' : 'chats.panel.pin')}
            </Button>
            {owner && (
              <Button variant="secondary" className="max-sm:h-10" onClick={() => void startChatAndOpen(owner.id)}>
                <Plus className="size-4" aria-hidden="true" />{t(isGroup ? 'chats.panel.newGroupChat' : 'chats.panel.newChat', { name: owner.name })}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="secondary" className="max-sm:size-10" size="icon" aria-label={t('chats.panel.more')}><DotsThree className="size-4" aria-hidden="true" /></Button>} />
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={onRename}><PencilSimple className="size-4" aria-hidden="true" />{t('chats.panel.rename')}</DropdownMenuItem>
                  {lastSpeaker && (
                    <DropdownMenuItem onClick={() => void forkAndOpen(chat.id, lastSpeaker.id)}><GitBranch className="size-4" aria-hidden="true" />{t('chats.panel.branch')}</DropdownMenuItem>
                  )}
                  {chatFolders.map((f) => (
                    <DropdownMenuItem key={f.id} onClick={() => { updateChat(chat.id, { folderId: chat.folderId === f.id ? null : f.id }); toast.success(chat.folderId === f.id ? `Removed from ${f.name}` : `Moved to ${f.name}`) }}>
                      <FolderIcon className="size-4" style={{ color: f.color }} aria-hidden="true" />
                      {chat.folderId === f.id ? `Remove from ${f.name}` : `Move to ${f.name}`}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem onClick={() => { exportChatJSONL(chat, characters); toast.success('Exported as JSONL') }}><DownloadSimple className="size-4" aria-hidden="true" />Export JSONL</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { exportChatTxt(chat, characters); toast.success('Exported as TXT') }}><DownloadSimple className="size-4" aria-hidden="true" />Export TXT</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={onDelete}><Trash className="size-4" aria-hidden="true" />{t('chats.panel.delete')}</DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <Section
          icon={<BookOpenText className="size-4" weight="fill" />}
          title={t('chats.panel.story')}
          action={(chapters?.length ?? 0) > 0 && (
            <button type="button" onClick={() => setRecordOpen(true)} className="flex min-h-8 items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              {t('chats.panel.openRecord')}<ArrowRight className="size-3" aria-hidden="true" />
            </button>
          )}
        >
          {chapters === null ? (
            <p className="text-sm text-muted-foreground">{t('chats.panel.loading')}</p>
          ) : story.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('chats.panel.noStory')}</p>
          ) : (
            <ol className="space-y-2.5">
              {story.map((c, i) => (
                <li key={c.id} className="flex max-w-prose gap-3 text-sm leading-relaxed">
                  <span className="w-7 shrink-0 font-heading text-muted-foreground">{roman[firstNo + i] ?? firstNo + i + 1}</span>
                  <span className="min-w-0">
                    {c.label && <span className="font-medium">{c.label}. </span>}
                    <span className="line-clamp-3">{c.text}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section icon={<ListBullets className="size-4" weight="bold" />} title={t('chats.panel.last')}>
          {last.length === 0 ? (
            <p className="text-sm text-muted-foreground">{msgCount > 0 ? t('chats.panel.loading') : t('chats.panel.empty')}</p>
          ) : (
            <div className="space-y-3">
              {last.map((m) => {
                const who = speaker(m)
                return (
                  <div key={m.id} className="max-w-prose border-l-2 pl-3" style={{ borderColor: who.color ?? 'var(--border)' }}>
                    <p className={cn('text-xs font-semibold', !who.color && 'text-muted-foreground')} style={who.color ? { color: who.color } : undefined}>{who.name}</p>
                    <p className="line-clamp-4 text-sm leading-relaxed">{cleanPreview(m.swipes[m.activeSwipe]?.content ?? '', 420)}</p>
                  </div>
                )
              })}
            </div>
          )}
        </Section>

        <Section icon={<Users className="size-4" weight="fill" />} title={t('chats.panel.details')}>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-3">
            <Detail label={t('chats.panel.persona')}>{persona?.name ?? '—'}</Detail>
            <Detail label={t('chats.panel.preset')}>{preset?.name ?? '—'}</Detail>
            <Detail label={t('chats.panel.model')}>{model ? model.id : modelRef.replace(/^c_[^/]*\//, '') || '—'}</Detail>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">{t('chats.panel.history')}</dt>
              <dd className="text-sm font-medium">
                {chat.messages.length > 0 ? `≈ ${formatTokens(history)}${model?.context ? ` / ${formatTokens(model.context)}` : ''}` : '—'}
              </dd>
              {chat.messages.length > 0 && model?.context ? (
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div className={cn('h-full rounded-full', history > model.context * 0.8 ? 'bg-destructive' : 'bg-muted-foreground')} style={{ width: `${Math.min(100, (history / model.context) * 100)}%` }} />
                </div>
              ) : null}
            </div>
            <Detail label={t('chats.panel.books')}>{books.length ? books.join(', ') : '—'}</Detail>
            {isGroup ? (
              <Detail label={t('chats.panel.turns')}>{t(owner?.group?.generationMode === 'narrator' ? 'chats.panel.turnsNarrator' : 'chats.panel.turnsEach')}</Detail>
            ) : (
              <Detail label={t('chats.panel.branches')}>{chat.branches.length || '—'}</Detail>
            )}
          </dl>
        </Section>
      </div>
      <ChatRecordSheet chat={chat} open={recordOpen} onOpenChange={setRecordOpen} />
    </div>
  )
}
