// Joining two Dashboard characters that are one person, and marking two as different people (the entity registry's
// phase A, docs/ENTITY-REGISTRY.md): the "Manage {name}" menu in a person's header and the suggestion callout on the
// Person view. Both call POST /dashboard/notes through the dashboard's `act`.

import { useState } from 'react'
import { toast } from 'sonner'
import { CircleNotch, GitMerge, UserGear, UserMinus, UsersThree } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TONE, AvatarImg } from './dash-common'
import { useDashMaybe } from './dash-context'
import { useT } from '@/hooks/use-t'
import type { MsgKey } from '@/lib/i18n'
import { canEditNotes, suggestionsFor, type DashView } from '@/lib/dashboard'
import { cn } from '@/lib/utils'

/** The registry's reason for a suggested pair, as a message key. An unknown reason shows no line. */
const WHY_KEY: Record<string, MsgKey> = {
  'same first name': 'dash.merge.why.firstName',
  'shares a word of the name': 'dash.merge.why.word',
  'same name in another alphabet': 'dash.merge.why.script',
  'one letter apart': 'dash.merge.why.letter',
  'two people fit': 'dash.merge.why.twoFit',
  'same name': 'dash.merge.why.same',
}

/** Whether the user may change the cast: the notes are editable and there is someone else left. */
export function canManageCast(view: DashView | null | undefined): boolean {
  return !!view && canEditNotes(view) && Object.keys(view.chars ?? {}).length > 1
}

/** `merge(from, into)` asks first, then joins and tells how it went; true when it was done. The dialog goes into the page. */
export function useMerge() {
  const t = useT()
  const dash = useDashMaybe()
  const [confirm, dialog] = useConfirm()
  const merge = async (from: string, into: string): Promise<boolean> => {
    if (!dash) return false
    const ok = await confirm({
      title: t('dash.merge.title', { name: from, other: into }),
      description: t('dash.merge.body', { name: from, other: into }),
      actionLabel: t('dash.merge.do'),
      destructive: false,
    })
    if (!ok) return false
    // a failed request has already shown its reason (the dashboard's act)
    if (!(await dash.act({ op: 'merge-character', from, into }))) return false
    toast.success(t('dash.merge.done', { other: into }))
    return true
  }
  return [merge, dialog] as const
}

/** The small icon button in a person's header: "Same person as..." (the other characters) and "Remove from the Dashboard". */
export function ManagePerson({ name, avatars }: { name: string; avatars?: Record<string, string | undefined> }) {
  const t = useT()
  const dash = useDashMaybe()
  const [confirm, confirmDialog] = useConfirm()
  const [merge, mergeDialog] = useMerge()
  if (!dash || !canManageCast(dash.view)) return null
  const view = dash.view as DashView
  const others = view.order.filter((n) => n !== name && view.chars[n])
  const remove = async () => {
    if (!(await confirm({ title: t('dash.remove.title', { name }), description: t('dash.remove.body'), actionLabel: t('dash.remove.do') }))) return
    await dash.act({ op: 'remove-character', name })
  }
  const label = t('dash.manage', { name })
  return (
    <>
      {confirmDialog}
      {mergeDialog}
      <DropdownMenu>
        <DropdownMenuTrigger render={
          <Button variant="ghost" size="icon-xs" aria-label={label} title={label} data-testid="dash-manage" className="rounded-none max-md:size-10">
            <UserGear aria-hidden="true" />
          </Button>
        } />
        <DropdownMenuContent align="end" className="w-auto min-w-56">
          {others.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="max-md:min-h-10">
                <UsersThree aria-hidden="true" />{t('dash.manage.same')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-auto min-w-48">
                {others.map((other) => (
                  <DropdownMenuItem key={other} className="max-md:min-h-10" onClick={() => void merge(name, other)}>
                    <AvatarImg name={other} url={avatars?.[other]} className="size-5" />
                    <span className="min-w-0 truncate">{other}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" className="max-md:min-h-10" onClick={() => void remove()}>
            <UserMinus aria-hidden="true" />{t('dash.manage.remove')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

/** The callout itself, from plain props: who may be whom, why, which button is working (it shows a spinner, both are off). */
export function SuggestCalloutView({ name, other, why, busy, onMerge, onApart }: {
  name: string
  other: string
  why?: string
  busy: 'merge' | 'apart' | null
  onMerge: () => void
  onApart: () => void
}) {
  const t = useT()
  const reason = why && WHY_KEY[why] ? t(WHY_KEY[why]) : ''
  return (
    <section
      className={cn('flex min-w-0 flex-col gap-2 border p-3', TONE.people.bar)}
      data-testid="dash-suggest"
      aria-busy={busy ? true : undefined}
    >
      <div className="flex min-w-0 items-start gap-2">
        <UsersThree className={cn('mt-0.5 size-4 shrink-0', TONE.people.text)} aria-hidden="true" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-[13px] leading-snug font-semibold break-words text-foreground">{t('dash.merge.maybe', { name, other })}</p>
          {reason && <p className="text-[12px] leading-snug text-muted-foreground">{reason}</p>}
        </div>
      </div>
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap">
        <Button variant="tonal" className="rounded-none max-md:h-10 max-md:w-full" disabled={busy !== null} onClick={onMerge} data-testid="dash-suggest-merge">
          {busy === 'merge' ? <CircleNotch className="animate-spin" aria-hidden="true" /> : <GitMerge aria-hidden="true" />}
          <span className="min-w-0 truncate">{t('dash.merge.into', { other })}</span>
        </Button>
        <Button variant="outline" className="rounded-none max-md:h-10 max-md:w-full" disabled={busy !== null} onClick={onApart} data-testid="dash-suggest-apart">
          {busy === 'apart' && <CircleNotch className="animate-spin" aria-hidden="true" />}
          {t('dash.merge.apart')}
        </Button>
      </div>
    </section>
  )
}

/** The first suggestion that names the focused character; nothing when there is none or the notes cannot be edited. */
export function SuggestCallout({ focus }: { focus: string }) {
  const t = useT()
  const dash = useDashMaybe()
  const [merge, mergeDialog] = useMerge()
  const [busy, setBusy] = useState<'merge' | 'apart' | null>(null)
  const first = suggestionsFor(dash?.view ?? null, focus)[0]
  if (!dash || !first || !canEditNotes(dash.view)) return null
  const run = async (kind: 'merge' | 'apart') => {
    setBusy(kind)
    try {
      if (kind === 'merge') await merge(focus, first.other)
      else if (await dash.act({ op: 'apart-characters', a: focus, b: first.other })) toast.success(t('dash.merge.apartDone'))
    } finally {
      setBusy(null)
    }
  }
  return (
    <>
      {mergeDialog}
      <SuggestCalloutView name={focus} other={first.other} why={first.why} busy={busy} onMerge={() => void run('merge')} onApart={() => void run('apart')} />
    </>
  )
}
