// The word that goes with the Backstage tone (#448, T5): a small chip in the header of a drawer or sheet of maker's work.
import { MaskHappy } from '@phosphor-icons/react'
import { useT } from '@/hooks/use-t'

export function BackstageChip() {
  const t = useT()
  return (
    <span
      data-testid="backstage-chip"
      title={t('backstage.hint')}
      className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-1.5 text-caption font-medium text-foreground"
    >
      <MaskHappy className="size-3.5 text-primary" aria-hidden="true" />
      {t('backstage.button')}
    </span>
  )
}
