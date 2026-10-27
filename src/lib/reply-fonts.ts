// Fonts the app ships for replies to use. A reply (or the user's Custom CSS) may
// name any of these in `font-family`; the style filter drops `@font-face` and
// foreign `url()`, so the app cannot fetch a font a reply asks for, only use one
// it already carries. Each family has Latin and Cyrillic subsets (imported in
// main.tsx); a family named here but missing there would silently fall back.
//
// Limit: a fenced ```html block runs in a sealed, sandboxed frame with its own
// document, which does not see the app's fonts. Fonts apply to styled text in the
// reply itself, not inside that block.

export const REPLY_FONTS: { family: string; kind: string; fallback: string }[] = [
  { family: 'Caveat', kind: 'handwriting', fallback: 'cursive' },
  { family: 'Marck Script', kind: 'calligraphy', fallback: 'cursive' },
  { family: 'Lobster', kind: 'display', fallback: 'cursive' },
  { family: 'Playfair Display', kind: 'serif', fallback: 'serif' },
  { family: 'Cormorant Garamond', kind: 'serif', fallback: 'serif' },
  { family: 'Oswald', kind: 'condensed sans', fallback: 'sans-serif' },
  { family: 'PT Mono', kind: 'typewriter', fallback: 'monospace' },
  { family: 'Ruslan Display', kind: 'gothic display', fallback: 'serif' },
]
