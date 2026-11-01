// A switch drawn as a chip: pressed = the tone's fill and a check mark (so it is never colour alone), not pressed =
// an outline. For a short list of named options that are each on or off (event groups). 32 px high, 40 px on a phone.

import { Check } from "@phosphor-icons/react"
import type { ReactNode } from "react"

import { TONES, type ToneName } from "@/components/ui/tone"
import { cn } from "@/lib/utils"

export function ToggleChip({ pressed, onPressedChange, tone = "sky", disabled, children }: { pressed: boolean; onPressedChange: (v: boolean) => void; tone?: ToneName; disabled?: boolean; children: ReactNode }) {
  // text-body is joined after cn(): tailwind-merge reads it as a colour and would drop it next to the text colour
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={() => onPressedChange(!pressed)}
      className={`${cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 max-md:min-h-10",
        pressed ? `${TONES[tone].chip} font-semibold` : "border-input text-muted-foreground hover:bg-accent hover:text-foreground"
      )} text-body`}
    >
      {pressed ? <Check aria-hidden="true" weight="bold" className="size-3.5 shrink-0" /> : null}
      {children}
    </button>
  )
}
