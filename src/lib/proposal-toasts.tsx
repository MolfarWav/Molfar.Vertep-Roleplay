// The toasts for what the story proposed in the open chat and the player has not answered: a block of a character's
// portrait, a habit, a quest to open or close. Until now they showed only inside their own block (the card's Memory
// tab, the Library's Habits, the Dashboard's Suggestions), which is not where the player is while playing.
// One toast per kind, each in the colour of its block (proposal-core.ts), told once per proposal like the Library's
// fact toast (attention.ts), batched when several arrive together. The chat view calls `checkChatProposals` when the
// chat opens, after a reply and every minute.
import { toast } from 'sonner'
import { Lightbulb, ListChecks, TrendUp } from '@phosphor-icons/react'
import { loadGrowth, putGrowth } from '@/components/character/memory-api'
import { fetchLitChat, litHabitOp } from '@/components/library/litopys-api'
import { TONE_TOAST } from '@/components/ui/sonner'
import type { QuestProposal } from '@/lib/dashboard'
import { j } from '@/lib/engine'
import { resolveLanguage, t, type Lang } from '@/lib/i18n'
import { useApp } from '@/lib/store'
import { attentionOn, BTN, isPhone, readSeen, setWaiting, whenIdle, writeSeen } from './attention'
import { growthItems, habitItems, PROPOSAL_TONE, proposalPlan, questItems, takeNewItems, byKind, type ProposalItem, type ProposalKind } from './proposal-core'

const ICONS = { growth: TrendUp, habits: ListChecks, quests: Lightbulb } as const

/** Where "Open" goes: the card's Memory tab, the chat's habits in the Library, the Dashboard's quests. */
function openPlace(kind: ProposalKind, item: ProposalItem) {
  const app = useApp.getState()
  if (kind === 'growth' && item.cardId) app.openCharacterOnTab(item.cardId, 'memory')
  else if (kind === 'habits') {
    useApp.setState({ ledgerTabRequest: 'habits' })
    app.focusLibraryChat(item.chatId)
  } else app.openDashboard({ tab: 'quests' })
}

/** The answer a toast's Accept or Reject sends for one proposal. */
async function answer(item: ProposalItem, accept: boolean) {
  if (item.kind === 'growth') await putGrowth(item.cardId, accept ? { op: 'accept', id: item.id } : { op: 'delete', id: item.id })
  else if (item.kind === 'habits') await litHabitOp(item.chatId, item.id, { op: accept ? 'accept' : 'reject' })
  else {
    const r = await j<{ ok?: boolean; error?: string }>('/dashboard/notes', { method: 'POST', body: JSON.stringify({ chatId: item.chatId, op: accept ? 'proposal-accept' : 'proposal-reject', id: item.id }) })
    if (r?.ok === false) throw new Error(r.error || 'unknown error')
  }
}

/** One colour's toast. `all` is everything of that kind that waits now, so the count is right when a new one joins. */
function showKind(kind: ProposalKind, all: ProposalItem[], lang: Lang, refresh: () => void) {
  const plan = proposalPlan(kind, all, lang)
  const Icon = ICONS[kind]
  const first = all[0]!
  const open = { label: t('attn.open', lang), onClick: () => openPlace(kind, first) }
  const base = {
    id: `attention-${kind}`,
    description: plan.description || undefined,
    duration: 20_000,
    position: isPhone() ? ('bottom-center' as const) : undefined,
    icon: <Icon className="size-4" weight="fill" aria-hidden="true" />,
    classNames: { toast: TONE_TOAST[PROPOSAL_TONE[kind]], actionButton: BTN, cancelButton: BTN },
  }
  if (!plan.inline) {
    toast(plan.title, { ...base, action: open })
    return
  }
  const settle = async (accept: boolean) => {
    try {
      await answer(first, accept)
      toast.success(t(accept ? 'attn.accepted' : 'attn.rejected', lang), { duration: 3000 })
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e), { action: open, duration: 10_000 })
    }
  }
  toast(plan.title, {
    ...base,
    action: { label: kind === 'quests' ? t('attn.quests.closeIt', lang) : t('attn.accept', lang), onClick: () => void settle(true) },
    cancel: { label: kind === 'quests' ? t('attn.quests.keep', lang) : t('attn.reject', lang), onClick: () => void settle(false) },
  })
}

let running = false

/** Reads what waits in a chat (its characters' portraits, its habits, its Dashboard), hands it to the inbox, and toasts what is new. */
export async function checkChatProposals(chatId: string) {
  if (running) return
  running = true
  try {
    const st = useApp.getState()
    const sw = st.settings.attention
    const on = { growth: attentionOn(sw, 'growth'), habits: attentionOn(sw, 'habits'), quests: attentionOn(sw, 'quests') }
    const chat = st.chats.find((c) => c.id === chatId)
    const holder = chat ? st.characters.find((c) => c.id === chat.characterId) : undefined
    const cardIds = !holder ? [] : holder.isGroup ? (holder.members ?? []) : [holder.id]
    const [growth, habits, quests] = await Promise.all([
      on.growth
        ? Promise.all(cardIds.map(async (id) => {
            const v = await loadGrowth(id).catch(() => null)
            return growthItems(chatId, id, st.characters.find((c) => c.id === id)?.name ?? '', v?.growth.entries)
          })).then((l) => l.flat())
        : Promise.resolve([] as ProposalItem[]),
      on.habits ? fetchLitChat(chatId).then((r) => habitItems(chatId, r.habits)).catch(() => [] as ProposalItem[]) : Promise.resolve([] as ProposalItem[]),
      on.quests
        ? j<{ view?: { proposals?: QuestProposal[] } | null }>(`/dashboard/state?chatId=${encodeURIComponent(chatId)}&view=1`).then((r) => questItems(chatId, r.view?.proposals)).catch(() => [] as ProposalItem[])
        : Promise.resolve([] as ProposalItem[]),
    ])
    // the chat was changed while the answers came: they belong to the one left
    if (useApp.getState().activeChatId !== chatId) return
    const all = [...growth, ...habits, ...quests]
    setWaiting(all)
    const seen = readSeen()
    const fresh = takeNewItems(all, seen)
    if (!fresh.length) return
    writeSeen(seen)
    const lang = resolveLanguage(st.settings.language)
    const kinds = new Set(fresh.map((p) => p.kind))
    whenIdle(() => {
      for (const g of byKind(all)) if (kinds.has(g.kind)) showKind(g.kind, g.items, lang, () => void checkChatProposals(chatId))
    })
  } finally {
    running = false
  }
}
