import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

/** A number field keeps what is typed while it has focus: callers turn the
 *  text into Number(...), so an emptied field came back as 0 and the next
 *  digit was typed after it ("07500", above all on a phone keypad). An empty
 *  field now reports nothing until a number is typed, leading zeros go, and
 *  on blur the field shows the stored value again. */
function useNumberDraft(type: string | undefined, props: React.ComponentProps<"input">) {
  const [draft, setDraft] = React.useState<string | null>(null)
  if (type !== "number" || props.value === undefined || !props.onChange) return null
  const { onChange, onBlur } = props
  return {
    value: draft ?? props.value,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      const clean = raw.replace(/^(-?)0+(?=\d)/, "$1")
      setDraft(clean)
      if (clean === "" || clean === "-") return
      if (clean !== raw) e.target.value = clean
      onChange(e)
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      setDraft(null)
      onBlur?.(e)
    },
  }
}

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  const numberDraft = useNumberDraft(type, props)
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
      {...numberDraft}
    />
  )
}

export { Input }
