// A foldable block for settings: a full-width header (tone square, icon, title, a summary while closed, a count of
// changed settings, a caret) over a panel of rows. The open state is remembered per `id` in localStorage.
//
// The body has no padding of its own: rows (SettingRow) pad themselves with px-4 and are split by hairlines here;
// free content wraps itself in a padded block.
//
// Two looks. The default is its own box (border, rounded, card fill). `flat` has no box of its own: it sits inside
// a Card with `variant="rows"`, and its header is full-bleed with a hairline above it, which is the Card's divider
// between rows (the top border is on the root, so the first flat fold under a card title also gets one).

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { CaretDown, type Icon as PhosphorIcon } from "@phosphor-icons/react"

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { TONES, type ToneName } from "@/components/ui/tone"
import { cn } from "@/lib/utils"

const KEY_PREFIX = "rp.fold."

/** The remembered open state of a fold, or `fallback` when none is stored (or storage is missing or throws). */
export function readFoldOpen(id: string, fallback: boolean): boolean {
  try {
    const v = globalThis.localStorage?.getItem(KEY_PREFIX + id)
    if (v === "1") return true
    if (v === "0") return false
    return fallback
  } catch {
    return fallback
  }
}

/** Remember a fold's open state. Storage may be blocked or full: then the state is simply not kept. */
export function writeFoldOpen(id: string, open: boolean): void {
  try {
    globalThis.localStorage?.setItem(KEY_PREFIX + id, open ? "1" : "0")
  } catch {
    /* storage is optional */
  }
}

/** The warning text for a fold that renders inside another fold, or null when it is not nested. */
export function foldNestingMessage(id: string, parent: string | null): string | null {
  return parent === null ? null : `Fold inside Fold (${id} in ${parent}): flatten it`
}

const warnedNesting = new Set<string>()

const FoldContext = createContext<{ id: string } | null>(null)

export interface FoldProps {
  /** state key: the open state is remembered as localStorage `rp.fold.<id>` */
  id: string
  title: string
  /** one line of what is set, shown only while the fold is closed */
  summary?: string
  /** a 10 px square before the title, in the tone's colour */
  tone?: ToneName
  /** an icon before the title, in the tone's ink (muted when there is no tone) */
  icon?: PhosphorIcon
  /** how many settings differ from the default: a small pill when above zero */
  count?: number
  defaultOpen?: boolean
  /** no box of its own: for a fold inside a Card with variant="rows" */
  flat?: boolean
  className?: string
  children: ReactNode
}

export function Fold({ id, title, summary, tone, icon: Icon, count, defaultOpen = false, flat = false, className, children }: FoldProps) {
  const [open, setOpen] = useState(() => readFoldOpen(id, defaultOpen))
  const parent = useContext(FoldContext)
  const parentId = parent?.id ?? null

  useEffect(() => {
    const message = foldNestingMessage(id, parentId)
    if (message && !warnedNesting.has(id)) {
      warnedNesting.add(id)
      console.warn(message)
    }
  }, [id, parentId])

  const toggle = (next: boolean) => {
    setOpen(next)
    writeFoldOpen(id, next)
  }

  return (
    <FoldContext.Provider value={{ id }}>
      <Collapsible
        open={open}
        onOpenChange={toggle}
        data-slot="fold"
        data-testid={`fold-${id}`}
        data-open={open ? "true" : "false"}
        className={cn(
          flat ? "border-t border-border" : "overflow-hidden rounded-xl border border-border bg-card",
          className
        )}
      >
        <CollapsibleTrigger
          className={cn(
            "flex min-h-12 w-full items-center gap-3 bg-muted px-4 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
            open && "border-b border-border"
          )}
        >
          {tone ? <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-sm", TONES[tone].square)} /> : null}
          {Icon ? <Icon aria-hidden="true" className={cn("size-5 shrink-0", tone ? TONES[tone].ink : "text-muted-foreground")} /> : null}
          <span className="shrink-0 text-body font-semibold">{title}</span>
          {count && count > 0 ? (
            <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-border bg-background px-1.5 text-caption font-medium text-muted-foreground tabular-nums">
              {count}
            </span>
          ) : null}
          {!open && summary ? <span className="min-w-0 flex-1 truncate text-caption text-muted-foreground">{summary}</span> : null}
          <CaretDown
            aria-hidden="true"
            className={cn("ml-auto size-5 shrink-0 text-foreground transition-transform", open && "rotate-180")}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col divide-y divide-border">{children}</CollapsibleContent>
      </Collapsible>
    </FoldContext.Provider>
  )
}
