// The start actions: New character (the one filled button when there is no chat to continue), Import card, and
// With Molfar, which hands a draft to Molfar. Failures of Molfar are a toast, like every other result.

import { useRef } from 'react'
import { Plus, Sparkle, UploadSimple } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import { importCardFiles } from '@/lib/card-import'
import { askMolfar, canAskMolfar } from '@/lib/shell-bridge'
import { cn } from '@/lib/utils'
import type { MsgKey } from '@/lib/i18n'

// Drafts handed to Molfar. They stay English on purpose: Molfar answers in the user's own language, and the user
// reviews the text before sending it.
export const DRAFT_CHARACTER = 'Create a new Roleplay character card. My idea: '

/** Hands a draft to Molfar; a refusal is a toast with the reason. */
async function draftToMolfar(text: string, failure: MsgKey, t: (key: MsgKey) => string): Promise<void> {
  try {
    await askMolfar(text)
  } catch (e) {
    const why = e instanceof Error ? e.message : ''
    toast.error(why ? `${t(failure)}: ${why}` : t(failure))
  }
}

/** The header's With Molfar: a slim ghost button, shown only when Molfar is there. */
export function WithMolfarButton() {
  const t = useT()
  if (!canAskMolfar()) return null
  return (
    // on a phone the header is short of room: an icon button (the name stays for screen readers and as a tooltip)
    <Button variant="ghost" className="gap-1.5 max-md:h-10 max-md:w-10 max-md:px-0" data-guide="home.ask" aria-label={t('home.withMolfar')} title={t('home.withMolfar')} onClick={() => void draftToMolfar(DRAFT_CHARACTER, 'home.askError', t)}>
      <Sparkle aria-hidden="true" /> <span className="max-md:sr-only">{t('home.withMolfar')}</span>
    </Button>
  )
}

/** New character, Import card, With Molfar. `primary` makes New character the page's one filled button. */
export function CreateButtons({ primary = true, className }: { primary?: boolean; className?: string }) {
  const t = useT()
  const newCharacter = useApp((s) => s.newCharacter)
  const openCharacter = useApp((s) => s.openCharacter)
  const setView = useApp((s) => s.setView)
  const hydrate = useApp((s) => s.hydrate)
  const importRef = useRef<HTMLInputElement>(null)
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <Button
        variant={primary ? 'default' : 'tonal'}
        size="lg"
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
      <Button variant="outline" size="lg" onClick={() => importRef.current?.click()}>
        <UploadSimple aria-hidden="true" /> {t('home.importCard')}
      </Button>
      {canAskMolfar() && (
        <Button variant="ghost" size="lg" onClick={() => void draftToMolfar(DRAFT_CHARACTER, 'home.askError', t)}>
          <Sparkle aria-hidden="true" /> {t('home.withMolfar')}
        </Button>
      )}
    </div>
  )
}
