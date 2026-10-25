import { Plus, Trash } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useT } from '@/hooks/use-t'
import { VOICE_PALETTE } from '@/lib/dialogue-voices'
import type { Character } from '@/lib/types'

type Voice = NonNullable<Character['voices']>[number]

/** The card's `voices`: whom a Narrator-type card speaks as, one dialogue colour each. */
export function VoicesEditor({ voices, onChange }: { voices: Voice[]; onChange: (next: Voice[]) => void }) {
  const t = useT()
  const set = (i: number, patch: Partial<Voice>) => onChange(voices.map((v, j) => (j === i ? { ...v, ...patch } : v)))
  return (
    <div className="flex flex-col gap-2" data-testid="voices-editor">
      <h3 className="text-xs font-medium">{t('voices.title')}</h3>
      <p className="text-[11px] text-muted-foreground">{t('voices.hint')}</p>
      {voices.map((v, i) => {
        const shown = v.name.trim() || `#${i + 1}`
        return (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={v.name}
              onChange={(e) => set(i, { name: e.target.value })}
              placeholder={t('voices.name')}
              aria-label={t('voices.name')}
              className="min-w-0 flex-1"
            />
            <input
              type="color"
              value={v.color || VOICE_PALETTE[i % VOICE_PALETTE.length]}
              onChange={(e) => set(i, { color: e.target.value })}
              aria-label={t('voices.color', { name: shown })}
              className="size-10 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0 md:size-8"
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-10 shrink-0 md:size-8"
              aria-label={t('voices.remove', { name: shown })}
              onClick={() => onChange(voices.filter((_, j) => j !== i))}
            >
              <Trash className="size-4" aria-hidden />
            </Button>
          </div>
        )
      })}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="w-fit" onClick={() => onChange([...voices, { name: '', color: '' }])}>
          <Plus className="size-4" aria-hidden />{t('voices.add')}
        </Button>
        {voices.length > 0 && <span className="text-[11px] text-muted-foreground">{t('voices.palette')}</span>}
      </div>
    </div>
  )
}
