import type { ReactNode } from 'react'
import { CaretDown, type Icon } from '@phosphor-icons/react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Field, FieldLabel } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'
import { TONE, type Tone } from '@/components/dashboard/dash-common'
import { cn } from '@/lib/utils'

/**
 * One block of a settings screen: a tinted title bar with its icon (the Dashboard's colours: one hue for a kind
 * of content), and what is set when it is folded. A block folds, so a long list of settings reads as a list
 * of titles; the everyday ones start open. Shared by the Litopys settings and the World settings.
 */
export function SettingsBlock({ title, hint, tone, icon: Glyph, summary, defaultOpen = false, testId, children }: { title: string; hint: string; tone: Tone; icon: Icon; summary?: string; defaultOpen?: boolean; testId?: string; children: ReactNode }) {
  const look = TONE[tone]
  return (
    <Collapsible defaultOpen={defaultOpen} className="min-w-0 overflow-hidden rounded-md border border-border bg-card" data-testid={testId}>
      <CollapsibleTrigger
        className={cn('group flex min-h-11 w-full items-center gap-2 border-b border-transparent px-3 py-2 text-left aria-expanded:border-border', look.bar)}
      >
        <Glyph className={cn('size-4 shrink-0', look.text)} aria-hidden="true" />
        <span className={cn('shrink-0 text-sm font-semibold', look.text)}>{title}</span>
        {summary && <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground group-aria-expanded:hidden">{summary}</span>}
        <CaretDown className={cn('ml-auto size-4 shrink-0 transition-transform group-aria-expanded:rotate-180', look.text)} aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3 p-3">
        <p className="text-xs text-muted-foreground">{hint}</p>
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}

/** A yes/no setting: its label with a line under it on the left, the switch on the right. */
export function SwitchRow({ id, label, hint, checked, onChange, testId }: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; testId?: string }) {
  return (
    <Field orientation="horizontal">
      <div className="flex flex-col gap-0.5">
        <FieldLabel htmlFor={id} className="font-medium">{label}</FieldLabel>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} data-testid={testId} />
    </Field>
  )
}
