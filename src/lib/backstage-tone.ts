// The Backstage surface (#448, T5): a drawer or sheet that holds maker's work takes this fill, one notch toward the primary
// colour from the popover, so a reader can tell the two floors apart. It is mixed from tokens, never a hex, so every theme
// (custom ones too) follows its own palette. The tone is never the only cue: the drawer header carries a "Backstage" chip.
export const BACKSTAGE_SURFACE = 'bg-[color-mix(in_oklab,var(--popover)_95%,var(--primary))]'
