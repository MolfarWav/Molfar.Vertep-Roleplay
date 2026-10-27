import { X } from '@phosphor-icons/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useT } from '@/hooks/use-t'
import { shortModel } from '@/lib/utils'
import { canOpenModelSettings, openModelSettings } from '@/lib/shell-bridge'

const KEY = 'roleplay.windowNote.'
const seen = (ref: string): boolean => {
  try { return localStorage.getItem(KEY + ref) === '1' } catch { return false }
}

/**
 * One line above the composer while the model's context window is unknown: replies are then budgeted
 * against a default, which can cut a long story short. The window is set in Settings, Models; the
 * line can be closed for this model on this device.
 */
export function WindowUnknownNote({ model, assumed }: { model: string; assumed: number }) {
  const t = useT()
  const [closed, setClosed] = useState(() => seen(model))
  if (closed) return null
  return (
    <div className="mx-auto flex w-full max-w-[var(--chat-max,48rem)] items-start gap-2 px-4 py-1 text-[11px] leading-snug text-muted-foreground" role="note" data-testid="window-unknown-note">
      <p className="min-w-0 flex-1">{t('ctx.unknown', { model: shortModel(model), n: Math.round(assumed / 1024) })}</p>
      {canOpenModelSettings() && (
        <button
          type="button"
          className="shrink-0 underline underline-offset-2 hover:text-foreground max-md:min-h-10 max-md:px-2"
          onClick={() => void openModelSettings(model).catch((e: unknown) => toast.error(String((e as Error).message ?? e)))}
        >
          {t('ctx.unknownSet')}
        </button>
      )}
      <button
        type="button"
        className="-my-1 flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-muted max-md:size-10"
        aria-label={t('ctx.unknownClose')}
        onClick={() => {
          try { localStorage.setItem(KEY + model, '1') } catch { /* storage blocked: it closes for this view only */ }
          setClosed(true)
        }}
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
