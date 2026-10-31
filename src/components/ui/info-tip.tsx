import type { ReactNode } from "react"
import { Info } from "@phosphor-icons/react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

/**
 * An "i" button that opens a short explanation on click or tap (never hover-only).
 * `label` names the button for screen readers; `children` is the explanation.
 */
function InfoTip({ label, children, className, testId }: { label: string; children: ReactNode; className?: string; /** data-testid on the trigger */ testId?: string }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        data-testid={testId}
        className={cn(
          "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 max-md:size-10 max-md:-m-2",
          className
        )}
      >
        <Info className="size-3.5" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent className="w-72 text-xs leading-relaxed">{children}</PopoverContent>
    </Popover>
  )
}

export { InfoTip }
