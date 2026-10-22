import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useT } from '@/hooks/use-t'

/** What the card editor is asking the user about its unsaved changes (GitHub #103). */
export type DraftPrompt =
  /** leaving the card (back, another section, another card, a chat): Save, Discard or stay */
  | { kind: 'leave'; go: () => void }
  /** an action that works on the saved card (export, duplicate): save first, go on without saving, or stay */
  | { kind: 'action'; label: string; run: () => void }
  /** the stored card changed under the draft: keep mine or take the stored version, for these fields */
  | { kind: 'conflict'; labels: string[]; keep: () => void; theirs: () => void }

/** "Description, Tags and 2 more": short enough for a dialog line. */
export function fieldList(labels: string[], more: (n: number) => string): string {
  const shown = labels.slice(0, 4)
  const rest = labels.length - shown.length
  return rest > 0 ? `${shown.join(', ')} ${more(rest)}` : shown.join(', ')
}

export function DraftDialogs({ prompt, labels, saving, onSaveThen, onDiscardThen, onClose }: {
  prompt: DraftPrompt | null
  /** the fields the draft changes */
  labels: string[]
  saving: boolean
  /** save the draft, then run `then` (nothing runs when the save fails) */
  onSaveThen: (then: () => void) => void
  onDiscardThen: (then: () => void) => void
  onClose: () => void
}) {
  const t = useT()
  const fields = fieldList(labels, (n) => t('cd.fieldsMore', { n }))
  return (
    <Dialog open={!!prompt} onOpenChange={(o) => { if (!o && !saving) onClose() }}>
      <DialogContent className="sm:max-w-md" data-testid="draft-dialog">
        {prompt?.kind === 'leave' && (
          <>
            <DialogHeader>
              <DialogTitle>{t('cd.leave.title')}</DialogTitle>
              <DialogDescription>{t('cd.leave.body', { fields })}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 max-sm:flex-col-reverse">
              <Button variant="outline" className="max-sm:h-10" disabled={saving} onClick={onClose}>{t('cd.leave.stay')}</Button>
              <Button variant="outline" className="max-sm:h-10 text-destructive" disabled={saving} onClick={() => onDiscardThen(prompt.go)}>{t('cd.leave.discard')}</Button>
              <Button className="max-sm:h-10" disabled={saving} onClick={() => onSaveThen(prompt.go)}>{saving ? t('cd.saving') : t('cd.leave.save')}</Button>
            </DialogFooter>
          </>
        )}
        {prompt?.kind === 'action' && (
          <>
            <DialogHeader>
              <DialogTitle>{t('cd.act.title')}</DialogTitle>
              <DialogDescription>{t('cd.act.body', { action: prompt.label, fields })}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 max-sm:flex-col-reverse">
              <Button variant="outline" className="max-sm:h-10" disabled={saving} onClick={onClose}>{t('cd.leave.stay')}</Button>
              <Button variant="outline" className="max-sm:h-10" disabled={saving} onClick={() => { const run = prompt.run; onClose(); run() }}>{t('cd.act.skip')}</Button>
              <Button className="max-sm:h-10" disabled={saving} onClick={() => onSaveThen(prompt.run)}>{saving ? t('cd.saving') : t('cd.act.save')}</Button>
            </DialogFooter>
          </>
        )}
        {prompt?.kind === 'conflict' && (
          <>
            <DialogHeader>
              <DialogTitle>{t('cd.conflict.title')}</DialogTitle>
              <DialogDescription>{t('cd.conflict.body', { fields: fieldList(prompt.labels, (n) => t('cd.fieldsMore', { n })) })}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 max-sm:flex-col-reverse">
              <Button variant="outline" className="max-sm:h-10" disabled={saving} onClick={prompt.theirs}>{t('cd.conflict.theirs')}</Button>
              <Button className="max-sm:h-10" disabled={saving} onClick={prompt.keep}>{t('cd.conflict.keep')}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
