// The toast that says the story has probably changed a character, with "Update portrait" (#450, triggers). It only tells;
// the model is asked when the player presses the button (the hand button of the card's Memory tab, `updateGrowthFromStory`),
// and what it proposes arrives as the usual portrait notice. The detection is growth-cue-core.ts. A chat's memory of what
// was already told lives in this browser's localStorage, like the seen list of the other notices (attention.ts).
import { toast } from 'sonner'
import { TrendUp } from '@phosphor-icons/react'
import { updateGrowthFromStory } from '@/components/character/memory-api'
import { fetchLitChat } from '@/components/library/litopys-api'
import { TONE_TOAST } from '@/components/ui/sonner'
import type { DashView } from '@/lib/dashboard'
import { j } from '@/lib/engine'
import { resolveLanguage, t, type Lang } from '@/lib/i18n'
import { useApp } from '@/lib/store'
import { BTN, isPhone, whenIdle } from './attention'
import { cleanMemory, cuesByCard, detectCues, type CueMemory } from './growth-cue-core'

const KEY = (chatId: string) => `rp.growthcue.${chatId}`
const mem = new Map<string, CueMemory>()

function readMemory(chatId: string): CueMemory | null {
  const hit = mem.get(chatId)
  if (hit) return hit
  try {
    const m = cleanMemory(JSON.parse(localStorage.getItem(KEY(chatId)) ?? 'null'))
    if (m) mem.set(chatId, m)
    return m
  } catch {
    return null
  }
}

function writeMemory(chatId: string, m: CueMemory) {
  mem.set(chatId, m)
  try {
    localStorage.setItem(KEY(chatId), JSON.stringify(m))
  } catch {
    /* private mode: the memory lasts until the page is closed */
  }
}

let running = false

/** One look at an open chat: which characters did the story just touch? `cards` are the chat's cards (one, or a group's members). */
export async function checkGrowthCues(chatId: string, cards: readonly { id: string; name: string }[], refresh: () => void) {
  if (running || !cards.length) return
  running = true
  try {
    const [lit, dash] = await Promise.all([
      fetchLitChat(chatId).catch(() => null),
      j<{ view?: DashView | null }>(`/dashboard/state?chatId=${encodeURIComponent(chatId)}&view=1`).catch(() => null),
    ])
    const st = useApp.getState()
    if (st.activeChatId !== chatId) return
    const view = dash?.view ?? null
    const { cues, mem: next } = detectCues({
      turns: (lit?.turns ?? []).map((x) => ({ id: x.id, text: x.text, cast: x.cast })),
      view: view ? { key: view.key, turn: view.turn, events: view.events, chars: view.chars } : null,
      mem: readMemory(chatId),
    })
    writeMemory(chatId, next)
    const byCard = cuesByCard(cues, cards)
    if (!byCard.length) return
    const lang = resolveLanguage(st.settings.language)
    whenIdle(() => showCue(chatId, byCard, lang, refresh))
  } finally {
    running = false
  }
}

function showCue(chatId: string, byCard: ReturnType<typeof cuesByCard>, lang: Lang, refresh: () => void) {
  const first = byCard[0]!
  const one = byCard.length === 1
  const line = first.cues[0]!.text
  const run = async () => {
    const id = toast.loading(t('cue.working', lang, { name: first.name || '…' }), { id: 'growth-cue-run' })
    try {
      const r = await updateGrowthFromStory(first.cardId, chatId)
      toast.success(r.added > 0 ? t('cue.done', lang, { n: r.added }) : t('cue.none', lang), { id, duration: 6000 })
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e), { id, duration: 10_000 })
    }
  }
  const openMemory = () => {
    useApp.getState().openCharacterOnTab(first.cardId, 'memory')
  }
  toast(one ? t('cue.one', lang, { name: first.name || '…' }) : t('cue.many', lang, { n: byCard.length }), {
    id: 'attention-cue',
    description: one ? line : byCard.map((c) => c.name).filter(Boolean).slice(0, 3).join(', '),
    duration: 25_000,
    position: isPhone() ? 'bottom-center' : undefined,
    icon: <TrendUp className="size-4" weight="fill" aria-hidden="true" />,
    classNames: { toast: TONE_TOAST.sky, actionButton: BTN, cancelButton: BTN },
    action: one ? { label: t('cue.update', lang), onClick: () => void run() } : { label: t('attn.open', lang), onClick: openMemory },
    cancel: { label: t('cue.later', lang), onClick: () => undefined },
  })
}
