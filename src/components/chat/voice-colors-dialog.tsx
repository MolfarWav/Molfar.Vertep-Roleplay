// "Voice colours" in the chat menu: each character's lines in their own colour, kept for this chat. The people are the
// Dashboard's registry (lib/chat-voices.ts); a card of several characters turns this on by itself, any other chat by
// the switch here. "Spread" gives everyone not picked by hand a different colour.

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ArrowCounterClockwise, Shuffle } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { useT } from '@/hooks/use-t'
import { changeChatVoices, useChatVoices, type VoiceOp } from '@/lib/chat-voices'
import { voiceInk } from '@/lib/dialogue-voices'

/** A colour input that tells the server once the picking has paused: a picker fires on every step of a drag. */
function Swatch({ color, disabled, label, onPick }: { color: string; disabled: boolean; label: string; onPick: (color: string) => void }) {
  const [draft, setDraft] = useState(color)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => setDraft(color), [color])
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <input
      type="color"
      value={draft}
      disabled={disabled}
      onChange={(e) => {
        const next = e.target.value
        setDraft(next)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => onPick(next), 400)
      }}
      aria-label={label}
      className="size-10 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-40 md:size-8"
    />
  )
}

export function VoiceColorsDialog({ chatId, open, onOpenChange }: { chatId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT()
  const v = useChatVoices((s) => s.byChat[chatId])
  const [busy, setBusy] = useState(false)
  const run = async (op: VoiceOp) => {
    setBusy(true)
    try {
      await changeChatVoices(chatId, op)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="voice-colors">
        <DialogHeader>
          <DialogTitle>{t('voices.chat.title')}</DialogTitle>
          <DialogDescription>{t('voices.chat.hint')}</DialogDescription>
        </DialogHeader>
        {!v ? (
          <p className="text-sm text-muted-foreground">{t('voices.chat.noPlugin')}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 text-sm max-md:min-h-12">
              <span className="min-w-0">
                {t('voices.chat.switch')}
                <span className="block text-xs text-muted-foreground">{v.active && v.mode === 'auto' ? t('voices.chat.autoOn') : v.active ? t('voices.chat.on') : t('voices.chat.off')}</span>
              </span>
              <Switch checked={v.active} disabled={busy} onCheckedChange={(on) => void run({ op: on ? 'on' : 'off' })} aria-label={t('voices.chat.switch')} />
            </label>
            {v.people.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('voices.chat.empty')}</p>
            ) : (
              <>
                <ul className="flex flex-col gap-1" aria-label={t('voices.chat.people')}>
                  {v.people.map((p) => (
                    <li key={p.id} className="flex min-h-11 items-center gap-2 rounded-md px-1 max-md:min-h-12">
                      <Swatch
                        color={p.color || '#888888'}
                        disabled={!v.active || busy}
                        label={t('voices.color', { name: p.name })}
                        onPick={(color) => void run({ op: 'set', id: p.id, color })}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium" style={p.color && v.active ? { color: voiceInk(p.color) } : undefined}>{p.name}</span>
                      {v.active && <span className="shrink-0 text-xs text-muted-foreground">{p.hand ? t('voices.chat.mine') : t('voices.chat.auto')}</span>}
                      {v.active && p.hand && (
                        <Button variant="ghost" size="icon" className="size-10 shrink-0 md:size-8" disabled={busy} aria-label={t('voices.chat.backAuto', { name: p.name })} title={t('voices.chat.backAuto', { name: p.name })} onClick={() => void run({ op: 'unset', id: p.id })}>
                          <ArrowCounterClockwise className="size-4" aria-hidden="true" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-col gap-1">
                  <Button variant="outline" className="w-fit max-md:min-h-10" disabled={!v.active || busy} onClick={() => void run({ op: 'spread' })} data-testid="voice-spread">
                    <Shuffle className="size-4" aria-hidden="true" />{t('voices.chat.spread')}
                  </Button>
                  <p className="text-xs text-muted-foreground">{t('voices.chat.spreadHint')}</p>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
