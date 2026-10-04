import { useCallback, useRef, useState } from 'react'
import { useT } from '@/hooks/use-t'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface ConfirmOptions {
  title: string
  description?: string
  actionLabel?: string
  /** red action button (default); false for a plain question */
  destructive?: boolean
}

interface ConfirmState extends ConfirmOptions {
  open: boolean
}

/**
 * Promise-based confirmation for destructive actions:
 *   const confirm = useConfirm()
 *   if (await confirm({ title: `Delete ${name}?`, description: 'This cannot be undone.' })) deleteThing(id)
 * One AlertDialog instance per hook consumer; no per-call-site dialogs.
 */
export function useConfirm() {
  const t = useT()
  const [state, setState] = useState<ConfirmState | null>(null)
  const resolveRef = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback((opts: ConfirmOptions) => {
    setState({ ...opts, open: true })
    return new Promise<boolean>((resolve) => { resolveRef.current = resolve })
  }, [])

  const settle = (v: boolean) => {
    resolveRef.current?.(v)
    resolveRef.current = null
    setState(null)
  }

  const dialog = (
    <AlertDialog open={!!state?.open} onOpenChange={(open) => { if (!open) settle(false) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{state?.title}</AlertDialogTitle>
          {state?.description && <AlertDialogDescription>{state.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>{t('home.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            className={state?.destructive === false ? undefined : 'bg-destructive text-white hover:bg-destructive/90'}
            onClick={() => settle(true)}
          >
            {state?.actionLabel ?? 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return [confirm, dialog] as const
}
