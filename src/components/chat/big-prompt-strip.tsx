// A long chat sends more with every reply (#261). When the last reply was big, one strip above the composer says so
// and offers the two ways out the app already has: finished scenes as chapters, or a continuation chat.
import { useEffect, useState } from 'react'
import { Gauge } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { fetchLitConfig, putLitConfig, type LitConfig } from '@/components/library/litopys-api'
import { useT } from '@/hooks/use-t'
import { alertLimit, lastPromptTokens, shouldOfferTrim } from '@/lib/long-chat'
import { chatLimits, useApp } from '@/lib/store'
import type { Chat } from '@/lib/types'

/** 45000 reads "45k", 45300 "45.3k" */
const shortTokens = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n))

const key = (chatId: string) => `rp.bigPrompt.${chatId}`

function readDismissed(chatId: string): number | null {
  try {
    const v = Number(localStorage.getItem(key(chatId)))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

export function BigPromptStrip({ chat }: { chat: Chat }) {
  const t = useT()
  const startChatAndOpen = useApp((s) => s.startChatAndOpen)
  const tokens = lastPromptTokens(chat.messages)
  const windowTokens = chatLimits(chat.id).contextWindow ?? null
  const [dismissed, setDismissed] = useState<number | null>(() => readDismissed(chat.id))
  // the limit lives in the Litopys settings; read again after each reply (a small call), so a change there is seen
  const [cfg, setCfg] = useState<LitConfig | null>(null)
  useEffect(() => {
    let live = true
    fetchLitConfig().then((c) => { if (live) setCfg(c) }).catch(() => { if (live) setCfg(null) })
    return () => { live = false }
  }, [chat.id, tokens])
  const show = shouldOfferTrim(tokens, alertLimit(cfg, windowTokens), dismissed)
  if (!show) return null

  const hide = () => {
    setDismissed(tokens)
    try {
      localStorage.setItem(key(chat.id), String(tokens))
    } catch {
      // private mode: the strip comes back after a reload, which is harmless
    }
  }
  const litopysOn = !!cfg && cfg.enabled !== false && cfg.insert !== false
  const byScenes = litopysOn && cfg.cutMode === 'scenes'
  const canSwitch = litopysOn && !byScenes
  const switchToScenes = async () => {
    try {
      await putLitConfig({ cutMode: 'scenes' })
      toast.success(t('big.scenesDone'))
      hide()
    } catch (e) {
      toast.error(String((e as Error).message ?? e))
    }
  }

  return (
    <div
      className="chat-column mb-2 flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-2.5 text-xs"
      role="note"
      data-testid="big-prompt-strip"
    >
      <div className="flex items-start gap-2">
        <Gauge className="mt-px size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="break-words font-medium">{t('big.title', { n: shortTokens(tokens) })}</span>
          <span className="text-[11px] text-muted-foreground max-sm:hidden">
            {byScenes ? t('big.bodyScenes') : canSwitch ? t('big.bodySwitch') : cfg && !litopysOn ? t('big.bodyNoLit') : t('big.body')} {t('big.where')}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {canSwitch && (
          <Button variant="outline" size="sm" className="h-10 md:h-7" onClick={() => void switchToScenes()} data-testid="big-prompt-scenes">
            {t('big.scenes')}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-10 md:h-7"
          onClick={() => void startChatAndOpen(chat.characterId, 0, { continues: chat.id })}
          data-testid="big-prompt-continue"
        >
          {t('chat.continueNew')}
        </Button>
        <Button variant="ghost" size="sm" className="h-10 md:h-7" onClick={hide} data-testid="big-prompt-later">
          {t('big.later')}
        </Button>
      </div>
    </div>
  )
}
